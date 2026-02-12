import sys
import os
# 현재 디렉토리를 경로에 추가하여 린터가 로컬 모듈을 찾을 수 있게 함
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import requests
import pandas as pd

BASE_URL = "http://localhost:8000/api"

def test_api():
    print("--- 1. 데이터 조회 테스트 ---")
    resp = requests.get(f"{BASE_URL}/records")
    if resp.status_code == 200:
        print(f"✅ 조회 성공: {len(resp.json())}건")
    else:
        print(f"❌ 조회 실패: {resp.status_code}")
        return

    print("\n--- 2. 엑셀 내보내기 테스트 ---")
    resp = requests.get(f"{BASE_URL}/export/excel")
    if resp.status_code == 200:
        with open("test_export.xlsx", "wb") as f:
            f.write(resp.content)
        print("✅ 엑셀 내보내기 성공 (test_export.xlsx)")
    else:
        print(f"❌ 엑셀 내보내기 실패: {resp.status_code}")
        return

    print("\n--- 3. 엑셀 가져오기 테스트 ---")
    with open("test_export.xlsx", "rb") as f:
        files = {"file": ("test_export.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        resp = requests.post(f"{BASE_URL}/import/excel", files=files)
    if resp.status_code == 200:
        print(f"✅ 엑셀 가져오기 성공: {resp.json()}")
    else:
        print(f"❌ 엑셀 가져오기 실패: {resp.text}")

    print("\n--- 4. CSV 가져오기 테스트 ---")
    csv_data = "slip_no,date,waste_type,amount,carrier,processor\nTEST-001,2026-02-12,폐산,1.5,운반업체A,처리업체B"
    with open("test.csv", "w", encoding="utf-8") as f:
        f.write(csv_data)
    
    with open("test.csv", "rb") as f:
        files = {"file": ("test.csv", f, "text/csv")}
        resp = requests.post(f"{BASE_URL}/import/csv", files=files)
    if resp.status_code == 200:
        print(f"✅ CSV 가져오기 성공: {resp.json()}")
    else:
        print(f"❌ CSV 가져오기 실패: {resp.text}")

    # 정리
    os.remove("test_export.xlsx")
    os.remove("test.csv")

if __name__ == "__main__":
    try:
        test_api()
    except Exception as e:
        print(f"🔥 테스드 중 오류 발생: {e}")
