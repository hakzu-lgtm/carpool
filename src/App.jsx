import { useState, useEffect, useCallback, useMemo } from "react";
import { loadData, saveData } from "./api/sheets";

const POLL_INTERVAL_MS = 5000; // 5초 폴링

// ── 상수 ──────────────────────────────────────────────────────────────
const BANNED_DIGITS = { 1: [1, 6], 2: [2, 7], 3: [3, 8], 4: [4, 9], 5: [5, 0] };
const DAY_NAMES = { 1: "월", 2: "화", 3: "수", 4: "목", 5: "금" };

// 요일별 컬러 팔레트
const DAY_COLORS = {
  1: { grad: "from-sky-400 to-cyan-500",    light: "bg-sky-50",     border: "border-sky-200",    text: "text-sky-600",    ring: "ring-sky-300"    },
  2: { grad: "from-violet-500 to-purple-600",light: "bg-violet-50",  border: "border-violet-200", text: "text-violet-600", ring: "ring-violet-300" },
  3: { grad: "from-emerald-400 to-teal-500", light: "bg-emerald-50", border: "border-emerald-200",text: "text-emerald-600",ring: "ring-emerald-300" },
  4: { grad: "from-amber-400 to-orange-500", light: "bg-amber-50",   border: "border-amber-200",  text: "text-amber-600",  ring: "ring-amber-300"  },
  5: { grad: "from-pink-400 to-rose-500",    light: "bg-pink-50",    border: "border-pink-200",   text: "text-pink-600",   ring: "ring-pink-300"   },
};

// 07:30 ~ 08:40, 10분 단위
const TIME_OPTIONS = (() => {
  const r = [];
  for (let m = 30; m <= 50; m += 10) r.push(`07:${String(m).padStart(2, "0")}`);
  for (let m = 0; m <= 40; m += 10) r.push(`08:${String(m).padStart(2, "0")}`);
  return r;
})();

// 날씨 좌표 (서울 기준 — 필요 시 학교 좌표로 변경)
const WEATHER_LAT = 37.5665;
const WEATHER_LON = 126.9780;

// ── 헬퍼 함수 ─────────────────────────────────────────────────────────
function getTodayDayNum() {
  const d = new Date().getDay();
  return d >= 1 && d <= 5 ? d : null;
}

function getWeekDates(offset = 0) {
  const today = new Date();
  const dow = today.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff + offset * 7);
  const result = {};
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    result[i + 1] = {
      month: d.getMonth() + 1,
      date: d.getDate(),
      dateStr: d.toISOString().split("T")[0],
    };
  }
  return result;
}

function getWeekKey(offset = 0) {
  return getWeekDates(offset)[1].dateStr; // 월요일 dateStr
}

function isBannedOnDay(carDigit, day) {
  if (carDigit === "" || carDigit == null) return false;
  return (BANNED_DIGITS[day] || []).includes(parseInt(carDigit, 10));
}

function loadLS(key, fallback) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function saveLS(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

function wmoToWeather(code) {
  if (code == null) return null;
  if (code === 0)  return { emoji: "☀️", label: "맑음" };
  if (code <= 2)   return { emoji: "🌤️", label: "구름조금" };
  if (code <= 3)   return { emoji: "☁️", label: "흐림" };
  if (code <= 48)  return { emoji: "🌫️", label: "안개" };
  if (code <= 55)  return { emoji: "🌦️", label: "이슬비" };
  if (code <= 65)  return { emoji: "🌧️", label: "비" };
  if (code <= 75)  return { emoji: "❄️", label: "눈" };
  if (code <= 82)  return { emoji: "🌧️", label: "소나기" };
  return { emoji: "⛈️", label: "뇌우" };
}

async function fetchWeather(startDate, endDate) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${WEATHER_LAT}&longitude=${WEATHER_LON}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=Asia%2FSeoul&start_date=${startDate}&end_date=${endDate}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("날씨 오류");
  const data = await res.json();
  const result = {};
  data.daily.time.forEach((date, i) => {
    const info = wmoToWeather(data.daily.weathercode[i]);
    result[date] = {
      ...info,
      tempMax: Math.round(data.daily.temperature_2m_max[i]),
      tempMin: Math.round(data.daily.temperature_2m_min[i]),
    };
  });
  return result;
}

// ── Toast ─────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 2800); return () => clearTimeout(t); }, [onClose]);
  const style = type === "error"   ? "bg-red-500 shadow-red-200"
              : type === "info"    ? "bg-sky-500 shadow-sky-200"
              : "bg-emerald-500 shadow-emerald-200";
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 ${style} text-white text-sm font-bold px-5 py-3 rounded-2xl shadow-xl max-w-xs text-center`}>
      {msg}
    </div>
  );
}

// ── 이용 안내 모달 ────────────────────────────────────────────────────
function HelpModal({ onClose }) {
  const steps = [
    { icon: "👤", title: "내 정보 등록", desc: "설정 탭에서 이름과 차량 끝번호를 먼저 저장해주세요." },
    { icon: "🚙", title: "타시오 등록", desc: "운행할 요일과 출발 시간을 선택해 카풀 제공자로 등록하세요. 차량 5부제 금지 요일은 자동 차단됩니다." },
    { icon: "🙋", title: "탑승 예약", desc: "현황판에서 원하는 운전자 카드를 클릭하면 예약됩니다. 최대 2인, 하루 1회만 예약 가능합니다." },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border border-violet-100" onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-violet-500 to-fuchsia-500 p-5 flex items-center justify-between">
          <div>
            <h2 className="text-white font-black text-xl">이용 안내 📖</h2>
            <p className="text-violet-100 text-xs mt-0.5">타시오 카풀 서비스 사용법</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/25 hover:bg-white/40 active:scale-90 transition-all text-white font-bold flex items-center justify-center">✕</button>
        </div>
        <div className="p-5 space-y-4">
          {steps.map((s, i) => (
            <div key={i} className="flex gap-3 items-start">
              <div className="w-10 h-10 rounded-2xl bg-violet-100 flex items-center justify-center text-xl flex-shrink-0">{s.icon}</div>
              <div>
                <p className="text-slate-800 font-bold text-sm"><span className="text-violet-500 mr-1">{i + 1}.</span>{s.title}</p>
                <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
            <p className="text-amber-600 text-xs font-semibold">💡 Google Sheets 연동 시 실시간으로 다른 사용자와 공유됩니다.</p>
          </div>
        </div>
        <div className="px-5 pb-5">
          <button onClick={onClose} className="w-full bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-400 hover:to-fuchsia-400 active:scale-95 text-white font-bold py-3 rounded-2xl transition-all duration-200 text-sm shadow-lg shadow-violet-200">확인했어요 👍</button>
        </div>
      </div>
    </div>
  );
}

// ── 운전자 카드 ───────────────────────────────────────────────────────
function DriverCard({ driver, isMine, isBooked, isFull, onBook, onDelete }) {
  return (
    <div
      onClick={!isMine ? onBook : undefined}
      className={`rounded-xl border px-2.5 py-2 transition-all duration-200 select-none
        ${isMine
          ? "border-violet-200 bg-violet-50"
          : isFull && !isBooked
          ? "border-slate-100 bg-slate-50 opacity-50"
          : "border-emerald-200 bg-emerald-50 cursor-pointer hover:bg-emerald-100 active:scale-95"}`}
    >
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-slate-800 font-black text-xs">{driver.time}</span>
        {isMine ? (
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-slate-300 hover:text-red-400 transition-colors text-xs px-1 py-0.5 rounded hover:bg-red-50">삭제</button>
        ) : isFull ? (
          <span className="text-red-400 text-xs font-bold">마감</span>
        ) : (
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${isBooked ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
            {isBooked ? "✓" : "탑승"}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-1">
        <span className={`text-xs font-semibold truncate min-w-0 ${isMine ? "text-violet-600" : "text-slate-700"}`}>
          {driver.name}{isMine && <span className="ml-1 text-violet-400 font-normal">(나)</span>}
        </span>
        <div className="flex gap-0.5 flex-shrink-0">
          {driver.passengers.map((p, i) => <span key={i} className="text-xs leading-none" title={p}>👤</span>)}
        </div>
      </div>
    </div>
  );
}

// ── 요일 컬럼 ─────────────────────────────────────────────────────────
function DayColumn({ day, dateInfo, isToday, drivers, bannedPeople, userName, onBookRide, onDeleteDriver, weather }) {
  const c = DAY_COLORS[day];
  return (
    <div className={`flex-1 min-w-[148px] flex flex-col rounded-2xl overflow-hidden transition-all duration-300
      ${isToday
        ? `shadow-lg ring-2 ${c.ring} bg-white`
        : `shadow-md border ${c.border} bg-white`}`}>

      {/* 날짜 헤더 */}
      <div className={`p-3 bg-gradient-to-b ${isToday ? c.grad : `${c.light} to-white`}`}>
        <div className="flex items-start justify-between">
          <div>
            <div className={`text-4xl font-black leading-none tabular-nums ${isToday ? "text-white" : "text-slate-700"}`}>
              {dateInfo.date}
            </div>
            <div className={`text-xs font-bold mt-1 ${isToday ? "text-white/85" : c.text}`}>
              {dateInfo.month}월 &middot; {DAY_NAMES[day]}
            </div>
          </div>
          {isToday && (
            <span className="bg-white/30 backdrop-blur-sm text-white text-xs font-black px-2 py-0.5 rounded-lg">오늘</span>
          )}
        </div>

        {/* 날씨 표시 */}
        {weather ? (
          <div className={`flex items-center gap-1.5 mt-2 rounded-xl px-2 py-1 ${isToday ? "bg-white/25" : "bg-white/70"}`}>
            <span className="text-base leading-none">{weather.emoji}</span>
            <span className={`text-xs font-bold leading-none ${isToday ? "text-white" : "text-slate-600"}`}>
              {weather.tempMax}° <span className={`font-normal ${isToday ? "text-white/70" : "text-slate-400"}`}>/ {weather.tempMin}°</span>
            </span>
          </div>
        ) : (
          <div className={`mt-2 h-6 rounded-xl animate-pulse ${isToday ? "bg-white/20" : "bg-white/60"}`} />
        )}

        <div className={`text-xs mt-1.5 ${isToday ? "text-white/60" : "text-slate-400"}`}>
          금지 {BANNED_DIGITS[day].join(", ")}번
        </div>
      </div>

      {/* 금지 인원 */}
      {bannedPeople.length > 0 && (
        <div className="bg-red-50 border-y border-red-100 px-2 py-1.5 flex flex-wrap gap-1">
          {bannedPeople.map((p) => (
            <span key={p} className="bg-red-100 border border-red-200 text-red-500 text-xs font-bold px-1.5 py-0.5 rounded-full">
              🚫 {p}
            </span>
          ))}
        </div>
      )}

      {/* 운전자 목록 */}
      <div className="flex-1 bg-white p-2 space-y-1.5 min-h-[72px]">
        {drivers.length === 0
          ? <p className="text-slate-300 text-xs text-center py-4">등록 없음</p>
          : drivers.map((d) => (
            <DriverCard
              key={d.id}
              driver={d}
              isMine={d.name === userName}
              isBooked={d.passengers.includes(userName)}
              isFull={d.passengers.length >= 2}
              onBook={() => onBookRide(d.id)}
              onDelete={() => onDeleteDriver(d.id)}
            />
          ))
        }
      </div>
    </div>
  );
}

// ── 태워줘 패널 ───────────────────────────────────────────────────────
function BoardPanel({ schedules, userName, userCar, loading, onBookRide, onDeleteDriver, onRefresh, weekOffset, setWeekOffset, weekDates, weatherData }) {
  const todayDay = getTodayDayNum();
  const currentWeekKey = useMemo(() => getWeekKey(0), []);
  const weekKey = weekDates[1].dateStr;
  const displaySchedules = schedules.filter((s) => (s.weekKey ?? currentWeekKey) === weekKey);

  const weekLabel = useMemo(() => {
    const mon = weekDates[1], fri = weekDates[5];
    return mon.month === fri.month
      ? `${mon.month}월 ${mon.date}일 ~ ${fri.date}일`
      : `${mon.month}/${mon.date} ~ ${fri.month}/${fri.date}`;
  }, [weekDates]);

  const weekBadge = weekOffset === 0 ? { text: "이번 주", color: "text-violet-500 bg-violet-100" }
    : weekOffset === 1 ? { text: "다음 주", color: "text-emerald-600 bg-emerald-100" }
    : weekOffset > 1  ? { text: `${weekOffset}주 후`, color: "text-amber-600 bg-amber-100" }
    : { text: "지난 주", color: "text-slate-500 bg-slate-100" };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-slate-800 font-black text-base">🙋 태워줘</h2>
        <button onClick={onRefresh} disabled={loading}
          className="bg-white hover:bg-violet-50 active:scale-90 transition-all text-slate-500 text-xs font-semibold px-3 py-1.5 rounded-xl shadow-sm border border-violet-100">
          {loading ? "⏳" : "🔄 새로고침"}
        </button>
      </div>

      {/* 주간 네비게이션 바 */}
      <div className="flex items-center gap-2 mb-3 bg-white rounded-2xl p-2 shadow-sm border border-violet-100">
        <button
          onClick={() => setWeekOffset((w) => w - 1)}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-violet-50 hover:bg-violet-100 active:scale-90 transition-all text-violet-600 font-bold text-xl shadow-sm"
        >
          ‹
        </button>
        <div className="flex-1 text-center">
          <p className="text-slate-700 font-bold text-sm">{weekLabel}</p>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${weekBadge.color}`}>{weekBadge.text}</span>
        </div>
        {weekOffset !== 0 && (
          <button onClick={() => setWeekOffset(0)}
            className="text-xs text-violet-600 font-bold bg-violet-100 hover:bg-violet-200 px-2.5 py-1.5 rounded-xl transition-all">
            오늘
          </button>
        )}
        <button
          onClick={() => setWeekOffset((w) => w + 1)}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-violet-50 hover:bg-violet-100 active:scale-90 transition-all text-violet-600 font-bold text-xl shadow-sm"
        >
          ›
        </button>
      </div>

      {/* 가로 스크롤 요일 컬럼 */}
      <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-hide">
        {loading && displaySchedules.length === 0
          ? [1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex-1 min-w-[148px] h-48 rounded-2xl bg-violet-100/60 animate-pulse" />
            ))
          : [1, 2, 3, 4, 5].map((day) => {
              const dateInfo = weekDates[day];
              const dayDrivers = displaySchedules.filter((d) => d.day === day).sort((a, b) => a.time.localeCompare(b.time));
              const knownPeople = new Map();
              if (userName && userCar !== "") knownPeople.set(userName, userCar);
              schedules.forEach((s) => { if (!knownPeople.has(s.name)) knownPeople.set(s.name, s.carLastDigit); });
              const bannedPeople = [];
              knownPeople.forEach((car, name) => { if (isBannedOnDay(car, day)) bannedPeople.push(name); });
              return (
                <DayColumn
                  key={day}
                  day={day}
                  dateInfo={dateInfo}
                  isToday={weekOffset === 0 && todayDay === day}
                  drivers={dayDrivers}
                  bannedPeople={bannedPeople}
                  userName={userName}
                  onBookRide={onBookRide}
                  onDeleteDriver={onDeleteDriver}
                  weather={weatherData[dateInfo.dateStr]}
                />
              );
            })}
      </div>
    </div>
  );
}

// ── 설정 패널 ─────────────────────────────────────────────────────────
function SettingsPanel({
  userName, userCar, nameInput, setNameInput, carInput, setCarInput, onSaveProfile,
  driverDay, setDriverDay, driverTime, setDriverTime, onRegisterDriver,
  schedules, onShowHelp, weekOffset, weekDates,
}) {
  const weekBadgeText = weekOffset === 0 ? "이번 주" : weekOffset === 1 ? "다음 주" : weekOffset > 1 ? `${weekOffset}주 후` : "지난 주";

  return (
    <div className="space-y-3">
      {/* 이용안내 + 서버 상태 */}
      <div className="flex gap-2">
        <button onClick={onShowHelp}
          className="flex-1 bg-white hover:bg-violet-50 active:scale-95 transition-all text-slate-600 text-sm font-semibold py-2.5 rounded-xl shadow-sm border border-violet-100">
          📖 이용 안내
        </button>
        <div className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border text-xs font-semibold py-2.5 bg-emerald-50 border-emerald-200 text-emerald-600">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-emerald-500" />
          Google Sheets 연동
        </div>
      </div>

      {/* 내 정보 설정 */}
      <div className="rounded-2xl overflow-hidden shadow-md border border-sky-100">
        <div className="bg-gradient-to-r from-sky-400 to-cyan-500 p-4">
          {userName && (
            <div className="mb-2">
              <p className="text-sky-100 text-xs font-semibold">반갑습니다!</p>
              <p className="text-white font-black text-2xl leading-tight">{userName} <span className="text-sky-100 font-semibold text-lg">님</span> 👋</p>
            </div>
          )}
          <h2 className="text-white font-black text-base">👤 내 정보 설정</h2>
          <p className="text-sky-100 text-xs mt-0.5">이름과 차량 끝번호를 저장하세요</p>
        </div>
        <div className="bg-white p-4 space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">이름</label>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="홍길동"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 transition"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">차량 번호판 끝자리</label>
            <div className="grid grid-cols-5 gap-1.5">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <button key={n} type="button" onClick={() => setCarInput(String(n))}
                  className={`py-3 rounded-xl text-sm font-black transition-all duration-150
                    ${carInput === String(n) ? "bg-sky-400 text-white shadow-md shadow-sky-200 scale-105" : "bg-slate-50 text-slate-600 border border-slate-200 hover:bg-sky-50"}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          {carInput !== "" && (
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <p className="text-xs text-slate-400 font-bold mb-2">내 차량 진입 금지 요일</p>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((d) => (
                  <div key={d} className={`flex-1 text-center py-2 rounded-xl text-xs font-bold transition-all
                    ${isBannedOnDay(carInput, d)
                      ? "bg-red-100 text-red-500 border border-red-200"
                      : "bg-white text-slate-300 border border-slate-100"}`}>
                    {DAY_NAMES[d]}
                  </div>
                ))}
              </div>
            </div>
          )}
          <button onClick={onSaveProfile}
            className="w-full bg-gradient-to-r from-sky-400 to-cyan-500 hover:from-sky-300 hover:to-cyan-400 active:scale-95 text-white font-bold py-3 rounded-xl shadow-md shadow-sky-200 transition-all duration-200 text-sm">
            저장하기 💾
          </button>
          {userName && (
            <p className="text-center text-xs text-emerald-500 font-bold">✅ {userName} · 끝번호 {userCar}번 설정됨</p>
          )}
        </div>
      </div>

      {/* 타시오 등록 */}
      <div className="rounded-2xl overflow-hidden shadow-md border border-violet-100">
        <div className="bg-gradient-to-r from-violet-500 to-purple-600 p-4">
          <h2 className="text-white font-black text-base">🚙 타시오 등록</h2>
          <p className="text-violet-100 text-xs mt-0.5">카풀 운행 일정을 등록하세요</p>
        </div>
        <div className="bg-white p-4 space-y-3">
          {!userName && (
            <p className="text-amber-500 text-xs text-center font-bold bg-amber-50 rounded-xl py-2.5 border border-amber-200">
              ⚠️ 먼저 내 정보를 저장해주세요
            </p>
          )}

          {/* 주차 표시 */}
          <div className="flex items-center gap-2 bg-violet-50 rounded-xl px-3 py-2 border border-violet-100">
            <span className="text-violet-400 text-xs">📅 등록 대상:</span>
            <span className="text-violet-700 text-xs font-black">{weekBadgeText}</span>
            <span className="text-slate-400 text-xs">
              ({weekDates[1].month}/{weekDates[1].date} ~ {weekDates[5].month}/{weekDates[5].date})
            </span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">운행 요일</label>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((d) => {
                const banned = isBannedOnDay(userCar, d);
                const alreadyReg = schedules.some((s) => s.name === userName && s.day === d);
                const c = DAY_COLORS[d];
                return (
                  <button key={d} type="button" onClick={() => !banned && setDriverDay(d)} disabled={banned}
                    className={`relative flex-1 py-3 rounded-xl text-sm font-black transition-all duration-150
                      ${driverDay === d ? `bg-gradient-to-b ${c.grad} text-white shadow-md scale-105`
                        : banned ? "bg-red-50 text-red-300 cursor-not-allowed border border-red-100"
                        : `bg-slate-50 text-slate-600 border border-slate-200 hover:${c.light}`}`}>
                    {DAY_NAMES[d]}
                    {banned && <span className="absolute -top-1.5 -right-1 text-xs">🚫</span>}
                    {alreadyReg && !banned && <span className="absolute -top-1.5 -right-1 text-xs">✅</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">출발 시간</label>
            <div className="grid grid-cols-4 gap-1.5">
              {TIME_OPTIONS.map((t) => (
                <button key={t} type="button" onClick={() => setDriverTime(t)}
                  className={`py-2.5 rounded-xl text-xs font-bold transition-all duration-150
                    ${driverTime === t ? "bg-gradient-to-b from-violet-500 to-purple-600 text-white shadow-md scale-105" : "bg-slate-50 text-slate-600 border border-slate-200 hover:bg-violet-50"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <button onClick={onRegisterDriver} disabled={!userName}
            className="w-full bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-400 hover:to-purple-500 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl shadow-md shadow-violet-200 transition-all duration-200 text-sm">
            {weekBadgeText} {DAY_NAMES[driverDay]}요일 {driverTime} 등록 🚙
          </button>
        </div>
      </div>

      {/* 내 등록 현황 */}
      {schedules.filter((s) => s.name === userName).length > 0 && (
        <div className="rounded-2xl overflow-hidden shadow-md border border-violet-100">
          <div className="bg-violet-50 p-3 border-b border-violet-100">
            <h2 className="text-violet-700 font-black text-sm">📌 내 등록 현황</h2>
          </div>
          <div className="bg-white p-3 space-y-2">
            {schedules.filter((s) => s.name === userName).sort((a, b) => a.day - b.day).map((s) => (
              <div key={s.id} className="flex items-center gap-3 bg-violet-50 border border-violet-100 rounded-xl px-3 py-2.5">
                <span className="text-violet-600 font-black text-sm w-8">{DAY_NAMES[s.day]}</span>
                <span className="text-slate-700 font-bold text-sm">{s.time}</span>
                <div className="flex gap-0.5 flex-1">
                  {s.passengers.map((p, i) => <span key={i} className="text-sm" title={p}>👤</span>)}
                </div>
                <span className="text-slate-400 text-xs font-semibold">{s.passengers.length}/2석</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 메인 App ──────────────────────────────────────────────────────────
export default function App() {
  const todayDay = getTodayDayNum();

  const [activeTab, setActiveTab] = useState("board");
  const [showHelp, setShowHelp] = useState(false);
  const [serverLoading, setServerLoading] = useState(false);

  const [userName, setUserName] = useState(() => loadLS("tasio_name", ""));
  const [userCar, setUserCar]   = useState(() => loadLS("tasio_car", ""));
  const [nameInput, setNameInput] = useState(() => loadLS("tasio_name", ""));
  const [carInput, setCarInput]   = useState(() => { const v = loadLS("tasio_car", ""); return v ?? ""; });

  const [schedules, setSchedules] = useState(() => loadLS("tasio_schedules", []));
  const [driverDay, setDriverDay]   = useState(todayDay || 1);
  const [driverTime, setDriverTime] = useState("08:00");
  const [toast, setToast] = useState(null);

  // 주간 네비게이션
  const [weekOffset, setWeekOffset] = useState(0);
  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);

  // 날씨 데이터
  const [weatherData, setWeatherData] = useState({});

  const showToast = (msg, type = "success") => setToast({ msg, type });

  useEffect(() => { saveLS("tasio_schedules", schedules); }, [schedules]);

  // 날씨 fetch — 주가 바뀔 때마다
  useEffect(() => {
    const dates = Object.values(weekDates);
    const startDate = dates[0].dateStr;
    const endDate = dates[dates.length - 1].dateStr;
    fetchWeather(startDate, endDate)
      .then((data) => setWeatherData((prev) => ({ ...prev, ...data })))
      .catch(() => {}); // 날씨 실패 시 조용히 무시
  }, [weekOffset]);

  // ── 서버 데이터 fetch ──────────────────────────────────────────────
  // silent=true → 로딩 스피너 없이 조용히 갱신 (폴링용)
  const fetchFromServer = useCallback(async (silent = false) => {
    if (!silent) setServerLoading(true);
    try {
      const data = await loadData();
      setSchedules(data);
      saveLS("tasio_schedules", data); // 로컬 캐시도 갱신
    } catch (err) {
      if (!silent) showToast("서버 연결 실패. 잠시 후 다시 시도합니다.", "info");
      console.warn("[타시오] fetch 오류:", err.message);
    } finally {
      if (!silent) setServerLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 앱 시작 시 초기 로드 (로딩 표시 O)
  useEffect(() => {
    fetchFromServer(false);
  }, [fetchFromServer]);

  // 5초마다 자동 폴링 — 다른 사용자 변경 사항 실시간 반영 (로딩 표시 X)
  useEffect(() => {
    const id = setInterval(() => fetchFromServer(true), POLL_INTERVAL_MS);
    return () => clearInterval(id); // 언마운트 시 인터벌 정리
  }, [fetchFromServer]);

  // ── 낙관적 업데이트 ────────────────────────────────────────────────
  // 순서: UI 즉시 반영 → 서버 저장 → 서버 재조회(즉시 동기화)
  // 실패 시: UI 롤백 + 에러 토스트
  const optimisticUpdate = useCallback(async (updateFn, serverAction, serverPayload, rollbackFn) => {
    updateFn(); // 즉각 UI 반영
    try {
      await saveData(serverAction, serverPayload); // 서버 저장
      await fetchFromServer(true);                 // 저장 직후 서버 재조회
    } catch (err) {
      rollbackFn();
      console.warn("[타시오] save 오류:", err.message);
      showToast("서버 저장 실패. 변경이 취소됐습니다.", "error");
    }
  }, [fetchFromServer]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveProfile = () => {
    if (!nameInput.trim()) { showToast("이름을 입력해주세요.", "error"); return; }
    if (carInput === "")  { showToast("차량 끝번호를 선택해주세요.", "error"); return; }
    const name = nameInput.trim();
    saveLS("tasio_name", name); saveLS("tasio_car", carInput);
    setUserName(name); setUserCar(carInput);
    showToast(`✅ ${name} 님으로 저장됐어요!`);
  };

  const registerDriver = () => {
    if (!userName) { showToast("먼저 내 정보를 저장해주세요.", "error"); return; }
    if (isBannedOnDay(userCar, driverDay)) {
      alert(`🚫 차량 진입이 금지된 날입니다!\n\n끝번호 ${BANNED_DIGITS[driverDay].join(", ")}번 차량은 ${DAY_NAMES[driverDay]}요일에 진입할 수 없어요.`);
      return;
    }
    const wKey = weekDates[1].dateStr; // 이번(또는 선택된) 주의 weekKey
    if (schedules.some((s) => s.name === userName && s.day === driverDay && (s.weekKey ?? getWeekKey(0)) === wKey)) {
      showToast(`${DAY_NAMES[driverDay]}요일엔 이미 등록했습니다.`, "error"); return;
    }
    const newEntry = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: userName, carLastDigit: userCar, day: driverDay, time: driverTime,
      passengers: [], weekKey: wKey,
    };
    optimisticUpdate(
      () => { setSchedules((p) => [...p, newEntry]); showToast(`🚙 ${DAY_NAMES[driverDay]}요일 ${driverTime} 등록 완료!`); setActiveTab("board"); },
      "register",
      { id: newEntry.id, name: newEntry.name, carLastDigit: newEntry.carLastDigit, day: newEntry.day, time: newEntry.time, weekKey: wKey },
      () => setSchedules((p) => p.filter((s) => s.id !== newEntry.id))
    );
  };

  const bookRide = (scheduleId) => {
    if (!userName) { showToast("먼저 내 정보를 저장해주세요.", "error"); return; }
    const target = schedules.find((s) => s.id === scheduleId);
    if (!target || target.name === userName) return;
    const alreadyBooked = target.passengers.includes(userName);
    if (!alreadyBooked) {
      if (target.passengers.length >= 2) { showToast("마감되었습니다. 이미 2명이 예약됐어요.", "error"); return; }
      if (schedules.some((s) => s.day === target.day && (s.weekKey ?? getWeekKey(0)) === (target.weekKey ?? getWeekKey(0)) && s.passengers.includes(userName))) {
        showToast(`${DAY_NAMES[target.day]}요일엔 이미 예약했어요. 하루 1회만 가능해요.`, "error"); return;
      }
    }
    const prevSchedules = schedules;
    optimisticUpdate(
      () => {
        setSchedules((p) => p.map((s) =>
          s.id === scheduleId
            ? { ...s, passengers: alreadyBooked ? s.passengers.filter((x) => x !== userName) : [...s.passengers, userName] }
            : s
        ));
        showToast(alreadyBooked ? "예약을 취소했습니다." : `🎉 ${target.name} 님 카풀 예약 완료!`, alreadyBooked ? "info" : "success");
      },
      alreadyBooked ? "cancel" : "book",
      { id: scheduleId, userName },
      () => setSchedules(prevSchedules)
    );
  };

  const deleteDriver = (scheduleId) => {
    const prev = schedules;
    optimisticUpdate(
      () => { setSchedules((p) => p.filter((s) => s.id !== scheduleId)); showToast("카풀 등록이 삭제됐습니다.", "info"); },
      "delete", { id: scheduleId },
      () => setSchedules(prev)
    );
  };

  // 오늘 금지 정보
  const todayBanned = todayDay ? BANNED_DIGITS[todayDay] : null;
  const myCarBannedToday = todayDay ? isBannedOnDay(userCar, todayDay) : false;
  const todayBannedPeople = useMemo(() => {
    if (!todayDay) return [];
    const map = new Map();
    if (userName && userCar !== "") map.set(userName, userCar);
    schedules.forEach((s) => { if (!map.has(s.name)) map.set(s.name, s.carLastDigit); });
    const result = [];
    map.forEach((car, name) => { if (isBannedOnDay(car, todayDay)) result.push(name); });
    return result;
  }, [todayDay, userName, userCar, schedules]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-100 via-fuchsia-50 to-sky-100">

      {/* ── 상단 헤더 ── */}
      <div className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-violet-200/60 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 pt-4 pb-3">

          {/* 타이틀 행 */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500 leading-none">
                타시오 🚗
              </h1>
              <p className="text-slate-400 text-xs mt-0.5 font-semibold">폴리텍아파트 입주민 카풀</p>
            </div>
            {userName ? (
              <div onClick={() => setActiveTab("settings")}
                className="bg-gradient-to-br from-violet-50 to-fuchsia-50 border border-violet-200 hover:border-violet-300 active:scale-95 transition-all cursor-pointer rounded-2xl px-3 py-2 text-right shadow-sm">
                <p className="text-violet-700 text-sm font-black">{userName} 님</p>
                <p className="text-violet-400 text-xs">끝번호 {userCar}번</p>
              </div>
            ) : (
              <button onClick={() => setActiveTab("settings")}
                className="bg-violet-500 hover:bg-violet-600 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-md shadow-violet-200 transition-all">
                내 정보 설정 →
              </button>
            )}
          </div>

          {/* 오늘 5부제 배너 */}
          {todayBanned && (
            <div className={`rounded-2xl px-4 py-3 mb-3 flex items-center gap-3 border shadow-sm
              ${myCarBannedToday
                ? "bg-red-50 border-red-200"
                : "bg-white border-violet-100"}`}>
              <div className="flex-shrink-0">
                <span className="text-xs text-slate-500 font-bold block mb-1">
                  {DAY_NAMES[todayDay]}요일 진입 금지 끝번호
                </span>
                <div className="flex gap-1.5">
                  {todayBanned.map((n) => (
                    <span key={n} className={`text-sm font-black w-8 h-8 flex items-center justify-center rounded-xl shadow-sm
                      ${myCarBannedToday && userCar === String(n)
                        ? "bg-red-500 text-white shadow-red-200"
                        : "bg-violet-100 text-violet-700"}`}>
                      {n}
                    </span>
                  ))}
                </div>
              </div>
              {todayBannedPeople.length > 0 && (
                <>
                  <div className="w-px self-stretch bg-violet-100 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-red-500 font-bold block mb-1">🚫 오늘 운행 불가</span>
                    <div className="flex flex-wrap gap-1">
                      {todayBannedPeople.map((name) => (
                        <span key={name} className="bg-red-100 border border-red-200 text-red-500 text-xs font-bold px-2 py-0.5 rounded-full">
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 탭 버튼 — 모바일만 */}
          <div className="flex gap-2 md:hidden">
            <button onClick={() => setActiveTab("board")}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 shadow-sm
                ${activeTab === "board"
                  ? "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-violet-200"
                  : "bg-white text-slate-500 border border-violet-100 hover:bg-violet-50"}`}>
              🙋 태워줘
            </button>
            <button onClick={() => setActiveTab("settings")}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 shadow-sm
                ${activeTab === "settings"
                  ? "bg-gradient-to-r from-sky-400 to-cyan-500 text-white shadow-sky-200"
                  : "bg-white text-slate-500 border border-violet-100 hover:bg-sky-50"}`}>
              ⚙️ 내 설정
            </button>
          </div>
        </div>
      </div>

      {/* ── 메인 콘텐츠 ── */}
      <div className="max-w-5xl mx-auto px-4 py-4 pb-24">
        <div className="flex flex-col md:flex-row md:items-start gap-4">

          {/* 좌측: 태워줘 현황판 */}
          <div className={`w-full md:flex-[3] ${activeTab !== "board" ? "hidden md:block" : ""}`}>
            <BoardPanel
              schedules={schedules}
              userName={userName}
              userCar={userCar}
              loading={serverLoading}
              onBookRide={bookRide}
              onDeleteDriver={deleteDriver}
              onRefresh={() => fetchFromServer(false)}
              weekOffset={weekOffset}
              setWeekOffset={setWeekOffset}
              weekDates={weekDates}
              weatherData={weatherData}
            />
          </div>

          {/* 우측: 설정 패널 */}
          <div className={`w-full md:flex-[2] ${activeTab !== "settings" ? "hidden md:block" : ""}`}>
            <SettingsPanel
              userName={userName} userCar={userCar}
              nameInput={nameInput} setNameInput={setNameInput}
              carInput={carInput} setCarInput={setCarInput}
              onSaveProfile={saveProfile}
              driverDay={driverDay} setDriverDay={setDriverDay}
              driverTime={driverTime} setDriverTime={setDriverTime}
              onRegisterDriver={registerDriver}
              schedules={schedules}
              onShowHelp={() => setShowHelp(true)}
              weekOffset={weekOffset}
              weekDates={weekDates}
            />
          </div>

        </div>
      </div>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
