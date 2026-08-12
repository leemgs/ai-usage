// 데이터 계층: 저장된 자격 증명으로 프록시 서버에 실제 사용량을 요청하고,
// 키가 없거나 프록시에 연결할 수 없으면 예시(mock) 데이터로 안전하게 대체합니다.
//
// 실제 사용량 API는 아이디/비밀번호가 아니라 각 공급자의 API 키/토큰을 사용합니다.
// 브라우저는 CORS 때문에 공급자 API를 직접 호출할 수 없으므로 로컬 프록시가 필요합니다.
// server/proxy.js 를 실행하고 설정에서 프록시 주소를 입력하세요.

(function () {
"use strict";

const PROVIDERS = [
  {
    name: "Claude", short: "AI", color: "#d97757",
    fields: [
      { key: "adminKey", label: "Admin API 키", type: "password", placeholder: "sk-ant-admin..." },
      { key: "budget", label: "월 예산(USD, 선택)", type: "number", placeholder: "100" }
    ],
    supported: true,
    mock: { metrics: [["5시간 세션", 36], ["주간 사용량", 18], ["Sonnet 모델", 42]], reset: "8월 10일 오전 9:00" }
  },
  {
    name: "Gemini", short: "G", color: "#4285f4",
    fields: [
      { key: "apiKey", label: "API 키", type: "password", placeholder: "AIza..." },
      { key: "project", label: "GCP 프로젝트 ID (선택)", type: "text", placeholder: "my-project" }
    ],
    supported: true,
    mock: { metrics: [["Pro 요청", 12], ["Deep Research", 5], ["이미지 생성", 28]], reset: "9월 1일 오전 9:00" }
  },
  {
    name: "Antigravity", short: "A", color: "#805ad5",
    fields: [{ key: "apiKey", label: "API 키", type: "password", placeholder: "키 입력" }],
    supported: false, // 공개 사용량 API가 없어 실시간 조회를 지원하지 않습니다.
    mock: { metrics: [["월간 크레딧", 64], ["에이전트 실행", 31], ["자동화", 16]], reset: "9월 1일 오전 9:00" }
  },
  {
    name: "Codex", short: "CX", color: "#111827",
    fields: [
      { key: "apiKey", label: "OpenAI API 키", type: "password", placeholder: "sk-..." },
      { key: "orgId", label: "조직 ID (선택)", type: "text", placeholder: "org-..." },
      { key: "budget", label: "월 예산(USD, 선택)", type: "number", placeholder: "100" }
    ],
    supported: true,
    mock: { metrics: [["5시간 한도", 21], ["주간 한도", 34], ["코드 리뷰", 8]], reset: "8월 14일 오전 9:00" }
  },
  {
    name: "Copilot", short: "C", color: "#17191f",
    fields: [
      { key: "token", label: "GitHub 토큰(PAT)", type: "password", placeholder: "ghp_..." },
      { key: "org", label: "조직/사용자 (선택)", type: "text", placeholder: "my-org" }
    ],
    supported: true,
    mock: { metrics: [["프리미엄 요청", 0], ["채팅 메시지", 0], ["인라인 제안", 0]], reset: "9월 1일 오전 9:00" }
  }
];

const CRED_KEY = "aiUsageCreds";
const PROXY_KEY = "aiUsageProxy";

const store = {
  creds() { try { return JSON.parse(localStorage.getItem(CRED_KEY)) || {}; } catch { return {}; } },
  credFor(name) { return this.creds()[name] || {}; },
  saveCred(name, values) {
    const all = this.creds();
    all[name] = values;
    localStorage.setItem(CRED_KEY, JSON.stringify(all));
  },
  clearCred(name) {
    const all = this.creds();
    delete all[name];
    localStorage.setItem(CRED_KEY, JSON.stringify(all));
  },
  hasCred(name) {
    const c = this.credFor(name);
    return Object.values(c).some((v) => v && String(v).trim());
  },
  proxyUrl() { return (localStorage.getItem(PROXY_KEY) || "").trim(); },
  saveProxyUrl(url) { localStorage.setItem(PROXY_KEY, (url || "").trim()); }
};

// 특정 공급자의 사용량을 반환합니다.
// 반환 형태: { live, status, metrics:[[label,value]], reset, error? }
async function fetchUsage(provider) {
  const mock = { live: false, status: "예시 데이터", metrics: provider.mock.metrics, reset: provider.mock.reset };

  if (!provider.supported) {
    return { ...mock, status: "실시간 조회 미지원", error: "공개 사용량 API가 없습니다." };
  }
  if (!store.hasCred(provider.name)) {
    return { ...mock, status: "키 미설정 · 예시 표시" };
  }
  const proxy = store.proxyUrl();
  if (!proxy) {
    return { ...mock, status: "프록시 미설정 · 예시 표시" };
  }

  try {
    const res = await fetch(proxy.replace(/\/$/, "") + "/api/usage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: provider.name, creds: store.credFor(provider.name) })
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ...mock, status: `조회 실패 (${res.status})`, error: detail.slice(0, 200) || res.statusText };
    }
    const data = await res.json();
    return {
      live: true,
      status: data.status || "정상적으로 연결됨",
      metrics: Array.isArray(data.metrics) && data.metrics.length ? data.metrics : provider.mock.metrics,
      reset: data.reset || provider.mock.reset
    };
  } catch (err) {
    // 프록시 미실행·네트워크·CORS 오류 → 예시 데이터로 대체
    return { ...mock, status: "프록시 연결 실패 · 예시 표시", error: String(err.message || err) };
  }
}

window.AIUsage = { PROVIDERS, store, fetchUsage };
})();
