# -*- coding: utf-8 -*-
"""
database.py - 사내 전용 SQLite DB 연결 모듈
네트워크 드라이브(공유 폴더)의 DB를 자동으로 찾아 연결합니다.

DB 저장 경로: [드라이브]:\안전환경팀\박봉육\지정폐기물 관리시스템DB\waste_management.db
드라이브 문자(X, Y, Z 등)가 PC마다 다를 수 있으므로 A~Z 자동 탐색합니다.
"""
import sqlite3
import os
import re
import shutil
import time

# 네트워크 폴더 내부 경로 (드라이브 문자 제외)
NETWORK_FOLDER_SUBPATH = r"안전환경팀\박봉육\지정폐기물 관리시스템DB"
DB_FILENAME = "waste_management.db"

# 현재 스크립트 위치 (폴백용 로컬 경로)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOCAL_DB_PATH = os.path.join(BASE_DIR, DB_FILENAME)

# 마지막 동기화 시간 저장 (너무 자주 실행되는 것 방지)
_last_sync_time = 0
SYNC_INTERVAL = 30  # 30초마다 체크


def find_network_db_path():
    """
    A~Z 드라이브를 순서대로 탐색하여
    '안전환경팀\\박봉육\\지정폐기물 관리시스템DB' 폴더가 있는 드라이브를 찾음.
    
    Returns:
        str: 네트워크 DB 파일 경로 (발견 시), None (미발견 시)
    """
    # X 드라이브를 먼저, 그 다음 나머지 드라이브 순서로 시도
    drive_letters = list("XZYKWVUTSRQPONMLKJIHGFEDCBA")
    
    for drive in drive_letters:
        candidate = os.path.join(f"{drive}:\\", NETWORK_FOLDER_SUBPATH)
        if os.path.isdir(candidate):
            db_path = os.path.join(candidate, DB_FILENAME)
            return db_path
    
    return None


def get_db_path():
    """DB 경로를 반환 (네트워크 우선, 없으면 로컬)"""
    net_path = find_network_db_path()
    if net_path:
        return net_path
    return LOCAL_DB_PATH


def sync_db_files():
    """
    네트워크 DB와 로컬 DB를 동기화합니다.
    - 두 파일 중 수정 시간이 더 최신인 것으로 다른 쪽을 덮어씁니다.
    """
    global _last_sync_time
    now = time.time()
    if now - _last_sync_time < SYNC_INTERVAL:
        return
        
    net_path = find_network_db_path()
    loc_path = LOCAL_DB_PATH
    
    if not net_path:
        return # 네트워크 연결 안됨
        
    try:
        net_exists = os.path.exists(net_path)
        loc_exists = os.path.exists(loc_path)
        
        if net_exists and loc_exists:
            net_mtime = os.path.getmtime(net_path)
            loc_mtime = os.path.getmtime(loc_path)
            
            # 2초 이상의 차이가 있을 때만 복사 (오차 고려)
            if loc_mtime > net_mtime + 2:
                print(f"[Sync] 로컬 DB가 최신입니다. 네트워크로 복사 중... ({loc_path} -> {net_path})")
                shutil.copy2(loc_path, net_path)
            elif net_mtime > loc_mtime + 2:
                print(f"[Sync] 네트워크 DB가 최신입니다. 로컬로 복사 중... ({net_path} -> {loc_path})")
                shutil.copy2(net_path, loc_path)
                
        elif net_exists and not loc_exists:
            print(f"[Sync] 로컬 DB가 없습니다. 네트워크에서 가져오는 중...")
            shutil.copy2(net_path, loc_path)
            
        elif not net_exists and loc_exists:
            # 네트워크 폴더는 있는데 파일이 없는 경우
            print(f"[Sync] 네트워크 DB가 없습니다. 로컬 DB를 업로드 중...")
            shutil.copy2(loc_path, net_path)
            
        _last_sync_time = now
    except Exception as e:
        print(f"[Sync] 동기화 중 오류 발생: {e}")


def refresh_db_path():
    """드라이브 연결 상태 재확인"""
    sync_db_files()
    return get_db_path()


# === SQLite 호환 래퍼 ===
# server.py에서 %s 문법을 사용하므로 자동 변환하는 래퍼

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
        # 3) ON CONFLICT ... DO UPDATE SET → INSERT OR REPLACE로 단순화
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
    SQLite DB 연결 반환 (네트워크 드라이브 우선, 없으면 로컬)
    """
    sync_db_files()
    db_path = get_db_path()
    
    # DB 폴더가 없으면 생성
    db_dir = os.path.dirname(db_path)
    if db_dir and not os.path.exists(db_dir):
        try:
            os.makedirs(db_dir, exist_ok=True)
            print(f"[DB] 폴더 생성: {db_dir}")
        except Exception as e:
            print(f"[DB] 폴더 생성 실패, 로컬로 전환: {e}")
            db_path = LOCAL_DB_PATH
    
    is_new = not os.path.exists(db_path)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    
    # WAL 모드 활성화 (다중 PC 동시 접근 시 성능 및 안정성 향상)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")  # 5초 대기 후 오류
    
    init_sqlite_tables(conn)
    
    if is_new:
        print(f"[DB] 새 데이터베이스 생성 완료: {db_path}")
    
    return SQLiteConnectionWrapper(conn)


def init_sqlite_tables(conn):
    """SQLite 테이블 생성 (처음 실행 시에만 생성됨)"""
    cursor = conn.cursor()

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
