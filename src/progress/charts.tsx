/** Small single-series SVG line chart: 2px line, recessive axis labels, a dot and direct label on the latest point, native tooltips per point. */
export function LineChart({ points, format, label, height = 120 }: {
  points: { x: number; y: number; tip: string }[]; format: (v: number) => string; label: string; height?: number;
}) {
  if (points.length < 2) return null;
  const W = 320, H = height, padL = 4, padR = 44, padT = 10, padB = 14;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  let [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  const sx = (x: number) => padL + ((x - x0) / (x1 - x0 || 1)) * (W - padL - padR);
  const sy = (y: number) => padT + (1 - (y - y0) / (y1 - y0)) * (H - padT - padB);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return (
    <svg class="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <line class="chart-grid" x1={padL} x2={W - padR} y1={sy(y1)} y2={sy(y1)} />
      <line class="chart-grid" x1={padL} x2={W - padR} y1={sy(y0)} y2={sy(y0)} />
      <text class="chart-axis" x={W - padR + 6} y={sy(y1) + 4}>{format(y1)}</text>
      <text class="chart-axis" x={W - padR + 6} y={sy(y0) + 4}>{format(y0)}</text>
      <path class="chart-line" d={d} />
      {points.map((p) => (
        <circle class="chart-hit" cx={sx(p.x)} cy={sy(p.y)} r="10" key={p.x}><title>{p.tip}</title></circle>
      ))}
      <circle class="chart-dot" cx={sx(last.x)} cy={sy(last.y)} r="4" />
    </svg>
  );
}

/** A percentage bar with its value as text (never colour alone). */
export function Bar({ value, label, sub }: { value: number; label: string; sub: string }) {
  return (
    <div class="bar-row">
      <div class="bar-head"><span>{label}</span><span class="dim">{sub}</span></div>
      <div class="bar-track"><span style={{ width: `${Math.round(value * 100)}%` }} /></div>
    </div>
  );
}
