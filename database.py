# -*- coding: utf-8 -*-
"""
database.py - Neon PostgreSQL 연결 모듈
- 클라우드 DB(Neon)에 직접 연결합니다.
- 기존 SQLite 동기화 로직을 제거하고 PostgreSQL 연결을 반환합니다.
"""
import psycopg2
from psycopg2.extras import RealDictCursor
import os
import re

# Neon PostgreSQL 연결 문자열
# 기본값으로 사용자님이 주신 주소를 사용하지만, 환경변수가 있으면 그것을 우선합니다.
DATABASE_URL = os.environ.get(
    "DATABASE_URL", 
    "postgresql://neondb_owner:npg_WS5Awkb8NVFZ@ep-dry-mud-a1udwjh7-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
)

def get_db_conn():
    """
    Neon PostgreSQL DB 연결 반환
    RealDictCursor를 사용하여 SQLite의 dict-like 접근을 유지합니다.
    """
    try:
        conn = psycopg2.connect(DATABASE_URL)
        # SQLite의 row_factory=sqlite3.Row와 유사한 동작을 위해 RealDictCursor 사용
        # 단, server.py에서 dict(row)를 사용하는 부분이 있으므로 호환성을 고려해야 함
        return conn
    except Exception as e:
        print(f"[DB] 연결 실패: {e}")
        raise

def get_db_path():
    """기존 코드와 인터페이스 유지를 위한 함수 (PostgreSQL에서는 URL 반환)"""
    return DATABASE_URL.split('@')[-1] # 호스트 정보만 노출

def init_db_tables():
    """PostgreSQL 테이블 생성 (처음 실행 시에만 생성됨)"""
    conn = get_db_conn()
    cursor = conn.cursor()

    # 1. records 테이블
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

    # 2. schedules 테이블
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

    # 3. liquid_waste 테이블
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
    cursor.close()
    conn.close()
    print("[DB] PostgreSQL 테이블 초기화 완료")

# server.py에서 get_db_conn().cursor()를 호출할 때 
# SQLite처럼 사용할 수 있게 래핑이 필요한지 검토 필요.
# psycopg2의 기본 cursor는 튜플을 반환하므로 DictCursor를 사용하는 것이 좋음.

class DBContext:
    """server.py의 conn.cursor(), conn.close() 패턴을 유지하기 위한 래퍼"""
    def __init__(self, conn):
        self.conn = conn
    
    def cursor(self):
        # DictCursor를 기본으로 사용하여 row['column'] 접근 허용
        from psycopg2.extras import DictCursor
        return self.conn.cursor(cursor_factory=DictCursor)
    
    def commit(self):
        return self.conn.commit()
    
    def close(self):
        return self.conn.close()

    def __getattr__(self, name):
        return getattr(self.conn, name)

def get_db_wrapper():
    """server.py에서 사용할 래핑된 연결 반환"""
    return DBContext(get_db_conn())
