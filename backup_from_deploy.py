# -*- coding: utf-8 -*-
"""
배포 환경(Render) 데이터를 로컬 JSON 파일로 백업하는 스크립트
사용법: python backup_from_deploy.py
"""
import json
import os
import time
import requests
import urllib3

# === CONFIG ===
RENDER_URL = "https://waste-api-3j2l.onrender.com"
VERIFY_SSL = False  # SSL 인증서 검증 (사내 환경에서 문제 시 False)

# 백업 대상 및 저장 파일 매핑
BACKUP_TARGETS = [
    {
        "name": "인계서 기록",
        "endpoint": "/api/records",
        "save_to": "render_records.json",
    },
    {
        "name": "일정 데이터",
        "endpoint": "/api/schedules",
        "save_to": "local_schedules.json",
    },
    {
        "name": "액상폐기물 데이터",
        "endpoint": "/api/liquid-waste",
        "save_to": "local_liquid_waste.json",
    },
]

# === MAIN ===
def backup():
    """배포 환경 데이터를 로컬 JSON 파일로 백업"""
    if not VERIFY_SSL:
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    print("=" * 50)
    print("  배포 환경 -> 로컬 백업 시작")
    print(f"  서버: {RENDER_URL}")
    print("=" * 50)

    # === 1. 서버 상태 확인 ===
    try:
        r = requests.get(f"{RENDER_URL}/api/health", verify=VERIFY_SSL, timeout=30)
        r.raise_for_status()
        print(f"\n[OK] 서버 연결 성공: {r.json()}")
    except Exception as e:
        print(f"\n[ERROR] 서버 연결 실패: {e}")
        print("Render 서버가 sleep 상태일 수 있습니다. 잠시 후 재시도해주세요.")
        return

    # === 2. 각 데이터 백업 ===
    total_records = 0
    start_time = time.time()

    for target in BACKUP_TARGETS:
        name = target["name"]
        endpoint = target["endpoint"]
        save_to = target["save_to"]

        try:
            print(f"\n--- {name} 백업 중... ---")
            r = requests.get(f"{RENDER_URL}{endpoint}", verify=VERIFY_SSL, timeout=30)
            r.raise_for_status()
            data = r.json()
            count = len(data)

            # 기존 백업 파일이 있으면 이전 건수 표시
            old_count = 0
            if os.path.exists(save_to):
                with open(save_to, "r", encoding="utf-8") as f:
                    try:
                        old_data = json.load(f)
                        old_count = len(old_data)
                    except json.JSONDecodeError:
                        old_count = 0

            # JSON 파일 저장
            with open(save_to, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=None)

            diff = count - old_count
            diff_str = f" (변동: +{diff})" if diff > 0 else f" (변동: {diff})" if diff < 0 else " (변동 없음)"
            print(f"  [OK] {save_to} <- {count}건 저장{diff_str}")
            total_records += count

        except Exception as e:
            print(f"  [ERROR] {name} 백업 실패: {e}")

    # === 3. 결과 요약 ===
    elapsed = time.time() - start_time
    print("\n" + "=" * 50)
    print(f"  백업 완료! 총 {total_records}건, 소요시간: {elapsed:.1f}초")
    print(f"  로컬 서버에서 확인: python server.py -> http://localhost:8000")
    print("=" * 50)


if __name__ == "__main__":
    backup()
