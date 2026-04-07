// ─────────────────────────────────────────────────────────────────────────────
// Google Apps Script 웹앱 URL
// ─────────────────────────────────────────────────────────────────────────────
export const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbx5OqRK6txbdGWOeHCFoIdLjyMADQR9qIKGOkgA2h3b_3SndVjpKCtsPAl2dUL4bWd9Ug/exec";

export const IS_CONNECTED = true;

// ─────────────────────────────────────────────────────────────────────────────
// [Google Sheets 구조]
//  시트명: "schedules"
//  헤더(1행): id | name | carLastDigit | day | time | passengers | weekKey
//   - passengers : JSON 배열 문자열  예) ["홍길동","김철수"]
//   - weekKey    : 해당 주 월요일 날짜 문자열  예) "2025-03-31"
//
// ─────────────────────────────────────────────────────────────────────────────
// [Apps Script 전체 코드] — 아래 코드를 붙여넣고 재배포하세요.
// 저장/수정/삭제 모두 doGet 에서 처리합니다 (CORS 문제 없음).
//
// const SHEET = "schedules";
//
// function doGet(e) {
//   const action = (e.parameter && e.parameter.action) || "load";
//   if (action === "load") {
//     const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET);
//     const [headers, ...rows] = sheet.getDataRange().getValues();
//     const schedules = rows
//       .filter(r => r[0])
//       .map(r => {
//         const obj = {};
//         headers.forEach((h, i) => { obj[h] = r[i]; });
//         try { obj.passengers = JSON.parse(obj.passengers || "[]"); }
//         catch { obj.passengers = []; }
//         obj.day = Number(obj.day);
//         return obj;
//       });
//     return json({ success: true, schedules });
//   }
//   return handleAction(action, e.parameter);
// }
//
// function handleAction(action, p) {
//   const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET);
//   const data    = sheet.getDataRange().getValues();
//   const headers = data[0];
//   const rows    = data.slice(1);
//
//   switch (action) {
//     case "register": {
//       sheet.appendRow([
//         p.id, p.name, p.carLastDigit,
//         Number(p.day), p.time, JSON.stringify([]),
//         p.weekKey || ""
//       ]);
//       break;
//     }
//     case "book":
//     case "cancel": {
//       const rowIdx = rows.findIndex(r => String(r[0]) === String(p.id));
//       if (rowIdx === -1) return json({ success: false, message: "항목 없음" });
//       const col = headers.indexOf("passengers") + 1;
//       let pax = JSON.parse(rows[rowIdx][col - 1] || "[]");
//       if (action === "book") {
//         if (!pax.includes(p.userName)) pax.push(p.userName);
//       } else {
//         pax = pax.filter(x => x !== p.userName);
//       }
//       sheet.getRange(rowIdx + 2, col).setValue(JSON.stringify(pax));
//       break;
//     }
//     case "delete": {
//       const rowIdx = rows.findIndex(r => String(r[0]) === String(p.id));
//       if (rowIdx !== -1) sheet.deleteRow(rowIdx + 2);
//       break;
//     }
//     default:
//       return json({ success: false, message: "알 수 없는 action" });
//   }
//   return json({ success: true });
// }
//
// function json(obj) {
//   return ContentService
//     .createTextOutput(JSON.stringify(obj))
//     .setMimeType(ContentService.MimeType.JSON);
// }
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 전체 카풀 스케줄을 서버에서 불러옵니다.
 * @returns {Promise<Array>}
 */
function fixTime(raw) {
  if (!raw) return raw;
  const s = String(raw);
  // ISO 형식: "1899-12-29T23:12:08.000Z" → 로컬 시간으로 변환
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  // toString 형식: "Sat Dec 30 1899 08:00:00 GMT+0827..." → HH:MM 직접 추출
  const match = s.match(/(\d{1,2}):(\d{2}):\d{2}/);
  if (match) return `${String(parseInt(match[1])).padStart(2, "0")}:${match[2]}`;
  return s;
}

function fixWeekKey(raw) {
  if (!raw) return raw;
  const s = String(raw);
  // "2026-03-22T15:00:00.000Z" → 로컬 날짜 "2026-03-23"
  if (s.includes("T")) {
    const d = new Date(s);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return s;
}

export async function loadData() {
  const res = await fetch(`${SCRIPT_URL}?action=load`, {
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`서버 응답 오류 (${res.status})`);
  const data = await res.json();
  if (!data.success) throw new Error(data.message || "데이터 로드 실패");
  return (data.schedules || []).map((s) => ({
    ...s,
    time: fixTime(s.time),
    weekKey: fixWeekKey(s.weekKey),
  }));
}

/**
 * 변경 사항을 서버에 저장합니다.
 * POST 대신 GET 파라미터 방식을 사용해 CORS/302 리다이렉트 문제를 완전히 우회합니다.
 *
 * @param {"register"|"book"|"cancel"|"delete"} action
 * @param {object} payload
 */
export async function saveData(action, payload) {
  const params = new URLSearchParams({ action });
  Object.entries(payload).forEach(([k, v]) => {
    params.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  });
  const res = await fetch(`${SCRIPT_URL}?${params.toString()}`, {
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`서버 응답 오류 (${res.status})`);
  const data = await res.json();
  if (!data.success) throw new Error(data.message || "저장 실패");
}
