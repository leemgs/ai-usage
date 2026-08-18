import assert from "node:assert/strict";
import test from "node:test";
import { isSecureEndpoint, readConnections, usagePercent, validateUsage } from "../docs/usage-core.js";

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
