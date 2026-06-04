import { useState } from "react";
import { card, pill, th2, td2, kpiCard, heatColors } from "../utils/styles.js";
import { TC, PAL, C_POS } from "../constants.js";
import { fmL } from "../utils/dateUtils.js";
import { MEETING_QUALITY, MQ_CRITERIA, MQ_MAX } from "../data/meetingQuality.js";

const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const recPct = (s) => (s.reduce((a, b) => a + b, 0) / MQ_MAX) * 100;
const monthOf = (d) => d.slice(0, 7);

export default function MeetingQualityTab() {
  const [mode, setMode] = useState("overall"); // overall | criteria
  const [sort, setSort] = useState({ key: "pct", dir: "desc" });

  const data = MEETING_QUALITY;
  const months = [...new Set(data.map((r) => monthOf(r.d)))].sort();

  // средний % по каждому критерию (от макс)
  const critPct = MQ_CRITERIA.map((c, i) => mean(data.map((r) => r.s[i])) / c.max * 100);
  const overallPct = mean(data.map((r) => recPct(r.s)));

  // помесячно
  const monthOverall = months.map((m) => mean(data.filter((r) => monthOf(r.d) === m).map((r) => recPct(r.s))));
  const monthCrit = MQ_CRITERIA.map((c, i) =>
    months.map((m) => {
      const recs = data.filter((r) => monthOf(r.d) === m);
      return recs.length ? mean(recs.map((r) => r.s[i])) / c.max * 100 : null;
    })
  );

  // по консультантам
  const byCons = {};
  for (const r of data) {
    if (!byCons[r.c]) byCons[r.c] = { name: r.c, team: r.t, recs: [] };
    byCons[r.c].recs.push(r);
  }
  let consRows = Object.values(byCons).map((c) => ({
    name: c.name,
    team: c.team,
    n: c.recs.length,
    pct: mean(c.recs.map((r) => recPct(r.s))),
    crit: MQ_CRITERIA.map((cr, i) => mean(c.recs.map((r) => r.s[i])) / cr.max * 100),
  }));
  if (sort.key) {
    consRows.sort((a, b) => {
      if (sort.key === "name" || sort.key === "team") {
        const r = String(a[sort.key]).localeCompare(String(b[sort.key]), "ru");
        return sort.dir === "asc" ? r : -r;
      }
      let av, bv;
      if (sort.key === "n") { av = a.n; bv = b.n; }
      else if (sort.key === "pct") { av = a.pct; bv = b.pct; }
      else { av = a.crit[sort.key]; bv = b.crit[sort.key]; } // sort.key = criterion index
      return sort.dir === "asc" ? av - bv : bv - av;
    });
  }
  const toggle = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  const arrow = (key) => (sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : "");

  // SVG chart
  const W = 920, H = 300, padL = 40, padR = 16, padT = 20, padB = 36;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const x = (i) => padL + (months.length <= 1 ? innerW / 2 : (innerW * i) / (months.length - 1));
  const y = (p) => padT + innerH - (innerH * (p || 0)) / 100;
  const yTicks = [0, 25, 50, 75, 100];
  const linePath = (vals) => {
    const pts = vals.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`)).filter(Boolean);
    return pts.length ? "M" + pts.join("L") : "";
  };

  return (
    <div>
      {/* KPI: общий % + 5 критериев */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginBottom: 12 }}>
        <div style={kpiCard}>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary,#888)" }}>Общая оценка</div>
          <div style={{ fontSize: 22, fontWeight: 500, color: C_POS }}>{overallPct.toFixed(0)}%</div>
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary,#aaa)" }}>{data.length} встреч</div>
        </div>
        {MQ_CRITERIA.map((c, i) => (
          <div key={c.key} style={kpiCard}>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary,#888)", minHeight: 28 }}>{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 500 }}>{critPct[i].toFixed(0)}%</div>
            <div style={{ fontSize: 11, color: "var(--color-text-tertiary,#aaa)" }}>
              {(critPct[i] / 100 * c.max).toFixed(1)} / {c.max}
            </div>
          </div>
        ))}
      </div>

      {/* Динамика */}
      <div style={card}>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <button style={pill(mode === "overall")} onClick={() => setMode("overall")}>Общая оценка</button>
          <button style={pill(mode === "criteria")} onClick={() => setMode("criteria")}>По критериям</button>
        </div>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--color-border-tertiary,#e0e0e0)" strokeDasharray="4,4" strokeWidth={0.5} />
              <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill="var(--color-text-tertiary,#aaa)">{v}%</text>
            </g>
          ))}
          {months.map((m, i) => (
            <text key={m} x={x(i)} y={H - padB + 16} textAnchor="middle" fontSize={9} fill="var(--color-text-secondary,#888)">{fmL(m)}</text>
          ))}
          {mode === "overall" ? (
            <g>
              <path d={linePath(monthOverall)} fill="none" stroke="var(--color-text-primary,#333)" strokeWidth={2.5} />
              {monthOverall.map((v, i) => (
                <g key={i}>
                  <text x={x(i)} y={y(v) - 8} textAnchor="middle" fontSize={9} fill="var(--color-text-primary,#333)">{v.toFixed(0)}%</text>
                  <circle cx={x(i)} cy={y(v)} r={3.5} fill="var(--color-text-primary,#333)" stroke="#fff" strokeWidth={1}>
                    <title>{`${fmL(months[i])}: ${v.toFixed(1)}%`}</title>
                  </circle>
                </g>
              ))}
            </g>
          ) : (
            MQ_CRITERIA.map((c, ci) => (
              <g key={c.key}>
                <path d={linePath(monthCrit[ci])} fill="none" stroke={PAL[ci]} strokeWidth={1.5} />
                {monthCrit[ci].map((v, i) =>
                  v == null ? null : (
                    <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={PAL[ci]} stroke="#fff" strokeWidth={1}>
                      <title>{`${c.label} — ${fmL(months[i])}: ${v.toFixed(0)}%`}</title>
                    </circle>
                  )
                )}
              </g>
            ))
          )}
        </svg>
        {mode === "criteria" && (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8, fontSize: 11 }}>
            {MQ_CRITERIA.map((c, i) => (
              <span key={c.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 14, height: 2.5, background: PAL[i] }} />
                {c.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Таблица по консультантам */}
      <div style={card}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640 }}>
            <thead>
              <tr>
                <th style={{ ...th2, cursor: "pointer" }} onClick={() => toggle("name")}>Консультант{arrow("name")}</th>
                <th style={{ ...th2, cursor: "pointer" }} onClick={() => toggle("team")}>Команда{arrow("team")}</th>
                <th style={{ ...th2, cursor: "pointer", textAlign: "center" }} onClick={() => toggle("n")}>Встреч{arrow("n")}</th>
                <th style={{ ...th2, cursor: "pointer", textAlign: "center" }} onClick={() => toggle("pct")}>Общая{arrow("pct")}</th>
                {MQ_CRITERIA.map((c, i) => (
                  <th key={c.key} style={{ ...th2, cursor: "pointer", textAlign: "center" }} onClick={() => toggle(i)}>
                    {c.label}{arrow(i)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {consRows.map((r) => (
                <tr key={r.name}>
                  <td style={{ ...td2, fontWeight: 500 }}>{r.name}</td>
                  <td style={{ ...td2, color: TC[r.team] || "var(--color-text-secondary,#888)" }}>{r.team || "—"}</td>
                  <td style={{ ...td2, textAlign: "center" }}>{r.n}</td>
                  {(() => {
                    const { bg, fg } = heatColors(r.pct / 8); // переводим % в шкалу heatColors (0..>12)
                    return <td style={{ ...td2, textAlign: "center", fontWeight: 600, background: bg, color: fg }}>{r.pct.toFixed(0)}%</td>;
                  })()}
                  {r.crit.map((v, i) => {
                    const { bg, fg } = heatColors(v / 8);
                    return <td key={i} style={{ ...td2, textAlign: "center", background: bg, color: fg }}>{v.toFixed(0)}%</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-secondary,#888)", marginTop: 10 }}>
          Оценка качества первичных встреч за {fmL(months[0])} — {fmL(months[months.length - 1])}. Итог = сумма
          баллов / {MQ_MAX}. Фильтр «Горячие/Холодные» к этой вкладке не применяется.
        </div>
      </div>
    </div>
  );
}
