import { isSecureEndpoint, overallPercent, readConnections, usagePercent, validateUsage } from "./usage-core.js";
import { area, donut, miniRing } from "./charts.js";

const providers = [
  { id: "claude", name: "Claude", short: "AI", color: "#d97757" },
  { id: "gemini", name: "Gemini", short: "G", color: "#4285f4" },
  { id: "antigravity", name: "Antigravity", short: "A", color: "#805ad5" },
  { id: "codex", name: "Codex", short: "CX", color: "#111827" },
  { id: "copilot", name: "Copilot", short: "C", color: "#17191f" }
];

// 공급자별 공식 API 키/토큰 안내와 입력 필드
const providerMeta = {
  claude: {
    supported: true,
    help: { text: "Anthropic Console → Settings → Admin keys 에서 Admin API 키를 발급하세요.", url: "https://console.anthropic.com/settings/admin-keys", label: "Anthropic Console 열기" },
    fields: [
      { key: "adminKey", label: "Admin API 키", type: "password", placeholder: "sk-ant-admin..." },
      { key: "budget", label: "월 예산(USD, 선택)", type: "number", placeholder: "100" }
    ]
  },
  gemini: {
    supported: true,
    help: { text: "Google AI Studio 에서 API 키를 발급하세요. (사용률 API가 없어 키 유효성만 확인합니다)", url: "https://aistudio.google.com/app/apikey", label: "Google AI Studio 열기" },
    fields: [{ key: "apiKey", label: "Google API 키", type: "password", placeholder: "AIza..." }]
  },
  antigravity: {
    supported: false,
    help: { text: "Antigravity 는 공개 사용량 API가 없어 실시간 조회를 지원하지 않습니다.", url: "", label: "" },
    fields: []
  },
  codex: {
    supported: true,
    help: { text: "OpenAI Platform → API keys 에서 키를 발급하세요. 비용/사용량 조회에는 조직 권한이 필요할 수 있습니다.", url: "https://platform.openai.com/api-keys", label: "OpenAI Platform 열기" },
    fields: [
      { key: "apiKey", label: "OpenAI API 키", type: "password", placeholder: "sk-..." },
      { key: "orgId", label: "조직 ID(선택)", type: "text", placeholder: "org-..." },
      { key: "budget", label: "월 예산(USD, 선택)", type: "number", placeholder: "100" }
    ]
  },
  copilot: {
    supported: true,
    help: { text: "GitHub → Settings → Developer settings → Personal access tokens 에서 토큰을 발급하세요(읽기 전용 권장).", url: "https://github.com/settings/tokens", label: "GitHub 토큰 페이지 열기" },
    fields: [
      { key: "token", label: "GitHub 토큰(PAT)", type: "password", placeholder: "ghp_..." },
      { key: "org", label: "조직 또는 사용자명", type: "text", placeholder: "my-org" }
    ]
  }
};

const storageKey = "aiUsageConnectionsV3";
const proxyBaseKey = "aiUsageProxyBase";
const connections = readConnections(localStorage.getItem(storageKey), location.hostname);
const tokens = new Map();
let dialogMode = "key"; // 'key' | 'endpoint'
const usage = new Map();
let active = Math.max(0, providers.findIndex(({ id }) => id === (localStorage.getItem("activeProvider") || "copilot")));
let refreshPromise = null;

const $ = (selector) => document.querySelector(selector);
const elements = {
  nav: $("#providerNav"), content: $("#providerContent"), summary: $("#summaryStrip"), name: $("#providerName"), logo: $("#providerLogo"),
  status: $("#providerStatus"), count: $("#activeCount"), updated: $("#globalUpdated"), refresh: $("#refreshButton"),
  disconnect: $("#disconnectButton"), dialog: $("#connectDialog"), form: $("#connectForm"), title: $("#dialogTitle"), dialogLogo: $("#dialogLogo"),
  endpoint: $("#endpointInput"), token: $("#tokenInput"), error: $("#formError"), submit: $("#connectSubmit"), theme: $("#themeToggle"),
  tabKey: $("#tabKey"), tabEndpoint: $("#tabEndpoint"), keyPanel: $("#keyPanel"), endpointPanel: $("#endpointPanel"),
  proxyBase: $("#proxyBaseInput"), keyHelp: $("#keyHelp"), keyFields: $("#keyFields"), keyUnsupported: $("#keyUnsupported")
};

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function saveConnections() {
  localStorage.setItem(storageKey, JSON.stringify(connections));
}

function renderNav() {
  elements.nav.innerHTML = providers.map((provider, index) => `
    <button class="nav-item ${index === active ? "active" : ""}" type="button" data-index="${index}" aria-current="${index === active ? "page" : "false"}">
      <span class="nav-icon">${provider.short}</span><span>${provider.name}</span><i class="connection-dot ${connections[provider.id] ? "on" : ""}"></i>
    </button>`).join("");
}

function emptyState(provider) {
  const supported = providerMeta[provider.id]?.supported !== false;
  return `<div class="empty-state">
    <span class="empty-icon" aria-hidden="true">🔑</span>
    <h3>${provider.name} 연결하기</h3>
    <p>공식 <strong>API 키/토큰</strong>을 입력하면 실제 사용량을<br>그래프로 확인할 수 있습니다.</p>
    <button class="primary-button" id="openConnect" type="button" ${supported ? "" : "disabled"}>${supported ? "API 키로 연결" : "실시간 조회 미지원"}</button>
  </div>`;
}

function formatDate(value) {
  if (!value) return "제공되지 않음";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeStyle: "short" }).format(date);
}

function usageState(data, provider) {
  const overall = overallPercent(data.metrics);
  const metrics = data.metrics.map((metric) => {
    const percent = usagePercent(metric.used, metric.limit);
    const display = percent === null ? `${metric.used}` : `${metric.used} / ${metric.limit}`;
    return `<div class="metric"><div class="metric-labels"><span class="metric-name">${escapeHtml(metric.label)}</span><span class="metric-numbers"><strong>${escapeHtml(display)}</strong>${percent === null ? "회" : ` (${percent}%)`}</span></div>
      <div class="progress" role="progressbar" aria-label="${escapeHtml(metric.label)}" aria-valuemin="0" aria-valuemax="${metric.limit || metric.used}" aria-valuenow="${metric.used}"><div class="progress-fill" style="width:${percent ?? 100}%"></div></div></div>`;
  }).join("");

  // 도넛 게이지: 한도가 있는 지표가 있으면 전체 평균 사용률을 표시
  const gauge = overall === null ? "" : `<div class="gauge-row">
    <div class="gauge">${donut(overall, { color: provider.color })}</div>
    <div class="gauge-side">
      <p class="gauge-headline">전체 평균 사용률</p>
      <p class="gauge-detail">${data.metrics.length}개 항목 · 다음 재설정 ${escapeHtml(formatDate(data.resetAt))}</p>
    </div></div>`;

  // 추이 차트: 엔드포인트가 history 를 제공할 때만 표시(예시 데이터를 지어내지 않음)
  let trend = "";
  if (Array.isArray(data.history) && data.history.length > 1) {
    const values = data.history.map((point) => usagePercent(point.used, point.limit) ?? point.used);
    trend = `<div class="trend"><div class="trend-head"><span>사용 추이 (${data.history.length}개 지점)</span><span>실시간</span></div>${area(values, { color: provider.color })}</div>`;
  }

  const account = `<div class="account-row"><div><span>계정</span><strong>${escapeHtml(data.account || "확인되지 않음")}</strong></div><div class="account-updated"><span>API 기준 시각</span><strong>${escapeHtml(formatDate(data.updatedAt))}</strong></div></div>`;
  const reset = `<div class="reset-note"><span aria-hidden="true">◷</span><div><small>다음 사용량 재설정</small><strong>${escapeHtml(formatDate(data.resetAt))}</strong></div></div>`;
  return `${account}${gauge}${metrics}${trend}${reset}`;
}

function renderSummary() {
  elements.summary.innerHTML = providers.map((provider, index) => {
    const data = usage.get(provider.id);
    const overall = data ? overallPercent(data.metrics) : null;
    const connected = Boolean(connections[provider.id]);
    const valClass = overall === null ? "summary-val dim" : "summary-val";
    const valText = overall === null ? (connected ? "확인 대기" : "미연결") : `${overall}%`;
    return `<button class="summary-item ${index === active ? "active" : ""}" type="button" data-index="${index}">
      <span class="summary-ring">${miniRing(overall ?? 0, provider.color)}</span>
      <span class="summary-name">${escapeHtml(provider.name)}</span>
      <span class="${valClass}">${valText}${data ? ' <i class="dot-live"></i>' : ""}</span>
    </button>`;
  }).join("");
}

function renderProvider() {
  const provider = providers[active];
  const connection = connections[provider.id];
  const data = usage.get(provider.id);
  elements.name.textContent = provider.name;
  elements.logo.textContent = provider.short;
  elements.logo.style.background = provider.color;
  elements.count.textContent = Object.keys(connections).length;
  elements.disconnect.hidden = !connection;
  elements.status.textContent = connection ? (data ? "실제 데이터 확인됨" : "연결됨 · 확인 대기") : "계정 연결 필요";
  elements.status.className = connection ? (data ? "connected" : "pending") : "disconnected";
  elements.content.innerHTML = data ? usageState(data, provider) : emptyState(provider);
  $("#openConnect")?.addEventListener("click", openDialog);
  renderNav();
  renderSummary();
}

async function fetchUsage(provider, connection, token = tokens.get(provider.id)) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);
  let response;
  try {
    if (connection.mode === "key") {
      // API 키 방식: 프록시(어댑터)에 키를 전달해 대신 호출하게 함
      response = await fetch(connection.proxyBase.replace(/\/$/, "") + "/api/usage", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: controller.signal,
        body: JSON.stringify({ provider: provider.id, creds: connection.creds })
      });
    } else {
      // 직접 어댑터 주소 방식
      const headers = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      response = await fetch(connection.endpoint, { headers, cache: "no-store", signal: controller.signal });
    }
  } catch (error) {
    if (error.name === "AbortError") throw new Error("응답 시간이 초과되었습니다.");
    throw new Error(connection.mode === "key" ? "프록시에 연결할 수 없습니다. server/proxy.js 실행과 주소를 확인하세요." : "Usage API에 연결할 수 없습니다. 주소와 CORS 설정을 확인하세요.");
  } finally {
    window.clearTimeout(timeout);
  }
  if (!response.ok) {
    let detail = "";
    try { detail = (await response.clone().json()).error || ""; } catch {}
    if (response.status === 401 || response.status === 403) throw new Error("인증이 만료되었거나 권한이 없습니다.");
    throw new Error(detail || `조회 오류 (${response.status})`);
  }
  let payload;
  try { payload = await response.json(); } catch { throw new Error("올바른 JSON을 반환하지 않았습니다."); }
  const data = validateUsage(payload);
  usage.set(provider.id, data);
  return data;
}

async function refreshAll() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = performRefresh();
  try { return await refreshPromise; } finally { refreshPromise = null; }
}

async function performRefresh() {
  const connected = providers.filter(({ id }) => connections[id]);
  if (!connected.length) { renderProvider(); return; }
  elements.refresh.classList.add("loading"); elements.refresh.disabled = true;
  const results = await Promise.allSettled(connected.map((provider) => fetchUsage(provider, connections[provider.id])));
  const failures = results.filter(({ status }) => status === "rejected").length;
  elements.updated.innerHTML = `<span class="status-dot ${failures ? "warning" : "live"}"></span>${failures ? `${failures}개 연결 확인 실패 · 다시 인증하거나 API를 확인하세요` : "방금 전 실제 데이터 업데이트"}`;
  elements.refresh.classList.remove("loading"); elements.refresh.disabled = false;
  renderProvider();
}

function setDialogMode(mode) {
  dialogMode = mode;
  const isKey = mode === "key";
  elements.tabKey.classList.toggle("active", isKey);
  elements.tabEndpoint.classList.toggle("active", !isKey);
  elements.tabKey.setAttribute("aria-selected", String(isKey));
  elements.tabEndpoint.setAttribute("aria-selected", String(!isKey));
  elements.keyPanel.hidden = !isKey;
  elements.endpointPanel.hidden = isKey;
}

function renderKeyFields(provider) {
  const meta = providerMeta[provider.id];
  const saved = connections[provider.id]?.mode === "key" ? connections[provider.id].creds : {};
  const help = meta.help;
  elements.keyHelp.innerHTML = `${escapeHtml(help.text)}${help.url ? ` <a href="${help.url}" target="_blank" rel="noopener">${escapeHtml(help.label)} ↗</a>` : ""}`;
  if (!meta.supported) {
    elements.keyFields.innerHTML = "";
    elements.keyUnsupported.hidden = false;
    elements.keyUnsupported.textContent = "이 서비스는 실시간 조회를 지원하지 않습니다.";
    elements.submit.disabled = true;
    return;
  }
  elements.keyUnsupported.hidden = true;
  elements.submit.disabled = false;
  elements.keyFields.innerHTML = meta.fields.map((field) => `
    <label>${escapeHtml(field.label)}
      <input data-field="${field.key}" type="${field.type}" autocomplete="off" spellcheck="false"
        placeholder="${escapeHtml(field.placeholder)}" value="${escapeHtml(saved[field.key] || "")}" />
    </label>`).join("");
}

function openDialog() {
  const provider = providers[active];
  const conn = connections[provider.id];
  elements.title.textContent = `${provider.name} 연결`;
  elements.dialogLogo.textContent = provider.short;
  elements.dialogLogo.style.background = provider.color;
  elements.error.textContent = "";
  // 프록시 주소: 저장된 연결 → 마지막 사용값 → 기본값 순
  elements.proxyBase.value = (conn?.mode === "key" && conn.proxyBase) || localStorage.getItem(proxyBaseKey) || "http://localhost:8787";
  elements.endpoint.value = conn && conn.mode !== "key" ? conn.endpoint : "";
  elements.token.value = "";
  setDialogMode(conn && conn.mode !== "key" ? "endpoint" : "key");
  renderKeyFields(provider);
  elements.dialog.showModal();
}

elements.tabKey.addEventListener("click", () => { setDialogMode("key"); renderKeyFields(providers[active]); elements.error.textContent = ""; });
elements.tabEndpoint.addEventListener("click", () => { setDialogMode("endpoint"); elements.submit.disabled = false; elements.error.textContent = ""; });

elements.form.addEventListener("submit", async (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  const provider = providers[active];
  elements.submit.disabled = true; elements.submit.textContent = "확인 중…"; elements.error.textContent = "";
  try {
    let connection;
    if (dialogMode === "key") {
      const proxyBase = elements.proxyBase.value.trim();
      if (!isSecureEndpoint(proxyBase, location.hostname)) throw new Error("올바른 프록시 주소를 입력하세요. HTTP는 localhost 에서만 허용됩니다.");
      const creds = {};
      elements.keyFields.querySelectorAll("input[data-field]").forEach((input) => { creds[input.dataset.field] = input.value.trim(); });
      if (!Object.values(creds).some((v) => v)) throw new Error("API 키/토큰을 입력하세요.");
      connection = { mode: "key", proxyBase, creds };
      await fetchUsage(provider, connection);
      localStorage.setItem(proxyBaseKey, proxyBase);
    } else {
      const endpoint = elements.endpoint.value.trim();
      if (!isSecureEndpoint(endpoint, location.hostname)) throw new Error("올바른 HTTPS 주소를 입력하세요. HTTP는 로컬 개발 환경에서만 허용됩니다.");
      const token = elements.token.value.trim();
      connection = { endpoint };
      await fetchUsage(provider, connection, token);
      if (token) tokens.set(provider.id, token);
    }
    connections[provider.id] = connection;
    saveConnections();
    elements.dialog.close();
    elements.updated.innerHTML = '<span class="status-dot live"></span>방금 전 실제 데이터 업데이트';
    renderProvider();
  } catch (error) {
    elements.error.textContent = `연결하지 못했습니다: ${error.message}`;
  } finally {
    elements.submit.disabled = false; elements.submit.textContent = "연결 및 확인";
  }
});

function selectProvider(index) { active = Number(index); localStorage.setItem("activeProvider", providers[active].id); renderProvider(); }
elements.nav.addEventListener("click", (event) => { const button = event.target.closest("button[data-index]"); if (!button) return; selectProvider(button.dataset.index); });
elements.summary.addEventListener("click", (event) => { const button = event.target.closest("button[data-index]"); if (!button) return; selectProvider(button.dataset.index); });
elements.refresh.addEventListener("click", refreshAll);
elements.disconnect.addEventListener("click", () => { const provider = providers[active]; if (!confirm(`${provider.name} 연결을 해제할까요?`)) return; delete connections[provider.id]; tokens.delete(provider.id); usage.delete(provider.id); saveConnections(); renderProvider(); });

if (localStorage.getItem("theme") === "dark" || (!localStorage.getItem("theme") && matchMedia("(prefers-color-scheme: dark)").matches)) document.body.classList.add("dark");
elements.theme.addEventListener("click", () => { document.body.classList.toggle("dark"); localStorage.setItem("theme", document.body.classList.contains("dark") ? "dark" : "light"); });

renderProvider();
refreshAll();

const refreshInterval = window.setInterval(() => {
  if (document.visibilityState === "visible") refreshAll();
}, 60_000);
window.addEventListener("pagehide", () => window.clearInterval(refreshInterval), { once: true });
