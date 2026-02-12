/* ============================================
   폐기물 관리 시스템 - Main Application (Database API version)
   ============================================ */

const APP = {
  records: [],
  masterData: {},
  currentPage: "dashboard",
  recordsPage: 1,
  recordsPerPage: 50,
  sortField: "date",
  sortDir: "desc",
  charts: {},
  calendar: {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    schedules: [],
  },
  // 보안 설정: localhost 접속이 아니면 읽기 전용 모드 활성화
  isReadOnly: !["localhost", "127.0.0.1"].includes(window.location.hostname),
  // API 베이스 URL 설정
  get apiBase() {
    return ["localhost", "127.0.0.1"].includes(window.location.hostname)
      ? "" // 로컬 환경에서는 상대 경로 사용 (server.py가 서빙)
      : "https://waste-management-system-tkkn.onrender.com"; // 배포 환경(Firebase)에서는 Render 백엔드 사용
  },
};

document.addEventListener("DOMContentLoaded", async () => {
  await loadData();
  initNavigation();
  initTheme();
  initSidebar();
  updateCurrentDate();
  renderDashboard();
  initRecordsPage();
  initSchedulePage();
  initStatsPage();
});

async function loadData() {
  try {
    const [recordsRes, masterRes] = await Promise.all([
      fetch(`${APP.apiBase}/api/records`),
      fetch(`${APP.apiBase}/api/master`),
    ]);
    if (!recordsRes.ok || !masterRes.ok) throw new Error("API 연동 실패");

    const rawRecords = await recordsRes.json();
    APP.records = rawRecords.map((r) => ({
      id: r.id,
      slipNo: r.slip_no,
      date: r.date ? r.date.split(" ")[0] : "",
      wasteName: r.waste_type,
      amount: r.amount,
      carrier: r.carrier,
      vehicle: r.vehicle_no,
      processor: r.processor,
      note: r.note1 + (r.note2 ? `, ${r.note2}` : ""),
      category: (r.category || "").replace(/ao-tar/gi, "AO-Tar"),
      location: r.supplier || "공장",
      status: r.status || "completed",
    }));

    APP.masterData = await masterRes.json();
    document.getElementById("lastSync").textContent =
      `DB 활성화됨 (총 ${APP.records.length}건)`;
    populateFormSelects();
    populateColumnFilters();
    initDashboard(); // 대시보드 초기화 추가
  } catch (e) {
    console.error("데이터 로딩 실패:", e);
    showToast("서버 연결 실패. server.py를 실행하세요.", "error");
  }
}

function initNavigation() {
  document.querySelectorAll(".nav-item, [data-page]").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      navigateTo(item.dataset.page);
    });
  });
  window.addEventListener("hashchange", () => {
    const page = window.location.hash.substring(1) || "dashboard";
    navigateTo(page, false);
  });
}

function navigateTo(page, updateHash = true) {
  APP.currentPage = page;
  document.querySelectorAll(".page").forEach((el) => {
    el.classList.remove("active");
    if (el.id === `page-${page}`) el.classList.add("active");
  });
  document.querySelectorAll(".nav-item").forEach((el) => {
    el.classList.remove("active");
    if (el.dataset.page === page) el.classList.add("active");
  });

  const titles = {
    dashboard: "대시보드",
    schedule: "배차/일정 관리",
    records: "전자인계서 이력",
    stats: "통계 분석",
    "liquid-waste": "팀별 액상폐기물 관리",
  };
  const title = titles[page] || "지정폐기물 관리";
  document.querySelector(
    ".header-left .breadcrumb span:last-child",
  ).textContent = title;
  document.title = `${title} | KMCI 안전환경팀`;

  if (updateHash) {
    window.location.hash = page;
  }

  // 페이지별 초기화
  if (page === "schedule") {
    // 캘린더 페이지 진입 시 크기 재계산 등을 위해 렌더링
    renderCalendar();
  }
  if (page === "stats") initStatsPage();
  if (page === "records") renderRecordsTable();
  if (page === "dashboard") initDashboard();
  if (page === "liquid-waste") initLiquidWastePage();
}

function initTheme() {
  const saved = localStorage.getItem("waste-theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  updateThemeIcon(saved);
  document.getElementById("themeToggle").addEventListener("click", () => {
    const next =
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "light"
        : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("waste-theme", next);
    updateThemeIcon(next);
  });
}

function updateThemeIcon(theme) {
  document.getElementById("themeToggle").innerHTML =
    theme === "dark"
      ? '<i class="fas fa-sun"></i><span>라이트 모드</span>'
      : '<i class="fas fa-moon"></i><span>다크 모드</span>';
}

function initSidebar() {
  document
    .getElementById("mobileMenuBtn")
    .addEventListener("click", () =>
      document.getElementById("sidebar").classList.toggle("open"),
    );
}

function updateCurrentDate() {
  document.getElementById("currentDate").textContent =
    new Date().toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    });
}

// DASHBOARD
function initDashboard() {
  const yearSelect = document.getElementById("dashboardYear");
  const monthSelect = document.getElementById("dashboardMonth");

  if (!yearSelect || !monthSelect) return;

  // 연도 셀렉트 초기화 (데이터 기반)
  const years = new Set(
    APP.records
      .map((r) => (r.date ? r.date.split("-")[0] : ""))
      .filter((y) => y),
  );
  const currentYear = new Date().getFullYear().toString();
  years.add(currentYear);

  const sortedYears = Array.from(years).sort().reverse();

  yearSelect.innerHTML = sortedYears
    .map((y) => `<option value="${y}">${y}년</option>`)
    .join("");
  yearSelect.value = currentYear;

  // 현재 월 선택
  monthSelect.value = "all"; // 기본값 전체

  // 이벤트 리스너
  yearSelect.onchange = renderDashboard;
  monthSelect.onchange = renderDashboard;

  renderDashboard();
}

function renderDashboard() {
  const year =
    document.getElementById("dashboardYear")?.value ||
    new Date().getFullYear().toString();
  const month = document.getElementById("dashboardMonth")?.value || "all";

  // 필터링된 데이터
  const filteredRecords = APP.records.filter((r) => {
    if (!r.date) return false;
    const rYear = r.date.split("-")[0];
    const rMonth = r.date.split("-")[1];

    if (month === "all") return rYear === year;
    return rYear === year && rMonth === month;
  });

  // 통계 카드 업데이트
  document.getElementById("statTotal").textContent =
    filteredRecords.length.toLocaleString();
  document.getElementById("statAmount").textContent = filteredRecords
    .reduce((s, r) => s + (r.amount || 0), 0)
    .toFixed(1);

  // 배차 대기는 전체 기준 (필터링 제외)
  const pendingCount = APP.records.filter(
    (r) => r.status && r.status !== "completed",
  ).length;
  // statPending 제거됨
  const pendingBadge = document.getElementById("pendingBadge");
  if (pendingBadge) pendingBadge.textContent = pendingCount;

  // 폐공드럼, 폐IBC 통계 집계 (필터링된 데이터 기준)
  let totalDrum = 0;
  let totalIbc = 0;
  filteredRecords.forEach((r) => {
    const note = r.category || "";
    const drumMatch = note.match(/폐공드럼\s*(\d+)/);
    const ibcMatch = note.match(/폐IBC\s*(\d+)/);
    if (drumMatch) totalDrum += parseInt(drumMatch[1], 10);
    if (ibcMatch) totalIbc += parseInt(ibcMatch[1], 10);
  });

  const statDrum = document.getElementById("statDrum");
  const statIBC = document.getElementById("statIBC");
  if (statDrum) statDrum.textContent = totalDrum.toLocaleString();
  if (statIBC) statIBC.textContent = totalIbc.toLocaleString();

  if (pendingBadge) {
    pendingBadge.style.display = pendingCount > 0 ? "inline" : "none";
  }

  // 월별 차트는 연간 보기일 때만 의미가 있으므로, 특정 월 선택 시 일별 차트로 변경하거나 그대로 둠
  // 여기서는 데이터 소스만 변경하여 차트 업데이트
  renderMonthlyChart(year); // 월별 차트는 연도 기준 고정
  updateChartsWithData(filteredRecords);
  renderRecentTable(); // 최근 이력은 전체 기준 유지 또는 필터 연동? -> 전체 기준 유지
}

function updateChartsWithData(records) {
  // 도넛 차트 (폐기물 종류)
  const wasteMap = {};
  records.forEach((r) => {
    const n = shortenWasteName(r.wasteName);
    wasteMap[n] = (wasteMap[n] || 0) + (r.amount || 0);
  });
  const wasteSorted = Object.entries(wasteMap).sort((a, b) => b[1] - a[1]);

  // 차트 생성 로직 재사용 (renderWasteTypeChart 내부 로직과 유사하게 처리)
  if (APP.charts.wasteType) APP.charts.wasteType.destroy();

  const premiumPalette = [
    "#6366f1",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#06b6d4",
    "#8b5cf6",
    "#ec4899",
    "#f97316",
    "#14b8a6",
    "#3b82f6",
  ];

  APP.charts.wasteType = new Chart(document.getElementById("wasteTypeChart"), {
    type: "doughnut",
    data: {
      labels: wasteSorted.map((s) => s[0]),
      datasets: [
        {
          data: wasteSorted.map((s) => s[1].toFixed(1)),
          backgroundColor: premiumPalette,
          borderWidth: 2,
          borderColor: "rgba(255, 255, 255, 0.1)",
        },
      ],
    },
    options: {
      cutout: "70%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: getComputedStyle(document.documentElement)
              .getPropertyValue("--text-primary")
              .trim(),
            font: { size: 11 },
            padding: 15,
            usePointStyle: true,
          },
        },
      },
    },
  });

  // 바 차트 (처리업체)
  const procMap = {};
  records.forEach((r) => {
    const n = normalizeProcessor(r.processor);
    procMap[n] = (procMap[n] || 0) + (r.amount || 0);
  });
  const procSorted = Object.entries(procMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (APP.charts.processor) APP.charts.processor.destroy();
  APP.charts.processor = new Chart(document.getElementById("processorChart"), {
    type: "bar",
    data: {
      labels: procSorted.map((s) => s[0]),
      datasets: [
        {
          label: "처리량 (톤)",
          data: procSorted.map((s) => s[1].toFixed(1)),
          backgroundColor: "#6366f1",
          borderRadius: 4,
          barThickness: 16,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          grid: { color: "rgba(100, 116, 139, 0.2)" },
          ticks: {
            color: getComputedStyle(document.documentElement)
              .getPropertyValue("--text-primary")
              .trim(),
          },
        },
        y: {
          grid: { display: false },
          ticks: {
            color: getComputedStyle(document.documentElement)
              .getPropertyValue("--text-primary")
              .trim(),
            autoSkip: false,
          },
        },
      },
    },
  });
}

function renderRecentTable() {
  document.getElementById("recentTable").innerHTML = APP.records
    .slice(0, 8)
    .map(
      (r) => `
        <tr>
            <td>${r.date || "-"}</td>
            <td>${r.slipNo}</td>
            <td>${shortenWasteName(r.wasteName)}</td>
            <td><strong>${r.amount}</strong> 톤</td>
            <td>${normalizeProcessor(r.processor)}</td>
            <td><span class="status-badge status-${r.status}">${getStatusLabel(r.status)}</span></td>
        </tr>
    `,
    )
    .join("");
}

function getStatusLabel(s) {
  return (
    {
      pending: "대기",
      dispatched: "배차됨",
      collecting: "수거중",
      completed: "완료",
    }[s] || "완료"
  );
}

async function deleteRecordAction(id) {
  if (!confirm("이 데이터를 삭제하시겠습니까?")) return;
  try {
    const res = await fetch(`${APP.apiBase}/api/records/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("삭제 실패");
    await loadData();
    renderDashboard();
    if (APP.currentPage === "records") renderRecordsTable();
    showToast("삭제되었습니다.", "warning");
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function editRecordAction(id) {
  const r = APP.records.find((rec) => rec.id === id);
  if (!r) return;

  const modalOverlay = document.getElementById("modalOverlay");
  const modalTitle = document.getElementById("modalTitle");
  const modalBody = document.getElementById("modalBody");
  const modalFooter = document.getElementById("modalFooter");
  const modalClose = document.getElementById("modalClose");

  modalTitle.innerText = "데이터 수정";
  modalBody.innerHTML = `
    <div class="edit-form" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:10px;">
      <div class="form-group">
        <label>처리일</label>
        <input type="date" id="editDate" value="${r.date || ""}">
      </div>
      <div class="form-group">
        <label>전표번호</label>
        <input type="text" id="editSlipNo" value="${r.slipNo || ""}">
      </div>
      <div class="form-group">
        <label>폐기물명</label>
        <input type="text" id="editWasteName" value="${r.wasteName || ""}">
      </div>
      <div class="form-group">
        <label>처리량(톤)</label>
        <input type="number" step="0.01" id="editAmount" value="${r.amount || 0}">
      </div>
      <div class="form-group">
        <label>차량번호</label>
        <input type="text" id="editVehicle" value="${r.vehicle || ""}">
      </div>
      <div class="form-group">
        <label>처리업체</label>
        <input type="text" id="editProcessor" value="${r.processor || ""}">
      </div>
      <div class="form-group">
        <label>처리방법</label>
        <input type="text" id="editNote" value="${r.note || ""}">
      </div>
      <div class="form-group">
        <label>비고</label>
        <input type="text" id="editCategory" value="${r.category || ""}">
      </div>
      <div class="form-group">
        <label>장소</label>
        <select id="editLocation" class="form-control">
          <option value="공장" ${r.location === "공장" ? "selected" : ""}>공장</option>
          <option value="9블럭" ${r.location === "9블럭" ? "selected" : ""}>9블럭</option>
        </select>
      </div>
    </div>
  `;

  modalFooter.innerHTML = `
    <button class="btn btn-ghost" onclick="document.getElementById('modalOverlay').classList.remove('active')">취소</button>
    <button class="btn btn-primary" id="btnSaveEdit">저장하기</button>
  `;

  modalOverlay.classList.add("active");

  // 처리업체 변경 시 비고(category) 자동 매핑 및 UI 변경 (편집 모달용)
  const editProcessor = document.getElementById("editProcessor");
  const editCategoryContainer =
    document.getElementById("editCategory").parentNode;

  // 유광드럼 전용 입력 UI 생성
  const drumInputsHTML = `
    <div id="editDrumInputs" style="display:none; gap:10px; margin-top:5px;">
      <div style="flex:1">
        <label style="font-size:0.8rem">폐공드럼</label>
        <input type="number" id="editDrumQty" class="form-control" placeholder="수량">
      </div>
      <div style="flex:1">
        <label style="font-size:0.8rem">폐IBC</label>
        <input type="number" id="editIbcQty" class="form-control" placeholder="수량">
      </div>
    </div>
  `;
  editCategoryContainer.insertAdjacentHTML("beforeend", drumInputsHTML);

  const updateEditCategory = () => {
    const val = editProcessor.value;
    const categoryInput = document.getElementById("editCategory");
    const drumInputs = document.getElementById("editDrumInputs");

    if (val.includes("유광드럼")) {
      categoryInput.style.display = "none";
      drumInputs.style.display = "flex";

      // 기존 값 파싱
      if (!drumInputs.dataset.initialized) {
        const currentVal = categoryInput.value;
        const drumMatch = currentVal.match(/폐공드럼\s*(\d+)/);
        const ibcMatch = currentVal.match(/폐IBC\s*(\d+)/);
        if (drumMatch)
          document.getElementById("editDrumQty").value = drumMatch[1];
        if (ibcMatch) document.getElementById("editIbcQty").value = ibcMatch[1];
        drumInputs.dataset.initialized = "true";
      }
    } else {
      categoryInput.style.display = "block";
      drumInputs.style.display = "none";

      if (val.includes("해동이앤티")) categoryInput.value = "AO-Tar";
      else if (val.includes("제일자원")) categoryInput.value = "AO-Tar";
      else if (val.includes("디에너지")) categoryInput.value = "메탄올";
    }
  };

  if (editProcessor) {
    editProcessor.onchange = updateEditCategory;
    // 초기 실행
    updateEditCategory();
  }

  // 드럼/IBC 입력 시 기존 비고란 업데이트
  document.getElementById("editDrumQty").oninput = updateDrumCategory;
  document.getElementById("editIbcQty").oninput = updateDrumCategory;

  function updateDrumCategory() {
    const d = document.getElementById("editDrumQty").value;
    const i = document.getElementById("editIbcQty").value;
    const parts = [];
    if (d) parts.push(`폐공드럼 ${d}`);
    if (i) parts.push(`폐IBC ${i}`);
    document.getElementById("editCategory").value = parts.join(", ");
  }

  document.getElementById("btnSaveEdit").onclick = async () => {
    const data = {
      slip_no: document.getElementById("editSlipNo").value,
      date: document.getElementById("editDate").value,
      waste_type: document.getElementById("editWasteName").value,
      amount: parseFloat(document.getElementById("editAmount").value) || 0,
      carrier: r.carrier,
      vehicle_no: document.getElementById("editVehicle").value,
      processor: document.getElementById("editProcessor").value,
      note1: document.getElementById("editNote").value,
      category: document.getElementById("editCategory").value,
      supplier: document.getElementById("editLocation").value,
      status: r.status,
    };

    try {
      showToast("수정 사항 반영 중...", "info");
      const res = await fetch(`${APP.apiBase}/api/records/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      await loadData();
      renderDashboard();
      if (APP.currentPage === "records") renderRecordsTable();
      showToast("수정 완료", "success");
      modalOverlay.classList.remove("active");
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  // Enter Key Support for Edit Modal
  modalBody.querySelectorAll("input, select").forEach((el) => {
    el.onkeyup = (e) => {
      if (e.key === "Enter") document.getElementById("btnSaveEdit").click();
    };
  });

  modalClose.onclick = () => modalOverlay.classList.remove("active");
}

// CALENDAR SYSTEM
function initSchedulePage() {
  // 이벤트 리스너 등록
  document.getElementById("btnPrevMonth").onclick = () => changeMonth(-1);
  document.getElementById("btnNextMonth").onclick = () => changeMonth(1);
  document.getElementById("btnToday").onclick = () => {
    const now = new Date();
    APP.calendar.year = now.getFullYear();
    APP.calendar.month = now.getMonth() + 1;
    renderCalendar();
  };

  loadSchedules();
}

async function loadSchedules() {
  try {
    const res = await fetch(`${APP.apiBase}/api/schedules`);
    if (!res.ok) throw new Error("일정 로딩 실패");
    APP.calendar.schedules = await res.json();
    renderCalendar();
  } catch (e) {
    console.error(e);
    showToast("일정 정보를 불러오지 못했습니다.", "error");
  }
}

function changeMonth(delta) {
  let { year, month } = APP.calendar;
  month += delta;
  if (month < 1) {
    year--;
    month = 12;
  } else if (month > 12) {
    year++;
    month = 1;
  }
  APP.calendar.year = year;
  APP.calendar.month = month;
  renderCalendar();
}

// 한국 공휴일 계산 (2024~2026 하드코딩)
function getKoreanHoliday(year, month, day) {
  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  // 양력 고정 공휴일
  const solarHolidays = {
    "01-01": "신정",
    "03-01": "3.1절",
    "05-05": "어린이날",
    "06-06": "현충일",
    "08-15": "광복절",
    "10-03": "개천절",
    "10-09": "한글날",
    "12-25": "성탄절",
  };

  const md = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (solarHolidays[md]) return solarHolidays[md];

  // 음력 변환 및 대체공휴일 (주요 연도만 하드코딩)
  const lunarHolidays = {
    // 2024
    "2024-02-09": "설날 연휴",
    "2024-02-10": "설날",
    "2024-02-11": "설날 연휴",
    "2024-02-12": "대체공휴일",
    "2024-04-10": "국회의원 선거",
    "2024-05-06": "대체공휴일",
    "2024-05-15": "부처님오신날",
    "2024-09-16": "추석 연휴",
    "2024-09-17": "추석",
    "2024-09-18": "추석 연휴",

    // 2025
    "2025-01-28": "설날 연휴",
    "2025-01-29": "설날",
    "2025-01-30": "설날 연휴",
    "2025-03-03": "대체공휴일",
    "2025-05-05": "어린이날",
    "2025-05-06": "대체공휴일",
    "2025-05-05": "부처님오신날",
    "2025-06-06": "현충일",
    "2025-08-15": "광복절",
    "2025-10-03": "개천절",
    "2025-10-05": "추석 연휴",
    "2025-10-06": "추석",
    "2025-10-07": "추석 연휴",
    "2025-10-08": "대체공휴일",
    "2025-12-25": "성탄절",

    // 2026 (예시)
    "2026-01-01": "신정",
    "2026-02-16": "설날 연휴",
    "2026-02-17": "설날",
    "2026-02-18": "설날 연휴",
    "2026-03-01": "3.1절",
    "2026-03-02": "대체공휴일",
    "2026-05-05": "어린이날",
    "2026-05-24": "부처님오신날",
    "2026-05-25": "대체공휴일",
    "2026-06-06": "현충일",
    "2026-08-15": "광복절",
    "2026-08-17": "대체공휴일",
    "2026-09-24": "추석 연휴",
    "2026-09-25": "추석",
    "2026-09-26": "추석 연휴",
    "2026-10-03": "개천절",
    "2026-10-05": "대체공휴일",
    "2026-10-09": "한글날",
    "2026-12-25": "성탄절",
  };

  return lunarHolidays[dateStr] || null;
}

function renderCalendar() {
  const { year, month, schedules } = APP.calendar;
  const calendarTitle = document.getElementById("calendarTitle");
  const calendarGrid = document.getElementById("calendarGrid");

  if (!calendarTitle || !calendarGrid) return;

  calendarTitle.textContent = `${year}년 ${month}월`;

  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startDay = firstDay.getDay(); // 0: 일요일
  const totalDays = lastDay.getDate();

  // 이전 달의 마지막 날짜들
  const prevLastDay = new Date(year, month - 1, 0).getDate();

  let html = "";

  // 이전 달 날짜 채우기
  for (let i = 0; i < startDay; i++) {
    const dayNum = prevLastDay - startDay + 1 + i;
    html += `
      <div class="calendar-day other-month">
        <div class="day-header"><span class="day-number">${dayNum}</span></div>
      </div>
    `;
  }

  // 이번 달 날짜 채우기
  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() + 1 === month;

  for (let i = 1; i <= totalDays; i++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
    const dayOfWeek = new Date(year, month - 1, i).getDay();
    const isSunday = dayOfWeek === 0;
    const isSaturday = dayOfWeek === 6;
    const isToday = isCurrentMonth && today.getDate() === i;

    const holidayName = getKoreanHoliday(year, month, i);
    const isHoliday = !!holidayName;

    // 해당 날짜의 일정 필터링
    const daySchedules = schedules.filter((s) => s.date === dateStr);

    let dayClass = "";
    if (isToday) dayClass += " today";
    if (isSunday || isHoliday)
      dayClass += " holiday-text"; // 일요일 또는 공휴일은 빨간색
    else if (isSaturday) dayClass += " saturday-text"; // 토요일은 파란색

    html += `
      <div class="calendar-day ${dayClass}" ${APP.isReadOnly ? "" : `onclick="openScheduleModal('${dateStr}')"`}>
        <div class="day-header">
          <span class="day-number">${i}</span>
          ${holidayName ? `<span class="holiday-name">${holidayName}</span>` : ""}
        </div>
        <div class="calendar-events">
          ${daySchedules
            .map(
              (s) => `
            <div class="calendar-event style-${(s.id % 6) + 1} ${s.status === "completed" ? "completed" : ""}" 
                 ${APP.isReadOnly ? "" : `onclick="event.stopPropagation(); openScheduleModal('${dateStr}', ${s.id})"`}>
              ${s.content}${s.status === "completed" ? " (수거완료)" : ""}
            </div>
          `,
            )
            .join("")}
        </div>
      </div>
    `;
  }

  // 다음 달 날짜 채우기 (42칸 - 6주 기준 맞추기 위해)
  const remainingCells = 42 - (startDay + totalDays);
  for (let i = 1; i <= remainingCells; i++) {
    html += `
      <div class="calendar-day other-month">
        <div class="day-header"><span class="day-number">${i}</span></div>
      </div>
    `;
  }

  calendarGrid.innerHTML = html;
}

async function openScheduleModal(date, id = null) {
  const schedule = id ? APP.calendar.schedules.find((s) => s.id === id) : null;
  const isEdit = !!schedule;

  const modalOverlay = document.getElementById("modalOverlay");
  const modalTitle = document.getElementById("modalTitle");
  const modalBody = document.getElementById("modalBody");
  const modalFooter = document.getElementById("modalFooter");
  const modalClose = document.getElementById("modalClose");

  modalTitle.textContent = isEdit ? "일정 수정" : "새 일정 등록";

  modalBody.innerHTML = `
    <div class="modal-form-group">
      <label>날짜</label>
      <input type="date" id="schedDate" value="${date}">
    </div>
    <div class="modal-form-group">
      <label>내용</label>
      <input type="text" id="schedContent" placeholder="예: 해동이앤티 배차" value="${schedule ? schedule.content : ""}">
    </div>
    <div class="modal-form-group">
      <label>상태</label>
      <select id="schedStatus">
        <option value="pending" ${schedule?.status === "pending" ? "selected" : ""}>예정 (미완료)</option>
        <option value="completed" ${schedule?.status === "completed" ? "selected" : ""}>완료됨</option>
      </select>
    </div>
  `;

  let footerHtml = `
    <button class="btn btn-ghost" onclick="document.getElementById('modalOverlay').classList.remove('active')">취소</button>
  `;

  if (isEdit) {
    footerHtml += `
      <button class="btn btn-danger" onclick="deleteScheduleAction(${id})">삭제</button>
      <button class="btn btn-primary" onclick="saveSchedule(${id})">수정 저장</button>
    `;
  } else {
    footerHtml += `
      <button class="btn btn-primary" onclick="saveSchedule()">등록</button>
    `;
  }

  modalFooter.innerHTML = footerHtml;
  modalOverlay.classList.add("active");
  modalClose.onclick = () => modalOverlay.classList.remove("active");

  // Focus content input
  const contentInput = document.getElementById("schedContent");
  const dateInput = document.getElementById("schedDate");

  setTimeout(() => contentInput.focus(), 100);

  // Enter Key Support
  const handleEnter = (e) => {
    if (e.key === "Enter") saveSchedule(id);
  };
  contentInput.onkeyup = handleEnter;
  dateInput.onkeyup = handleEnter;
}

async function saveSchedule(id = null) {
  const date = document.getElementById("schedDate").value;
  const content = document.getElementById("schedContent").value;
  const status = document.getElementById("schedStatus").value;

  if (!content.trim()) {
    showToast("내용을 입력해주세요.", "warning");
    return;
  }

  const data = { date, content, status };

  try {
    const url = id ? `${APP.apiBase}/api/schedules/${id}` : `${APP.apiBase}/api/schedules`;
    const method = id ? "PUT" : "POST";

    const res = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) throw new Error("저장 실패");

    document.getElementById("modalOverlay").classList.remove("active");
    showToast(
      id ? "일정이 수정되었습니다." : "새 일정이 등록되었습니다.",
      "success",
    );
    loadSchedules(); // 목록 갱신
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function deleteScheduleAction(id) {
  if (!confirm("정말 이 일정을 삭제하시겠습니까?")) return;

  try {
    const res = await fetch(`${APP.apiBase}/api/schedules/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("삭제 실패");

    document.getElementById("modalOverlay").classList.remove("active");
    showToast("일정이 삭제되었습니다.", "warning");
    loadSchedules();
  } catch (e) {
    showToast(e.message, "error");
  }
}

// RECORDS
function initRecordsPage() {
  const btnRefresh = document.getElementById("btnRefresh");
  const btnExportExcel = document.getElementById("btnExportExcel");
  const btnExportExcelRecords = document.getElementById(
    "btnExportExcelRecords",
  );
  const btnImportExcel = document.getElementById("btnImportExcel");
  const fileInput = document.getElementById("excelFileInput");
  const dropZone = document.getElementById("dropZone");

  if (btnRefresh) btnRefresh.onclick = () => loadData();

  const exportExcelFn = async () => {
    const filteredData = getFilteredRecords().map((r) => ({
      처리일: r.date ? r.date.split(" ")[0] : "",
      전표번호: r.slipNo,
      폐기물명: r.wasteName,
      "처리량(톤)": r.amount,
      차량번호: r.vehicle,
      처리업체: r.processor,
      처리방법: r.note,
      비고: r.category,
      장소: r.location,
    }));

    if (filteredData.length === 0) {
      showToast("내보낼 데이터가 없습니다.", "warning");
      return;
    }

    try {
      showToast("엑셀 파일을 생성 중입니다...", "info");
      const resp = await fetch(`${APP.apiBase}/api/export/excel/filtered`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filteredData),
      });

      if (!resp.ok) throw new Error("파일 생성 실패");

      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `지정폐기물_인계서_추출_${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      showToast("엑셀 다운로드가 완료되었습니다.", "success");
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  if (btnExportExcel) btnExportExcel.onclick = exportExcelFn;
  if (btnExportExcelRecords) btnExportExcelRecords.onclick = exportExcelFn;

  // 엑셀 가져오기 - 파일 선택 다이얼로그 열기 (읽기 전용 시 숨김)
  if (APP.isReadOnly) {
    if (btnImportExcel) btnImportExcel.style.display = "none";
  } else {
    if (btnImportExcel) {
      btnImportExcel.onclick = () => fileInput.click();
    }
  }

  // Drag and Drop 설정
  if (dropZone) {
    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      dropZone.addEventListener(
        eventName,
        (e) => {
          e.preventDefault();
          e.stopPropagation();
        },
        false,
      );
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      dropZone.addEventListener(
        eventName,
        () => dropZone.classList.add("drag-over"),
        false,
      );
    });

    ["dragleave", "drop"].forEach((eventName) => {
      dropZone.addEventListener(
        eventName,
        () => dropZone.classList.remove("drag-over"),
        false,
      );
    });

    dropZone.addEventListener(
      "drop",
      (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
          handleGlobalFileUpload(files[0]);
        }
      },
      false,
    );
  }

  if (fileInput) {
    fileInput.onchange = (e) => {
      if (e.target.files.length > 0) {
        handleGlobalFileUpload(e.target.files[0]);
        fileInput.value = "";
      }
    };
  }

  populateYearSelect("quickYear");
  const quickYear = document.getElementById("quickYear");
  const quickMonth = document.getElementById("quickMonth");
  if (quickYear) quickYear.value = new Date().getFullYear().toString();

  [
    "filterWasteType",
    "filterProcessor",
    "filterDateFrom",
    "filterDateTo",
    "quickYear",
    "quickMonth",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el)
      el.onchange = () => {
        // 날짜 범위 필터 사용 시 년/월 신속 필터는 초기화
        if (id === "filterDateFrom" || id === "filterDateTo") {
          quickYear.value = "";
          quickMonth.value = "";
        }
        // 년/월 필터 사용 시 날짜 범위 초기화
        if (id === "quickYear" || id === "quickMonth") {
          document.getElementById("filterDateFrom").value = "";
          document.getElementById("filterDateTo").value = "";
        }
        APP.recordsPage = 1;
        renderRecordsTable();
      };
  });

  document.getElementById("searchInput").oninput = debounce(() => {
    APP.recordsPage = 1;
    renderRecordsTable();
  }, 300);

  // 컬럼별 개별 필터 적용
  document.querySelectorAll(".col-filter").forEach((input) => {
    const eventType = input.tagName === "SELECT" ? "change" : "input";
    input.addEventListener(
      eventType,
      debounce(() => {
        APP.recordsPage = 1;
        renderRecordsTable();
      }, 300),
    );
  });

  document.querySelectorAll("#recordsTable th.sortable").forEach((th) => {
    th.onclick = () => {
      const field = th.dataset.sort;
      APP.sortDir =
        APP.sortField === field && APP.sortDir === "desc" ? "asc" : "desc";
      APP.sortField = field;
      renderRecordsTable();
    };
  });

  renderRecordsTable();
}

async function handleGlobalFileUpload(file) {
  const formData = new FormData();
  formData.append("file", file);
  const endpoint = file.name.endsWith(".csv")
    ? `${APP.apiBase}/api/import/csv`
    : `${APP.apiBase}/api/import/excel`;

  try {
    showToast("파일 분석 및 반영 중...", "info");
    const resp = await fetch(endpoint, { method: "POST", body: formData });
    const result = await resp.json();
    if (resp.ok) {
      showToast(
        `반영 완료: ${result.added}건 추가, ${result.skipped}건 중복 제외`,
        "success",
      );
      await loadData();
      renderDashboard();
      if (APP.currentPage === "records") renderRecordsTable();
      if (APP.currentPage === "register") navigateTo("records");
    } else {
      throw new Error(result.detail || "업로드 실패");
    }
  } catch (err) {
    showToast(err.message, "error");
  }
}

function renderRecordsTable() {
  populateColumnFilters();
  const data = getFilteredRecords();
  const pageData = data.slice(
    (APP.recordsPage - 1) * APP.recordsPerPage,
    APP.recordsPage * APP.recordsPerPage,
  );
  document.getElementById("recordsBody").innerHTML =
    pageData
      .map(
        (r) => `
        <tr>
            <td>${r.date || "-"}</td>
            <td>${r.slipNo}</td>
            <td>${shortenWasteName(r.wasteName)}</td>
            <td><strong>${r.amount}</strong> 톤</td>
            <td>${r.vehicle || "-"}</td>
            <td>${normalizeProcessor(r.processor)}</td>
            <td>${r.note || "-"}</td>
            <td>${r.category || "-"}</td>
            <td><span class="badge-location">${r.location}</span></td>
            <td>
                ${
                  APP.isReadOnly
                    ? `
                  <span class="badge" style="background:var(--bg-card);color:var(--text-muted);border:1px solid var(--border);">조회모드</span>
                `
                    : `
                  <div style="display:flex;gap:4px;">
                      <button class="btn btn-ghost btn-xs" onclick="editRecordAction(${r.id})"><i class="fas fa-edit"></i></button>
                      <button class="btn btn-ghost btn-xs" onclick="deleteRecordAction(${r.id})"><i class="fas fa-trash"></i></button>
                  </div>
                `
                }
            </td>
        </tr>
    `,
      )
      .join("") ||
    '<tr><td colspan="9" style="text-align:center;padding:40px;">결과는 없으나, 다른 필터 조건을 확인해 보세요.</td></tr>';
  renderPagination(Math.ceil(data.length / APP.recordsPerPage), data.length);
}

// STATS
function initStatsPage() {
  populateYearSelect("statsYear");

  // 기본적으로 월별 탭 활성화
  document
    .querySelectorAll(".period-tab")
    .forEach((t) => t.classList.remove("active"));
  document
    .querySelector('.period-tab[data-period="monthly"]')
    .classList.add("active");

  document.querySelectorAll(".period-tab").forEach(
    (tab) =>
      (tab.onclick = () => {
        document
          .querySelectorAll(".period-tab")
          .forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        renderStatsCharts();
      }),
  );
  document.getElementById("statsYear").onchange = renderStatsCharts;
  document.getElementById("btnExportStats").onclick = exportStatsCSV;

  // 초기 렌더링
  renderStatsCharts();
}

function renderStatsCharts() {
  const year =
    document.getElementById("statsYear").value ||
    new Date().getFullYear().toString();
  const period =
    document.querySelector(".period-tab.active")?.dataset.period || "monthly";
  const yearRecords = APP.records.filter(
    (r) => r.date && r.date.startsWith(year),
  );
  renderStatsTrendChart(yearRecords, period);
  renderStatsWasteChart(yearRecords);
  renderStatsDetailChart(yearRecords);
  renderStatsTable(yearRecords, period);
}

// CHART LOGIC
function renderMonthlyChart() {
  const year =
    document.getElementById("chartYearSelect").value ||
    new Date().getFullYear().toString();
  const mData = Array.from({ length: 12 }, () => ({ count: 0, amount: 0 }));
  APP.records.forEach((r) => {
    if (r.date && r.date.startsWith(year)) {
      const m = parseInt(r.date.split("-")[1]) - 1;
      mData[m].count++;
      mData[m].amount += r.amount || 0;
    }
  });
  const ctx = document.getElementById("monthlyChart");
  if (!ctx) return;
  if (APP.charts.monthly) APP.charts.monthly.destroy();
  APP.charts.monthly = new Chart(ctx, {
    type: "bar",
    data: {
      labels: mData.map((_, i) => `${i + 1}월`),
      datasets: [
        {
          label: "건수",
          data: mData.map((d) => d.count),
          backgroundColor: "#6366f1",
          yAxisID: "y",
        },
        {
          label: "톤",
          data: mData.map((d) => d.amount.toFixed(1)),
          type: "line",
          borderColor: "#10b981",
          yAxisID: "y1",
        },
      ],
    },
    options: {
      scales: {
        y: { position: "left" },
        y1: { position: "right", grid: { display: false } },
      },
    },
  });
}

function renderWasteTypeChart() {
  const map = {};
  APP.records.forEach((r) => {
    const n = shortenWasteName(r.wasteName);
    map[n] = (map[n] || 0) + (r.amount || 0);
  });
  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
  const premiumPalette = [
    "#6366f1",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#06b6d4",
    "#8b5cf6",
    "#ec4899",
    "#f97316",
    "#14b8a6",
    "#3b82f6",
  ];

  if (APP.charts.wasteType) APP.charts.wasteType.destroy();
  APP.charts.wasteType = new Chart(document.getElementById("wasteTypeChart"), {
    type: "doughnut",
    data: {
      labels: sorted.map((s) => s[0]),
      datasets: [
        {
          data: sorted.map((s) => s[1].toFixed(1)),
          backgroundColor: premiumPalette,
          borderWidth: 2,
          borderColor: "rgba(255, 255, 255, 0.1)",
        },
      ],
    },
    options: {
      cutout: "70%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: getComputedStyle(document.documentElement)
              .getPropertyValue("--text-primary")
              .trim(),
            font: { size: 11 },
            padding: 15,
            usePointStyle: true,
          },
        },
      },
    },
  });
}

function renderProcessorChart() {
  const map = {};
  APP.records.forEach((r) => {
    const n = normalizeProcessor(r.processor);
    map[n] = (map[n] || 0) + (r.amount || 0);
  });
  const sorted = Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  if (APP.charts.processor) APP.charts.processor.destroy();
  APP.charts.processor = new Chart(document.getElementById("processorChart"), {
    type: "bar",
    data: {
      labels: sorted.map((s) => s[0]),
      datasets: [
        {
          data: sorted.map((s) => s[1].toFixed(1)),
          backgroundColor: "#6366f1",
        },
      ],
    },
    options: {
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { color: "rgba(100, 116, 139, 0.2)" },
          ticks: {
            color: getComputedStyle(document.documentElement)
              .getPropertyValue("--text-primary")
              .trim(),
          },
        },
        y: {
          grid: { display: false },
          ticks: {
            color: getComputedStyle(document.documentElement)
              .getPropertyValue("--text-primary")
              .trim(),
          },
        },
      },
    },
  });
}

// UTILS
function shortenWasteName(n) {
  if (!n) return "-";

  // 긴 특수 폐기물 명칭 요약 (화관법 등 법적 문구 제거)
  const summaries = {
    "그 밖의 폐유독물질": "폐유독물질",
    "그 밖의 폐유기용제": "폐유기용제",
    "그 밖의 폐유기용제(액상)": "폐유기용제(액상)",
    "폐유독물질(화학물질관리법 제2조제7호에 따른 유해화학물질을 포함한다)":
      "폐유독물질(유해화학물)",
    "폐유기용제(그 밖의 폐유기용제)": "폐유기용제(기타)",
  };

  if (summaries[n]) return summaries[n];

  // 패턴 기반 요약: 「...」으로 시작하거나 "에 따른" 이 포함된 경우 핵심 키워드 추출
  if (n.includes("에 따른")) {
    const parts = n.split("에 따른");
    return parts[parts.length - 1].trim();
  }

  // 너무 길면 15자 이내로 생략
  return n.length > 20 ? n.substring(0, 18) + ".." : n;
}
function normalizeProcessor(n) {
  return (n || "-").replace(/\(주\)|㈜|주식회사/g, "").trim();
}
function debounce(f, d) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => f(...a), d);
  };
}
function showToast(m, t = "info") {
  const c = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast toast-${t}`;
  toast.innerHTML = `<i class="fas fa-info-circle"></i><span class="toast-msg">${m}</span>`;
  c.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("toast-out");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
function populateSelect(id, opts, def) {
  const s = document.getElementById(id);
  if (!s) return;
  s.innerHTML =
    `<option value="">${def}</option>` +
    opts.map((o) => `<option value="${o}">${o}</option>`).join("");
}
function populateFormSelects() {
  const m = APP.masterData;
  populateSelect("dispatchWaste", m.wasteTypes, "폐기물 선택");
  populateSelect("dispatchProcessor", m.processors, "처리업체 선택");
  populateSelect("dispatchVehicle", m.vehicles, "미정");
  populateSelect("regWasteName", m.wasteTypes, "폐기물 선택");
  populateSelect("regProcessor", m.processors, "처리업체 선택");
  populateSelect("regVehicle", m.vehicles, "선택");
  populateSelect("filterWasteType", m.wasteTypes, "전체 폐기물");
  populateSelect("filterProcessor", m.processors, "전체 업체");
  populateColumnFilters();
}
function populateYearSelect(id) {
  const years = [
    ...new Set(
      APP.records
        .map((r) => (r.date ? r.date.substring(0, 4) : null))
        .filter(Boolean),
    ),
  ]
    .sort()
    .reverse();
  const s = document.getElementById(id);
  if (!s) return;
  s.innerHTML = years
    .map((y) => `<option value="${y}">${y}년</option>`)
    .join("");
}
function getFilteredRecords(excludeCol = null) {
  const s = document.getElementById("searchInput").value.toLowerCase();
  const w = document.getElementById("filterWasteType").value;
  const p = document.getElementById("filterProcessor").value;
  const df = document.getElementById("filterDateFrom").value;
  const dt = document.getElementById("filterDateTo").value;
  const qy = document.getElementById("quickYear").value;
  const qm = document.getElementById("quickMonth").value;

  // 컬럼별 필터 값 수집
  const colFilters = {};
  document.querySelectorAll(".col-filter").forEach((input) => {
    const col = input.dataset.col;
    if (col === excludeCol) return; // 특정 컬럼 제외 (연쇄 필터용)
    const val = input.value.toLowerCase();
    if (val) colFilters[col] = val;
  });

  return APP.records
    .filter((r) => {
      if (s && !JSON.stringify(r).toLowerCase().includes(s)) return false;
      if (w && r.wasteName !== w) return false;
      if (p && r.processor !== p) return false;

      // 컬럼별 상세 필터링
      for (const [col, val] of Object.entries(colFilters)) {
        let rVal = "";
        switch (col) {
          case "date":
            rVal = r.date;
            break;
          case "slipNo":
            rVal = r.slipNo || "";
            break;
          case "wasteName":
            rVal = r.wasteName;
            break;
          case "amount":
            rVal = r.amount?.toString();
            break;
          case "vehicle":
            rVal = r.vehicle;
            break;
          case "processor":
            rVal = r.processor;
            break;
          case "note":
            rVal = r.note;
            break;
          case "category":
            rVal = r.category;
            break;
          case "location":
            rVal = r.location;
            break;
        }

        // 검색(input)과 비고(category)는 포함 여부, 나머지는 정확한 매칭
        if (col === "slipNo" || col === "category") {
          if (!rVal?.toLowerCase().includes(val.toLowerCase())) return false;
        } else {
          if (rVal !== val) return false;
        }
      }

      // 우선순위 1: 상세 날짜 범위
      if (df && r.date < df) return false;
      if (dt && r.date > dt) return false;

      // 우선순위 2: 신속 년/월 필터 (상세 날짜가 없을 때만 적용)
      if (!df && !dt) {
        if (qy && r.date && !r.date.startsWith(qy)) return false;
        if (qm && r.date && r.date.split("-")[1] !== qm) return false;
      }

      return true;
    })
    .sort((a, b) => {
      let va = a[APP.sortField] || "",
        vb = b[APP.sortField] || "";
      return APP.sortDir === "asc" ? (va > vb ? 1 : -1) : va < vb ? 1 : -1;
    });
}
function renderPagination(total, items) {
  const p = document.getElementById("pagination");
  p.innerHTML = `<span style="font-size:0.8rem;color:var(--text-muted);">총 ${items}건</span>`;
  if (total <= 1) return;
  for (let i = 1; i <= total; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    btn.className = i === APP.recordsPage ? "active" : "";
    btn.onclick = () => {
      APP.recordsPage = i;
      renderRecordsTable();
    };
    p.appendChild(btn);
  }
}
function exportCSV() {
  const data = getFilteredRecords();
  const headers = [
    "날짜",
    "전표",
    "폐기물",
    "처리량(톤)",
    "차량번호",
    "처리업체",
    "처리방법",
    "비고",
    "장소",
  ];
  const csv =
    "\uFEFF" +
    [
      headers.join(","),
      ...data.map((r) =>
        [
          r.date,
          r.slipNo,
          r.wasteName,
          r.amount,
          r.vehicle,
          r.processor,
          r.note,
          r.category,
          r.location,
        ].join(","),
      ),
    ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "waste_records.csv";
  a.click();
}
// Stats page specific charts/table
function renderStatsCharts() {
  const year =
    document.getElementById("statsYear").value ||
    new Date().getFullYear().toString();
  const period =
    document.querySelector(".period-tab.active")?.dataset.period || "monthly";
  const yearRecords = APP.records.filter(
    (r) => r.date && r.date.startsWith(year),
  );

  renderStatsDailyTypeChart(yearRecords, period);
  renderStatsCumulativeChart(yearRecords, period);
  renderStatsDetailChart(yearRecords);
  renderStatsTable(yearRecords, period);
}

// 1. 일별 폐기물 종류별(비고) 처리량 - Stacked Bar Chart
function renderStatsDailyTypeChart(records, period) {
  // 날짜별, 폐기물 종류(note)별 그룹화
  const dailyData = {};
  const wasteTypes = new Set();

  records.forEach((r) => {
    if (!r.date) return;
    // 월별 보기일 때는 일별(YYYY-MM-DD)로, 연별 보기일 때는 월별(YYYY-MM)로 그룹화하는 것이 일반적이나,
    // 요청사항이 "일별"이므로 period에 상관없이 일자별로 보여주되, 데이터가 너무 많으면 필터링 필요할 수 있음.
    // 여기서는 period 설정에 따라 라벨을 조정.

    let key = r.date; // 기본 YYYY-MM-DD
    if (period === "yearly") key = r.date.substring(0, 7); // YYYY-MM

    if (!dailyData[key]) dailyData[key] = {};

    const type = r.note || "기타"; // 비고 기준, 없으면 기타
    wasteTypes.add(type);

    dailyData[key][type] = (dailyData[key][type] || 0) + (r.amount || 0);
  });

  const labels = Object.keys(dailyData).sort();
  const types = Array.from(wasteTypes).sort();

  // 색상 팔레트
  const colors = [
    "#6366f1",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#06b6d4",
    "#8b5cf6",
    "#ec4899",
    "#f97316",
    "#14b8a6",
    "#3b82f6",
  ];

  const datasets = types.map((type, index) => ({
    label: type,
    data: labels.map((date) => dailyData[date][type] || 0),
    backgroundColor: colors[index % colors.length],
    borderRadius: 4,
    stack: "combined",
  }));

  if (APP.charts.statsDailyType) APP.charts.statsDailyType.destroy();

  APP.charts.statsDailyType = new Chart(
    document.getElementById("statsDailyTypeChart"),
    {
      type: "bar",
      data: {
        labels: labels,
        datasets: datasets,
      },
      options: {
        responsive: true,
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${ctx.raw}톤`,
            },
          },
          legend: { position: "bottom" },
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { color: "rgba(255, 255, 255, 0.5)" },
          },
          y: {
            stacked: true,
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            ticks: { color: "rgba(255, 255, 255, 0.5)" },
          },
        },
      },
    },
  );
}

// 2. 누적 처리량 추이 - Line Chart
function renderStatsCumulativeChart(records, period) {
  // 날짜별 총 처리량 계산
  const dailyTotal = {};
  records.forEach((r) => {
    if (!r.date) return;
    let key = r.date;
    if (period === "yearly") key = r.date.substring(0, 7);

    dailyTotal[key] = (dailyTotal[key] || 0) + (r.amount || 0);
  });

  const labels = Object.keys(dailyTotal).sort();

  // 누적 계산
  let cumulative = 0;
  const data = labels.map((date) => {
    cumulative += dailyTotal[date];
    return cumulative;
  });

  if (APP.charts.statsCumulative) APP.charts.statsCumulative.destroy();

  APP.charts.statsCumulative = new Chart(
    document.getElementById("statsCumulativeChart"),
    {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "누적 처리량 (톤)",
            data: data,
            borderColor: "#10b981",
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            borderWidth: 2,
            pointBackgroundColor: "#10b981",
            pointRadius: 3,
            fill: true,
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          tooltip: {
            intersect: false,
            mode: "index",
          },
          legend: { display: false },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "rgba(255, 255, 255, 0.5)" },
          },
          y: {
            beginAtZero: true,
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            ticks: { color: "rgba(255, 255, 255, 0.5)" },
          },
        },
      },
    },
  );
}
function renderStatsDetailChart(records) {
  // 월별 그룹화 (1월~12월)
  const monthlyData = Array.from({ length: 12 }, () => ({
    drum: 0,
    ibc: 0,
    aoTar: 0,
    methanol: 0,
    solidHazardous: 0,
    liquidHazardous: 0,
    etc: 0,
  }));

  // 표시할 마지막 월 인덱스 계산 (현재 연도라면 현재 월까지만, 아니면 12월까지)
  const selectedYear = parseInt(
    document.getElementById("statsYear")?.value || new Date().getFullYear(),
  );
  const now = new Date();
  const isCurrentYear = selectedYear === now.getFullYear();
  const lastIndex = isCurrentYear ? now.getMonth() : 11;

  records.forEach((r) => {
    if (!r.date) return;
    const m = parseInt(r.date.split("-")[1]) - 1;
    if (m < 0 || m > 11) return;

    const note = (r.category || "").trim();
    const amount = r.amount || 0;

    // 수량
    const drumMatch = note.match(/폐공드럼\s*(\d+)/);
    const ibcMatch = note.match(/폐IBC\s*(\d+)/);
    if (drumMatch) monthlyData[m].drum += parseInt(drumMatch[1], 10);
    if (ibcMatch) monthlyData[m].ibc += parseInt(ibcMatch[1], 10);

    // 톤수 - 기간별 상세 통계와 동일한 로직
    const lowerNote = note.toLowerCase();
    if (lowerNote.includes("ao-tar")) {
      monthlyData[m].aoTar += amount;
    } else if (lowerNote.includes("메탄올")) {
      monthlyData[m].methanol += amount;
    } else {
      // AO-Tar, 메탄올이 아닌 경우 wasteName으로 세분화
      const wasteName = (r.wasteName || "").trim();
      const lowerWasteName = wasteName.toLowerCase();

      if (lowerWasteName.includes("고상") || lowerWasteName.includes("고체")) {
        monthlyData[m].solidHazardous += amount;
      } else if (
        lowerWasteName.includes("액상") ||
        lowerWasteName.includes("액체")
      ) {
        monthlyData[m].liquidHazardous += amount;
      } else {
        monthlyData[m].etc += amount;
      }
    }
  });

  // 월 라벨
  const monthLabels = Array.from({ length: 12 }, (_, i) => `${i + 1}월`);

  // 각 폐기물별 독립 차트 생성
  const chartConfigs = [
    {
      id: "statsDetailDrum",
      key: "drum",
      label: "폐공드럼",
      color: "#f59e0b",
      chartKey: "statsDrum",
    },
    {
      id: "statsDetailIbc",
      key: "ibc",
      label: "폐IBC",
      color: "#06b6d4",
      chartKey: "statsIbc",
    },
    {
      id: "statsDetailAoTar",
      key: "aoTar",
      label: "AO-Tar",
      color: "#8b5cf6",
      chartKey: "statsAoTar",
    },
    {
      id: "statsDetailMethanol",
      key: "methanol",
      label: "메탄올",
      color: "#ec4899",
      chartKey: "statsMethanol",
    },
    {
      id: "statsDetailSolid",
      key: "solidHazardous",
      label: "유해화학물질(고상)",
      color: "#10b981",
      chartKey: "statsSolid",
    },
    {
      id: "statsDetailLiquid",
      key: "liquidHazardous",
      label: "유해화학물질(액상)",
      color: "#3b82f6",
      chartKey: "statsLiquid",
    },
    {
      id: "statsDetailEtc",
      key: "etc",
      label: "기타",
      color: "#6b7280",
      chartKey: "statsEtc",
    },
  ];

  chartConfigs.forEach((config) => {
    const ctx = document.getElementById(config.id);
    if (!ctx) return;

    // 기존 차트 파괴
    if (APP.charts[config.chartKey]) {
      APP.charts[config.chartKey].destroy();
    }

    // 데이터 준비 (미래 월은 null)
    const data = monthlyData.map((d, i) =>
      i <= lastIndex ? d[config.key] : null,
    );

    // 차트 생성
    APP.charts[config.chartKey] = new Chart(ctx, {
      type: "bar",
      data: {
        labels: monthLabels,
        datasets: [
          {
            label: config.label,
            data: data,
            backgroundColor: config.color,
            borderRadius: 4,
            barPercentage: 0.7,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            grid: { color: "rgba(255,255,255,0.05)" },
            ticks: {
              color: "rgba(255,255,255,0.5)",
              font: { size: 10 },
            },
          },
          y: {
            beginAtZero: true,
            grid: { color: "rgba(255,255,255,0.05)" },
            ticks: {
              color: "rgba(255,255,255,0.5)",
              font: { size: 10 },
            },
          },
        },
      },
    });
  });
}
function renderStatsTable(records, period) {
  // 기간별 상세 통계를 "비고"란 중심으로 개편
  // 기준: 월별
  // 컬럼: 월 | 폐공드럼(개) | 폐IBC(개) | AO-Tar(톤) | 메탄올(톤) | 유해화학물질(고상)(톤) | 유해화학물질(액상)(톤) | 기타(톤) | 합계(톤)

  // 1. 월별 그룹화
  const monthlyData = {};
  records.forEach((r) => {
    if (!r.date) return;
    const monthKey = r.date.substring(0, 7); // YYYY-MM
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {
        drum: 0,
        ibc: 0,
        aoTar: 0,
        methanol: 0,
        solidHazardous: 0, // 유해화학물질(고상)
        liquidHazardous: 0, // 유해화학물질(액상)
        etc: 0,
        totalAmount: 0,
      };
    }

    // 비고 파싱
    const note = (r.category || "").trim();
    const amount = r.amount || 0;

    // 폐공드럼/IBC 수량 추출
    const drumMatch = note.match(/폐공드럼\s*(\d+)/);
    const ibcMatch = note.match(/폐IBC\s*(\d+)/);

    if (drumMatch) monthlyData[monthKey].drum += parseInt(drumMatch[1], 10);
    if (ibcMatch) monthlyData[monthKey].ibc += parseInt(ibcMatch[1], 10);

    // 품목별 톤수 집계
    const lowerNote = note.toLowerCase();
    if (lowerNote.includes("ao-tar")) {
      monthlyData[monthKey].aoTar += amount;
    } else if (lowerNote.includes("메탄올")) {
      monthlyData[monthKey].methanol += amount;
    } else {
      // AO-Tar, 메탄올이 아닌 경우 wasteName으로 세분화
      const wasteName = (r.wasteName || "").trim();
      const lowerWasteName = wasteName.toLowerCase();

      if (lowerWasteName.includes("고상") || lowerWasteName.includes("고체")) {
        monthlyData[monthKey].solidHazardous += amount;
      } else if (
        lowerWasteName.includes("액상") ||
        lowerWasteName.includes("액체")
      ) {
        monthlyData[monthKey].liquidHazardous += amount;
      } else {
        monthlyData[monthKey].etc += amount;
      }
    }

    monthlyData[monthKey].totalAmount += amount;
  });

  // 2. 테이블 렌더링
  const sortedMonths = Object.keys(monthlyData).sort().reverse(); // 최신순

  // 헤더
  const thead = document.getElementById("statsTableHeader");
  const tbody = document.getElementById("statsTableBody");

  thead.innerHTML = `
    <tr>
      <th>기간</th>
      <th style="color:var(--warning)">폐공드럼<br><small>(개)</small></th>
      <th style="color:var(--info)">폐IBC<br><small>(개)</small></th>
      <th>AO-Tar<br><small>(톤)</small></th>
      <th>메탄올<br><small>(톤)</small></th>
      <th>유해화학물질<br><small>(고상, 톤)</small></th>
      <th>유해화학물질<br><small>(액상, 톤)</small></th>
      <th>기타<br><small>(톤)</small></th>
      <th>총 처리량<br><small>(톤)</small></th>
    </tr>
  `;

  if (sortedMonths.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="9" style="text-align:center; padding: 20px;">데이터가 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = sortedMonths
    .map((m) => {
      const d = monthlyData[m];
      const [y, mon] = m.split("-");
      const label = `${y}년 ${mon}월`;

      return `
      <tr>
        <td><strong>${label}</strong></td>
        <td>${d.drum > 0 ? d.drum.toLocaleString() : "-"}</td>
        <td>${d.ibc > 0 ? d.ibc.toLocaleString() : "-"}</td>
        <td>${d.aoTar > 0 ? d.aoTar.toFixed(2) : "-"}</td>
        <td>${d.methanol > 0 ? d.methanol.toFixed(2) : "-"}</td>
        <td>${d.solidHazardous > 0 ? d.solidHazardous.toFixed(2) : "-"}</td>
        <td>${d.liquidHazardous > 0 ? d.liquidHazardous.toFixed(2) : "-"}</td>
        <td>${d.etc > 0 ? d.etc.toFixed(2) : "-"}</td>
        <td><strong>${d.totalAmount.toFixed(2)}</strong></td>
      </tr>
    `;
    })
    .join("");
}
function exportStatsCSV() {
  showToast("통계 내보내기 완료", "success");
}
function groupByPeriod(recs, p) {
  const g = {};
  recs.forEach((r) => {
    if (!r.date) return;
    const [y, m] = r.date.split("-");
    const k = p === "monthly" ? `${y}-${m}` : y;
    if (!g[k]) g[k] = { count: 0, amount: 0 };
    g[k].count++;
    g[k].amount += r.amount || 0;
  });
  return g;
}
function formatPeriodLabel(k, p) {
  if (p === "monthly") {
    const [y, m] = k.split("-");
    return `${parseInt(m)}월`;
  }
  return k + "년";
}
function goPage(p) {
  APP.recordsPage = p;
  renderRecordsTable();
}

function populateColumnFilters() {
  const fields = {
    colFilterDate: "date",
    colFilterWasteName: "wasteName",
    colFilterAmount: "amount",
    colFilterVehicle: "vehicle",
    colFilterProcessor: "processor",
    colFilterNote: "note",
    colFilterCategory: "category",
    colFilterLocation: "location",
  };

  for (const [id, field] of Object.entries(fields)) {
    const el = document.getElementById(id);
    if (!el) continue;

    const currentVal = el.value;
    // 해당 컬럼의 필터만 제외하고 나머지 필터가 적용된 데이터 셋을 가져옴
    const relevantData = getFilteredRecords(field);

    const uniqueValues = [...new Set(relevantData.map((r) => r[field]))]
      .filter((v) => v !== null && v !== undefined && v !== "")
      .sort();

    let html = `<option value="">전체</option>`;
    uniqueValues.forEach((v) => {
      const displayVal = v.toString();
      html += `<option value="${displayVal}" ${displayVal === currentVal ? "selected" : ""}>${displayVal}</option>`;
    });
    el.innerHTML = html;
  }
}

// ================================================
// 팀별 액상폐기물 관리 페이지
// ================================================

let lwInitialized = false;
let lwAllData = []; // 전체 데이터 보관

function initLiquidWastePage() {
  const monthSelect = document.getElementById("lwMonthSelect");
  const dropZone = document.getElementById("lwDropZone");

  // 읽기 전용 시 업로드 드롭존 비활성화 및 문구 변경
  if (APP.isReadOnly && dropZone) {
    dropZone.style.opacity = "0.6";
    dropZone.style.pointerEvents = "none";
    const dropZoneText = dropZone.querySelector("p");
    if (dropZoneText)
      dropZoneText.textContent = "데이터 조회 모드 (업로드 불가)";
  }

  if (!lwInitialized) {
    lwInitialized = true;

    // 월 선택 변경 시 테이블 및 차트 갱신
    monthSelect.addEventListener("change", () => {
      renderLiquidWasteDetailTable(lwAllData, monthSelect.value);
      renderLiquidWasteCharts(lwAllData, monthSelect.value);
    });

    // 드래그 앤 드롭 방지 (브라우저 기본 동작)
    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      dropZone.addEventListener(
        eventName,
        (e) => {
          e.preventDefault();
          e.stopPropagation();
        },
        false,
      );
    });

    // 드래그 상태 시각적 효과
    ["dragenter", "dragover"].forEach((eventName) => {
      dropZone.addEventListener(
        eventName,
        () => {
          dropZone.classList.add("dragover");
        },
        false,
      );
    });

    ["dragleave", "drop"].forEach((eventName) => {
      dropZone.addEventListener(
        eventName,
        () => {
          dropZone.classList.remove("dragover");
        },
        false,
      );
    });

    // 파일 로드 처리
    dropZone.addEventListener(
      "drop",
      (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
          uploadLiquidWasteExcel(files[0]);
        }
      },
      false,
    );

    // 요약 테이블 내보내기 (MT 추출)
    document.getElementById("btnExportLwSummary").onclick = () => {
      const table = document.getElementById("lwSummaryTable");
      if (!table) return;

      let csv = "\uFEFF"; // BOM for Excel
      const rows = table.querySelectorAll("tr");
      rows.forEach((row) => {
        const cols = row.querySelectorAll("th, td");
        const rowData = Array.from(cols).map(
          (c) => `"${c.innerText.replace(/"/g, '""')}"`,
        );
        csv += rowData.join(",") + "\n";
      });

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.setAttribute(
        "download",
        `팀별_액상폐기물_요약_${new Date().toISOString().slice(0, 10)}.csv`,
      );
      link.click();
    };
  }

  loadAllLiquidWasteData();
}

async function uploadLiquidWasteExcel(file) {
  try {
    showToast("Excel 파일 업로드 중...", "info");
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${APP.apiBase}/api/liquid-waste/upload`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "업로드 실패");
    }

    const result = await res.json();
    showToast(`${result.message}`, "success");

    // 전체 데이터 새로고침
    loadAllLiquidWasteData();
  } catch (e) {
    console.error("업로드 오류:", e);
    showToast(`업로드 실패: ${e.message}`, "error");
  }
}

async function loadAllLiquidWasteData() {
  try {
    // 연도 구분 없이 전체 데이터를 가져옴
    const res = await fetch(`${APP.apiBase}/api/liquid-waste`);
    if (!res.ok) throw new Error("데이터 로드 실패");
    lwAllData = await res.json();

    // 월 목록 추출 및 셀렉트 갱신
    const months = [...new Set(lwAllData.map((r) => r.year_month))].sort();
    const monthSelect = document.getElementById("lwMonthSelect");
    const currentVal = monthSelect.value;

    monthSelect.innerHTML = months
      .map((m) => {
        const [y, mo] = m.split("-");
        return `<option value="${m}">${y.slice(2)}.${mo}</option>`;
      })
      .join("");

    // 기존 선택값 유지 또는 최신 월 선택
    if (currentVal && months.includes(currentVal)) {
      monthSelect.value = currentVal;
    } else if (months.length > 0) {
      monthSelect.value = months[months.length - 1];
    }

    renderLiquidWasteStats(lwAllData);
    renderLiquidWasteCharts(lwAllData, monthSelect.value);
    renderLiquidWasteDetailTable(lwAllData, monthSelect.value);
    renderLiquidWasteSummaryTable(lwAllData);
  } catch (e) {
    console.error("액상폐기물 데이터 로드 오류:", e);
  }
}

function renderLiquidWasteStats(data) {
  const totalAmount = data.reduce((s, r) => s + (r.amount_kg || 0), 0);
  const totalEA = data.reduce((s, r) => s + (r.quantity_ea || 0), 0);
  const teams = new Set(data.filter((r) => r.team).map((r) => r.team));
  const months = new Set(data.map((r) => r.year_month));

  document.getElementById("lwTotalAmount").textContent = (
    totalAmount / 1000
  ).toFixed(2);
  document.getElementById("lwTeamCount").textContent = teams.size;
  document.getElementById("lwMonthCount").textContent = months.size;
}

// 스크린샷 기준 고정 팀 목록
const LW_FIXED_TEAMS = [
  "생산1부",
  "생산2부",
  "제품운영팀",
  "공무팀",
  "경영지원팀",
  "품보팀",
  "연구1팀",
  "연구2팀",
  "연구3팀",
];

function renderLiquidWasteCharts(data, selectedMonth) {
  const teamColors = [
    "#6366f1", // Indigo
    "#10b981", // Emerald
    "#f59e0b", // Amber (세련된 황금색)
    "#3b82f6", // Blue
    "#ef4444", // Rose
    "#8b5cf6", // Violet
    "#06b6d4", // Cyan
    "#ec4899", // Pink
    "#f97316", // Orange
  ];
  const textColor =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--text-primary")
      .trim() || "#e2e8f0";

  // 1. 월 목록 추출 및 정렬 (25.10, 25.11... 26.01 형식)
  const months = [...new Set(data.map((r) => r.year_month))].sort();

  // 1. 팀별 월간 배출량 추이 — LINE CHART (꺾은선)
  const teamLineDatasets = LW_FIXED_TEAMS.map((team, i) => {
    const monthData = months.map((m) => {
      const recs = data.filter((r) => r.team === team && r.year_month === m);
      const val = recs.reduce((s, r) => s + (r.amount_kg || 0), 0) / 1000;
      return +val.toFixed(2);
    });
    return {
      label: team,
      data: monthData,
      borderColor: teamColors[i % teamColors.length],
      backgroundColor: teamColors[i % teamColors.length],
      tension: 0.1, // 엑셀느낌의 직선에 가까운 라인
      pointRadius: 4,
      pointHoverRadius: 6,
      borderWidth: 2,
      fill: false,
      spanGaps: true, // 데이터가 없는 달도 선으로 연결
    };
  });

  const monthLabels = months.map((m) => {
    const [y, mo] = m.split("-");
    return `${y.slice(2)}.${mo}`; // '25.10' 형식
  });

  if (APP.charts.lwTeamMonthly) APP.charts.lwTeamMonthly.destroy();
  APP.charts.lwTeamMonthly = new Chart(
    document.getElementById("lwTeamMonthlyChart"),
    {
      type: "line",
      data: { labels: monthLabels, datasets: teamLineDatasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: textColor,
              font: { size: 10 },
              usePointStyle: true,
              padding: 10,
              boxWidth: 8,
            },
          },
        },
        scales: {
          x: {
            grid: { color: "rgba(100,116,139,0.1)" },
            ticks: { color: textColor, font: { size: 10 } },
          },
          y: {
            beginAtZero: true,
            grid: { color: "rgba(100,116,139,0.1)" },
            ticks: { color: textColor, font: { size: 10 } },
            title: {
              display: true,
              text: "MT",
              color: textColor,
              font: { size: 10 },
            },
          },
        },
      },
    },
  );

  // 2. 선택 월 팀별 배출 비율 — PIE CHART
  const targetMonth = selectedMonth || months[months.length - 1];
  const targetData = targetMonth
    ? data.filter((r) => r.year_month === targetMonth)
    : [];

  const pieTitle = document.getElementById("lwPieTitle");
  if (pieTitle) {
    if (targetMonth) {
      const [py, pm] = targetMonth.split("-");
      pieTitle.textContent = `${py.slice(2)}.${pm} 팀별 배출량 그래프 (MT)`;
    } else {
      pieTitle.textContent = "팀별 배출량 그래프 (데이터 없음)";
    }
  }

  const teamTotals = {};
  targetData.forEach((r) => {
    teamTotals[r.team] = (teamTotals[r.team] || 0) + (r.amount_kg || 0);
  });

  const teamPieData = LW_FIXED_TEAMS.map((team) => ({
    team,
    val: +((teamTotals[team] || 0) / 1000).toFixed(2),
  })).filter((item) => item.val > 0);

  if (APP.charts.lwTeamPie) APP.charts.lwTeamPie.destroy();
  APP.charts.lwTeamPie = new Chart(document.getElementById("lwTeamPieChart"), {
    type: "pie",
    data: {
      labels: teamPieData.map((s) => s.team),
      datasets: [
        {
          data: teamPieData.map((s) => s.val),
          backgroundColor: teamColors,
          borderWidth: 1,
          borderColor: "#fff",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: textColor,
            font: { size: 10 },
            usePointStyle: true,
            padding: 10,
            boxWidth: 8,
          },
        },
      },
    },
    plugins: [
      {
        id: "lwPieLabels",
        afterDraw(chart) {
          const { ctx } = chart;
          chart.data.datasets[0].data.forEach((val, i) => {
            if (val <= 0) return;
            const meta = chart.getDatasetMeta(0).data[i];
            if (!meta || !meta.tooltipPosition) return;
            const { x, y } = meta.tooltipPosition();
            ctx.save();
            ctx.fillStyle = "#fff";
            ctx.font = "bold 10px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.shadowColor = "rgba(0,0,0,0.5)";
            ctx.shadowBlur = 4;
            ctx.fillText(val.toFixed(2), x, y);
            ctx.restore();
          });
        },
      },
    ],
  });
}

function renderLiquidWasteDetailTable(data, selectedMonth) {
  // selectedMonth가 주어지면 해당 월, 아니면 최신 월
  const months = [...new Set(data.map((r) => r.year_month))].sort();
  const targetMonth = selectedMonth || months[months.length - 1];

  if (!targetMonth) {
    document.getElementById("lwDetailTitle").textContent =
      "팀별 배출량 (MT) (데이터 없음)";
    document.getElementById("lwDetailTableBody").innerHTML =
      '<tr><td colspan="8" style="text-align:center; padding:20px;">업로드된 데이터가 없습니다.</td></tr>';
    return;
  }

  const [y, m] = targetMonth.split("-");
  document.getElementById("lwDetailTitle").textContent =
    `${y.slice(2)}.${m} 팀별 배출량 (MT)`;

  const monthData = data.filter((r) => r.year_month === targetMonth);

  let html = "";
  monthData.forEach((r) => {
    html += `<tr>
      <td>${r.discharge_date ? r.discharge_date : "-"}</td>
      <td>${r.receive_date ? r.receive_date : "-"}</td>
      <td>${r.waste_type || "-"}</td>
      <td>${r.content || "-"}</td>
      <td>${r.team || "-"}</td>
      <td>${r.discharger || "-"}</td>
      <td>${r.quantity_ea || 0}</td>
      <td>${(r.amount_kg || 0).toLocaleString()}</td>
    </tr>`;
  });

  const totalEA = monthData.reduce((s, r) => s + (r.quantity_ea || 0), 0);
  const totalKg = monthData.reduce((s, r) => s + (r.amount_kg || 0), 0);
  html += `<tr class="lw-total-row">
    <td colspan="6">합 계</td>
    <td>${totalEA}</td>
    <td>${totalKg.toLocaleString()}</td>
  </tr>`;

  document.getElementById("lwDetailTableBody").innerHTML = html;
}

function renderLiquidWasteSummaryTable(data) {
  const months = [...new Set(data.map((r) => r.year_month))].sort();
  if (months.length === 0) return;

  // 헤더
  let headerHtml = "<tr><th>팀명</th>";
  months.forEach((m) => {
    const [y, mo] = m.split("-");
    headerHtml += `<th>${y.slice(2)}.${mo}</th>`;
  });
  headerHtml += "<th>합계</th></tr>";
  document.getElementById("lwSummaryHead").innerHTML = headerHtml;

  // 데이터 집계
  const teamMonthMap = {};
  data.forEach((r) => {
    const key = `${r.team}_${r.year_month}`;
    teamMonthMap[key] = (teamMonthMap[key] || 0) + (r.amount_kg || 0);
  });

  let bodyHtml = "";
  const monthTotals = {};
  let grandTotal = 0;

  LW_FIXED_TEAMS.forEach((team) => {
    bodyHtml += `<tr><td style="font-weight:600; text-align:left;">${team}</td>`;
    let teamTotal = 0;
    months.forEach((m) => {
      const val = (teamMonthMap[`${team}_${m}`] || 0) / 1000;
      teamTotal += val;
      monthTotals[m] = (monthTotals[m] || 0) + val;
      bodyHtml += `<td>${val > 0 ? val.toFixed(2) : "-"}</td>`;
    });
    grandTotal += teamTotal;
    bodyHtml += `<td style="font-weight:bold">${teamTotal.toFixed(2)}</td></tr>`;
  });

  bodyHtml += '<tr class="lw-total-row"><td>합 계</td>';
  months.forEach((m) => {
    bodyHtml += `<td>${(monthTotals[m] || 0).toFixed(2)}</td>`;
  });
  bodyHtml += `<td>${grandTotal.toFixed(2)}</td></tr>`;

  document.getElementById("lwSummaryBody").innerHTML = bodyHtml;
}
