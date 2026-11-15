# 온라인 랜덤 마시기 게임 (Web Game) 종합 코드 및 설계 리뷰 보고서

본 문서는 `index.html`, `manifest.json`, `sw.js`로 구성된 웹 기반 멀티플레이어/파티 게임 프로젝트의 아키텍처, 핵심 게임 로직, PWA 구성, 보안 및 성능 리스크, 그리고 우선순위별 개선 권고안을 정리한 종합 리뷰 보고서입니다.

---

## 1. 프로젝트 개요 및 아키텍처 (Project Overview & Architecture)

### 1.1 전체 구조
- **단일 파일 중심 구조 (`index.html`)**: UI 마크업(HTML), 스타일시트(CSS), 사운드/진동/알림 제어, 다수의 파티 게임 모드, 그리고 **Firebase Realtime Database** 기반 실시간 멀티플레이어 상태 동기화 로직이 단일 진입점(`index.html`)에 통합되어 있습니다.
- **PWA 메타데이터 (`manifest.json`)**: `display: "fullscreen"` 및 `display_override: ["fullscreen", "standalone"]`을 통해 전체화면 우선 표시 및 독립 실행 폴백을 지정하며, 별도 외부 PNG 에셋 대신 내장된 **데이터 URI 형식의 SVG 아이콘(`data:image/svg+xml,...`)**을 사용하여 단일 구성 배포 편의성을 높였습니다.
- **캐싱 및 알림 지원 서비스 워커 (`sw.js`)**: `index.html`에서 `navigator.serviceWorker`를 통해 등록되며, 앱 셸(`index.html`, `manifest.json`) 프리캐싱 및 네트워크 우선(`fetch`) 오프라인 폴백과 Android Chrome 등 모바일 환경에서 `ServiceWorkerRegistration.showNotification()` 호출을 지원하기 위한 라이프사이클(`install`, `activate`, `fetch`, `notificationclick`) 핸들러로 구성되어 있습니다.
- **검토 대상 파일 구성 및 테스트 구성 현황**: 웹 게임 런타임은 정적 프론트엔드 파일(`index.html`, `manifest.json`, `sw.js`) 내 인라인 스크립트와 서비스 워커 코드로 구성되어 있으며, 저장소의 `tests/test_game_review.py`를 통해 정적 파일 구조/PWA 설정/서비스 워커 훅 및 리뷰 보고서 필수 항목에 대한 자동화 검증이 수행됩니다. 다만 `index.html` 내부의 인라인 자바스크립트 게임 상태 머신 자체는 별도 JS 모듈로 분리되어 있지 않으므로 향후 단위 테스트 확장이 필요합니다.

### 1.2 아키텍처 장단점
- **장점**:
  - 빌드 파이프라인이나 외부 이미지 에셋 의존성 없이 정적 호스팅과 Firebase 연결만으로 즉시 실행 가능합니다.
  - 서버 시간 오프셋 보정 및 탭 복귀(`visibilitychange`/`focus`) 시 타이머 만료 처리 등 모바일 브라우저 제약을 고려한 방어 로직이 내장되어 있습니다.
- **단점**:
  - `index.html` 단일 파일 내에 Firebase DB 참조/구독, 다수의 게임 모드 상태 머신, 타이머/오디오 제어, `innerHTML` 기반 DOM 렌더링이 강하게 결합되어 있어 유지보수 및 자동화 테스트 도입이 어렵습니다.

---

## 2. 핵심 게임 로직 및 메커니즘 분석 (Core Game Logic & Mechanics Analysis)

### 2.1 Firebase Realtime Database 기반 멀티플레이 및 시간 동기화
- **실시간 방/상태 동기화 (`index.html`)**: 멀티플레이 세션은 Firebase Realtime Database의 방 경로(`rooms/{roomCode}`)를 구독하여 참가자 목록(`players`), 방장 식별자(`host`), 현재 선택된 게임 모드 및 라운드 상태/결과 데이터를 실시간으로 공유합니다.
- **서버 시간 보정 (Server Time Offset)**: 기기마다 로컬 시계(`Date.now()`)가 다를 수 있는 문제를 해결하기 위해 Firebase의 `.info/serverTimeOffset`을 구독해 서버 기준 시각을 계산함으로써, 다중 클라이언트 간 카운트다운/알림 목표 시각의 동기화 오차를 줄이도록 구현되어 있습니다.

### 2.2 게임 모드별 고유 상태 전이, 입력 기록 및 결과 판정 메커니즘
프로젝트 내 게임 로직은 모든 모드가 단일한 흐름을 따르지 않고, **실행 문맥(로컬 단독 타이머 vs Firebase 방 동기화)**과 **상태 전이 트리거(시간 만료, 호스트 즉시 산출, 턴제 상태 전이, 비동기 전원 입력 집계)**에 따라 서로 다른 상태 구조와 판정 규칙으로 동작합니다.

1. **로컬/단독 실행형 랜덤 마시기 타이머 모드**:
   - **상태 전이**: 멀티플레이어 로비/방 상태(`rooms/{roomCode}`)나 타 참가자 입력 대기에 의존하지 않고, 로컬 타이머 상태(`대기(idle)` → `타이머 작동(running)` → `알람/벌칙 발동(alarm)` → `재설정/대기`)로 독립 전이됩니다.
   - **시간 산출 및 판정 조건**: 사용자가 지정한 최소~최대 시간 범위 내에서 `Math.random()`으로 무작위 지연 시간을 뽑아 목표 만료 시각(`targetTime`)을 설정합니다. 주기적 타이머 체크 및 `visibilitychange`/`focus` 복귀 보정 로직에서 현재 시각이 목표 시각 이상(`now >= targetTime`)에 도달하면 즉시 완료로 판정하고 오디오 재생, 진동(`navigator.vibrate`), 서비스 워커 알림(`registration.showNotification()`)을 실행합니다.
2. **호스트 사전 산출 및 애니메이션 동기화 모드 (룰렛/원판 돌리기, 제비뽑기/왕게임 등)**:
   - **상태 전이**: `로비 대기(waiting)` → `호스트 결과 산출 및 연출 시작(spinning/drawing)` → `클라이언트 애니메이션 종료 후 결과 노출(result)` 순으로 전이됩니다.
   - **판정 및 동기화 방식**: 참가자의 개별 게임 입력 단계가 존재하지 않으며, 라운드 시작 시점에 **호스트 클라이언트(`isHost`)가 `Math.random()`을 실행해 벌칙 대상자(또는 당첨 인덱스/회전 각도, 왕과 명령 대상 매핑)를 즉시 결정**하여 Firebase 방 상태 노드에 기록합니다. 각 클라이언트는 이미 확정된 결과 데이터를 수신해 동일한 시각 연출만 수행한 뒤 벌칙자를 표시합니다.
3. **실시간 시한/턴제 상태 전이 모드 (폭탄 돌리기, 업다운/숫자 맞추기, 베스킨라빈스 31 등)**:
   - **상태 전이**: 단순 `진행 → 결과` 2단계가 아니라, `라운드 시작(호스트가 폭발 시각/정답 숫자/초기 턴 설정)` → `현재 턴 플레이어의 행동 입력 및 턴 넘김(turn transition 반복)` → `종료 조건 충족 시 즉시 패배 판정(exploded/gameover)`의 **다단계 순차 상태 머신**으로 동작합니다.
   - **입력 기록 및 판정 조건**:
     - **폭탄 돌리기**: 호스트가 비공개 만료 시각(`explodeTime` / `targetTime`)과 현재 폭탄 소유자(`holder` / `turn`)를 설정하고, 소유자가 넘기기 액션을 수행할 때마다 다음 참가자로 소유권이 Firebase에서 갱신됩니다. 서버 보정 시각 기준으로 만료 시각이 도래했을 때 현재 폭탄을 보유한 플레이어가 벌칙 대상자로 즉시 판정됩니다.
     - **턴제 숫자/선택 게임**: 현재 차례인 참가자만 유효 입력을 제출해 공유 상태(현재 숫자, 남은 범위, 다음 턴 인덱스)를 갱신하며, 금지 숫자(예: 31)를 부르거나 정답 숫자를 맞춘(또는 맞추지 못한) 시점에 해당 턴 플레이어가 벌칙자로 판정됩니다.
4. **참가자 비동기 동시 입력 및 기록 비교 모드 (순발력/반응속도 터치, 타이밍 스톱워치, 연타 레이스 등)**:
   - **상태 전이**: `대기(waiting)` → `준비/신호 대기(ready/countdown)` → `개별 참가자 입력 수집(playing)` → `전원 제출 완료 또는 제한시간 만료 시 비교 집계(judging → result)`로 전이됩니다.
   - **입력 기록 및 판정 조건**:
     - 각 클라이언트는 자신의 로컬 측정값(신호 후 터치까지 걸린 반응 시간 `ms`, 목표 시간과의 절대 오차 `Math.abs(target - elapsed)`, 제한 시간 내 탭 횟수 `count` 등)과 제출 완료 여부를 자신의 플레이어 상태 하위 경로(`rooms/{roomCode}/players/{playerId}` 또는 게임 입력 노드)에 개별 기록합니다.
     - **결과 판정**: 활성 참가자 전원의 입력 플래그가 완료되거나 타임아웃이 발생하면, 집계 함수가 참가자별 기록을 비교(`Math.max` 반응시간/오차 또는 `Math.min` 연타 수)하여 최하위 기록 보유자(부정 출발/미입력 패널티 포함, 동점자 발생 시 다중 벌칙 또는 타이브레이크 처리)를 최종 벌칙 대상자로 확정합니다.

- **호스트 권한 의존성 (`isHost`) 및 상태 고착(Stall) 엣지 케이스**:
  - 방의 게임 모드 선택, 라운드 시작 시 초기 시드/목표값 생성, 타임아웃 강제 종료, 그리고 비동기 입력 모드의 최종 결과 확정 및 로비 복귀 전환이 **호스트 클라이언트의 로컬 실행과 Firebase `update`/`set` 호출**에 의존합니다.
  - 따라서 (1) 턴제 게임에서 현재 턴 플레이어가 이탈하거나, (2) 동시 입력 모드에서 특정 참가자가 결과를 제출하기 전 네트워크가 끊기면 전원 완료 조건이 충족되지 않아 대기 상태에 머물 수 있으며, (3) 호스트 기기가 백그라운드로 전환되어 판정 타이머가 스로틀링되면 전체 방의 상태 전이가 함께 멈추는 구조적 취약점이 존재합니다.

### 2.3 이미 구현된 보호 로직 vs 잔존 엣지 케이스 (`onDisconnect` 미구현 등)
- **구현된 타이머 복귀 보정 (`visibilitychange` & `focus`)**:
  - 단순히 `setTimeout`에만 의존하지 않고, 사용자가 다른 앱을 보다가 돌아오거나 화면을 다시 켰을 때 발생하는 `document.visibilitychange` 및 `window.focus` 이벤트 리스너가 구현되어 있습니다.
  - 복귀 시점에 목표 만료 시각과 현재(서버 보정) 시각을 비교하여 백그라운드에서 이미 만료되었어야 할 타이머나 이벤트를 즉시 소화(만료 처리)하도록 설계되어 있습니다.
- **잔존하는 구조적 한계 (백그라운드 즉시 알림 제약)**:
  - 위 복귀 로직 덕분에 **탭으로 돌아온 직후의 상태 복구**는 정상 동작하지만, 화면이 꺼진 상태나 앱이 완전히 백그라운드에 머무는 동안에는 OS/브라우저가 JS 타이머 스레드 자체를 유예(suspend)하므로 Web Push 서버 없이 클라이언트 타이머만으로는 정확한 시각에 백그라운드 알림(`showNotification`)을 깨우지 못하는 한계가 남습니다.
- **방 퇴장 처리 방식과 `onDisconnect` 미구현에 따른 유령 참가자/방장 정지 리스크**:
  - 현재 `index.html`의 방 퇴장 및 방장 위임 로직은 사용자가 명시적으로 나가기 동작을 수행할 때만 Firebase에서 플레이어 노드를 삭제하거나 남은 참가자에게 방장을 넘기도록 구현되어 있으며, **Firebase의 `onDisconnect()` 훅 기반 자동 연결 해제 처리는 구현되어 있지 않습니다.**
  - 이로 인해 참가자나 호스트가 브라우저 탭을 강제 종료하거나 모바일 네트워크가 끊겨 비정상 이탈할 경우, 방 목록에 실제로는 접속이 끊긴 '유령 플레이어'가 그대로 남게 되며 특히 호스트가 비정상 이탈하면 방장 권한이 위임되지 않아 방 전체의 게임 진행이 멈추는 문제가 발생합니다.

---

## 3. PWA 및 서비스 워커 구성 분석 (PWA & Service Worker Configuration)

### 3.1 `sw.js` 상세 분석
- **앱 셸 캐싱 및 모바일 알림 통합 워커**: Android Chrome 등에서 `new Notification()` 직접 호출 시 발생하는 예외를 우회해 `ServiceWorkerRegistration.showNotification()`을 지원함과 동시에, 동일 출처(Same-Origin) 정적 에셋에 대한 `caches` 기반 오프라인 폴백을 제공합니다.
- **라이프사이클 및 앱 전용 프리픽스 기반 캐시 정리 (`install`, `activate`)**: `install` 단계에서 `self.skipWaiting()`과 함께 `caches.open(CACHE_NAME)`으로 핵심 정적 파일(`./`, `./index.html`, `./manifest.json`)을 프리캐싱합니다. `activate` 단계에서는 동일 출처(Same-Origin)에서 호스팅되는 다른 웹앱의 캐시가 삭제되지 않도록 `CACHE_PREFIX`(`party-game-cache-`)로 시작하면서 현재 `CACHE_NAME`(`party-game-cache-v1`)이 아닌 이전 버전 캐시만 선별 삭제(`caches.delete`)하고 `self.clients.claim()`을 호출하여 즉시 제어권을 획득합니다.
- **네트워크 우선(`fetch`) 전략 및 안전한 비동기 캐시 기록**: 동일 출처 `GET` 요청에 대해 네트워크 응답(`status === 200`, `type === 'basic'`) 성공 시 응답 복제본을 `caches.open(CACHE_NAME).then((cache) => cache.put(...)).catch(() => undefined)`로 갱신하며, 이 비동기 쓰기 프라미스를 `event.waitUntil()`에 등록해 캐시 저장이 완료될 때까지 서비스 워커 수명을 유지하고 스토리지 오류를 안전하게 처리합니다. 오프라인 등 네트워크 실패 시에는 `caches.match`를 조회하고, 내비게이션 요청(`request.mode === 'navigate'`)은 `./index.html` 캐시로 폴백하며 그 외 요청은 `503 Service Unavailable` 응답을 반환합니다.
- **인스코프(In-Scope) 전용 알림 클릭 핸들링 (`notificationclick`)**: `self.clients.matchAll({ type: 'window', includeUncontrolled: true })` 결과를 순회할 때 `self.registration.scope`(또는 현재 워커 기준 스코프 URL) 하위에 속한 클라이언트(`client.url.startsWith(scopeUrl)`)만 `client.focus()`로 활성화합니다. 스코프 밖의 동일 출처 다른 앱 탭으로 잘못 포커스가 이동하는 것을 방지하기 위해, 스코프 내 열린 창이 없으면 임의의 창을 포커스하지 않고 즉시 `self.clients.openWindow(scopeUrl)`를 호출해 앱 스코프 경로로 새 창을 엽니다.
- **외부 CDN 리소스 의존성 한계**: 로컬 정적 파일은 `sw.js`를 통해 캐싱되지만, `index.html`이 참조하는 외부 CDN(Firebase SDK, 웹폰트)과 실시간 DB 연결은 별도 번들링이나 오프라인 전용 모드 분리가 추가로 필요합니다.

### 3.2 `manifest.json` 실제 설정 분석 및 호환성 평가
- **화면 표시 및 테마 색상 설정 (`display`, `display_override`, `background_color`, `theme_color`)**:
  - 실제 `manifest.json`은 `"display": "fullscreen"`, `"display_override": ["fullscreen", "standalone"]`, `"background_color": "#121214"`, `"theme_color": "#121214"`로 설정되어 다크 테마 UI와 일관된 스플래시/시스템 바 색상을 지정합니다.
  - 브라우저가 `fullscreen`을 지원하면 상태 표시줄/내비게이션 바까지 숨기는 전체화면 모드로 동작하고, 미지원 환경(예: iOS Safari 홈 화면 앱 등)에서는 `standalone`으로 폴백됩니다. 다만 모바일에서 `fullscreen` 적용 시 상단 시간/배터리/알림 트레이 확인이 불편할 수 있어 술자리 타이머 특성상 UX 호불호가 발생할 수 있습니다.
- **아이콘 설정 (데이터 URI SVG)**:
  - 별도의 외부 `192x192` / `512x512` PNG 파일을 참조하지 않고, `icons` 배열에 `data:image/svg+xml,...` 형태의 **인라인 데이터 URI SVG 아이콘**을 지정하고 있습니다.
  - 이 방식은 외부 파일 요청이 없다는 장점이 있으나, **iOS Safari(`apple-touch-icon`)나 일부 구형 Android 런처/설치 프롬프트에서는 데이터 URI SVG 아이콘을 홈 화면 아이콘이나 스플래시 이미지로 정상 파싱하지 못하거나 설치 아이콘이 깨지는 호환성 제약**이 존재합니다.

---

## 4. 식별된 버그, 보안/멀티플레이어 리스크 및 성능 병목 (Identified Bugs, Security/Multiplayer Risks & Performance Bottlenecks)

### 4.1 버그 및 엣지 케이스 (Bugs & Edge Cases)
1. **`onDisconnect` 부재로 인한 비정상 종료 시 유령 참가자 잔류 및 호스트 먹통 현상**:
   - `index.html`에서 방 참가 시 `onDisconnect().remove()` 등 서버 측 연결 종료 훅을 등록하지 않기 때문에, 플레이어가 나가기 버튼을 누르지 않고 탭/앱을 닫거나 통신이 두절되면 DB에 참가자 정보가 계속 남아 인원수 집계 및 전원의 입력을 기다리는 게임 판정이 블로킹될 수 있습니다. 특히 호스트가 비정상 종료되면 방장 승계가 일어나지 않아 진행 중인 방이 잠기게 됩니다.
2. **백그라운드 체류 중 알림 지연 및 호스트 타이머 스로틀링**:
   - `index.html`에 `visibilitychange`/`focus` 복귀 시 만료 보정 로직이 구현되어 있어 화면을 다시 켜면 즉시 만료 처리가 수행되지만, 화면이 꺼진 채 백그라운드에 머무는 동안에는 JS 타이머가 멈추므로 목표 시각 정각에 시스템 알림(`showNotification`)이 울리지 않거나 호스트 주도 라운드 전환이 지연될 수 있습니다.
3. **알림 누적 및 재알림 제어 (`showNotification` 옵션)**:
   - `sw.js`의 `notificationclick`에서 스코프 기반 포커스 매칭을 수행하더라도, `index.html`에서 `showNotification` 호출 시 `tag` 및 `renotify` 옵션을 일관되게 지정하지 않으면 반복 알림 시 알림 트레이에 중복 항목이 쌓일 수 있습니다.
4. **iOS/Safari 환경의 알림 및 전체화면 제약**:
   - iOS에서는 홈 화면에 추가(A2HS)된 웹앱에서만 Web Notification API가 동작하며, `manifest.json`의 데이터 URI SVG 아이콘은 iOS 홈 화면 아이콘으로 자동 적용되지 않습니다.

### 4.2 보안 및 멀티플레이어 리스크 (Security & Multiplayer Risks)
1. **`innerHTML` 기반 동적 렌더링과 Stored/DOM XSS 취약점 (`index.html`)**:
   - **코드 근거 및 입력 경로**: `index.html`에서는 플레이어 목록(닉네임, 방장 배지 등), 방 정보, 게임 진행 메시지 및 결과 화면을 갱신할 때 템플릿 리터럴로 조립한 HTML 문자열을 `innerHTML`에 대입하는 패턴이 다수 사용됩니다.
   - **신뢰 경계 및 위험 판정**: 사용자 입력(닉네임 등)이 로컬에만 머무르지 않고 **Firebase Realtime Database에 저장된 뒤 방에 참가한 모든 클라이언트로 브로드캐스트**됩니다. 만약 입력값에 `<img src=x onerror=...>` 등 HTML/스크립트 구문이 이스케이프 없이 포함되어 Firebase에 기록되면, 같은 방의 모든 참가자 브라우저에서 `innerHTML` 렌더링 시점에 스크립트가 실행되는 **클라이언트 간 Stored DOM XSS**로 이어질 수 있습니다.
2. **Firebase 보안 규칙(Security Rules) 확인 범위 및 클라이언트 신뢰 경계**:
   - **클라이언트 코드 한계**: `index.html`에 노출된 Firebase 설정과 클라이언트 로직만으로는 악의적인 사용자가 브라우저 콘솔에서 Firebase SDK를 직접 호출해 다른 플레이어의 상태를 덮어쓰거나 방 데이터를 변조하는 것을 막을 수 없습니다.
   - **검증 범위 명시**: 실제 데이터베이스의 읽기/쓰기 권한 및 스키마 검증(닉네임 길이 제한, 호스트 전용 필드 보호 등)은 서버 측 **Firebase Realtime Database Security Rules**에 의해 결정되나, 본 저장소에는 Security Rules 파일(`database.rules.json`)이 포함되어 있지 않아 서버 측 규칙 적용 여부를 코드만으로 확인할 수 없으므로 별도 점검이 필수적입니다.

### 4.3 성능 및 리소스 병목 (Performance Bottlenecks)
1. **상태 변경 시 전체 리스트 `innerHTML` 재작성**:
   - Firebase 데이터 변경 콜백마다 참가자 목록이나 게임 보드 영역을 `innerHTML`로 통째로 다시 그리면 DOM 노드가 매번 파괴·재생성되어 모바일 저사양 기기에서 프레임 드롭이나 입력 포커스 유실을 유발할 수 있습니다.
2. **장시간 세션 시 오디오/진동 및 리스너 관리**:
   - 방 이동 및 게임 모드 전환이 반복될 때 기존 Firebase 리스너(`off()`)와 타이머 핸들이 누락 없이 해제되는지 지속적으로 관리해야 메모리 누수를 방지할 수 있습니다.

---

## 5. 우선순위별 개선 권고안 (Prioritized Improvement Recommendations)

### [P0 - 최우선] XSS 보안 패치 및 Firebase 신뢰 경계 강화
1. **DOM API(`createElement` + `textContent`) 전환 및 삽입 문맥(Context)별 안전한 처리 (`index.html`)**:
   - 단순 HTML 엔티티 치환(`escapeHtml`)만으로는 동적 값이 삽입되는 모든 문맥(예: `onclick="..."` 등 인라인 이벤트 핸들러, `href`/`src` 등 URL 속성, 따옴표 없는 속성, `<script>`/`<style>` 내부)의 XSS를 완전히 차단할 수 없습니다.
   - **1차 권고 (DOM API 사용)**: Firebase에서 수신한 플레이어 닉네임, 방 코드, 게임 상태/결과 텍스트를 렌더링할 때 `innerHTML` 문자열 조립을 제거하고, `document.createElement()`와 `textContent`(또는 `replaceChildren()`)를 사용해 데이터를 순수 텍스트 노드로만 삽입하세요.
   - **2차 권고 (불가피한 HTML 삽입 시 문맥별 안전화)**: 구조상 HTML 템플릿 사용이 불가피한 구간에는 (a) 일반 태그 본문 및 따옴표로 감싼 일반 속성 문맥에 한해 `escapeHtml()`(`&`, `<`, `>`, `"`, `'` 치환)을 적용하고, (b) 사용자 데이터를 `onclick` 등 인라인 자바스크립트 핸들러 문자열에 직접 결합하는 패턴은 `dataset` 속성 + `addEventListener`(이벤트 위임)로 전면 교체하며, (c) 복합 마크업 렌더링 시에는 검증된 새니타이저(`DOMPurify`)를 적용하세요.
2. **Firebase Security Rules 버전 관리 및 스키마 검증 추가**:
   - 저장소에 `database.rules.json`을 추가하여 버전 관리하고, 닉네임 문자열 길이/형식 검증(`.validate`) 및 방 데이터 수정 권한을 제한하세요.

### [P1 - 높음] 멀티플레이어 연결 신뢰성 및 PWA 호환성 개선
1. **Firebase `onDisconnect()` 기반 비정상 이탈 처리 및 방장 자동 승계 구현 (`index.html`)**:
   - 방 입장 시 플레이어 노드에 `onDisconnect().remove()`(또는 연결 상태 플래그 해제 및 마지막 활동 시각 기록)를 등록하고, 남은 클라이언트가 방장의 부재를 감지했을 때 가장 먼저 입장한 활성 참가자로 호스트 권한(`host`)을 안전하게 인계하는 방어 로직을 추가하세요.
2. **`manifest.json` 아이콘 호환성 보완 (래스터 PNG 병행)**:
   - 데이터 URI SVG 아이콘 외에 Android/iOS 홈 화면 추가 호환성을 보장하기 위해 `192x192`, `512x512` PNG 아이콘과 iOS용 `<link rel="apple-touch-icon">`을 함께 제공하고, 상태 표시줄 확인이 필요할 경우 기본 `display`를 `standalone`으로 조정하는 것을 검토하세요.
3. **`index.html`의 `showNotification` 호출 시 알림 `tag` 및 `renotify` 옵션 일관 적용**:
   - `sw.js`의 `notificationclick` 핸들러는 `self.registration.scope` 내의 창만 포커스하거나 없을 때 `clients.openWindow(scopeUrl)`를 호출하도록 구성되어 있으므로, `index.html`에서 `showNotification`을 호출할 때 `tag` 및 `renotify` 옵션을 일관되게 지정해 반복 알림 시 알림 트레이에 중복 항목이 쌓이는 문제를 예방하세요.

### [P2 - 중간] 외부 의존성을 고려한 오프라인 전략 구체화 및 테스트 기반 마련
1. **외부 CDN 의존성(Firebase SDK, 웹폰트)을 포함한 캐싱 및 오프라인 폴백(Fallback) 설계**:
   - `index.html`과 `manifest.json`만 Network-First로 캐싱하는 것으로는 완전한 오프라인 실행이 보장되지 않습니다. 현재 앱은 **외부 CDN에서 Firebase SDK 및 Google Fonts를 로드**하며, 멀티플레이 기능은 **Firebase Realtime Database 실시간 연결**을 전제로 동작하기 때문입니다.
   - 따라서 (1) **로컬 단독 모드(랜덤 마시기 타이머 등)의 오프라인 실행**을 지원하려면 `sw.js`에서 로컬 문서(`index.html`, `manifest.json`)뿐만 아니라 외부 CDN 스크립트(Firebase SDK)와 폰트 리소스까지 함께 캐싱(또는 정적 번들로 내재화)하고 Firebase 초기화 실패 시에도 로컬 모드가 동작하도록 분리해야 하며, (2) **멀티플레이 모드**에 대해서는 `.info/connected` 및 `navigator.onLine` 상태를 감지해 네트워크 단절 시 재연결 안내 UI를 표시하고 로컬 전용 모드로 우아하게 폴백(Graceful Degradation)하도록 범위를 명확히 구분해 구현하세요.
2. **핵심 순수 함수 모듈 분리 및 단위 테스트(`tests/`) 확장**:
   - 현재 정적 산출물 및 아키텍처 검증용 `tests/test_game_review.py` 스위트가 구축되어 있으나, 런타임 게임·시간 계산 로직은 여전히 `index.html` 내부 인라인 스크립트로 강하게 결합되어 있습니다. 서버 시간 오프셋 계산, 모드별 승패/벌칙 판정, 입력 검증 및 이스케이프 유틸리티를 별도 스크립트 모듈로 분리하고 이를 직접 호출해 검증하는 단위 테스트를 `tests/`에 확장하세요.
