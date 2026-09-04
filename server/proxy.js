#!/usr/bin/env node
/*
 * AI Usage — 공식 API 키/토큰 어댑터(프록시)
 * ---------------------------------------------------------------------------
 * 이 대시보드는 계정 아이디/비밀번호를 받지 않습니다. 각 공급자의 "공식 API 키/토큰"으로
 * 사용량을 조회합니다. 브라우저는 CORS 때문에 공급자 API 를 직접 못 부르므로, 이 어댑터가
 * 대신 호출해 정규화된 JSON 으로 돌려줍니다.
 *
 * 두 가지 방식 모두 지원합니다.
 *  1) POST /api/usage  { "provider":"claude", "creds":{ "adminKey":"sk-ant-admin...", "budget":100 } }
 *     └ 대시보드의 "API 키로 연결"이 사용. 키는 브라우저에서 이 어댑터로만 전송됩니다.
 *  2) GET  /claude     └ 키를 환경 변수로 주입해두고 URL 만 연결하는 고급 방식.
 *        ANTHROPIC_ADMIN_KEY / ANTHROPIC_BUDGET / OPENAI_API_KEY / OPENAI_ORG / OPENAI_BUDGET /
 *        GITHUB_TOKEN / GITHUB_ORG / GEMINI_API_KEY
 *
 * 실행:  node server/proxy.js            # 기본 http://localhost:8787
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
const pick = (a, b) => (a != null && String(a).trim() !== "" ? a : b);

// ---- 공급자별 어댑터: creds(요청 본문) → 없으면 환경 변수로 대체 ----
const adapters = {
  // Anthropic Admin — 조직 비용 리포트 (일 단위 버킷 → 추이)
  async claude(creds = {}) {
    const key = String(pick(creds.adminKey, env.ANTHROPIC_ADMIN_KEY) || "").trim();
    if (!key) throw new Error("Anthropic Admin API 키가 필요합니다. (sk-ant-admin...)");
    const budget = Number(pick(creds.budget, env.ANTHROPIC_BUDGET)) || 100;
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
  async codex(creds = {}) {
    const key = String(pick(creds.apiKey, env.OPENAI_API_KEY) || "").trim();
    if (!key) throw new Error("OpenAI API 키가 필요합니다. (sk-...)");
    const budget = Number(pick(creds.budget, env.OPENAI_BUDGET)) || 100;
    const org = pick(creds.orgId, env.OPENAI_ORG);
    const headers = { Authorization: `Bearer ${key}` };
    if (org) headers["OpenAI-Organization"] = org;
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
      account: org || "OpenAI 계정",
      updatedAt: nowISO(), resetAt: nextMonthISO(),
      metrics: [{ label: "이번 달 비용(USD)", used: round2(total), limit: budget }],
      history: history.length ? history : undefined
    };
  },

  // GitHub Copilot 좌석 사용 현황 (스냅샷 · 추이 없음)
  async copilot(creds = {}) {
    const token = String(pick(creds.token, env.GITHUB_TOKEN) || "").trim();
    if (!token) throw new Error("GitHub 토큰(PAT)이 필요합니다. (ghp_...)");
    const org = pick(creds.org, env.GITHUB_ORG);
    if (!org) throw new Error("조직 또는 사용자 이름이 필요합니다.");
    const headers = {
      Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "ai-usage-proxy"
    };
    const res = await fetch(`https://api.github.com/orgs/${encodeURIComponent(org)}/copilot/billing`, { headers });
    if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const data = await res.json();
    const b = data.seat_breakdown || {};
    const total = b.total || 0;
    return {
      account: String(org),
      updatedAt: nowISO(), resetAt: nextMonthISO(),
      metrics: [
        { label: "활성 좌석", used: b.active_this_cycle || 0, limit: total || undefined },
        { label: "비활성 좌석", used: b.inactive_this_cycle || 0, limit: total || undefined }
      ]
    };
  },

  // Google Gemini — 공개 사용률 API 없음. 키 유효성만 확인.
  async gemini(creds = {}) {
    const key = String(pick(creds.apiKey, env.GEMINI_API_KEY) || "").trim();
    if (!key) throw new Error("Google API 키가 필요합니다. (AIza...)");
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
    if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const data = await res.json();
    const count = (data.models || []).length;
    return {
      account: "Google AI Studio",
      updatedAt: nowISO(), resetAt: nextMonthISO(),
      metrics: [{ label: "사용 가능 모델(사용률 API 미제공)", used: count }]
    };
  }
};

// ---- HTTP ----
const send = (res, code, body) => {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};

const readBody = (req) => new Promise((resolve, reject) => {
  let raw = "";
  req.on("data", (chunk) => { raw += chunk; if (raw.length > 1e5) req.destroy(); });
  req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error("잘못된 JSON 본문")); } });
  req.on("error", reject);
});

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, "");
  const path = (req.url || "/").split("?")[0].replace(/\/+$/, "");

  // 상태 확인
  if (req.method === "GET" && (path === "" || path === "/")) {
    return send(res, 200, { ok: true, service: "ai-usage-adapter", providers: Object.keys(adapters) });
  }

  // 방식 1) POST /api/usage { provider, creds }
  if (req.method === "POST" && path === "/api/usage") {
    let body;
    try { body = await readBody(req); } catch (err) { return send(res, 400, { error: String(err.message) }); }
    const adapter = adapters[String(body.provider || "").toLowerCase()];
    if (!adapter) return send(res, 400, { error: `지원하지 않는 공급자: ${body.provider}` });
    try { return send(res, 200, await adapter(body.creds || {})); }
    catch (err) { return send(res, 502, { error: String(err.message || err) }); }
  }

  // 방식 2) GET /claude (환경 변수 방식)
  const name = path.replace(/^\//, "").toLowerCase();
  const adapter = adapters[name];
  if (req.method === "GET" && adapter) {
    try { return send(res, 200, await adapter()); }
    catch (err) { return send(res, 502, { error: String(err.message || err) }); }
  }

  send(res, 404, { error: `알 수 없는 경로: ${req.method} ${path}` });
});

server.listen(PORT, () => {
  console.log(`ai-usage 어댑터가 http://localhost:${PORT} 에서 실행 중입니다.`);
  console.log(`· API 키로 연결: POST /api/usage`);
  console.log(`· 환경 변수 방식: ${Object.keys(adapters).map((n) => `GET /${n}`).join(", ")}`);
});
