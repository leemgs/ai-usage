import assert from "node:assert/strict";
import test from "node:test";
import { usagePercent, validateUsage } from "../docs/usage-core.js";

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
