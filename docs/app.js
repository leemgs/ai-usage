const { PROVIDERS: providers, store, fetchUsage } = window.AIUsage;

const elements = {
  nav: document.querySelector("#providerNav"), metrics: document.querySelector("#metrics"),
  name: document.querySelector("#providerName"), logo: document.querySelector("#providerLogo"),
  status: document.querySelector("#providerStatus"), badge: document.querySelector("#dataBadge"),
  reset: document.querySelector("#resetDate"), refresh: document.querySelector("#refreshButton"),
  updated: document.querySelector("#globalUpdated"), theme: document.querySelector("#themeToggle"),
  activeCount: document.querySelector("#activeCount"),
  tipTitle: document.querySelector("#tipTitle"), tipBody: document.querySelector("#tipBody"),
  tipAction: document.querySelector("#tipAction"),
  // 설정 모달
  settingsToggle: document.querySelector("#settingsToggle"), settingsModal: document.querySelector("#settingsModal"),
  settingsClose: document.querySelector("#settingsClose"), settingsSave: document.querySelector("#settingsSave"),
  settingsClear: document.querySelector("#settingsClear"), proxyUrl: document.querySelector("#proxyUrl"),
  credForms: document.querySelector("#credForms")
};

let active = Math.max(0, providers.findIndex(({ name }) => name === (localStorage.getItem("activeProvider") || "Copilot")));
let settingsProvider = active;

function renderNav() {
  elements.nav.innerHTML = providers.map((provider, index) => {
    const connected = store.hasCred(provider.name) && provider.supported;
    return `
    <button class="nav-item ${index === active ? "active" : ""}" type="button" data-index="${index}" aria-current="${index === active ? "page" : "false"}">
      <span class="nav-icon">${provider.short}${connected ? '<span class="nav-dot" aria-hidden="true"></span>' : ""}</span><span>${provider.name}</span>
    </button>`;
  }).join("");
}

function renderProvider() {
  const provider = providers[active];
  elements.name.textContent = provider.name;
  elements.logo.textContent = provider.short;
  elements.logo.style.background = provider.color;
  renderNav();
  updateOverview();
  loadUsage(provider);
}

function updateOverview() {
  const connected = providers.filter((p) => p.supported && store.hasCred(p.name)).length;
  elements.activeCount.textContent = connected || providers.length;
  if (connected === 0) {
    elements.tipTitle.textContent = "계정을 연결하세요";
    elements.tipBody.textContent = "설정에서 API 키를 저장하면 실제 사용량을 조회합니다.";
    elements.tipAction.setAttribute("aria-label", "계정 연결");
  } else {
    elements.tipTitle.textContent = "사용량을 효율적으로 관리하세요";
    elements.tipBody.textContent = "사용량이 80%를 넘으면 주의가 필요합니다.";
  }
}

function renderMetrics(metrics) {
  elements.metrics.innerHTML = metrics.map(([label, value]) => `
    <div class="metric">
      <div class="metric-labels"><span class="metric-name">${label}</span><span class="metric-numbers"><strong>${value}%</strong> 사용</span></div>
      <div class="progress" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}"><div class="progress-fill" style="width:${value}%"></div></div>
    </div>`).join("");
}

async function loadUsage(provider) {
  elements.badge.textContent = "…";
  elements.badge.className = "data-badge loading";
  elements.status.textContent = "조회 중…";
  renderMetrics(provider.mock.metrics.map(([l]) => [l, 0]));

  const data = await fetchUsage(provider);
  // 사용자가 그 사이 다른 서비스를 눌렀다면 무시
  if (providers[active].name !== provider.name) return;

  renderMetrics(data.metrics);
  elements.reset.textContent = data.reset;
  elements.status.textContent = data.status;
  elements.status.style.color = data.live ? "" : "var(--muted)";
  elements.badge.textContent = data.live ? "실시간" : "예시";
  elements.badge.className = "data-badge " + (data.live ? "live" : "mock");
  elements.badge.title = data.error ? data.error : (data.live ? "프록시를 통한 실제 조회" : "예시 데이터");
  elements.updated.innerHTML = '<span class="live-dot"></span>' +
    (data.live ? "방금 전 실시간 업데이트" : "예시 데이터 표시 중");
}

elements.nav.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-index]");
  if (!button) return;
  active = Number(button.dataset.index);
  localStorage.setItem("activeProvider", providers[active].name);
  renderProvider();
});

elements.refresh.addEventListener("click", () => {
  elements.refresh.classList.add("loading");
  elements.refresh.disabled = true;
  loadUsage(providers[active]).finally(() => {
    elements.refresh.classList.remove("loading");
    elements.refresh.disabled = false;
  });
});

// ---- 설정 모달 ----
function openSettings(index) {
  settingsProvider = index;
  elements.proxyUrl.value = store.proxyUrl();
  renderCredForm();
  elements.settingsModal.hidden = false;
  document.body.classList.add("modal-open");
}
function closeSettings() {
  elements.settingsModal.hidden = true;
  document.body.classList.remove("modal-open");
}

function renderCredForm() {
  const provider = providers[settingsProvider];
  const saved = store.credFor(provider.name);
  const chips = providers.map((p, i) =>
    `<button type="button" class="prov-chip ${i === settingsProvider ? "active" : ""}" data-prov="${i}">
       <span class="prov-chip-icon" style="background:${p.color}">${p.short}</span>${p.name}
     </button>`).join("");
  const note = provider.supported ? "" :
    `<p class="cred-warn">이 서비스는 공개 사용량 API가 없어 실시간 조회를 지원하지 않습니다.</p>`;
  const fields = provider.fields.map((f) => `
    <label class="field">
      <span>${f.label}</span>
      <input type="${f.type}" data-field="${f.key}" value="${(saved[f.key] || "").replace(/"/g, "&quot;")}"
             placeholder="${f.placeholder}" autocomplete="off" spellcheck="false" />
    </label>`).join("");
  elements.credForms.innerHTML = `<div class="prov-chips">${chips}</div>${note}${fields}`;
}

elements.credForms.addEventListener("click", (event) => {
  const chip = event.target.closest("button[data-prov]");
  if (!chip) return;
  settingsProvider = Number(chip.dataset.prov);
  renderCredForm();
});

elements.settingsSave.addEventListener("click", () => {
  store.saveProxyUrl(elements.proxyUrl.value);
  const provider = providers[settingsProvider];
  const values = {};
  elements.credForms.querySelectorAll("input[data-field]").forEach((input) => {
    values[input.dataset.field] = input.value.trim();
  });
  store.saveCred(provider.name, values);
  closeSettings();
  active = settingsProvider;
  localStorage.setItem("activeProvider", provider.name);
  renderProvider();
});

elements.settingsClear.addEventListener("click", () => {
  const provider = providers[settingsProvider];
  store.clearCred(provider.name);
  renderCredForm();
  updateOverview();
  renderNav();
  if (active === settingsProvider) loadUsage(provider);
});

elements.settingsToggle.addEventListener("click", () => openSettings(active));
elements.tipAction.addEventListener("click", () => openSettings(active));
elements.settingsClose.addEventListener("click", closeSettings);
elements.settingsModal.addEventListener("click", (event) => {
  if (event.target === elements.settingsModal) closeSettings();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.settingsModal.hidden) closeSettings();
});

// ---- 테마 ----
const savedTheme = localStorage.getItem("theme");
if (savedTheme === "dark" || (!savedTheme && matchMedia("(prefers-color-scheme: dark)").matches)) document.body.classList.add("dark");
elements.theme.addEventListener("click", () => {
  document.body.classList.toggle("dark");
  localStorage.setItem("theme", document.body.classList.contains("dark") ? "dark" : "light");
});

renderProvider();
