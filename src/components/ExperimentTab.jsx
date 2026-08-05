import { useState } from "react";
import {
  card,
  pill,
  th2,
  td2,
  kpiLabel,
  rampColors,
} from "../utils/styles.js";
import { TC, C_POS, C_NEG, C_WARN } from "../constants.js";
import { gM, gS, cv } from "../utils/convUtils.js";
import { actMo, fmL } from "../utils/dateUtils.js";
import { D } from "../data/consultants.js";
import { SECOND_MEETINGS, SM_MONTHS } from "../data/secondMeetings.js";
import { MEETING_QUALITY, MQ_CRITERIA, MQ_MAX } from "../data/meetingQuality.js";

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const recPct = (s) => (s.reduce((a, b) => a + b, 0) / MQ_MAX) * 100;
const monthOf = (d) => d.slice(0, 7);

// Месяцы, покрытые каждым источником
const D_MONTHS = actMo(D, "all");
const Q_MONTHS = [...new Set(MEETING_QUALITY.map((r) => monthOf(r.d)))].sort();
const ALL_MONTHS = [...new Set([...D_MONTHS, ...SM_MONTHS, ...Q_MONTHS])].sort();

// Период по умолчанию — пересечение всех трёх источников (там сравнение корректно)
const OVERLAP_FROM = [D_MONTHS[0], SM_MONTHS[0], Q_MONTHS[0]].sort().at(-1);
const OVERLAP_TO = [
  D_MONTHS[D_MONTHS.length - 1],
  SM_MONTHS[SM_MONTHS.length - 1],
  Q_MONTHS[Q_MONTHS.length - 1],
].sort()[0];

// Метрики рейтинга
const METRICS = [
  {
    id: "sales",
    label: "Топ по конверсии в продажу",
    short: "конверсия в продажу",
    value: (r) => r.conv,
    n: (r) => r.meetings,
    unit: "встреч",
    sub: (r) => `${r.meetings} встреч → ${r.sales} прод`,
  },
  {
    id: "second",
    label: "Топ по конверсии в повторную встречу",
    short: "конверсия во 2-ю встречу",
    value: (r) => r.cr2,
    n: (r) => r.m1,
    unit: "встреч",
    sub: (r) => `${r.m1} встреч → ${r.m2} повт`,
  },
  {
    id: "quality",
    label: "Топ по качеству первой встречи",
    short: "качество встречи",
    value: (r) => r.qpct,
    n: (r) => r.qn,
    unit: "оценок",
    sub: (r) => `${r.qn} ${r.qn === 1 ? "оценка" : "оценок"}`,
  },
];

const MIN_OPTIONS = [3, 5, 10, 20];

// Нормировка цвета: значение метрики, которое считаем «отличным» (100% шкалы).
// У метрик разные масштабы, поэтому единая шкала без нормировки врала бы.
const NORM = { sales: 15, second: 60, quality: 100 };

const selStyle = {
  padding: "4px 8px",
  fontSize: 12,
  border: "1px solid var(--color-border-tertiary,#DFE3E8)",
  borderRadius: 6,
  background: "var(--color-background-primary,#fff)",
  color: "var(--color-text-primary,#292B32)",
  cursor: "pointer",
};

// Экспериментальная вкладка: рейтинг консультантов сразу по трём метрикам
export default function ExperimentTab() {
  const [from, setFrom] = useState(OVERLAP_FROM);
  const [to, setTo] = useState(OVERLAP_TO);
  const [metricId, setMetricId] = useState("sales");
  const [minN, setMinN] = useState(10);

  const range = ALL_MONTHS.filter((m) => m >= from && m <= to);
  const metric = METRICS.find((m) => m.id === metricId);

  // Продажи дозревают ~3 месяца: если период включает последние месяцы,
  // конверсия в продажу по ним занижена.
  const SALES_LAG = 3;
  const lastMature = D_MONTHS[D_MONTHS.length - 1 - SALES_LAG];
  const immatureCount = range.filter((m) => m > lastMature).length;
  function excludeImmature() {
    setTo(lastMature);
    if (from > lastMature) setFrom(OVERLAP_FROM <= lastMature ? OVERLAP_FROM : ALL_MONTHS[0]);
  }

  // Ростер: объединение имён из всех трёх источников
  const roster = {};
  for (const d of D) if (!roster[d.name]) roster[d.name] = { name: d.name, team: d.team };
  for (const d of SECOND_MEETINGS)
    if (!roster[d.name]) roster[d.name] = { name: d.name, team: d.team };
  for (const r of MEETING_QUALITY)
    if (!roster[r.c]) roster[r.c] = { name: r.c, team: r.t };

  const rows = Object.values(roster).map((p) => {
    // конверсия в продажу
    const dRec = D.find((d) => d.name === p.name);
    let meetings = 0;
    let sales = 0;
    if (dRec)
      for (const k of range) {
        meetings += gM(dRec, k, "all");
        sales += gS(dRec, k, "all");
      }
    // конверсия во вторую встречу
    const smRec = SECOND_MEETINGS.find((d) => d.name === p.name);
    let m1 = 0;
    let m2 = 0;
    if (smRec)
      for (const k of range) {
        m1 += smRec.m1[k] || 0;
        m2 += smRec.m2[k] || 0;
      }
    // качество первой встречи
    const qRecs = MEETING_QUALITY.filter(
      (r) => r.c === p.name && range.includes(monthOf(r.d))
    );
    const qn = qRecs.length;
    return {
      ...p,
      meetings,
      sales,
      conv: cv(meetings, sales),
      m1,
      m2,
      cr2: cv(m1, m2),
      qn,
      qpct: qn ? mean(qRecs.map((r) => recPct(r.s))) : null,
      qcrit: MQ_CRITERIA.map((c, i) =>
        qn ? (mean(qRecs.map((r) => r.s[i])) / c.max) * 100 : null
      ),
    };
  });

  // Рейтинг по метрике: только те, у кого достаточно наблюдений.
  // При равных значениях (например, у нескольких 0%) выше тот, у кого
  // больше наблюдений — такой результат показательнее.
  function ranked(m, dir = "desc") {
    const ok = rows.filter((r) => m.n(r) >= minN && m.value(r) != null);
    ok.sort((a, b) => {
      const d = dir === "desc" ? m.value(b) - m.value(a) : m.value(a) - m.value(b);
      if (Math.abs(d) > 1e-9) return d;
      return m.n(b) - m.n(a);
    });
    return ok;
  }

  const mSales = METRICS[0];
  const mQual = METRICS[2];
  const highlights = [
    { title: "Топ-3 по конверсии из встречи в продажу", metric: mSales, dir: "desc", good: true },
    { title: "Топ-3 по качеству проведения встречи", metric: mQual, dir: "desc", good: true },
    { title: "Антитоп-3 по конверсии из встречи в продажу", metric: mSales, dir: "asc", good: false },
    { title: "Антитоп-3 по качеству проведения встречи", metric: mQual, dir: "asc", good: false },
  ];

  // Таблица рейтинга по выбранной метрике
  const eligible = ranked(metric, "desc");
  const rest = rows
    .filter((r) => !eligible.includes(r))
    .sort((a, b) => (metric.value(b) || 0) - (metric.value(a) || 0));

  const hl = "var(--row-selected,#EAF1FE)";

  function TeamChip({ team }) {
    return (
      <span style={{ color: TC[team] || "var(--color-text-secondary,#757987)", fontWeight: 600, fontSize: 11 }}>
        {team || "—"}
      </span>
    );
  }

  function HighlightCard({ title, metric: m, dir, good }) {
    const list = ranked(m, dir).slice(0, 3);
    const accent = good ? C_POS : C_NEG;
    return (
      <div style={{ ...card, marginBottom: 0, borderLeft: `3px solid ${accent}` }}>
        <div style={{ ...kpiLabel, marginBottom: 10 }}>{title}</div>
        {list.length === 0 && (
          <div style={{ fontSize: 12.5, color: "var(--color-text-secondary,#757987)" }}>
            Нет консультантов с {minN}+ {m.unit} за период
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {list.map((r, i) => (
            <div key={r.name} style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
              <span
                style={{
                  width: 19,
                  height: 19,
                  flexShrink: 0,
                  borderRadius: 999,
                  background: "var(--color-background-secondary,#E8EBEE)",
                  color: "var(--color-text-secondary,#757987)",
                  fontSize: 10.5,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {i + 1}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{r.name}</span>{" "}
                <TeamChip team={r.team} />
                <div style={{ fontSize: 11, color: "var(--color-text-secondary,#757987)" }}>
                  {m.sub(r)}
                </div>
              </span>
              <span
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  color: accent,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {m.value(r).toFixed(m.id === "quality" ? 0 : 1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Цвет ячейки: единая шкала «красный → зелёный», нормированная под диапазон
  // метрики (у конверсии в продажу и во вторую встречу разные масштабы).
  function HeatCell({ value, n, sub, active, norm }) {
    const enough = n >= minN && value != null;
    const { bg, fg } = enough
      ? rampColors(Math.min(100, (value / norm) * 100))
      : { bg: active ? hl : "transparent", fg: "var(--color-text-tertiary,#9AA1AF)" };
    return (
      <td
        style={{
          ...td2,
          textAlign: "center",
          background: bg,
          color: fg,
          whiteSpace: "nowrap",
          borderLeft: active ? "2px solid var(--ring,#39AA5D)" : undefined,
          borderRight: active ? "2px solid var(--ring,#39AA5D)" : undefined,
        }}
      >
        <div style={{ fontWeight: 700 }}>
          {value == null ? "—" : `${value.toFixed(norm === 100 ? 0 : 1)}%`}
        </div>
        <div style={{ fontSize: 11, opacity: 0.75 }}>{sub}</div>
      </td>
    );
  }

  function Row({ r, rank, dim }) {
    return (
      <tr style={dim ? { opacity: 0.55 } : undefined}>
        <td style={{ ...td2, textAlign: "center", color: "var(--color-text-secondary,#757987)" }}>
          {rank || "—"}
        </td>
        <td style={{ ...td2, fontWeight: 600, whiteSpace: "nowrap" }}>{r.name}</td>
        <td style={td2}>
          <TeamChip team={r.team} />
        </td>
        <HeatCell
          value={r.conv}
          n={r.meetings}
          sub={`${r.meetings} → ${r.sales}`}
          active={metricId === "sales"}
          norm={NORM.sales}
        />
        <HeatCell
          value={r.cr2}
          n={r.m1}
          sub={`${r.m1} → ${r.m2}`}
          active={metricId === "second"}
          norm={NORM.second}
        />
        <HeatCell
          value={r.qpct}
          n={r.qn}
          sub={r.qn ? `${r.qn} оц.` : "—"}
          active={metricId === "quality"}
          norm={NORM.quality}
        />
      </tr>
    );
  }

  const thPrimary = (id) => ({
    ...th2,
    textAlign: "center",
    background: metricId === id ? hl : undefined,
  });

  return (
    <div>
      <div style={{ ...card, marginBottom: 14, borderLeft: "3px solid var(--chart-3,#FCA92F)" }}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>
          Рейтинг консультантов · эксперимент
        </div>
        <div style={{ fontSize: 12.5, color: "var(--color-text-secondary,#757987)", marginTop: 4 }}>
          Конверсия в продажу, конверсия во вторую встречу и качество первой встречи в одном
          месте — за общий период. Топы считаются только по консультантам, у которых
          достаточно наблюдений: иначе одна встреча с одной продажей даёт «100%».
        </div>
      </div>

      {/* Общие контролы: период + порог выборки */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 12, color: "var(--color-text-secondary,#757987)" }}>Период:</span>
        <select style={selStyle} value={from} onChange={(e) => setFrom(e.target.value)}>
          {ALL_MONTHS.map((m) => (
            <option key={m} value={m} disabled={m > to}>
              {fmL(m)}
            </option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary,#757987)" }}>—</span>
        <select style={selStyle} value={to} onChange={(e) => setTo(e.target.value)}>
          {ALL_MONTHS.map((m) => (
            <option key={m} value={m} disabled={m < from}>
              {fmL(m)}
            </option>
          ))}
        </select>
        <span style={{ width: 12 }} />
        <span style={{ fontSize: 12, color: "var(--color-text-secondary,#757987)" }}>
          Минимум наблюдений:
        </span>
        <select style={selStyle} value={minN} onChange={(e) => setMinN(Number(e.target.value))}>
          {MIN_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      {immatureCount > 0 && (
        <div
          style={{
            ...card,
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            borderLeft: `3px solid ${C_WARN}`,
          }}
        >
          <span style={{ fontSize: 12.5, flex: 1, minWidth: 260 }}>
            В период входят {immatureCount}{" "}
            {immatureCount === 1 ? "месяц" : immatureCount < 5 ? "месяца" : "месяцев"}, где сделки
            ещё дозревают — конверсия в продажу по ним занижена, рейтинг по этой метрике сдвинут.
            Качество и вторая встреча дозревают быстрее.
          </span>
          <button style={pill(false)} onClick={excludeImmature}>
            Только дозревшие месяцы (до {fmL(lastMature)})
          </button>
        </div>
      )}

      {/* Топы и антитопы */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 12,
          marginBottom: 14,
        }}
      >
        {highlights.map((h) => (
          <HighlightCard key={h.title} {...h} />
        ))}
      </div>

      {/* Рейтинг: переключатель метрики + таблица */}
      <div style={card}>
        <div style={{ display: "flex", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
          {METRICS.map((m) => (
            <button key={m.id} style={pill(metricId === m.id)} onClick={() => setMetricId(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--color-text-secondary,#757987)", margin: "8px 0 12px" }}>
          Сортировка по «{metric.short}»; выбранная метрика подсвечена. Рядом — две другие,
          чтобы видеть связь между качеством встречи и конверсией.
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640 }}>
            <thead>
              <tr>
                <th style={{ ...th2, textAlign: "center" }}>#</th>
                <th style={th2}>Консультант</th>
                <th style={th2}>Команда</th>
                <th style={thPrimary("sales")}>В продажу</th>
                <th style={thPrimary("second")}>Во 2-ю встречу</th>
                <th style={thPrimary("quality")}>Качество</th>
              </tr>
            </thead>
            <tbody>
              {eligible.map((r, i) => (
                <Row key={r.name} r={r} rank={i + 1} />
              ))}
              {rest.length > 0 && (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      ...td2,
                      background: "var(--color-background-secondary,#E8EBEE)",
                      fontSize: 11.5,
                      color: "var(--color-text-secondary,#757987)",
                    }}
                  >
                    Меньше {minN} наблюдений по метрике «{metric.short}» — в рейтинг не попадают
                  </td>
                </tr>
              )}
              {rest.map((r) => (
                <Row key={r.name} r={r} rank={null} dim />
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: 11, color: "var(--color-text-secondary,#757987)", marginTop: 10, lineHeight: 1.5 }}>
          Период {fmL(range[0] || from)} — {fmL(range[range.length - 1] || to)}. Покрытие данных
          различается: конверсия в продажу — с {fmL(D_MONTHS[0])}, вторая встреча — с{" "}
          {fmL(SM_MONTHS[0])}, качество — с {fmL(Q_MONTHS[0])}. По умолчанию период выставлен на
          пересечение всех трёх. Продажи привязаны к месяцу встречи, последние месяцы занижены —
          сделки ещё дозревают. Цвет нормирован под масштаб метрики: зелёный максимум — это{" "}
          {NORM.sales}% в продажу, {NORM.second}% во вторую встречу и {NORM.quality}% качества;
          серым — у кого меньше {minN} наблюдений.
        </div>
      </div>
    </div>
  );
}
