import { useState } from "react";
import { card, th2, td2, kpiCard } from "../utils/styles.js";
import { TC, C_POS } from "../constants.js";
import { fmL } from "../utils/dateUtils.js";
import { SECOND_MEETINGS, SM_MONTHS } from "../data/secondMeetings.js";

// Heatmap для CR во вторую встречу (шкала 0–100%)
function heatCR(cr) {
  if (cr == null || cr === 0) return { bg: "transparent", fg: "var(--color-text-tertiary,#aaa)" };
  if (cr < 20) return { bg: "#EAF3DE", fg: "#3B6D11" };
  if (cr < 35) return { bg: "#C0DD97", fg: "#27500A" };
  if (cr < 50) return { bg: "#97C459", fg: "#173404" };
  return { bg: "#639922", fg: "#fff" };
}

const sum = (obj) => SM_MONTHS.reduce((a, m) => a + (obj[m] || 0), 0);
const cr = (a, b) => (a ? (b / a) * 100 : null);

// «CR во вторую встречу по людям» — конверсия из первой встречи во вторую.
export default function SecondMeetingTab() {
  const [sort, setSort] = useState({ key: "total", dir: "desc" });

  const rows = SECOND_MEETINGS.map((d) => {
    const m1 = sum(d.m1);
    const m2 = sum(d.m2);
    return { ...d, m1tot: m1, m2tot: m2, crtot: cr(m1, m2) };
  });

  if (sort.key) {
    rows.sort((a, b) => {
      if (sort.key === "name" || sort.key === "team") {
        const r = String(a[sort.key]).localeCompare(String(b[sort.key]), "ru");
        return sort.dir === "asc" ? r : -r;
      }
      let av, bv;
      if (sort.key === "total") {
        av = a.crtot || 0; bv = b.crtot || 0;
      } else {
        av = cr(a.m1[sort.key], a.m2[sort.key]) || 0;
        bv = cr(b.m1[sort.key], b.m2[sort.key]) || 0;
      }
      return sort.dir === "asc" ? av - bv : bv - av;
    });
  }
  const toggle = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  const arrow = (key) => (sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : "");

  // Итоги
  const totM1 = rows.reduce((a, r) => a + r.m1tot, 0);
  const totM2 = rows.reduce((a, r) => a + r.m2tot, 0);
  const totCR = cr(totM1, totM2);

  const stickyTh = { ...th2, position: "sticky", left: 0, zIndex: 2, background: "var(--color-background-primary,#fff)" };
  const stickyTd = { ...td2, position: "sticky", left: 0, zIndex: 1, background: "var(--color-background-primary,#fff)" };

  function CRCell({ a, b }) {
    const v = cr(a, b);
    const { bg, fg } = heatCR(v);
    return (
      <td style={{ ...td2, background: bg, textAlign: "center", whiteSpace: "nowrap" }}>
        <div style={{ fontWeight: 500, color: fg }}>{v == null ? "—" : `${v.toFixed(0)}%`}</div>
        <div style={{ fontSize: 11, color: "var(--color-text-secondary,#888)" }}>{a}→{b}</div>
      </td>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
        CR во вторую встречу по людям
      </div>
      {/* KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 12 }}>
        <div style={kpiCard}>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary,#888)" }}>Первичные встречи</div>
          <div style={{ fontSize: 22, fontWeight: 500 }}>{totM1}</div>
        </div>
        <div style={kpiCard}>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary,#888)" }}>Вторые встречи</div>
          <div style={{ fontSize: 22, fontWeight: 500 }}>{totM2}</div>
        </div>
        <div style={kpiCard}>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary,#888)" }}>CR во вторую встречу</div>
          <div style={{ fontSize: 22, fontWeight: 500, color: C_POS }}>
            {totCR == null ? "—" : `${totCR.toFixed(1)}%`}
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}>
            <thead>
              <tr>
                <th style={{ ...stickyTh, cursor: "pointer" }} onClick={() => toggle("name")}>Консультант{arrow("name")}</th>
                <th style={{ ...th2, cursor: "pointer" }} onClick={() => toggle("team")}>Команда{arrow("team")}</th>
                {SM_MONTHS.map((m) => (
                  <th key={m} style={{ ...th2, cursor: "pointer", whiteSpace: "nowrap" }} onClick={() => toggle(m)}>
                    {fmL(m)}{arrow(m)}
                  </th>
                ))}
                <th style={{ ...th2, cursor: "pointer" }} onClick={() => toggle("total")}>Итого{arrow("total")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <td style={{ ...stickyTd, fontWeight: 500 }}>{r.name}</td>
                  <td style={{ ...td2, color: TC[r.team] || "var(--color-text-secondary,#888)" }}>{r.team || "—"}</td>
                  {SM_MONTHS.map((m) => (
                    <CRCell key={m} a={r.m1[m] || 0} b={r.m2[m] || 0} />
                  ))}
                  <td style={{ ...td2, textAlign: "center", fontWeight: 600 }}>
                    {r.crtot == null ? "—" : `${r.crtot.toFixed(0)}%`}
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary,#888)" }}>{r.m1tot}→{r.m2tot}</div>
                  </td>
                </tr>
              ))}
              <tr style={{ background: "var(--color-background-secondary,#f5f5f5)" }}>
                <td style={{ ...stickyTd, fontWeight: 600, background: "var(--color-background-secondary,#f5f5f5)" }}>Всего</td>
                <td style={td2} />
                {SM_MONTHS.map((m) => {
                  const a = rows.reduce((s, r) => s + (r.m1[m] || 0), 0);
                  const b = rows.reduce((s, r) => s + (r.m2[m] || 0), 0);
                  return <CRCell key={m} a={a} b={b} />;
                })}
                <td style={{ ...td2, textAlign: "center", fontWeight: 700 }}>
                  {totCR == null ? "—" : `${totCR.toFixed(0)}%`}
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary,#888)" }}>{totM1}→{totM2}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-secondary,#888)", marginTop: 10 }}>
          Данные за фев'26 — май'26 (этап «вторая встреча» появился 16.02.2026). Вторые встречи привязаны
          к месяцу первичной встречи. Фильтр «Горячие/Холодные» к этой вкладке не применяется.
        </div>
      </div>
    </div>
  );
}
