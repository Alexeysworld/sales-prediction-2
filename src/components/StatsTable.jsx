import { useState } from "react";
import { card, pill, th2, td2 } from "../utils/styles.js";
import { TEAMS, TC, C_POS, C_NEG } from "../constants.js";
import { gM, gS, cv } from "../utils/convUtils.js";
import {
  actMo,
  fmL,
  fmQ,
  quartersOf,
  monthsInQuarter,
} from "../utils/dateUtils.js";

// mode: "teams" | "consultants"; title — заголовок карточки (необязательный)
export default function StatsTable({ data, filter, mode, title }) {
  const [byQuarter, setByQuarter] = useState(false);
  const [sort, setSort] = useState({ key: null, dir: "desc" });

  const months = actMo(data, filter);
  const periods = byQuarter ? quartersOf(months) : months;

  // Группировка строк
  let rows;
  if (mode === "teams") {
    rows = TEAMS.map((t) => ({
      label: t,
      team: t,
      members: data.filter((d) => d.team === t),
    }));
  } else {
    rows = data.map((d) => ({
      label: d.name,
      team: d.team,
      members: [d],
    }));
  }

  // Значения по периодам для строки
  function periodVals(members) {
    return periods.map((pk) => {
      const ms = byQuarter ? monthsInQuarter(pk, months) : [pk];
      let m = 0;
      let s = 0;
      for (const d of members) {
        for (const k of ms) {
          m += gM(d, k, filter);
          s += gS(d, k, filter);
        }
      }
      return { meetings: m, sales: s, conv: cv(m, s) };
    });
  }

  function totals(members) {
    let m = 0;
    let s = 0;
    for (const d of members) {
      for (const k of months) {
        m += gM(d, k, filter);
        s += gS(d, k, filter);
      }
    }
    return { meetings: m, sales: s, conv: cv(m, s) };
  }

  // Тренд: последние 3 периода исключены; сравниваем последнее активное vs предпоследнее
  function trendOf(vals) {
    const usable = vals.slice(0, Math.max(0, vals.length - 3));
    const convs = usable.map((v) => v.conv).filter((c) => c != null);
    if (convs.length < 2) return { dir: 0, series: usable.map((v) => v.conv || 0) };
    const last = convs[convs.length - 1];
    const prev = convs[convs.length - 2];
    return { dir: last >= prev ? 1 : -1, series: usable.map((v) => v.conv || 0) };
  }

  // Подготовка строк с вычислениями
  const computed = rows.map((r) => {
    const vals = periodVals(r.members);
    const tot = totals(r.members);
    const tr = trendOf(vals);
    return { ...r, vals, tot, tr };
  });

  // Сортировка
  if (sort.key != null) {
    computed.sort((a, b) => {
      let av;
      let bv;
      if (sort.key === "label") {
        av = a.label;
        bv = b.label;
        return sort.dir === "asc"
          ? String(av).localeCompare(String(bv), "ru")
          : String(bv).localeCompare(String(av), "ru");
      }
      if (sort.key === "total") {
        av = a.tot.conv || 0;
        bv = b.tot.conv || 0;
      } else {
        // период по индексу
        av = a.vals[sort.key]?.conv || 0;
        bv = b.vals[sort.key]?.conv || 0;
      }
      return sort.dir === "asc" ? av - bv : bv - av;
    });
  }

  function toggleSort(key) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" }
    );
  }

  // Строка «Всего»
  const allVals = periodVals(data);
  const allTot = totals(data);
  const allTr = trendOf(allVals);

  const stickyTh = {
    ...th2,
    position: "sticky",
    left: 0,
    zIndex: 2,
    background: "var(--color-background-primary,#fff)",
  };
  const stickyTd = {
    ...td2,
    position: "sticky",
    left: 0,
    zIndex: 1,
    background: "var(--color-background-primary,#fff)",
  };

  function PeriodCell({ v, prev }) {
    const grew = v.conv != null && prev != null && v.conv > prev;
    const fell = v.conv != null && prev != null && v.conv < prev;
    return (
      <td style={{ ...td2, whiteSpace: "nowrap" }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: (v.conv || 0) > 0 ? 500 : 400,
            color: "var(--color-text-primary,#333)",
          }}
        >
          {v.conv == null ? "—" : `${v.conv.toFixed(1)}%`}{" "}
          {grew && <span style={{ color: C_POS }}>▲</span>}
          {fell && <span style={{ color: C_NEG }}>▼</span>}
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-secondary,#888)" }}>
          {v.meetings} встреч → {v.sales} win
        </div>
      </td>
    );
  }

  function Sparkline({ tr }) {
    const series = tr.series;
    const w = 72;
    const h = 24;
    if (series.length < 2)
      return <svg width={w} height={h} />;
    const max = Math.max(1, ...series);
    const pts = series
      .map((v, i) => {
        const px = (w * i) / (series.length - 1);
        const py = h - (h - 4) * (v / max) - 2;
        return `${px.toFixed(1)},${py.toFixed(1)}`;
      })
      .join(" ");
    const color = tr.dir >= 0 ? C_POS : C_NEG;
    return (
      <svg width={w} height={h}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} />
      </svg>
    );
  }

  const sortArrow = (key) =>
    sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : "";

  return (
    <div style={card}>
      {title && (
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 12 }}>
          {title}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <button style={pill(!byQuarter)} onClick={() => setByQuarter(false)}>
          Месяцы
        </button>
        <button style={pill(byQuarter)} onClick={() => setByQuarter(true)}>
          Кварталы
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 600 }}>
          <thead>
            <tr>
              <th style={{ ...stickyTh, cursor: "pointer" }} onClick={() => toggleSort("label")}>
                {mode === "teams" ? "Команда" : "Имя"}
                {sortArrow("label")}
              </th>
              {mode === "consultants" && <th style={th2}>Команда</th>}
              {periods.map((p, i) => (
                <th
                  key={p}
                  style={{ ...th2, cursor: "pointer", whiteSpace: "nowrap" }}
                  onClick={() => toggleSort(i)}
                >
                  {byQuarter ? fmQ(p) : fmL(p)}
                  {sortArrow(i)}
                </th>
              ))}
              <th style={{ ...th2, cursor: "pointer" }} onClick={() => toggleSort("total")}>
                Итого{sortArrow("total")}
              </th>
              <th style={th2}>Тренд</th>
            </tr>
          </thead>
          <tbody>
            {computed.map((r) => (
              <tr key={r.label}>
                <td style={{ ...stickyTd, fontWeight: 500 }}>
                  {mode === "teams" ? (
                    <span style={{ color: TC[r.team] }}>{r.label}</span>
                  ) : (
                    r.label
                  )}
                </td>
                {mode === "consultants" && (
                  <td style={{ ...td2, color: TC[r.team] }}>{r.team}</td>
                )}
                {r.vals.map((v, i) => (
                  <PeriodCell key={i} v={v} prev={i > 0 ? r.vals[i - 1].conv : null} />
                ))}
                <td style={{ ...td2, fontWeight: 500 }}>
                  {r.tot.conv == null ? "—" : `${r.tot.conv.toFixed(1)}%`}
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary,#888)" }}>
                    {r.tot.meetings} → {r.tot.sales}
                  </div>
                </td>
                <td style={td2}>
                  <Sparkline tr={r.tr} />
                </td>
              </tr>
            ))}
            {/* Строка «Всего» */}
            <tr style={{ background: "var(--color-background-secondary,#f5f5f5)" }}>
              <td
                style={{
                  ...stickyTd,
                  fontWeight: 600,
                  background: "var(--color-background-secondary,#f5f5f5)",
                }}
              >
                Всего
              </td>
              {mode === "consultants" && <td style={td2} />}
              {allVals.map((v, i) => (
                <PeriodCell key={i} v={v} prev={i > 0 ? allVals[i - 1].conv : null} />
              ))}
              <td style={{ ...td2, fontWeight: 600 }}>
                {allTot.conv == null ? "—" : `${allTot.conv.toFixed(1)}%`}
                <div style={{ fontSize: 11, color: "var(--color-text-secondary,#888)" }}>
                  {allTot.meetings} → {allTot.sales}
                </div>
              </td>
              <td style={td2}>
                <Sparkline tr={allTr} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {periods.length > 0 && (
        <div style={{ fontSize: 11, color: "var(--color-text-secondary,#888)", marginTop: 10 }}>
          Данные за период {fmL(months[0])} — {fmL(months[months.length - 1])}. Продажи
          привязаны к месяцу встречи, а не к месяцу закрытия сделки.
        </div>
      )}
    </div>
  );
}
