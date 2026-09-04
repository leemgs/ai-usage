import assert from "node:assert/strict";
import test from "node:test";
import { isSecureEndpoint, overallPercent, readConnections, usagePercent, validateUsage } from "../docs/usage-core.js";

const validPayload = {
  account: "mobile-user",
  updatedAt: "2026-08-16T10:00:00Z",
  resetAt: "2026-09-01T09:00:00+09:00",
  metrics: [{ label: "프리미엄 요청", used: 12, limit: 300 }]
};

test("올바른 Usage API 응답을 허용한다", () => {
  assert.equal(validateUsage(validPayload), validPayload);
});

test("비어 있거나 잘못된 사용량을 거부한다", () => {
  assert.throws(() => validateUsage({ metrics: [] }), /metrics/);
  assert.throws(() => validateUsage({ metrics: [{ label: "요청", used: -1 }] }), /0 이상/);
  assert.throws(() => validateUsage({ metrics: [{ label: "요청", used: 1, limit: 0 }] }), /0보다 큰/);
});

test("잘못된 날짜를 거부한다", () => {
  assert.throws(() => validateUsage({ metrics: [{ label: "요청", used: 1 }], updatedAt: "not-a-date" }), /updatedAt/);
});

test("사용률을 계산하고 100%에서 제한한다", () => {
  assert.equal(usagePercent(12, 300), 4);
  assert.equal(usagePercent(500, 300), 100);
  assert.equal(usagePercent(1, undefined), null);
});

test("선택적 history 를 검증한다", () => {
  const withHistory = { metrics: [{ label: "요청", used: 1, limit: 10 }], history: [{ date: "2026-08-01", used: 3, limit: 10 }, { used: 5 }] };
  assert.equal(validateUsage(withHistory), withHistory);
  assert.throws(() => validateUsage({ metrics: [{ label: "요청", used: 1 }], history: "nope" }), /history/);
  assert.throws(() => validateUsage({ metrics: [{ label: "요청", used: 1 }], history: [{ used: -1 }] }), /history/);
});

test("전체 사용률은 한도가 있는 지표의 평균이다", () => {
  assert.equal(overallPercent([{ used: 10, limit: 100 }, { used: 30, limit: 100 }]), 20);
  assert.equal(overallPercent([{ used: 5 }]), null);
  assert.equal(overallPercent([]), null);
});

test("안전한 API 주소만 허용한다", () => {
  assert.equal(isSecureEndpoint("https://usage.example.com/api"), true);
  assert.equal(isSecureEndpoint("http://usage.example.com/api"), false);
  assert.equal(isSecureEndpoint("http://localhost:3000/api", "localhost"), true);
  assert.equal(isSecureEndpoint("http://localhost:3000/api", "leemgs.github.io"), false);
  assert.equal(isSecureEndpoint("not-a-url"), false);
});

test("손상되거나 위험한 저장 설정을 안전하게 제거한다", () => {
  assert.deepEqual(readConnections("not-json"), {});
  assert.deepEqual(readConnections("[]"), {});
  assert.deepEqual(readConnections(JSON.stringify({ copilot: { endpoint: "http://unsafe.example/api" }, codex: { endpoint: "https://safe.example/api" } })), { codex: { endpoint: "https://safe.example/api" } });
});

test("localhost 로컬 어댑터 연결은 localhost 페이지에서 유지된다", () => {
  const stored = JSON.stringify({ claude: { endpoint: "http://localhost:8787/claude" } });
  assert.deepEqual(readConnections(stored, "localhost"), { claude: { endpoint: "http://localhost:8787/claude" } });
  assert.deepEqual(readConnections(stored, "leemgs.github.io"), {});
});
