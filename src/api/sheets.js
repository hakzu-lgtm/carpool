// ─────────────────────────────────────────────────────────────────────────────
// Google Apps Script 웹앱 URL
// ─────────────────────────────────────────────────────────────────────────────
export const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwBRKNXtiidIrpgfn5688Wu7vUxc1eS9Q9uZAO9NeUSsDEyMFJ1nbT07lEuTg8X0hDgbw/exec";

export const IS_CONNECTED = true;

// ─────────────────────────────────────────────────────────────────────────────
// [Google Sheets 구조]
//  시트명: "schedules"
//  헤더(1행): id | name | carLastDigit | day | time | passengers | weekKey
//   - passengers : JSON 배열 문자열  예) ["홍길동","김철수"]
//   - weekKey    : 해당 주 월요일 날짜 문자열  예) "2025-03-31"
//
// ─────────────────────────────────────────────────────────────────────────────
// [Apps Script 전체 코드] — 아래 코드로 재배포하면 weekKey 컬럼도 지원됩니다.
//
// const SHEET = "schedules";
//
// function doGet(e) {
//   const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET);
//   const [headers, ...rows] = sheet.getDataRange().getValues();
//   const schedules = rows
//     .filter(r => r[0])
//     .map(r => {
//       const obj = {};
//       headers.forEach((h, i) => { obj[h] = r[i]; });
//       try { obj.passengers = JSON.parse(obj.passengers || "[]"); }
//       catch { obj.passengers = []; }
//       obj.day = Number(obj.day);
//       return obj;
//     });
//   return json({ success: true, schedules });
// }
//
// function doPost(e) {
//   const payload = JSON.parse(e.postData.contents);
//   const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET);
//   const data  = sheet.getDataRange().getValues();
//   const headers = data[0];
//   const rows    = data.slice(1);
//
//   switch (payload.action) {
//
//     case "register": {
//       sheet.appendRow([
//         payload.id,
//         payload.name,
//         payload.carLastDigit,
//         payload.day,
//         payload.time,
//         JSON.stringify([]),
//         payload.weekKey || ""
//       ]);
//       break;
//     }
//
//     case "book":
//     case "cancel": {
//       const rowIdx = rows.findIndex(r => String(r[0]) === String(payload.id));
//       if (rowIdx === -1) return json({ success: false, message: "항목 없음" });
//       const col = headers.indexOf("passengers") + 1;
//       let pax = JSON.parse(rows[rowIdx][col - 1] || "[]");
//       if (payload.action === "book") {
//         if (!pax.includes(payload.userName)) pax.push(payload.userName);
//       } else {
//         pax = pax.filter(p => p !== payload.userName);
//       }
//       sheet.getRange(rowIdx + 2, col).setValue(JSON.stringify(pax));
//       break;
//     }
//
//     case "delete": {
//       const rowIdx = rows.findIndex(r => String(r[0]) === String(payload.id));
//       if (rowIdx !== -1) sheet.deleteRow(rowIdx + 2);
//       break;
//     }
//
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
 * GAS는 GET 요청 시 302 리다이렉트를 거치므로 redirect:'follow' 를 명시합니다.
 * @returns {Promise<Array>}
 */
export async function loadData() {
  const res = await fetch(`${SCRIPT_URL}?action=load`, {
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`서버 응답 오류 (${res.status})`);
  const data = await res.json();
  if (!data.success) throw new Error(data.message || "데이터 로드 실패");
  return data.schedules || [];
}

/**
 * 변경 사항을 서버에 저장합니다.
 *
 * GAS는 Content-Type: application/json 에 CORS preflight 오류가 발생하므로
 * text/plain 으로 전송합니다 (simple request → preflight 없음).
 *
 * @param {"register"|"book"|"cancel"|"delete"} action
 * @param {object} payload
 */
export async function saveData(action, payload) {
  const res = await fetch(SCRIPT_URL, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...payload }),
  });
  if (!res.ok) throw new Error(`서버 응답 오류 (${res.status})`);
  const data = await res.json();
  if (!data.success) throw new Error(data.message || "저장 실패");
}
