import sqlite3
import os

DB_PATH = "waste_management.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 테이블 생성: 지정폐기물 전자인계서 목록
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

    # 인덱스 생성 (검색 성능 향상)
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_slip_no ON records(slip_no)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_date ON records(date)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_waste_type ON records(waste_type)')

    conn.commit()
    conn.close()
    print(f"✅ 데이터베이스(SQLite) 및 테이블 생성 완료: {DB_PATH}")

if __name__ == "__main__":
    init_db()
