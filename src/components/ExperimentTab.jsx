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
import { SALES_FACT, SF_MONTHS } from "../data/salesFact.js";

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const recPct = (s) => (s.reduce((a, b) => a + b, 0) / MQ_MAX) * 100;
const monthOf = (d) => d.slice(0, 7);

// Месяцы, покрытые каждым источником
const D_MONTHS = actMo(D, "all");
const Q_MONTHS = [...new Set(MEETING_QUALITY.map((r) => monthOf(r.d)))].sort();
const ALL_MONTHS = [...new Set([...D_MONTHS, ...SM_MONTHS, ...Q_MONTHS, ...SF_MONTHS])].sort();

// Период по умолчанию — пересечение всех источников (там сравнение корректно)
const OVERLAP_FROM = [D_MONTHS[0], SM_MONTHS[0], Q_MONTHS[0], SF_MONTHS[0]].sort().at(-1);
const OVERLAP_TO = [
  D_MONTHS[D_MONTHS.length - 1],
  SM_MONTHS[SM_MONTHS.length - 1],
  Q_MONTHS[Q_MONTHS.length - 1],
  SF_MONTHS[SF_MONTHS.length - 1],
].sort()[0];

// Метрики рейтинга
const METRICS = [
  {
    id: "count",
    column: "Закрытых сделок",
    topTitle: "Топ-3 по количеству закрытых сделок",
    antiTitle: "Антитоп-3 по количеству закрытых сделок",
    short: "закрытых сделок",
    // Факт из выгрузки сделок: месяц закрытия (Won time), а не месяц встречи
    value: (r) => r.won,
    n: (r) => r.meetings,
    unit: "встреч",
    // Конверсию здесь не показываем: закрытия отнесены к месяцу закрытия,
    // а встречи — к месяцу встречи, делить одно на другое нельзя.
    sub: (r) => `${r.meetings} встреч в периоде`,
    subShort: (r) => `${r.meetings} встр`,
    fmt: (v) => (v == null ? "—" : String(v)),
    valueHead: "Сделок",
    leanSample: true,
    accent: TC.MS2,
  },
  {
    id: "sales",
    column: "Конверсия в продажу",
    topTitle: "Топ-3 по конверсии из встречи в продажу",
    antiTitle: "Антитоп-3 по конверсии из встречи в продажу",
    short: "конверсия в продажу",
    accent: TC.MS1,
    value: (r) => r.conv,
    n: (r) => r.meetings,
    unit: "встреч",
    sub: (r) => `${r.meetings} встреч → ${r.sales} прод`,
    subShort: (r) => `${r.meetings}→${r.sales}`,
    // Разбивка в таблице: три узких столбца вместо «Данные + %»
    parts: [
      { label: "Все", value: (r) => r.conv, n: (r) => r.meetings, sub: (r) => `${r.meetings}→${r.sales}` },
      { label: "Гор", value: (r) => r.hotConv, n: (r) => r.hotM, sub: (r) => `${r.hotM}→${r.hotS}` },
      { label: "Хол", value: (r) => r.coldConv, n: (r) => r.coldM, sub: (r) => `${r.coldM}→${r.coldS}` },
    ],
  },
  {
    id: "second",
    column: "Конверсия в повторную встречу",
    topTitle: "Топ-3 по конверсии во вторую встречу",
    antiTitle: "Антитоп-3 по конверсии во вторую встречу",
    short: "конверсия во 2-ю встречу",
    accent: TC.MS3,
    value: (r) => r.cr2,
    n: (r) => r.m1,
    unit: "встреч",
    sub: (r) => `${r.m1} встреч → ${r.m2} повт`,
    subShort: (r) => `${r.m1}→${r.m2}`,
  },
  {
    id: "quality",
    column: "Качество проведения встречи",
    topTitle: "Топ-3 по качеству проведения встречи",
    antiTitle: "Антитоп-3 по качеству проведения встречи",
    short: "качество встречи",
    accent: C_WARN,
    value: (r) => r.qpct,
    n: (r) => r.qn,
    unit: "оценок",
    sub: (r) => `${r.qn} ${r.qn === 1 ? "оценка" : "оценок"}`,
    subShort: (r) => `${r.qn}`,
  },
];

const MIN_OPTIONS = [3, 5, 10, 20];

// Нормировка цвета: значение метрики, которое считаем «отличным» (100% шкалы).
// У метрик разные масштабы, поэтому единая шкала без нормировки врала бы.
// У количества продаж масштаб зависит от длины периода, поэтому нормируем
// на лучший результат в выборке, а не на константу.
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
  const [minN, setMinN] = useState(10);

  const range = ALL_MONTHS.filter((m) => m >= from && m <= to);

  // Пресеты периода. Нужны потому, что по умолчанию стоит пересечение
  // источников (оценки встреч начались только в фев'26), и «сколько закрыл
  // за год» без пресета отвечало бы неполным числом.
  const LAST_YEAR = ALL_MONTHS[ALL_MONTHS.length - 1].slice(0, 4);
  const PRESETS = [
    {
      label: `Весь ${LAST_YEAR}`,
      from: ALL_MONTHS.find((m) => m.startsWith(LAST_YEAR)),
      to: ALL_MONTHS.filter((m) => m.startsWith(LAST_YEAR)).at(-1),
    },
    { label: "Всё время", from: ALL_MONTHS[0], to: ALL_MONTHS[ALL_MONTHS.length - 1] },
    { label: "Пересечение источников", from: OVERLAP_FROM, to: OVERLAP_TO },
  ];

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
    let hotM = 0;
    let hotS = 0;
    let coldM = 0;
    let coldS = 0;
    if (dRec)
      for (const k of range) {
        meetings += gM(dRec, k, "all");
        sales += gS(dRec, k, "all");
        hotM += gM(dRec, k, "hot");
        hotS += gS(dRec, k, "hot");
        coldM += gM(dRec, k, "cold");
        coldS += gS(dRec, k, "cold");
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
    // закрытые сделки по месяцу закрытия (Won time)
    const sfRec = SALES_FACT.find((d) => d.name === p.name);
    let won = 0;
    if (sfRec) for (const k of range) won += sfRec.won[k] || 0;
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
      hotM,
      hotS,
      hotConv: cv(hotM, hotS),
      coldM,
      coldS,
      coldConv: cv(coldM, coldS),
      won,
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
      // При равных значениях у долей выше тот, у кого больше наблюдений —
      // такая конверсия показательнее, и это верно в обе стороны рейтинга.
      if (!m.leanSample) return m.n(b) - m.n(a);
      // У абсолютного количества размер выборки читается наоборот и зависит
      // от направления: те же продажи с меньшего потока встреч — лучший
      // результат, а тот же ноль с большего потока — худший.
      return dir === "desc" ? m.n(a) - m.n(b) : m.n(b) - m.n(a);
    });
    return ok;
  }

  function TeamChip({ team }) {
    return (
      <span
        style={{
          color: TC[team] || "var(--color-text-secondary,#757987)",
          fontWeight: 600,
          fontSize: 11,
        }}
      >
        {team || "—"}
      </span>
    );
  }

  // Верх шкалы цвета для метрики. Для количества продаж константы нет — берём
  // лучший результат среди попавших в рейтинг, иначе цвет зависел бы от периода.
  function normOf(m) {
    if (NORM[m.id] != null) return NORM[m.id];
    const vals = rows.filter((r) => m.n(r) >= minN).map((r) => m.value(r) || 0);
    return Math.max(1, ...vals);
  }

  // Значение метрики с цветом: единая шкала «красный → зелёный», нормированная
  // под диапазон метрики (у метрик разные масштабы).
  function cellColors(value, n, m) {
    return n >= minN && value != null
      ? rampColors(Math.min(100, (value / normOf(m)) * 100))
      : { bg: "transparent", fg: "var(--color-text-tertiary,#9AA1AF)" };
  }
  const valueColors = (m, r) => cellColors(m.value(r), m.n(r), m);
  const fmtVal = (m, v) =>
    m.fmt ? m.fmt(v) : v == null ? "—" : `${v.toFixed(m.id === "quality" ? 0 : 1)}%`;

  // Карточка топ-3 / антитоп-3
  function HighlightCard({ metric: m, dir }) {
    const good = dir === "desc";
    const list = ranked(m, dir).slice(0, 3);
    const accent = good ? C_POS : C_NEG;
    return (
      <div style={{ ...card, marginBottom: 0, borderLeft: `3px solid ${accent}` }}>
        <div style={{ ...kpiLabel, marginBottom: 10 }}>{good ? m.topTitle : m.antiTitle}</div>
        {list.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--color-text-secondary,#757987)" }}>
            Нет консультантов с {minN}+ {m.unit} за период
          </div>
        ) : (
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
                  {fmtVal(m, m.value(r))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Полная таблица по метрике
  function MetricTable({ metric: m }) {
    const eligible = ranked(m, "desc");
    const rest = rows
      .filter((r) => !eligible.includes(r))
      .sort((a, b) => (m.value(b) || 0) - (m.value(a) || 0));
    const thc = { ...th2, padding: "6px 4px" };
    const tdc = { ...td2, padding: "7px 4px", fontSize: 12.5 };

    const tdp = { ...tdc, padding: "6px 3px", textAlign: "center", whiteSpace: "nowrap" };

    const Row = ({ r, rank, dim }) => (
      <tr style={dim ? { opacity: 0.55 } : undefined}>
        <td
          style={{
            ...tdc,
            padding: "7px 2px",
            textAlign: "center",
            color: "var(--color-text-secondary,#757987)",
          }}
        >
          {rank || "—"}
        </td>
        <td style={{ ...tdc, whiteSpace: "nowrap" }}>
          <span style={{ fontWeight: 600 }}>{r.name}</span> <TeamChip team={r.team} />
        </td>
        {m.parts ? (
          // Разбивка: по узкому столбцу на срез, под процентом — размер выборки
          m.parts.map((part) => {
            const v = part.value(r);
            const n = part.n(r);
            const { bg, fg } = cellColors(v, n, m);
            return (
              <td key={part.label} style={{ ...tdp, background: bg, color: fg }}>
                <div style={{ fontWeight: 700 }}>{fmtVal(m, v)}</div>
                <div style={{ fontSize: 10.5, opacity: 0.7 }}>{part.sub(r)}</div>
              </td>
            );
          })
        ) : (
          <>
            <td style={{ ...tdc, textAlign: "right", whiteSpace: "nowrap", color: "var(--color-text-secondary,#757987)", fontSize: 11 }}>
              {(m.subShort || m.sub)(r)}
            </td>
            <td
              style={{
                ...tdc,
                textAlign: "center",
                whiteSpace: "nowrap",
                fontWeight: 700,
                background: valueColors(m, r).bg,
                color: valueColors(m, r).fg,
              }}
            >
              {fmtVal(m, m.value(r))}
            </td>
          </>
        )}
      </tr>
    );

    return (
      <div style={{ ...card, marginBottom: 0 }}>
        <div style={{ ...kpiLabel, marginBottom: 10 }}>Все консультанты</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ ...thc, textAlign: "center", padding: "6px 2px" }}>#</th>
                <th style={thc}>Консультант</th>
                {m.parts ? (
                  m.parts.map((part) => (
                    <th key={part.label} style={{ ...thc, textAlign: "center", padding: "6px 3px" }}>
                      {part.label}
                    </th>
                  ))
                ) : (
                  <>
                    <th style={{ ...thc, textAlign: "right", padding: "6px 4px" }}>N</th>
                    <th style={{ ...thc, textAlign: "center", padding: "6px 4px" }}>
                      {m.valueHead || "%"}
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {eligible.map((r, i) => (
                <Row key={r.name} r={r} rank={i + 1} />
              ))}
              {rest.length > 0 && (
                <tr>
                  <td
                    colSpan={m.parts ? 2 + m.parts.length : 4}
                    style={{
                      ...tdc,
                      background: "var(--color-background-secondary,#E8EBEE)",
                      fontSize: 11,
                      color: "var(--color-text-secondary,#757987)",
                    }}
                  >
                    Меньше {minN} наблюдений — вне рейтинга
                  </td>
                </tr>
              )}
              {rest.map((r) => (
                <Row key={r.name} r={r} rank={null} dim />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div>
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
        <span style={{ width: 12 }} />
        {PRESETS.map((p) => (
          <button
            key={p.label}
            style={pill(from === p.from && to === p.to)}
            onClick={() => {
              setFrom(p.from);
              setTo(p.to);
            }}
          >
            {p.label}
          </button>
        ))}
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
            ещё дозревают — конверсия в продажу по ним занижена. Качество и вторая встреча
            дозревают быстрее.
          </span>
          <button style={pill(false)} onClick={excludeImmature}>
            Только дозревшие месяцы (до {fmL(lastMature)})
          </button>
        </div>
      )}

      {/* Три колонки: по колонке на метрику */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(255px, 1fr))",
          gap: 12,
          alignItems: "start",
        }}
      >
        {METRICS.map((m) => (
          <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "-0.01em",
                paddingBottom: 2,
                borderBottom: `2px solid ${m.accent}`,
              }}
            >
              {m.column}
            </div>
            <HighlightCard metric={m} dir="desc" />
            <HighlightCard metric={m} dir="asc" />
            <MetricTable metric={m} />
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: "var(--color-text-secondary,#757987)", marginTop: 14, lineHeight: 1.5 }}>
        Период {fmL(range[0] || from)} — {fmL(range[range.length - 1] || to)}. Покрытие данных
        различается: конверсия в продажу — с {fmL(D_MONTHS[0])}, закрытые сделки — с{" "}
        {fmL(SF_MONTHS[0])}, вторая встреча — с {fmL(SM_MONTHS[0])}, качество — с{" "}
        {fmL(Q_MONTHS[0])}. По умолчанию период выставлен на пересечение всех четырёх.
        <br />
        <b>Две колонки про продажи считаются по-разному.</b> «Закрытых сделок» — факт из
        выгрузки сделок по дате закрытия (<i>Won time</i>): сколько человек реально закрыл
        внутри периода, включая сделки со встреч более раннего времени. «Конверсия в продажу» —
        отношение продаж к встречам, где продажа отнесена к месяцу первичной встречи; так
        считается эффективность, но у последних месяцев доля занижена, потому что сделки ещё
        дозревают. Числа в двух колонках не обязаны совпадать, и делить одно на другое нельзя —
        поэтому под количеством закрытых сделок показан только поток встреч, без CR. Цвет нормирован под масштаб метрики: зелёный максимум — это{" "}
        {NORM.sales}% в продажу, {NORM.second}% во вторую встречу и {NORM.quality}% качества.
        Закрытые сделки — абсолютная величина, поэтому цвет нормирован на лучший результат
        периода, а не на константу: масштаб зависит от длины периода. Порог наблюдений к ней
        применяется тот же, по встречам: без него в антитоп попадали бы просто те, кто провёл
        мало встреч, а с ним он читается как «мало закрытий при достаточном потоке».
        <br />
        При равных значениях у долей выше тот, у кого больше наблюдений — такая конверсия
        показательнее. У закрытых сделок поток встреч — лишь грубый ориентир, и он читается
        наоборот: те же закрытия с меньшего потока ставятся выше, а тот же ноль с большего
        потока — ниже. В разбивке «Гор / Хол» процент
        показан серым без заливки, если наблюдений меньше {minN}: горячих встреч на человека
        обычно немного, и такая конверсия — скорее шум. Чтобы увидеть срезы в цвете, снизьте
        минимум наблюдений.
      </div>
    </div>
  );
}
