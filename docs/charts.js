// 의존성 없는 인라인 SVG 차트. CDN 없이 오프라인에서도 동작하며 라이트/다크 테마를 따릅니다.
let uid = 0;
const nextId = (p) => `${p}-${++uid}`;

// 도넛(링) 게이지: percent(0~100)
export function donut(percent, opts = {}) {
  const size = opts.size || 128;
  const stroke = opts.stroke || 12;
  const color = opts.color || "#6658df";
  const color2 = opts.color2 || "#978af5";
  const track = opts.track || "rgba(125,130,145,.16)";
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  const dash = (p / 100) * circ;
  const gid = nextId("g");
  return `
  <svg class="donut" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${Math.round(p)}% 사용">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${color2}"/></linearGradient></defs>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="url(#${gid})" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${dash} ${circ}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="47%" text-anchor="middle" class="donut-value">${Math.round(p)}%</text>
    <text x="50%" y="63%" text-anchor="middle" class="donut-sub">${opts.label || "사용"}</text>
  </svg>`;
}

// 면적(area) 추이 차트: 값 배열(임의 스케일)을 부드러운 곡선 + 그라디언트 채움
export function area(values, opts = {}) {
  const w = opts.width || 320;
  const h = opts.height || 78;
  const pad = 4;
  const color = opts.color || "#6658df";
  const vals = (values && values.length ? values : [0, 0]).map(Number);
  const max = Math.max(1, ...vals, opts.max || 0);
  const min = Math.min(0, ...vals);
  const span = max - min || 1;
  const n = vals.length;
  const x = (i) => pad + (i * (w - pad * 2)) / (n - 1 || 1);
  const y = (v) => h - pad - ((v - min) / span) * (h - pad * 2);
  const pts = vals.map((v, i) => [x(i), y(v)]);
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2[0]} ${p2[1]}`;
  }
  const fill = `${d} L ${x(n - 1)} ${h - pad} L ${x(0)} ${h - pad} Z`;
  const gid = nextId("a");
  const last = pts[pts.length - 1];
  return `
  <svg class="area" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" role="img" aria-label="사용 추이">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path d="${fill}" fill="url(#${gid})"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="3.2" fill="${color}"/>
  </svg>`;
}

// 요약 스트립용 미니 링(가운데 텍스트 없음)
export function miniRing(percent, color) {
  const size = 46, stroke = 5, r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  const dash = (p / 100) * circ;
  return `
  <svg class="donut" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(125,130,145,.16)" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${dash} ${circ}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
  </svg>`;
}
