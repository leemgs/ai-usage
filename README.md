# AI Usage

여러 AI 서비스의 사용량과 재설정 일정을 모바일에서 한눈에 확인할 수 있는 정적 웹 대시보드입니다.

![AI Usage 모바일 화면](docs/ai-usage-mobile.png)

## 주요 기능

- Claude, Gemini, Antigravity, Codex, Copilot 서비스 전환
- 서비스별 사용량 진행률과 다음 재설정 시각 표시
- 수동 새로고침 피드백 및 마지막 선택 서비스 저장
- 시스템 설정을 반영하는 라이트/다크 테마
- 모바일, 태블릿, 데스크톱에 대응하는 반응형 레이아웃

## 실행하기

별도의 빌드 과정이나 의존성이 필요하지 않습니다.

```bash
python3 -m http.server 4173 --directory docs
```

브라우저에서 <http://localhost:4173>을 열어 확인합니다.

## GitHub Pages 배포

저장소의 **Settings → Pages**에서 배포 소스를 `main` 브랜치의 `/docs` 폴더로 설정하면 정적 웹앱을 배포할 수 있습니다.

## 프로젝트 구조

```text
docs/
├── index.html   # 화면 구조와 접근성 마크업
├── styles.css   # 반응형 UI 및 테마
└── app.js       # 서비스 데이터와 화면 상호작용
```

> 현재 표시되는 사용량은 UI 예시 데이터입니다. 실제 서비스와 연동할 때에는 각 공급자의 API 및 인증 정책에 맞는 백엔드 연결이 필요합니다.
