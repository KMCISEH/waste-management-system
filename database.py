# -*- coding: utf-8 -*-
import sqlite3
import os

# psycopg2는 배포 환경(PostgreSQL)에서만 사용 — 로컬에 없어도 정상 동작
try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    psycopg2 = None  # type: ignore
    RealDictCursor = None  # type: ignore

# 현재 디렉토리 기준 절대 경로 설정 (로컬 SQLite용)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "waste_management.db")

import re

# === SQLite 호환 래퍼 ===
# server.py 등에서 PostgreSQL 문법(%s, RETURNING id, ON CONFLICT ... DO UPDATE)을 사용하므로
# SQLite 실행 시 자동 변환하여 로컬/배포 코드를 동일하게 유지

class SQLiteCursorWrapper:
    """SQLite에서 PostgreSQL 문법(%s, RETURNING, ON CONFLICT)을 자동 변환하는 커서 래퍼"""
    def __init__(self, cursor):
        self._cursor = cursor

    def execute(self, query, params=None):
        query = self._adapt_query(query)
        if params:
            return self._cursor.execute(query, params)
        return self._cursor.execute(query)

    def _adapt_query(self, query):
        # 1) %s → ?
        query = query.replace('%s', '?')
        # 2) RETURNING id 제거 (SQLite 3.35 미만 호환)
        query = re.sub(r'\s+RETURNING\s+\w+', '', query, flags=re.IGNORECASE)
        # 3) ON CONFLICT (...) DO UPDATE SET ... → INSERT OR REPLACE 변환
        #    복잡한 UPSERT는 INSERT OR REPLACE로 단순화
        if 'ON CONFLICT' in query.upper():
            query = re.sub(
                r'\)\s*ON CONFLICT\s*\([^)]*\)\s*DO UPDATE SET[^;]*',
                ') ',
                query,
                flags=re.IGNORECASE | re.DOTALL
            )
            query = query.replace('INSERT INTO', 'INSERT OR REPLACE INTO', 1)
        return query

    def __getattr__(self, name):
        return getattr(self._cursor, name)


class SQLiteConnectionWrapper:
    """SQLite 연결 래퍼: cursor() 호출 시 SQLiteCursorWrapper를 반환"""
    def __init__(self, conn):
        self._conn = conn

    def cursor(self):
        return SQLiteCursorWrapper(self._conn.cursor())

    def __getattr__(self, name):
        return getattr(self._conn, name)


def get_db_conn():
    """
    환경 변수 DATABASE_URL 유무에 따라 
    로컬(SQLite) 또는 배포환경(PostgreSQL) 연결을 반환
    """
    database_url = os.environ.get('DATABASE_URL')

    if database_url:
        # ==========================================
        # 1. 배포 환경 (PostgreSQL)
        # ==========================================
        try:
            # SSL 모드 필수, 딕셔너리 커서(RealDictCursor) 사용해 SQLite Row와 호환성 유지
            conn = psycopg2.connect(database_url, sslmode='require', cursor_factory=RealDictCursor)
            
            # PostgreSQL용 테이블 생성 (최초 1회만 실행됨)
            init_postgres_tables(conn)
            return conn
        except Exception as e:
            print(f"DB 연결 오류: {e}")
            raise e

    else:
        # ==========================================
        # 2. 로컬 환경 (SQLite)
        # ==========================================
        is_new = not os.path.exists(DB_PATH)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        
        # SQLite용 테이블 생성
        init_sqlite_tables(conn)
        
        if is_new:
            print(f"[OK] 새 로컬 데이터베이스 생성 완료: {DB_PATH}")
        
        # 래퍼로 감싸서 %s → ? 자동 변환
        return SQLiteConnectionWrapper(conn)

def init_postgres_tables(conn):
    """PostgreSQL 전용 테이블 생성 쿼리 (SERIAL 사용)"""
    with conn.cursor() as cursor:
        # records 테이블
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS records (
            id SERIAL PRIMARY KEY,
            slip_no TEXT UNIQUE,
            date TEXT,
            waste_type TEXT,
            amount REAL,
            carrier TEXT,
            vehicle_no TEXT,
            processor TEXT,
            note1 TEXT,
            note2 TEXT,
            category TEXT,
            supplier TEXT,
            status TEXT DEFAULT 'completed',
            is_local INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_slip_no ON records(slip_no)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_date ON records(date)')

        # schedules 테이블
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS schedules (
            id SERIAL PRIMARY KEY,
            date TEXT,
            content TEXT,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_sched_date ON schedules(date)')

        # liquid_waste 테이블
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS liquid_waste (
            id SERIAL PRIMARY KEY,
            year_month TEXT NOT NULL,
            discharge_date TEXT,
            receive_date TEXT,
            waste_type TEXT,
            content TEXT,
            team TEXT,
            discharger TEXT,
            quantity_ea INTEGER DEFAULT 0,
            amount_kg REAL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_lw_ym ON liquid_waste(year_month)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_lw_team ON liquid_waste(team)')
        conn.commit()

def init_sqlite_tables(conn):
    """SQLite 전용 테이블 생성 쿼리 (AUTOINCREMENT 사용)"""
    cursor = conn.cursor()
    
    # records 테이블
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slip_no TEXT UNIQUE,
        date TEXT,
        waste_type TEXT,
        amount REAL,
        carrier TEXT,
        vehicle_no TEXT,
        processor TEXT,
        note1 TEXT,
        note2 TEXT,
        category TEXT,
        supplier TEXT,
        status TEXT DEFAULT 'completed',
        is_local INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_slip_no ON records(slip_no)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_date ON records(date)')

    # schedules 테이블
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        content TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_sched_date ON schedules(date)')

    # liquid_waste 테이블
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS liquid_waste (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year_month TEXT NOT NULL,
        discharge_date TEXT,
        receive_date TEXT,
        waste_type TEXT,
        content TEXT,
        team TEXT,
        discharger TEXT,
        quantity_ea INTEGER DEFAULT 0,
        amount_kg REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_lw_ym ON liquid_waste(year_month)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_lw_team ON liquid_waste(team)')
    conn.commit()
