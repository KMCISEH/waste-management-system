
import psycopg2
from database import get_db_wrapper

def check_liquid_waste():
    conn = get_db_wrapper()
    cursor = conn.cursor()
    
    print("Checking liquid_waste table for 2026-03 or specific dates...")
    
    # Check by year_month
    cursor.execute("SELECT COUNT(*) FROM liquid_waste WHERE year_month = '2026-03'")
    count_3 = cursor.fetchone()[0]
    print(f"Total records for year_month '2026-03': {count_3}")
    
    # Check by specific date
    cursor.execute("SELECT * FROM liquid_waste WHERE discharge_date = '2026-03-17' OR receive_date = '2026-03-17'")
    rows = cursor.fetchall()
    print(f"Records for 2026-03-17: {len(rows)}")
    for row in rows:
        print(row)
        
    conn.close()

if __name__ == "__main__":
    check_liquid_waste()
