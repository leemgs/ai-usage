# AI Usage

여러 AI 서비스 계정의 **실제 사용량**과 재설정 일정을 모바일에서 한눈에 확인하는 웹 대시보드입니다. 연결하지 않은 계정의 수치를 임의로 표시하지 않습니다.

![AI Usage 모바일 화면](docs/ai-usage-mobile.png)

![AI Usage 데스크톱 화면](docs/ai-usage-desktop.png)

## 주요 기능

- Claude, Gemini, Antigravity, Codex, Copilot별 Usage API 연결
- **그래프 시각화**: 전체 평균 사용률 도넛 게이지, 서비스별 요약 링 스트립, 사용 추이(면적 차트)
- **상단 서비스 네비게이션**(모바일) · 데스크톱 사이드바
- API 응답 검증 후 실제 사용량, 한도, 다음 재설정 시각 표시
- 전체 연결 새로고침, 연결 상태 및 실패 상태 표시
- 화면이 열려 있는 동안 60초마다 자동 갱신하며 API 기준 시각 표시
- API 토큰은 `localStorage`에 기록하지 않고 현재 탭의 메모리에만 보관
- 계정 연결 해제 및 마지막 선택 서비스 저장
- 시스템 설정을 반영하는 라이트/다크 테마
- 모바일, 태블릿, 데스크톱에 대응하는 반응형 레이아웃
- 데스크톱에서는 서비스 사이드바와 넓은 대시보드 레이아웃 제공

## 실행하기

별도의 빌드 과정이나 의존성이 필요하지 않습니다.

```bash
python3 -m http.server 4173 --directory docs
```

브라우저에서 <http://localhost:4173>을 열어 확인합니다.

## GitHub Pages 배포

저장소의 **Settings → Pages**에서 배포 소스를 `main` 브랜치의 `/docs` 폴더로 설정하면 정적 웹앱을 배포할 수 있습니다.

## 실제 계정 연결

AI Usage는 사용자의 AI 서비스 아이디나 암호를 수집하지 않습니다. 각 서비스의 개인 구독 사용량 API 제공 여부와 인증 방식이 서로 다르므로, 공급자가 제공하는 API 또는 사용자가 운영하는 읽기 전용 어댑터를 연결합니다.

1. 상단(모바일) 또는 사이드바(데스크톱)에서 서비스를 선택합니다.
2. **계정 데이터 연결**을 누릅니다.
3. HTTPS Usage API 주소와 필요한 경우 읽기 전용 토큰을 입력합니다.
4. 응답을 검증하고 성공한 경우에만 해당 서비스를 연결됨으로 표시합니다.

Usage API는 다음 JSON 형식을 반환해야 하며, 브라우저 접근을 허용하는 CORS 헤더가 필요합니다.

```json
{
  "account": "my-account",
  "updatedAt": "2026-08-09T09:00:00Z",
  "resetAt": "2026-09-01T09:00:00+09:00",
  "metrics": [
    { "label": "프리미엄 요청", "used": 12, "limit": 300 }
  ],
  "history": [
    { "date": "2026-08-01", "used": 8, "limit": 300 }
  ]
}
```

`limit`를 제공하지 않는 항목은 횟수만 표시합니다. `history`(선택)를 제공하면 사용 추이 그래프가 표시되며, 없으면 그래프는 표시되지 않습니다(임의로 지어내지 않습니다). 브라우저를 닫으면 토큰은 사라지므로 다음 접속 때 토큰이 필요한 연결은 다시 인증해야 합니다.

### 로컬 어댑터 예제(server/proxy.js)

각 공급자의 실제 API를 호출해 위 형식으로 정규화하는 **동작하는 어댑터 예제**가 포함되어 있습니다. 공급자 API 키를 환경 변수로 주입하면 브라우저 대신 호출합니다(브라우저는 CORS 때문에 공급자 API를 직접 호출할 수 없습니다).

```bash
ANTHROPIC_ADMIN_KEY=sk-ant-admin... ANTHROPIC_BUDGET=100 \
OPENAI_API_KEY=sk-... OPENAI_BUDGET=100 \
GITHUB_TOKEN=ghp_... GITHUB_ORG=my-org \
GEMINI_API_KEY=AIza... \
node server/proxy.js          # 기본 http://localhost:8787
```

설정 대화상자의 "Usage API 주소"에 아래처럼 입력합니다.

| 서비스 | 주소 | 조회 내용 |
| --- | --- | --- |
| Claude | `http://localhost:8787/claude` | 이번 달 비용/예산(일별 추이 포함) |
| Codex | `http://localhost:8787/codex` | 이번 달 비용/예산(일별 추이 포함) |
| Copilot | `http://localhost:8787/copilot` | 활성/비활성 좌석 |
| Gemini | `http://localhost:8787/gemini` | 키 유효성(공개 사용률 API 미제공) |

> 소비자 서비스(claude.ai · chatgpt.com · gemini)는 **아이디/비밀번호로 사용량을 조회하는 공개 API가 없습니다.** 이 어댑터도 계정 비밀번호가 아니라 각 공급자의 API 키/토큰을 사용합니다.

자동 갱신은 화면이 보이는 동안 60초마다 실행됩니다. 이는 Usage API가 반환하는 최신 데이터를 다시 가져오는 방식이며, 공급자의 사용량 반영 지연보다 빠르게 갱신되거나 스트리밍 방식으로 전달되는 것은 아닙니다.

각 API 요청은 12초 후 자동으로 중단되며, 인증 만료·잘못된 JSON·CORS 및 네트워크 오류를 구분해 안내합니다. 저장된 연결 정보가 손상되었거나 안전하지 않은 HTTP 주소를 포함하면 해당 설정은 자동으로 제외됩니다.

### 보안 및 공급자 제한

- 정적 GitHub Pages에는 OAuth 비밀 키나 서비스 토큰을 안전하게 저장할 수 없습니다.
- Claude, Gemini, Codex, Copilot의 일반 사용자용 웹 구독 사용량은 공급자가 공개 API로 제공하지 않을 수 있습니다.
- 계정 암호, 세션 쿠키 또는 쓰기 권한 토큰을 이 앱에 입력하지 마세요.
- 조직용 비용/사용량 API와 개인 구독 사용량은 서로 다른 데이터일 수 있습니다.

## 프로젝트 구조

```text
docs/
├── index.html    # 화면 구조와 접근성 마크업
├── styles.css    # 반응형 UI 및 테마
├── app.js        # 서비스 연결과 화면 상호작용
├── charts.js     # 의존성 없는 인라인 SVG 차트(도넛/면적/미니링)
└── usage-core.js # API 응답 검증 및 사용률 계산
server/
└── proxy.js      # 공급자 API를 대시보드 형식으로 정규화하는 어댑터 예제
```

## 테스트

```bash
node --test
```

> 연결 전에는 사용량이 표시되지 않습니다. 성공적으로 검증된 Usage API 응답만 화면에 표시합니다.
