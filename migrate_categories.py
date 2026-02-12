# -*- coding: utf-8 -*-
import sqlite3

def migrate_existing_data():
    conn = sqlite3.connect("waste_management.db")
    cursor = conn.cursor()
    
    rules = [
        ('%해동이앤티%', 'AO-Tar'),
        ('%제일자원%', 'AO-TAR'),
        ('%디에너지%', '메탄올')
    ]
    
    total_updated = 0
    for pattern, category in rules:
        cursor.execute('''
            UPDATE records 
            SET category = ? 
            WHERE processor LIKE ? 
            AND (category IS NULL OR category = '' OR category = 'nan')
        ''', (category, pattern))
        total_updated += cursor.rowcount
        
    conn.commit()
    conn.close()
    print(f"✅ 기존 데이터 {total_updated}건에 대해 자동 분류 규칙이 적용되었습니다.")

if __name__ == "__main__":
    migrate_existing_data()
