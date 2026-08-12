#!/usr/bin/env node
/*
 * AI Usage 프록시 서버
 * ---------------------------------------------------------------------------
 * 정적 프런트엔드(docs/)는 브라우저 CORS 정책 때문에 각 공급자 API를 직접
 * 호출할 수 없습니다. 이 작은 프록시가 브라우저 대신 실제 사용량 API를
 * 호출하고, 프런트엔드가 기대하는 형태로 정규화해 돌려줍니다.
 *
 * 실행:  node server/proxy.js         (기본 포트 8787)
 *        PORT=9000 node server/proxy.js
 *
 * 요청:  POST /api/usage
 *        { "provider": "Claude", "creds": { "adminKey": "sk-ant-admin..." } }
 *
 * 응답:  { "live": true, "status": "정상적으로 연결됨",
 *          "metrics": [["이번 달 비용", 42]], "reset": "9월 1일" }
 *
 * 의존성 없음(Node 18+ 내장 fetch 사용). 자격 증명은 저장하지 않고
 * 요청마다 클라이언트가 보낸 값을 그대로 사용해 공급자에 전달합니다.
 */
"use strict";
const http = require("http");

const PORT = process.env.PORT || 8787;

// ---- 유틸 --------------------------------------------------------------
const pct = (used, total) => {
  if (!total || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((used / total) * 100)));
};
const firstOfNextMonthKST = () => {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const next = new Date(Date.UTC(y, m + 1, 1));
  return `${next.getUTCMonth() + 1}월 1일 오전 9:00`;
};
const monthStartISO = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
};

// ---- 공급자별 어댑터 ---------------------------------------------------
// 각 어댑터는 { status, metrics, reset } 를 반환하거나 Error 를 던집니다.
const adapters = {
  // Anthropic Admin API — 조직 비용 리포트
  // https://docs.anthropic.com/en/api/administration
  async Claude(creds) {
    const key = (creds.adminKey || "").trim();
    if (!key) throw new Error("Admin API 키가 필요합니다.");
    const budget = Number(creds.budget) || 100; // 월 예산(USD) 대비 사용률
    const url = "https://api.anthropic.com/v1/organizations/cost_report?starting_at=" +
      encodeURIComponent(monthStartISO());
    const res = await fetch(url, {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const data = await res.json();
    // cost_report 는 시간 버킷별 결과 배열 → 총합을 USD 로 환산
    let cents = 0;
    for (const bucket of data.data || []) {
      for (const item of bucket.results || []) {
        cents += Number(item.amount || item.cost || 0);
      }
    }
    const usd = cents / 100;
    return {
      status: "정상적으로 연결됨",
      metrics: [
        [`이번 달 비용 ($${usd.toFixed(2)}/$${budget})`, pct(usd, budget)]
      ],
      reset: firstOfNextMonthKST()
    };
  },

  // OpenAI 사용량/비용 API (Codex)
  // https://platform.openai.com/docs/api-reference/usage
  async Codex(creds) {
    const key = (creds.apiKey || "").trim();
    if (!key) throw new Error("OpenAI API 키가 필요합니다.");
    const budget = Number(creds.budget) || 100;
    const headers = { Authorization: `Bearer ${key}` };
    if (creds.orgId) headers["OpenAI-Organization"] = creds.orgId;
    const start = Math.floor(new Date(monthStartISO()).getTime() / 1000);
    const url = `https://api.openai.com/v1/organizations/costs?start_time=${start}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const data = await res.json();
    let usd = 0;
    for (const bucket of data.data || []) {
      for (const item of bucket.results || []) {
        usd += Number(item.amount?.value || 0);
      }
    }
    return {
      status: "정상적으로 연결됨",
      metrics: [[`이번 달 비용 ($${usd.toFixed(2)}/$${budget})`, pct(usd, budget)]],
      reset: firstOfNextMonthKST()
    };
  },

  // GitHub Copilot 조직 좌석 사용량
  // https://docs.github.com/en/rest/copilot/copilot-user-management
  async Copilot(creds) {
    const token = (creds.token || "").trim();
    if (!token) throw new Error("GitHub 토큰이 필요합니다.");
    if (!creds.org) throw new Error("조직/사용자 이름이 필요합니다(개인 계정은 사용자명).");
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ai-usage-proxy"
    };
    const res = await fetch(`https://api.github.com/orgs/${encodeURIComponent(creds.org)}/copilot/billing`, { headers });
    if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const data = await res.json();
    const total = data.seat_breakdown?.total || 0;
    const active = data.seat_breakdown?.active_this_cycle || 0;
    const inactive = data.seat_breakdown?.inactive_this_cycle || 0;
    return {
      status: "정상적으로 연결됨",
      metrics: [
        [`활성 좌석 (${active}/${total})`, pct(active, total)],
        [`비활성 좌석 (${inactive}/${total})`, pct(inactive, total)]
      ],
      reset: firstOfNextMonthKST()
    };
  },

  // Google Gemini — 공개 "사용률" API가 없어 키 유효성만 확인합니다.
  // 실제 소비량은 Google Cloud Monitoring 이 필요하며 범위를 벗어납니다.
  async Gemini(creds) {
    const key = (creds.apiKey || "").trim();
    if (!key) throw new Error("API 키가 필요합니다.");
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
    if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const data = await res.json();
    const count = (data.models || []).length;
    return {
      status: `키 확인됨 · 모델 ${count}개 (사용률 API 미제공)`,
      metrics: [["연결 상태", count ? 100 : 0]],
      reset: firstOfNextMonthKST()
    };
  }
};

// ---- HTTP 서버 ---------------------------------------------------------
const send = (res, code, body) => {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  });
  res.end(payload);
};

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, "");
  if (req.method === "GET" && req.url === "/") return send(res, 200, { ok: true, service: "ai-usage-proxy" });
  if (req.method !== "POST" || !req.url.startsWith("/api/usage")) return send(res, 404, { error: "not found" });

  let raw = "";
  req.on("data", (chunk) => { raw += chunk; if (raw.length > 1e5) req.destroy(); });
  req.on("end", async () => {
    let body;
    try { body = JSON.parse(raw || "{}"); } catch { return send(res, 400, { error: "잘못된 JSON" }); }
    const adapter = adapters[body.provider];
    if (!adapter) return send(res, 400, { error: `지원하지 않는 공급자: ${body.provider}` });
    try {
      const result = await adapter(body.creds || {});
      send(res, 200, { live: true, ...result });
    } catch (err) {
      send(res, 502, { error: String(err.message || err) });
    }
  });
});

server.listen(PORT, () => {
  console.log(`ai-usage 프록시가 http://localhost:${PORT} 에서 실행 중입니다.`);
  console.log(`설정 모달의 "프록시 서버 주소"에 위 주소를 입력하세요.`);
});
