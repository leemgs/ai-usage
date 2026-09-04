export function validateUsage(payload) {
  if (!payload || typeof payload !== "object") throw new Error("JSON 객체가 아닌 응답입니다.");
  if (!Array.isArray(payload.metrics) || payload.metrics.length === 0) throw new Error("metrics 배열이 없는 응답입니다.");

  payload.metrics.forEach((metric) => {
    if (!metric || typeof metric.label !== "string" || !metric.label.trim()) throw new Error("사용량 항목의 이름이 올바르지 않습니다.");
    if (!Number.isFinite(metric.used) || metric.used < 0) throw new Error("사용량은 0 이상의 숫자여야 합니다.");
    if (metric.limit != null && (!Number.isFinite(metric.limit) || metric.limit <= 0)) throw new Error("한도는 0보다 큰 숫자여야 합니다.");
  });

  ["updatedAt", "resetAt"].forEach((field) => {
    if (payload[field] != null && Number.isNaN(Date.parse(payload[field]))) throw new Error(`${field} 값이 올바른 날짜가 아닙니다.`);
  });

  if (payload.history != null) {
    if (!Array.isArray(payload.history)) throw new Error("history 는 배열이어야 합니다.");
    payload.history.forEach((point) => {
      if (!point || !Number.isFinite(point.used) || point.used < 0) throw new Error("history 항목의 used 는 0 이상의 숫자여야 합니다.");
      if (point.limit != null && (!Number.isFinite(point.limit) || point.limit <= 0)) throw new Error("history 항목의 limit 는 0보다 큰 숫자여야 합니다.");
      if (point.date != null && Number.isNaN(Date.parse(point.date))) throw new Error("history 항목의 date 가 올바른 날짜가 아닙니다.");
    });
  }

  return payload;
}

export function usagePercent(used, limit) {
  if (!Number.isFinite(limit) || limit <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
}

// 한도가 있는 지표들의 평균 사용률(0~100). 한도가 하나도 없으면 null.
export function overallPercent(metrics) {
  if (!Array.isArray(metrics)) return null;
  const percents = metrics.map((m) => usagePercent(m.used, m.limit)).filter((p) => p !== null);
  if (!percents.length) return null;
  return Math.round(percents.reduce((a, b) => a + b, 0) / percents.length);
}

export function isSecureEndpoint(value, pageHostname = "") {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname) && ["localhost", "127.0.0.1", "::1"].includes(pageHostname);
  } catch {
    return false;
  }
}

export function readConnections(serialized, pageHostname = "") {
  try {
    const parsed = JSON.parse(serialized || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, connection]) => connection && typeof connection.endpoint === "string" && isSecureEndpoint(connection.endpoint, pageHostname)));
  } catch {
    return {};
  }
}
