# TDD Evidence Report: `online-main` 오류 수정 및 구조·품질 개선

## 1. Source Plan
- **Plan Artifact**: [online-main-improvement.plan.md](file:///C:/Users/USER/.gemini/antigravity-cli/brain/c34a2cc5-ab1e-4e1b-9467-cb52eb9b9929/online-main-improvement.plan.md)
- **Working Directory**: `C:\Users\USER\Downloads\online-main`
- **Distribution Mode**: Option A — ES Modules under `src/` imported by `index.html` (static hosting compatible)
- **Test Runner**: `npm test` (`vitest run`) / `npm run test:coverage` (`vitest run --coverage`)

---

## 2. User Journeys
1. 악성 닉네임(`<style>`, `<span data-ep-onclick-fn="confirmLeaveRoom">`) 사용자가 입장해도 타인의 화면이 깨지거나 클릭 시 임의 함수가 실행되지 않는다.
2. 두 방장이 동시에 방을 생성해도 기존 방 데이터가 덮어쓰이지 않으며, 재입장·방 전환 시 Firebase `onValue` 리스너가 중복 호출되지 않는다.
3. 웹폰트가 정상 로드되고, 입력창에서 텍스트를 드래그 선택할 수 있으며, 모바일 `suspended` 상태에서도 효과음이 복구 재생된다.
4. 종이야구 무승부 시 청팀이 억울하게 패배자로 지정되지 않고, 마지막 이닝 말 역전 시 끝내기 승리로 즉시 종료된다.
5. 루미큐브 덱 소진 후 전원 패스 시 무한 루프 없이 잔여 점수 기준으로 종료되며, 2인전 첫 턴 즉사가 발생하지 않는다.
6. 도형그리기에서 동일 도형이 연속 출제되어도 봇이 정상 제출하며, 빙고 동시 호출 시 트랜잭션으로 레이스 컨디션이 방지된다.
7. Service Worker가 쿼리 파라미터 요청(`?_r=...`)으로 캐시를 오염시키지 않고, 분리된 `src/` ES 모듈을 프리캐시하며 오프라인 시 `./index.html`로 폴백한다.

---

## 3. Task Report (Phase별 RED → GREEN 증거)

### Phase 1: 보안(HTML 이스케이프·Sanitizer·클릭 위임 Allowlist) & 방 생명주기
- **Summary**: `src/utils/sanitize.js`와 `src/core/room.js`를 분리하고, `index.html` 내 모든 사용자 닉네임/입력 `innerHTML` 20+ 지점에 `escapeHtml`을 적용하며 방 생성 충돌 방지 및 `RoomSubscriptionManager` 기반 `onValue` 해제를 연동했습니다.
- **Validation Command**: `npm test`
- **RED Excerpt** (commit `590921f`):
  - `tests/unit/sanitize.test.js`: `Failed to resolve import "../../src/utils/sanitize.js"`
  - `tests/unit/room.test.js`: `Failed to resolve import "../../src/core/room.js"`
  - `tests/integration/phase1-index.test.js`: `4 failed` (`expected [ ...(20) ] to deeply equal []` — 미이스케이프 닉네임 `innerHTML` 20건 검출)
- **GREEN Excerpt** (commit `b8ea6cd`):
  - `Test Files 3 passed (3) | Tests 17 passed (17)`
- **Guaranteed**: `<style>`/`<svg>`/비허용 `data-ep-onclick-fn` 주입 차단, 허용된 6개 UI 핸들러만 실행, 기존 방 덮어쓰기 방지, 단일 `onValue` 구독 유지.

### Phase 2: UX 및 브라우저 호환성 수정
- **Summary**: Google Fonts CSS2 URL 문법(`wght@400;700`), `selectstart` 입력창 예외 허용, `src/utils/audio.js`(`AudioContext.resume()`), 비정상 함수명 `rpZEAWYtiB6bJ16NuLbGCc6CZ6jJdKfb63` → `requestDrinkNotifyPermission` 정규화를 완료했습니다.
- **Validation Command**: `npm test -- tests/unit/audio.test.js tests/integration/phase2-ux.test.js` → `npm test`
- **RED Excerpt** (commit `fc941f5`):
  - `tests/unit/audio.test.js`: `Failed to resolve import "../../src/utils/audio.js"`
  - `tests/integration/phase2-ux.test.js`: `4 failed` (폰트 URL `wght=`, 오염 함수명 잔존, `selectstart`가 `<input>`까지 차단)
- **GREEN Excerpt** (commit `cc0e7ad`):
  - `Test Files 5 passed (5) | Tests 24 passed (24)`
- **Guaranteed**: 폰트 정상 요청, `input`/`textarea`/`select`/`[contenteditable="true"]` 텍스트 선택 가능, `suspended` 상태 `AudioContext.resume()` 호출.

### Phase 3: 게임 로직 버그 수정 및 원자성 보강
- **Summary**: `src/games/baseball.js`, `src/games/rummikub.js`, `src/games/bingo.js`, `src/utils/random.js`를 분리하고 종이야구 무승부/끝내기, 루미큐브 덱 소진·2인 공정성·턴 가드, 도형그리기 봇 `drawRoundKey`, 빙고 `runTransaction`, Fisher-Yates 셔플 통일 및 `.substr()`/`parseInt` radix 정리를 완료했습니다.
- **Validation Command**: `npm test -- tests/unit/baseball.test.js tests/unit/rummikub.test.js tests/unit/bingo.test.js tests/unit/random.test.js tests/integration/phase3-games.test.js` → `npm test`
- **RED Excerpt** (commit `e5ea418`):
  - `Test Files 5 failed (5) | Tests 5 failed (5)` (모듈 미존재 + `targetShapeIndex` 키, 비원자적 `callBingoNumber`, 턴 가드 누락, 편향 `Math.random() - 0.5` 정렬 검출)
- **GREEN Excerpt** (commit `5474ccc`):
  - `Test Files 10 passed (10) | Tests 45 passed (45)`
- **Guaranteed**: 무승부 시 `loserId: null`, 끝내기 즉시 종료, 덱 소진 전원 패스 시 잔여점수 판정 종료, 2인전 1턴 즉사 방지, 빙고 트랜잭션 원자성, 비편향 셔플.

### Phase 4: PWA · Service Worker 캐시 정책 및 전체 무결성 검증
- **Summary**: `sw.js`를 `v3`로 올리고 `src/` ES 모듈 전체 프리캐시, `Promise.allSettled` 기반 설치 내성, 쿼리 파라미터(`?_r=`) 캐시 제외를 적용했으며 `manifest.json`에 `maskable` 아이콘을 추가했습니다.
- **Validation Command**: `npm test -- tests/unit/sw.test.js tests/integration/phase4-pwa.test.js` → `npm run test:coverage`
- **RED Excerpt** (commit `5c2d0cc`):
  - `tests/unit/sw.test.js`: `2 failed` (`v2` 미정리, `?_r=` 요청이 `cache.put`에 저장됨)
  - `tests/integration/phase4-pwa.test.js`: `2 failed` (`src/` 모듈 미프리캐시, `maskable` 아이콘 부재)
- **GREEN Excerpt** (commit `8bffc4e` + coverage hardening):
  - `Test Files 12 passed (12) | Tests 54 passed (54)`
  - `index.html` 인라인 `<script type="module">`에 대한 `node --check` 구문 검증 통과.

---

## 4. Test Specification

| # | What is guaranteed | Test file | Test type | Result | Evidence |
|---|---|---|---|---|---|
| 1 | `escapeHtml` / `sanitizeHtml`이 `<style>`, `<svg>`, `<script>`, 비허용 `data-ep-onclick-fn`을 제거하고 허용 위임만 통과 | `tests/unit/sanitize.test.js` (9 tests) | unit | PASS | `npm run test:coverage` |
| 2 | `createUniqueRoomCode` / `createRoomSafely`가 기존 방 덮어쓰기 및 중복 클릭을 차단하고 `RoomSubscriptionManager`가 이전 `onValue`를 해제 | `tests/unit/room.test.js` (5 tests) | unit | PASS | `npm run test:coverage` |
| 3 | `index.html` 내 모든 닉네임 `innerHTML` 이스케이프, 모듈 임포트, 리스너 관리, 안전 방 생성 적용 | `tests/integration/phase1-index.test.js` (4 tests) | integration | PASS | `npm run test:coverage` |
| 4 | `playTierSound`가 `suspended` 상태에서 `AudioContext.resume()` 호출 및 음소거/예외 안전 처리 | `tests/unit/audio.test.js` (3 tests) | unit | PASS | `npm run test:coverage` |
| 5 | Google Fonts `@` 문법, `selectstart` 입력창 예외, `requestDrinkNotifyPermission` 정규화 | `tests/integration/phase2-ux.test.js` (4 tests) | integration | PASS | `npm run test:coverage` |
| 6 | 종이야구 무승부 `loserId: null`, 끝내기 즉시 종료, 말 이닝 생략, 볼넷·안타·아웃·이닝 교대 | `tests/unit/baseball.test.js` (7 tests) | unit | PASS | `npm run test:coverage` |
| 7 | 루미큐브 조합 판정, 2인전 첫 턴 즉사 방지, 덱 소진 전원 패스 종료, 턴 가드 | `tests/unit/rummikub.test.js` (6 tests) | unit | PASS | `npm run test:coverage` |
| 8 | 빙고 번호 호출 트랜잭션 원자성(중복 호출·비턴 거부) | `tests/unit/bingo.test.js` (2 tests) | unit | PASS | `npm run test:coverage` |
| 9 | 비편향 Fisher-Yates `shuffleArray` 및 deprecated `.substr()` 제거 ID 생성 | `tests/unit/random.test.js` (2 tests) | unit | PASS | `npm run test:coverage` |
| 10 | `index.html` 게임 모듈 연동, `drawRoundKey` 봇 키, 빙고 트랜잭션, 편향 정렬·`.substr()` 0건 | `tests/integration/phase3-games.test.js` (5 tests) | integration | PASS | `npm run test:coverage` |
| 11 | `sw.js` 설치 실패 내성, 구버전 캐시 정리, 쿼리 URL 캐싱 제외, 오프라인 `./index.html` 폴백 | `tests/unit/sw.test.js` (4 tests) | unit | PASS | `npm run test:coverage` |
| 12 | `sw.js`의 `src/` 모듈 프리캐시 정합성, `manifest.json` `maskable` 아이콘, `index.html` 모듈 `node --check` | `tests/integration/phase4-pwa.test.js` (3 tests) | integration | PASS | `npm run test:coverage` |

---

## 5. Coverage and Known Gaps

### Coverage Output (`npm run test:coverage`)
```text
Test Files  12 passed (12)
     Tests  54 passed (54)

File          | % Stmts | % Branch | % Funcs | % Lines
--------------|---------|----------|---------|--------
All files     |   97.61 |    80.76 |     100 |   97.61
 core/room.js |     100 |    82.75 |     100 |     100
 games/       |   98.79 |    82.63 |     100 |   98.79
 utils/       |    93.9 |    76.34 |     100 |    93.9
```
- 전역 임계치(80% Statements / Branches / Functions / Lines) **모두 통과**.

### Known Gaps & Recommended Follow-ups
1. **Firebase RTDB Security Rules (서버 측 운영 항목)**: 클라이언트 보안(HTML 이스케이프/클릭 위임 allowlist/트랜잭션)은 완료했으나, 익명 인증(`firebase/auth`) 및 Firebase Console의 RTDB Security Rules 설정은 서버/인프라 영역이므로 별도 적용을 권장합니다.
2. **나머지 27개 인라인 게임 모듈화**: 이번 범위에서는 검증된 버그가 존재한 코어·게임 로직을 우선 분리했으며, `index.html` 내 잔여 게임(`initRoomListener`, `startGameFlow`)의 추가 모듈화는 후속 리팩터링 마일스톤으로 확장 가능합니다.
3. **실브라우저 E2E 테스트**: 현재 단위/통합 테스트는 jsdom + VM 환경에서 검증되었습니다. 정적 HTTP 서버(`npx serve .` 등) + Playwright 기반 실브라우저 E2E는 Firebase 테스트 인스턴스/에뮬레이터 구성 후 추가할 수 있습니다.

---

## 6. Merge / Checkpoint Evidence (`main` branch)
- `7586d59` `chore: import online-main baseline and Vitest test harness`
- `590921f` `test: add RED reproducers for Phase 1 security and room lifecycle`
- `b8ea6cd` `fix: harden HTML sanitization, click delegation, and room lifecycle`
- `fc941f5` `test: add RED reproducers for Phase 2 UX and browser fixes`
- `cc0e7ad` `fix: fix Google Fonts URL, selectstart editable guard, AudioContext resume, and function rename`
- `e5ea418` `test: add RED reproducers for Phase 3 game logic and atomicity`
- `5474ccc` `fix: resolve baseball, rummikub, draw bot key, bingo atomicity, and shuffle bugs`
- `5c2d0cc` `test: add RED reproducers for Phase 4 PWA and service worker`
- `8bffc4e` `fix: harden service worker caching and add maskable PWA icons`
- *(final commit)* `docs: add coverage hardening tests and TDD evidence report`

---

## 7. Follow-up Bugfix TDD Cycle: 방장 "새로운 방 만들기" 버튼 무반응 수정 (로컬 Mock 전용)
- **Bug Report**: 방장이 새 방을 만들 때 버튼을 클릭해도 동작하지 않음.
- **Validation Constraint**: 실제 Firebase DB에는 일절 접근하지 않고 로컬 Vitest + jsdom Mock 환경에서만 검증.
- **Root Causes Identified**:
  1. `createRoomSafely`의 `runRoomTransaction`에 타임아웃이 없어 지연/끊김 시 `createRoomInFlight`가 영구 잠금(`true`)되어 이후 클릭이 무반응 처리됨.
  2. `runTransaction`이 환경/규칙 오류로 거부될 때 충돌 검증 기반 `get`+`set` 폴백 경로가 없음.
  3. ES Module 지연 로딩 시 `DOMContentLoaded`가 이미 발생한 뒤 리스너가 등록되어 초기화가 누락될 수 있음.
  4. `file://` 직접 열기 시 ES Module CORS 차단으로 버튼이 무반응 상태가 되며 안내 메시지가 없음.
- **RED Checkpoint** (`a31b461`, `npx vitest run --testTimeout=1500 tests/unit/room-create-bug.test.js tests/integration/create-room-flow.test.js`):
  - `tests/unit/room-create-bug.test.js`: 2/2 failed (`Test timed out in 1500ms` 영구 잠금 재현, `expected null to be '2222'` 폴백 부재 재현)
  - `tests/integration/create-room-flow.test.js`: failed to resolve `src/core/login-controller.js`
- **GREEN Fix & Verification**:
  - `src/core/room.js`: `withTimeout` 기반 타임아웃 해제 + `checkRoomExists`/`writeRoom` 충돌 검증 폴백 추가
  - `src/core/login-controller.js`: `onDomReady`, `bindLoginControls`(버튼 비활성/로딩 상태 및 `finally` 복구) 분리
  - `index.html`, `sw.js`: `onDomReady`/`bindLoginControls` 연동, `window.__partyAppBooted` + `file://` CORS 경고 배너/클릭 안내 추가, `sw.js`에 `./src/core/login-controller.js` 프리캐시 등록
  - Validation command: `npm run test:coverage` (14 test files / 59 tests PASS, 80%+ 전 항목 통과)

---

## 8. Follow-up Feature TDD Cycle: `file://` 직접 열기 지원 (Standalone 인라인 번들)
- **Requirement**: `src/` 모듈 구조와 단위 테스트(커버리지 80%+)를 유지하면서, 탐색기에서 `index.html`을 `file://`로 직접 더블클릭해 열어도 CORS 차단 없이 방 생성·게임이 정상 동작해야 함.
- **RED Checkpoint** (`391fa84`, `npm test -- tests/unit/build-standalone.test.js tests/integration/standalone-file-protocol.test.js`):
  - `tests/unit/build-standalone.test.js`: failed to resolve `scripts/build-standalone.mjs`
  - `tests/integration/standalone-file-protocol.test.js`: 2/2 failed (`index.html`에 상대 경로 `./src/...` import 잔존)
- **GREEN Fix & Verification**:
  - `src/index.template.html`: 모듈형 원본 템플릿으로 분리
  - `scripts/build-standalone.mjs` (`npm run build`): 위상 정렬 순서로 로컬 `./src/**/*.js` 모듈을 `index.html`에 인라인 번들링 (HTTPS Firebase CDN import만 유지, 상대 경로 import 0건)
  - `sw.js`: 캐시 `party-games-shell-v4` 갱신 및 앱 셸 자산 정합화
  - `tests/integration/standalone-file-protocol.test.js`: `file://` URL + `localStorage` `SecurityError` 환경 + 로컬 Mock Firebase로 실제 부트 → 방장 전환 → 방 생성 → 로비 진입(4자리 코드 표시)까지 통과 검증
  - Validation command: `npm run build && npm run test:coverage` (**16 test files / 62 tests PASS**, Statements 98.00% / Branches 81.10% / Functions 97.72% / Lines 98.00%)


