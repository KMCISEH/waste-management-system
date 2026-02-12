import sqlite3
import os

DB_PATH = "waste_management.db"

if not os.path.exists(DB_PATH):
    print(f"Error: Database file {DB_PATH} not found.")
    exit(1)

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

print("Migrating database...")
try:
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
    conn.commit()
    print("Migration successful: 'schedules' table created.")
except Exception as e:
    print(f"Migration failed: {e}")
finally:
    conn.close()
