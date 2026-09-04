#!/usr/bin/env node
/*
 * AI Usage — Usage API 어댑터(프록시) 예제
 * ---------------------------------------------------------------------------
 * 이 대시보드는 계정 아이디/비밀번호를 받지 않습니다. 대신 각 서비스의 사용량을
 * 정규화된 JSON 으로 돌려주는 "Usage API 어댑터"에 연결합니다. 이 파일은 그런
 * 어댑터의 실제 동작 예제입니다. 공급자 API 키는 환경 변수로 주입하며, 브라우저는
 * CORS 때문에 공급자 API 를 직접 못 부르므로 이 어댑터가 대신 호출합니다.
 *
 * 실행:
 *   ANTHROPIC_ADMIN_KEY=sk-ant-admin... ANTHROPIC_BUDGET=100 \
 *   OPENAI_API_KEY=sk-... OPENAI_BUDGET=100 \
 *   GITHUB_TOKEN=ghp_... GITHUB_ORG=my-org \
 *   GEMINI_API_KEY=AIza... \
 *   node server/proxy.js                 # 기본 http://localhost:8787
 *
 * 대시보드 설정에서 각 서비스의 "Usage API 주소"에 아래처럼 입력하세요.
 *   Claude   → http://localhost:8787/claude
 *   Codex    → http://localhost:8787/codex
 *   Copilot  → http://localhost:8787/copilot
 *   Gemini   → http://localhost:8787/gemini
 *
 * 응답(대시보드 계약):
 *   { account, updatedAt, resetAt, metrics:[{label, used, limit?}], history?:[{date, used, limit?}] }
 *
 * Node 18+ 내장 fetch 사용, 외부 의존성 없음.
 */
import http from "node:http";

const PORT = process.env.PORT || 8787;
const env = process.env;
const nowISO = () => new Date().toISOString();
const monthStartISO = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1)).toISOString();
};
const nextMonthISO = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 1, 0, 0, 0)).toISOString();
};
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ---- 공급자별 어댑터: 대시보드 계약(JSON)을 반환하거나 Error 를 던진다 ----
const adapters = {
  // Anthropic Admin — 조직 비용 리포트 (일 단위 버킷 → 추이)
  async claude() {
    const key = (env.ANTHROPIC_ADMIN_KEY || "").trim();
    if (!key) throw new Error("ANTHROPIC_ADMIN_KEY 환경 변수가 필요합니다.");
    const budget = Number(env.ANTHROPIC_BUDGET) || 100;
    const url = "https://api.anthropic.com/v1/organizations/cost_report?starting_at=" +
      encodeURIComponent(monthStartISO()) + "&bucket_width=1d";
    const res = await fetch(url, { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const data = await res.json();
    const history = [];
    let total = 0;
    for (const bucket of data.data || []) {
      let cents = 0;
      for (const item of bucket.results || []) cents += Number(item.amount || item.cost || 0);
      const usd = cents / 100;
      total += usd;
      history.push({ date: bucket.starting_at || bucket.start || undefined, used: round2(usd), limit: budget });
    }
    return {
      account: "Anthropic 조직",
      updatedAt: nowISO(), resetAt: nextMonthISO(),
      metrics: [{ label: "이번 달 비용(USD)", used: round2(total), limit: budget }],
      history: history.length ? history : undefined
    };
  },

  // OpenAI 조직 비용 (일 단위 버킷 → 추이)
  async codex() {
    const key = (env.OPENAI_API_KEY || "").trim();
    if (!key) throw new Error("OPENAI_API_KEY 환경 변수가 필요합니다.");
    const budget = Number(env.OPENAI_BUDGET) || 100;
    const headers = { Authorization: `Bearer ${key}` };
    if (env.OPENAI_ORG) headers["OpenAI-Organization"] = env.OPENAI_ORG;
    const start = Math.floor(new Date(monthStartISO()).getTime() / 1000);
    const res = await fetch(`https://api.openai.com/v1/organizations/costs?start_time=${start}&bucket_width=1d`, { headers });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const data = await res.json();
    const history = [];
    let total = 0;
    for (const bucket of data.data || []) {
      let usd = 0;
      for (const item of bucket.results || []) usd += Number(item.amount?.value || 0);
      total += usd;
      const date = bucket.start_time ? new Date(bucket.start_time * 1000).toISOString() : undefined;
      history.push({ date, used: round2(usd), limit: budget });
    }
    return {
      account: env.OPENAI_ORG || "OpenAI 계정",
      updatedAt: nowISO(), resetAt: nextMonthISO(),
      metrics: [{ label: "이번 달 비용(USD)", used: round2(total), limit: budget }],
      history: history.length ? history : undefined
    };
  },

  // GitHub Copilot 좌석 사용 현황 (스냅샷 · 추이 없음)
  async copilot() {
    const token = (env.GITHUB_TOKEN || "").trim();
    if (!token) throw new Error("GITHUB_TOKEN 환경 변수가 필요합니다.");
    if (!env.GITHUB_ORG) throw new Error("GITHUB_ORG 환경 변수가 필요합니다(개인은 사용자명).");
    const headers = {
      Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "ai-usage-proxy"
    };
    const res = await fetch(`https://api.github.com/orgs/${encodeURIComponent(env.GITHUB_ORG)}/copilot/billing`, { headers });
    if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const data = await res.json();
    const b = data.seat_breakdown || {};
    const total = b.total || 0;
    return {
      account: env.GITHUB_ORG,
      updatedAt: nowISO(), resetAt: nextMonthISO(),
      metrics: [
        { label: "활성 좌석", used: b.active_this_cycle || 0, limit: total || undefined },
        { label: "비활성 좌석", used: b.inactive_this_cycle || 0, limit: total || undefined }
      ]
    };
  },

  // Google Gemini — 공개 사용률 API 없음. 키 유효성만 확인.
  async gemini() {
    const key = (env.GEMINI_API_KEY || "").trim();
    if (!key) throw new Error("GEMINI_API_KEY 환경 변수가 필요합니다.");
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
    if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const data = await res.json();
    const count = (data.models || []).length;
    return {
      account: "Google AI Studio",
      updatedAt: nowISO(), resetAt: nextMonthISO(),
      metrics: [{ label: `사용 가능 모델(사용률 API 미제공)`, used: count }]
    };
  }
};

// ---- HTTP ----
const send = (res, code, body) => {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, OPTIONS"
  });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, "");
  const path = (req.url || "/").split("?")[0].replace(/\/+$/, "");
  if (req.method === "GET" && (path === "" || path === "/")) {
    return send(res, 200, { ok: true, service: "ai-usage-adapter", providers: Object.keys(adapters) });
  }
  const name = path.replace(/^\//, "").toLowerCase();
  const adapter = adapters[name];
  if (req.method !== "GET" || !adapter) return send(res, 404, { error: `알 수 없는 경로: ${path}` });
  try {
    send(res, 200, await adapter());
  } catch (err) {
    send(res, 502, { error: String(err.message || err) });
  }
});

server.listen(PORT, () => {
  console.log(`ai-usage 어댑터가 http://localhost:${PORT} 에서 실행 중입니다.`);
  console.log(`설정된 공급자: ${Object.keys(adapters).map((n) => `/${n}`).join(", ")}`);
});
