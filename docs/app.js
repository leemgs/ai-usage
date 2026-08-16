import { usagePercent, validateUsage } from "./usage-core.js";

const providers = [
  { id: "claude", name: "Claude", short: "AI", color: "#d97757" },
  { id: "gemini", name: "Gemini", short: "G", color: "#4285f4" },
  { id: "antigravity", name: "Antigravity", short: "A", color: "#805ad5" },
  { id: "codex", name: "Codex", short: "CX", color: "#111827" },
  { id: "copilot", name: "Copilot", short: "C", color: "#17191f" }
];

const storageKey = "aiUsageConnectionsV2";
const connections = JSON.parse(localStorage.getItem(storageKey) || "{}");
const tokens = new Map();
const usage = new Map();
let active = Math.max(0, providers.findIndex(({ id }) => id === (localStorage.getItem("activeProvider") || "copilot")));

const $ = (selector) => document.querySelector(selector);
const elements = {
  nav: $("#providerNav"), content: $("#providerContent"), name: $("#providerName"), logo: $("#providerLogo"),
  status: $("#providerStatus"), count: $("#activeCount"), updated: $("#globalUpdated"), refresh: $("#refreshButton"),
  disconnect: $("#disconnectButton"), dialog: $("#connectDialog"), form: $("#connectForm"), title: $("#dialogTitle"),
  endpoint: $("#endpointInput"), token: $("#tokenInput"), error: $("#formError"), submit: $("#connectSubmit"), theme: $("#themeToggle")
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
  return `<div class="empty-state">
    <span class="empty-icon" aria-hidden="true">↗</span>
    <h3>${provider.name} 계정을 연결하세요</h3>
    <p>현재 표시할 실제 사용량이 없습니다.<br>Usage API를 연결한 뒤에만 데이터가 표시됩니다.</p>
    <button class="primary-button" id="openConnect" type="button">계정 데이터 연결</button>
  </div>`;
}

function formatDate(value) {
  if (!value) return "제공되지 않음";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeStyle: "short" }).format(date);
}

function usageState(data) {
  const metrics = data.metrics.map((metric) => {
    const percent = usagePercent(metric.used, metric.limit);
    const display = percent === null ? `${metric.used}` : `${metric.used} / ${metric.limit}`;
    return `<div class="metric"><div class="metric-labels"><span class="metric-name">${escapeHtml(metric.label)}</span><span class="metric-numbers"><strong>${escapeHtml(display)}</strong>${percent === null ? "회" : ` (${percent}%)`}</span></div>
      <div class="progress" role="progressbar" aria-label="${escapeHtml(metric.label)}" aria-valuemin="0" aria-valuemax="${metric.limit || metric.used}" aria-valuenow="${metric.used}"><div class="progress-fill" style="width:${percent ?? 100}%"></div></div></div>`;
  }).join("");
  return `<div class="account-row"><div><span>계정</span><strong>${escapeHtml(data.account || "확인되지 않음")}</strong></div><div class="account-updated"><span>API 기준 시각</span><strong>${escapeHtml(formatDate(data.updatedAt))}</strong></div></div>${metrics}<div class="reset-note"><span aria-hidden="true">◷</span><div><small>다음 사용량 재설정</small><strong>${escapeHtml(formatDate(data.resetAt))}</strong></div></div>`;
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
  elements.content.innerHTML = data ? usageState(data) : emptyState(provider);
  $("#openConnect")?.addEventListener("click", openDialog);
  renderNav();
}

async function fetchUsage(provider, connection, token = tokens.get(provider.id)) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(connection.endpoint, { headers, cache: "no-store" });
  if (!response.ok) throw new Error(`Usage API 오류 (${response.status})`);
  const data = validateUsage(await response.json());
  usage.set(provider.id, data);
  return data;
}

async function refreshAll() {
  const connected = providers.filter(({ id }) => connections[id]);
  if (!connected.length) { renderProvider(); return; }
  elements.refresh.classList.add("loading"); elements.refresh.disabled = true;
  const results = await Promise.allSettled(connected.map((provider) => fetchUsage(provider, connections[provider.id])));
  const failures = results.filter(({ status }) => status === "rejected").length;
  elements.updated.innerHTML = `<span class="status-dot ${failures ? "warning" : "live"}"></span>${failures ? `${failures}개 연결 확인 실패` : "방금 전 실제 데이터 업데이트"}`;
  elements.refresh.classList.remove("loading"); elements.refresh.disabled = false;
  renderProvider();
}

function openDialog() {
  const provider = providers[active];
  elements.title.textContent = `${provider.name} 계정 연결`;
  elements.endpoint.value = connections[provider.id]?.endpoint || "";
  elements.token.value = ""; elements.error.textContent = "";
  elements.dialog.showModal();
}

elements.form.addEventListener("submit", async (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  const provider = providers[active];
  const endpoint = elements.endpoint.value.trim();
  if (!endpoint.startsWith("https://") && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(endpoint)) { elements.error.textContent = "보안을 위해 HTTPS 주소만 사용할 수 있습니다."; return; }
  elements.submit.disabled = true; elements.submit.textContent = "확인 중…"; elements.error.textContent = "";
  try {
    const token = elements.token.value.trim();
    await fetchUsage(provider, { endpoint }, token);
    connections[provider.id] = { endpoint };
    if (token) tokens.set(provider.id, token);
    saveConnections(); elements.dialog.close();
    elements.updated.innerHTML = '<span class="status-dot live"></span>방금 전 실제 데이터 업데이트'; renderProvider();
  } catch (error) { elements.error.textContent = `연결하지 못했습니다: ${error.message}`; }
  finally { elements.submit.disabled = false; elements.submit.textContent = "연결 및 확인"; }
});

elements.nav.addEventListener("click", (event) => { const button = event.target.closest("button[data-index]"); if (!button) return; active = Number(button.dataset.index); localStorage.setItem("activeProvider", providers[active].id); renderProvider(); });
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
