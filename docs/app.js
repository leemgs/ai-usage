const providers = [
  { name: "Claude", short: "AI", color: "#d97757", metrics: [["5시간 세션", 36], ["주간 사용량", 18], ["Sonnet 모델", 42]], reset: "8월 10일 오전 9:00" },
  { name: "Gemini", short: "G", color: "#4285f4", metrics: [["Pro 요청", 12], ["Deep Research", 5], ["이미지 생성", 28]], reset: "9월 1일 오전 9:00" },
  { name: "Antigravity", short: "A", color: "#805ad5", metrics: [["월간 크레딧", 64], ["에이전트 실행", 31], ["자동화", 16]], reset: "9월 1일 오전 9:00" },
  { name: "Codex", short: "CX", color: "#111827", metrics: [["5시간 한도", 21], ["주간 한도", 34], ["코드 리뷰", 8]], reset: "8월 14일 오전 9:00" },
  { name: "Copilot", short: "C", color: "#17191f", metrics: [["프리미엄 요청", 0], ["채팅 메시지", 0], ["인라인 제안", 0]], reset: "9월 1일 오전 9:00" }
];

const elements = {
  nav: document.querySelector("#providerNav"), metrics: document.querySelector("#metrics"),
  name: document.querySelector("#providerName"), logo: document.querySelector("#providerLogo"),
  reset: document.querySelector("#resetDate"), refresh: document.querySelector("#refreshButton"),
  updated: document.querySelector("#globalUpdated"), theme: document.querySelector("#themeToggle")
};

let active = Math.max(0, providers.findIndex(({ name }) => name === (localStorage.getItem("activeProvider") || "Copilot")));

function renderNav() {
  elements.nav.innerHTML = providers.map((provider, index) => `
    <button class="nav-item ${index === active ? "active" : ""}" type="button" data-index="${index}" aria-current="${index === active ? "page" : "false"}">
      <span class="nav-icon">${provider.short}</span><span>${provider.name}</span>
    </button>`).join("");
}

function renderProvider() {
  const provider = providers[active];
  elements.name.textContent = provider.name;
  elements.logo.textContent = provider.short;
  elements.logo.style.background = provider.color;
  elements.reset.textContent = provider.reset;
  elements.metrics.innerHTML = provider.metrics.map(([label, value]) => `
    <div class="metric">
      <div class="metric-labels"><span class="metric-name">${label}</span><span class="metric-numbers"><strong>${value}%</strong> 사용</span></div>
      <div class="progress" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}"><div class="progress-fill" style="width:${value}%"></div></div>
    </div>`).join("");
  renderNav();
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
  setTimeout(() => {
    elements.refresh.classList.remove("loading");
    elements.refresh.disabled = false;
    elements.updated.innerHTML = '<span class="live-dot"></span>방금 전 업데이트';
  }, 700);
});

const savedTheme = localStorage.getItem("theme");
if (savedTheme === "dark" || (!savedTheme && matchMedia("(prefers-color-scheme: dark)").matches)) document.body.classList.add("dark");
elements.theme.addEventListener("click", () => {
  document.body.classList.toggle("dark");
  localStorage.setItem("theme", document.body.classList.contains("dark") ? "dark" : "light");
});

renderProvider();
