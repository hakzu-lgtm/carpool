# 타시오 🚗

폴리텍아파트 입주민 카풀 서비스

**배포 URL:** https://hakzu-lgtm.github.io/carpool

---

## 주요 기능

| 기능 | 설명 |
|---|---|
| 🚙 타시오 등록 | 운전자가 출발 요일·시간 등록 |
| 🙋 태워줘 | 탑승자가 운전자 카드 클릭으로 예약/취소 |
| 📅 주간 이동 | ‹ › 버튼으로 다른 주 일정 조회 |
| 🌤️ 날씨 표시 | 주간 날씨 및 최고/최저 기온 |
| 🚫 5부제 자동 차단 | 차량 끝번호 기반 금지 요일 자동 비활성화 |
| 🔄 실시간 동기화 | 5초 폴링으로 다른 사용자 변경사항 반영 |

---

## 기술 스택

- **프론트엔드:** React 18, Vite 5, TailwindCSS 3
- **백엔드:** Google Apps Script (웹앱)
- **데이터베이스:** Google Sheets
- **날씨 API:** [Open-Meteo](https://open-meteo.com/)
- **배포:** GitHub Pages (`gh-pages`)

---

## 사용 방법

### 1. 내 정보 등록 (필수)
⚙️ 내 설정 → 이름 입력 + 차량 끝번호 선택 → **저장하기**

### 2. 타시오 등록 (운전자)
⚙️ 내 설정 → 타시오 등록 → 요일·시간 선택 → **등록**
- 5부제 금지 요일은 자동 비활성화
- 같은 요일 중복 등록 불가

### 3. 태워줘 (탑승자)
🙋 태워줘 탭 → 원하는 운전자 카드 클릭 → 예약 완료
- 같은 날 하루 1회만 예약 가능
- 운전자당 최대 2명 탑승

---

## 5부제 기준

| 요일 | 금지 끝번호 |
|---|---|
| 월 | 1, 6 |
| 화 | 2, 7 |
| 수 | 3, 8 |
| 목 | 4, 9 |
| 금 | 5, 0 |

---

## Google Sheets 구조

시트명: **schedules**

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | string | 고유 ID (타임스탬프_랜덤) |
| name | string | 운전자 이름 |
| carLastDigit | number | 차량 번호판 끝자리 |
| day | number | 요일 (1=월 ~ 5=금) |
| time | string | 출발 시간 (HH:MM) |
| passengers | JSON | 탑승자 이름 배열 |
| weekKey | string | 해당 주 월요일 날짜 (예: 2025-03-31) |

---

## Google Apps Script 재배포

1. Apps Script 편집기 열기
2. `src/api/sheets.js` 상단 주석의 전체 코드 붙여넣기
3. **배포 → 새 배포 → 유형: 웹앱 → 액세스: 모든 사용자**
4. 배포 URL을 `sheets.js`의 `SCRIPT_URL` 값으로 교체

---

## 로컬 개발

```bash
# 패키지 설치
npm install

# 개발 서버 (http://localhost:5173/carpool/)
npm run dev

# 빌드
npm run build

# GitHub Pages 배포
npm run deploy
```

---

## 파일 구조

```
카풀/
├── src/
│   ├── App.jsx          # 메인 컴포넌트 (UI 전체)
│   ├── api/
│   │   └── sheets.js    # Google Sheets API 연동
│   ├── index.css        # 전역 스타일
│   └── main.jsx         # React 진입점
├── public/
│   └── favicon.svg
├── index.html
├── package.json
├── vite.config.js       # base: '/carpool/'
├── tailwind.config.js
└── postcss.config.js
```

---

## 데이터 흐름

```
앱 시작 → Google Sheets 전체 로드
5초마다 → 자동 폴링 (silent)
액션 발생 → 낙관적 UI 업데이트 → 서버 저장 → 2.5초 후 재조회
```
