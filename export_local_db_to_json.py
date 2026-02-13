import sqlite3
import json
import os

DB_PATH = "waste_management.db"

def dict_factory(cursor, row):
    d = {}
    for idx, col in enumerate(cursor.description):
        d[col[0]] = row[idx]
    return d

try:
    if not os.path.exists(DB_PATH):
        print(f"Error: Database file '{DB_PATH}' not found.")
        exit(1)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = dict_factory
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM records ORDER BY id DESC")
    records = cursor.fetchall()
    
    # Process data to ensure JSON serialization
    processed_records = []
    for r in records:
        # Convert amount to float explicitly if needed, but dict_factory handles most types
        r['amount'] = float(r['amount']) if r['amount'] is not None else 0.0
        
        # Ensure date format is YYYY-MM-DD
        if r['date'] and len(str(r['date'])) > 10:
            r['date'] = str(r['date'])[:10]
            
        # Ensure is_local is set to 1 for deployed environment editing
        r['is_local'] = 1 
        processed_records.append(r)

    with open("render_records.json", "w", encoding="utf-8") as f:
        json.dump(processed_records, f, ensure_ascii=False, indent=2, default=str)
        
    print(f"Successfully exported {len(records)} records to render_records.json")
    
except Exception as e:
    print(f"Error exporting database: {e}")
finally:
    if 'conn' in locals():
        conn.close()
