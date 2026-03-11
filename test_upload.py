# -*- coding: utf-8 -*-
"""
upload_to_render.py
====================================================
로컬 SQLite DB → Render 배포 서버 완전 덮어쓰기 동기화
====================================================
동작 순서:
  1. 로컬 DB에서 모든 데이터 읽기
  2. Render 서버의 전체 데이터 삭제 (records, schedules, liquid_waste)
  3. 로컬 데이터를 Render로 재업로드

실행 방법: Render에_업로드.bat 더블클릭 또는
  .venv\\Scripts\\python.exe upload_to_render.py
"""

import sqlite3
import sys
import requests
import urllib3
import hashlib
import os

# TLS 경고 무시
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ─────────────────────────────────────────────
# 설정값
# ─────────────────────────────────────────────
# === 기본 설정 ===
# 테스트를 위해 로컬 배포용 서버 포트 (8001)로 설정
RENDER_API_BASE_URL = "http://localhost:8001/api"
ADMIN_PASSWORD = "kmci2026"  # 서버의 ADMIN_PASSWORD와 일치해야 함
NETWORK_FOLDER_SUBPATH = r"안전환경팀\박봉육\지정폐기물 관리시스템DB"
DB_FILENAME = "waste_management.db"


# ─────────────────────────────────────────────
# 로컬 DB 경로 탐색
# ─────────────────────────────────────────────
def find_db_path():
    """테스트를 위해 무조건 현재 배포(사외) 폴더의 DB를 찾도록 고정"""
    local = os.path.join(os.path.dirname(os.path.abspath(__file__)), DB_FILENAME)
    if os.path.exists(local):
        return local

    return None


# ─────────────────────────────────────────────
# 관리자 토큰
# ─────────────────────────────────────────────
def get_admin_token():
    return hashlib.sha256(ADMIN_PASSWORD.encode()).hexdigest()


# ─────────────────────────────────────────────
# Render 서버 웨이크업
# ─────────────────────────────────────────────
def wakeup_render():
    print("Render 서버 연결 확인 중...")
    print("(무료 서버는 처음 1~2분 정도 대기가 필요할 수 있습니다)")
    try:
        resp = requests.get(f"{RENDER_API_BASE_URL}/health", timeout=90, verify=False)
        if resp.ok:
            data = resp.json()
            print(f"✅ 서버 연결 성공! (상태: {data.get('status', 'ok')})")
            return True
        else:
            print(f"⚠️  서버 응답 이상: {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ 서버 연결 실패: {e}")
        return False


# ─────────────────────────────────────────────
# STEP 1. Render DB 전체 삭제
# ─────────────────────────────────────────────
def nuke_render_db(token):
    """Render 서버의 모든 테이블 데이터를 삭제"""
    headers = {"X-Admin-Token": token}
    print("\n[삭제 단계] Render 서버 데이터 전체 삭제 중...")

    # 1-A. records 전체 삭제 (bulk endpoint 사용)
    try:
        resp = requests.delete(f"{RENDER_API_BASE_URL}/records", headers=headers, timeout=30, verify=False)
        if resp.ok:
            print("  ✅ records 삭제 완료")
        else:
            print(f"  ⚠️  records 삭제 응답: {resp.status_code} {resp.text[:60]}")
    except Exception as e:
        print(f"  ❌ records 삭제 오류: {e}")

    # 1-B. schedules 전체 삭제 (개별 ID 조회 후 삭제)
    try:
        resp = requests.get(f"{RENDER_API_BASE_URL}/schedules", timeout=30, verify=False)
        resp.raise_for_status()
        schedules = resp.json()
        deleted = 0
        for s in schedules:
            sid = s.get("id")
            if sid:
                r = requests.delete(f"{RENDER_API_BASE_URL}/schedules/{sid}", headers=headers, timeout=15, verify=False)
                if r.ok:
                    deleted += 1
        print(f"  ✅ schedules 삭제 완료: {deleted}건")
    except Exception as e:
        print(f"  ❌ schedules 삭제 오류: {e}")

    # 1-C. liquid_waste 전체 삭제 (연월별 삭제)
    try:
        resp = requests.get(f"{RENDER_API_BASE_URL}/liquid-waste", timeout=30, verify=False)
        resp.raise_for_status()
        items = resp.json()
        # 고유 연월 목록 추출
        year_months = list(set(item.get("year_month") for item in items if item.get("year_month")))
        deleted = 0
        for ym in year_months:
            r = requests.delete(f"{RENDER_API_BASE_URL}/liquid-waste/{ym}", headers=headers, timeout=15, verify=False)
            if r.ok:
                deleted += 1
        print(f"  ✅ liquid_waste 삭제 완료: {len(year_months)}개월 / {len(items)}건")
    except Exception as e:
        print(f"  ❌ liquid_waste 삭제 오류: {e}")


# ─────────────────────────────────────────────
# STEP 2. 로컬 데이터 Render에 업로드
# ─────────────────────────────────────────────
def upload_records(conn, token):
    print("\n[1/3] 인계서(records) 업로드 중...")
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM records ORDER BY date ASC, id ASC")
    rows = [dict(r) for r in cursor.fetchall()]
    print(f"  로컬 DB: {len(rows)}건")

    headers = {"X-Admin-Token": token}
    uploaded = 0
    failed   = 0

    for r in rows:
        raw_date   = r.get("date", "") or ""
        clean_date = raw_date[:10] if raw_date else ""

        payload = {
            "slip_no":    r.get("slip_no", "") or "",
            "date":       clean_date,
            "waste_type": r.get("waste_type", "") or "",
            "amount":     float(r.get("amount", 0) or 0),
            "carrier":    r.get("carrier", "") or "",
            "vehicle_no": r.get("vehicle_no", "") or "",
            "processor":  r.get("processor", "") or "",
            "note1":      r.get("note1", "") or "",
            "note2":      r.get("note2", "") or "",
            "category":   r.get("category", "") or "",
            "supplier":   r.get("supplier", "") or "",
            "status":     r.get("status", "completed") or "completed",
        }

        try:
            resp = requests.post(
                f"{RENDER_API_BASE_URL}/records",
                json=payload,
                headers=headers,
                timeout=30,
                verify=False,
            )
            if resp.status_code in (200, 201):
                uploaded += 1
            else:
                print(f"  [실패] 전표번호={payload['slip_no']} | {resp.status_code} | {resp.text[:80]}")
                failed += 1
        except Exception as e:
            print(f"  [오류] {e}")
            failed += 1

    print(f"  ✅ 완료: 업로드 {uploaded}건 / 실패 {failed}건")
    return uploaded, failed


def upload_schedules(conn, token):
    print("\n[2/3] 일정(schedules) 업로드 중...")
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM schedules ORDER BY date ASC, id ASC")
    rows = [dict(r) for r in cursor.fetchall()]
    print(f"  로컬 DB: {len(rows)}건")

    headers = {"X-Admin-Token": token}
    uploaded = 0
    failed   = 0

    for s in rows:
        payload = {
            "date":    s.get("date", "") or "",
            "content": s.get("content", "") or "",
            "status":  s.get("status", "pending") or "pending",
        }
        try:
            resp = requests.post(
                f"{RENDER_API_BASE_URL}/schedules",
                json=payload,
                headers=headers,
                timeout=30,
                verify=False,
            )
            if resp.status_code in (200, 201):
                uploaded += 1
            else:
                print(f"  [실패] {payload['date']} | {resp.status_code} | {resp.text[:60]}")
                failed += 1
        except Exception as e:
            print(f"  [오류] {e}")
            failed += 1

    print(f"  ✅ 완료: 업로드 {uploaded}건 / 실패 {failed}건")
    return uploaded, failed


def upload_liquid_waste(conn, token):
    print("\n[3/3] 액상폐기물(liquid_waste) 업로드 중...")
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM liquid_waste ORDER BY year_month, id ASC")
    rows = [dict(r) for r in cursor.fetchall()]
    print(f"  로컬 DB: {len(rows)}건")

    if not rows:
        print("  (데이터 없음, 건너뜀)")
        return 0, 0

    headers = {"X-Admin-Token": token}
    uploaded = 0
    failed   = 0

    for item in rows:
        payload = {
            "year_month":     item.get("year_month", "") or "",
            "discharge_date": item.get("discharge_date", "") or "",
            "receive_date":   item.get("receive_date", "") or "",
            "waste_type":     item.get("waste_type", "") or "",
            "content":        item.get("content", "") or "",
            "team":           item.get("team", "") or "",
            "discharger":     item.get("discharger", "") or "",
            "quantity_ea":    int(item.get("quantity_ea", 0) or 0),
            "amount_kg":      float(item.get("amount_kg", 0) or 0),
        }
        try:
            resp = requests.post(
                f"{RENDER_API_BASE_URL}/liquid-waste/sync",
                json=payload,
                headers=headers,
                timeout=30,
                verify=False,
            )
            if resp.status_code in (200, 201):
                uploaded += 1
            else:
                print(f"  [실패] {payload['year_month']} {payload['team']} | {resp.status_code} | {resp.text[:80]}")
                failed += 1
        except Exception as e:
            print(f"  [오류] {e}")
            failed += 1

    print(f"  ✅ 완료: 업로드 {uploaded}건 / 실패 {failed}건")
    return uploaded, failed


# ─────────────────────────────────────────────
# 메인
# ─────────────────────────────────────────────
def main():
    print("=" * 60)
    print("  지정폐기물 관리시스템 - 로컬 → Render 완전 덮어쓰기")
    print("=" * 60)
    print()
    print("  ⚠️  주의: Render 서버의 기존 데이터를 모두 삭제하고")
    print("           로컬 DB 데이터로 완전히 교체합니다.")
    print()

    # 1. DB 경로 확인
    db_path = find_db_path()
    if not db_path:
        print("[오류] 로컬 DB 파일을 찾을 수 없습니다.")
        print(f"   경로: X:\\{NETWORK_FOLDER_SUBPATH}\\{DB_FILENAME}")
        input("\n아무 키나 누르면 종료됩니다...")
        sys.exit(1)
    print(f"[DB 경로] {db_path}")

    # 2. Render 서버 웨이크업
    if not wakeup_render():
        print("\n[오류] Render 서버에 연결할 수 없습니다.")
        input("\n아무 키나 누르면 종료됩니다...")
        sys.exit(1)

    # 3. 토큰 & DB 연결
    token = get_admin_token()
    print("\n[인증] 관리자 인증 준비 완료")

    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
    except Exception as e:
        print(f"\n[오류] DB 연결 실패: {e}")
        input("\n아무 키나 누르면 종료됩니다...")
        sys.exit(1)

    print("\n" + "─" * 60)

    # 4. Render DB 전체 삭제
    nuke_render_db(token)

    print("\n" + "─" * 60)
    print("[업로드 단계] 로컬 데이터를 Render로 업로드 중...")

    # 5. 로컬 데이터 업로드
    r_up,  r_fail  = upload_records(conn, token)
    s_up,  s_fail  = upload_schedules(conn, token)
    lw_up, lw_fail = upload_liquid_waste(conn, token)

    conn.close()

    # 6. 최종 요약
    print("\n" + "=" * 60)
    print("  동기화 완료 요약")
    print("=" * 60)
    print(f"  [인계서]    : 업로드 {r_up}건 / 실패 {r_fail}건")
    print(f"  [일정]      : 업로드 {s_up}건 / 실패 {s_fail}건")
    print(f"  [액상폐기물]: 업로드 {lw_up}건 / 실패 {lw_fail}건")
    print()
    print("  >> 브라우저에서 아래 주소로 확인하세요:")
    print("     https://waste-api-3j2l.onrender.com")
    print("=" * 60)

    input("\n아무 키나 누르면 종료됩니다...")


if __name__ == "__main__":
    main()
