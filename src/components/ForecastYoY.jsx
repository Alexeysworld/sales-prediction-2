import { card, th2, td2, kpiCard, kpiLabel, kpiValue } from "../utils/styles.js";
import { C_POS, C_NEG, TC } from "../constants.js";
import { gM, gS } from "../utils/convUtils.js";
import { actMo, fmL } from "../utils/dateUtils.js";
import { D } from "../data/consultants.js";
import { SF_MONTHS, WON_BY_MONTH } from "../data/salesFact.js";

// ── Параметры модели ────────────────────────────────────────────────────────
const LAG = 3;          // месяцев дозревания сделки
const BASE_LEN = 12;    // длина базового окна для конверсии
const YOY_WINDOW = 3;   // по скольким последним месяцам считаем рост г/г
const Z = 1.96;         // 95% доверительный интервал

const C_FACT = "#14B8A6"; // факт продаж (месяц закрытия сделки)

const MONTHS_ALL = actMo(D, "all");
const LAST = MONTHS_ALL[MONTHS_ALL.length - 1];
const YEAR = Number(LAST.slice(0, 4));

// Закрытые сделки по месяцу закрытия (`Won time`)
const CLOSED = Object.fromEntries(WON_BY_MONTH.map((r) => [r.month, r.won]));
// Последний месяц выгрузки — это месяц, в который её сделали, значит он неполный
const PARTIAL_CLOSE = SF_MONTHS[SF_MONTHS.length - 1];

// Агрегат встреч/продаж по списку месяцев и срезу
function agg(monthKeys, type) {
  let m = 0;
  let s = 0;
  for (const d of D) {
    for (const k of monthKeys) {
      m += gM(d, k, type);
      s += gS(d, k, type);
    }
  }
  return { m, s };
}

// Доверительный интервал доли (Wilson) — даёт диапазон конверсии
function wilson(successes, n) {
  if (!n) return { p: 0, lo: 0, hi: 0 };
  const p = successes / n;
  const denom = 1 + (Z * Z) / n;
  const centre = (p + (Z * Z) / (2 * n)) / denom;
  const margin =
    (Z * Math.sqrt((p * (1 - p)) / n + (Z * Z) / (4 * n * n))) / denom;
  return { p, lo: Math.max(0, centre - margin), hi: centre + margin };
}

const prevYear = (m) => `${Number(m.slice(0, 4)) - 1}-${m.slice(5)}`;
const pct = (v) => `${(v * 100).toFixed(1)}%`;
const signed = (v, digits = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}`;

// ── Модель ──────────────────────────────────────────────────────────────────
function buildModel() {
  // База конверсии: 12 месяцев до последних 6 (там сделки уже дозрели)
  const base = MONTHS_ALL.slice(-(6 + BASE_LEN), -6);
  const bh = agg(base, "hot");
  const bc = agg(base, "cold");
  const conv = { hot: wilson(bh.s, bh.m), cold: wilson(bc.s, bc.m) };

  // Рост встреч год к году по последним 3 месяцам
  const recent = MONTHS_ALL.slice(-YOY_WINDOW);
  const yearAgo = recent.map(prevYear);
  const growthOf = (type) => {
    const now = agg(recent, type).m;
    const before = agg(yearAgo, type).m;
    return { now, before, k: before ? now / before : 1 };
  };
  const growth = { hot: growthOf("hot"), cold: growthOf("cold") };

  // Помесячно за год прогноза
  const rows = [];
  for (let i = 1; i <= 12; i++) {
    const key = `${YEAR}-${String(i).padStart(2, "0")}`;
    const known = MONTHS_ALL.includes(key);
    let hotM;
    let coldM;

    if (known) {
      hotM = agg([key], "hot").m;
      coldM = agg([key], "cold").m;
    } else {
      // Прогноз встреч: столько же, сколько год назад, с поправкой на рост
      const ly = prevYear(key);
      const hasLY = MONTHS_ALL.includes(ly);
      const fallback = (type) => agg(MONTHS_ALL.slice(-YOY_WINDOW), type).m / YOY_WINDOW;
      hotM = (hasLY ? agg([ly], "hot").m : fallback("hot")) * growth.hot.k;
      coldM = (hasLY ? agg([ly], "cold").m : fallback("cold")) * growth.cold.k;
    }

    const mid = hotM * conv.hot.p + coldM * conv.cold.p;
    const lo = hotM * conv.hot.lo + coldM * conv.cold.lo;
    const hi = hotM * conv.hot.hi + coldM * conv.cold.hi;

    rows.push({
      key,
      kind: known ? "actual" : "forecast", // про встречи, а не про продажи
      hotM,
      coldM,
      lo,
      mid,
      hi,
      closed: key in CLOSED ? CLOSED[key] : null,
      closedPartial: key === PARTIAL_CLOSE,
    });
  }

  const model = rows.reduce(
    (a, r) => ({ lo: a.lo + r.lo, mid: a.mid + r.mid, hi: a.hi + r.hi }),
    { lo: 0, mid: 0, hi: 0 }
  );

  // Закрытые сделки: всего за год и сравнение с прошлым годом.
  // Сравниваем только по полным месяцам — месяц выгрузки недобран.
  const closeMonths = SF_MONTHS.filter((m) => m.startsWith(String(YEAR)));
  const fullMonths = closeMonths.filter((m) => m !== PARTIAL_CLOSE);
  const sumClosed = (ms) => ms.reduce((a, m) => a + (CLOSED[m] || 0), 0);
  const closes = {
    ytd: sumClosed(closeMonths),
    full: sumClosed(fullMonths),
    fullPrev: sumClosed(fullMonths.map(prevYear)),
    prevYearTotal: sumClosed(
      SF_MONTHS.filter((m) => m.startsWith(String(YEAR - 1)))
    ),
    from: fullMonths[0],
    to: fullMonths[fullMonths.length - 1],
    partial: PARTIAL_CLOSE,
  };
  closes.k = closes.fullPrev ? closes.full / closes.fullPrev : 1;

  return { base, conv, growth, recent, yearAgo, rows, model, closes };
}

const KIND = {
  actual: { label: "встречи прошли", color: C_POS },
  forecast: { label: "прогноз встреч", color: TC.MS1 },
};

export default function ForecastYoY() {
  const M = buildModel();
  const { conv, growth, rows, model, closes } = M;

  // ── График: модель штрихом, факт сплошной ────────────────────────────────
  const W = 920;
  const H = 300;
  const padL = 40;
  const padR = 16;
  const padT = 22;
  const padB = 34;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const yMax = Math.max(
    25,
    Math.ceil(Math.max(...rows.map((r) => Math.max(r.hi, r.closed ?? 0))) / 5) * 5
  );
  const x = (i) => padL + (innerW * i) / (rows.length - 1);
  const y = (v) => padT + innerH - (innerH * v) / yMax;
  const step = x(1) - x(0);
  const yTicks = [];
  for (let v = 0; v <= yMax; v += 5) yTicks.push(v);

  const band =
    "M" +
    rows.map((r, i) => `${x(i)},${y(r.hi)}`).join("L") +
    "L" +
    [...rows].reverse().map((r, i) => `${x(rows.length - 1 - i)},${y(r.lo)}`).join("L") +
    "Z";
  const midLine = "M" + rows.map((r, i) => `${x(i)},${y(r.mid)}`).join("L");
  const factLine =
    rows.filter((r) => r.closed != null).length > 1
      ? "M" +
        rows.map((r, i) => (r.closed == null ? null : `${x(i)},${y(r.closed)}`)).filter(Boolean).join("L")
      : "";
  const firstForecast = rows.findIndex((r) => r.kind === "forecast");

  return (
    <div>
      {/* Сводка модели */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div style={kpiCard}>
          <div style={kpiLabel}>Конверсия горячих</div>
          <div style={{ ...kpiValue, color: C_POS }}>{pct(conv.hot.p)}</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary,#757987)" }}>
            диапазон {pct(conv.hot.lo)} – {pct(conv.hot.hi)}
          </div>
        </div>
        <div style={kpiCard}>
          <div style={kpiLabel}>Конверсия холодных</div>
          <div style={{ ...kpiValue, color: C_POS }}>{pct(conv.cold.p)}</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary,#757987)" }}>
            диапазон {pct(conv.cold.lo)} – {pct(conv.cold.hi)}
          </div>
        </div>
        <div style={kpiCard}>
          <div style={kpiLabel}>Закрыто сделок в {YEAR}</div>
          <div style={{ ...kpiValue, color: C_FACT }}>{closes.ytd}</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary,#757987)" }}>
            {fmL(closes.from)}–{fmL(closes.to)}: {closes.full} против {closes.fullPrev} год назад{" "}
            <span style={{ color: closes.k >= 1 ? C_POS : C_NEG, fontWeight: 600 }}>
              ({signed((closes.k - 1) * 100, 0)}%)
            </span>
            {" · "}
            {fmL(closes.partial)} не закончен
          </div>
        </div>
        <div style={{ ...kpiCard, borderColor: C_POS, borderWidth: 2 }}>
          <div style={kpiLabel}>Прогноз продаж {YEAR}</div>
          <div style={kpiValue}>{model.mid.toFixed(0)}</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary,#757987)" }}>
            диапазон {model.lo.toFixed(0)} – {model.hi.toFixed(0)} · в {YEAR - 1} закрыто{" "}
            {closes.prevYearTotal}
          </div>
        </div>
      </div>

      {/* График */}
      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>
          Продажи {YEAR}: прогноз и факт
        </div>
        <div style={{ fontSize: 12.5, color: "var(--color-text-secondary,#757987)", margin: "4px 0 12px" }}>
          Штриховая линия — прогноз (реалистичный сценарий), полоса вокруг неё —
          пессимистичный и оптимистичный. Сплошная линия — факт: сделки, закрытые в этом месяце.
        </div>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
          {yTicks.map((v) => (
            <g key={v}>
              <line
                x1={padL}
                x2={W - padR}
                y1={y(v)}
                y2={y(v)}
                stroke="var(--color-border-tertiary,#DFE3E8)"
                strokeDasharray="4,4"
                strokeWidth={0.5}
              />
              <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill="var(--color-text-tertiary,#9AA1AF)">
                {v}
              </text>
            </g>
          ))}

          {/* Зона, где встречи ещё не состоялись и смоделированы */}
          {firstForecast > 0 && (
            <>
              <rect
                x={x(firstForecast) - step / 2}
                y={padT}
                width={W - padR - (x(firstForecast) - step / 2)}
                height={innerH}
                fill="var(--color-background-secondary,#E8EBEE)"
                opacity={0.5}
              />
              <text
                x={W - padR}
                y={padT - 6}
                textAnchor="end"
                fontSize={9}
                fill="var(--color-text-secondary,#757987)"
                opacity={0.8}
              >
                прогноз встреч →
              </text>
            </>
          )}

          <path d={band} fill="var(--chart-area,rgba(86,214,127,.10))" stroke="none" />
          {/* Прогноз — штрих */}
          <path
            d={midLine}
            fill="none"
            stroke="var(--color-text-primary,#292B32)"
            strokeWidth={2.2}
            strokeDasharray="7,4"
          />
          {/* Факт — сплошная */}
          {factLine && <path d={factLine} fill="none" stroke={C_FACT} strokeWidth={2.6} />}

          {rows.map((r, i) => (
            <g key={r.key}>
              <circle
                cx={x(i)}
                cy={y(r.mid)}
                r={3.2}
                fill={KIND[r.kind].color}
                stroke="var(--color-background-primary,#fff)"
                strokeWidth={1.4}
              />
              <text
                x={x(i)}
                y={y(r.mid) - 9}
                textAnchor="middle"
                fontSize={9}
                fontWeight={600}
                fill="var(--color-text-primary,#292B32)"
              >
                {r.mid.toFixed(0)}
              </text>
              {r.closed != null && (
                <>
                  <circle
                    cx={x(i)}
                    cy={y(r.closed)}
                    r={3.8}
                    fill={C_FACT}
                    stroke="var(--color-background-primary,#fff)"
                    strokeWidth={1.4}
                    opacity={r.closedPartial ? 0.5 : 1}
                  />
                  <text
                    x={x(i)}
                    y={y(r.closed) + (r.closed >= r.mid ? -9 : 15)}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={700}
                    fill={C_FACT}
                    opacity={r.closedPartial ? 0.55 : 1}
                  >
                    {r.closed}
                  </text>
                </>
              )}
              <text
                x={x(i)}
                y={H - padB + 16}
                textAnchor="middle"
                fontSize={9}
                fill="var(--color-text-secondary,#757987)"
              >
                {fmL(r.key)}
              </text>
              <rect className="chart-hit" x={x(i) - step / 2} y={padT} width={step} height={innerH}>
                <title>
                  {[
                    `${fmL(r.key)} · ${KIND[r.kind].label}`,
                    `Встречи: ${r.hotM.toFixed(0)} гор + ${r.coldM.toFixed(0)} хол` +
                      (r.kind === "forecast" ? " (модель)" : ""),
                    "",
                    `Оптимистично: ${r.hi.toFixed(1)}`,
                    `Реалистично:  ${r.mid.toFixed(1)}`,
                    `Пессимистично: ${r.lo.toFixed(1)}`,
                    ...(r.closed == null
                      ? []
                      : [
                          "",
                          `Факт закрытий: ${r.closed}` +
                            (r.closedPartial ? " (месяц не закончился)" : ""),
                        ]),
                  ].join("\n")}
                </title>
              </rect>
            </g>
          ))}
        </svg>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8, fontSize: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--color-text-secondary,#757987)" }}>
            <span
              style={{
                width: 16,
                height: 0,
                borderTop: "2px dashed var(--color-text-primary,#292B32)",
              }}
            />
            прогноз, реалистично
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--color-text-secondary,#757987)" }}>
            <span style={{ width: 16, height: 3, borderRadius: 2, background: C_FACT }} />
            факт: закрыто в месяце
          </span>
          {Object.entries(KIND).map(([k, v]) => (
            <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--color-text-secondary,#757987)" }}>
              <span style={{ width: 9, height: 9, borderRadius: 999, background: v.color }} />
              {v.label}
            </span>
          ))}
        </div>
      </div>

      {/* Таблица */}
      <div style={card}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 720 }}>
            <thead>
              <tr>
                <th style={th2}>Месяц</th>
                <th style={th2}>Встречи</th>
                <th style={{ ...th2, textAlign: "center" }}>Гор.</th>
                <th style={{ ...th2, textAlign: "center" }}>Хол.</th>
                <th style={{ ...th2, textAlign: "center" }}>Пессим.</th>
                <th style={{ ...th2, textAlign: "center" }}>Реалист.</th>
                <th style={{ ...th2, textAlign: "center" }}>Оптим.</th>
                <th style={{ ...th2, textAlign: "center" }}>Факт закрытий</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td style={{ ...td2, fontWeight: 600, whiteSpace: "nowrap" }}>{fmL(r.key)}</td>
                  <td style={{ ...td2, whiteSpace: "nowrap" }}>
                    <span style={{ color: KIND[r.kind].color, fontWeight: 600, fontSize: 11.5 }}>
                      {KIND[r.kind].label}
                    </span>
                  </td>
                  <td style={{ ...td2, textAlign: "center", opacity: r.kind === "forecast" ? 0.65 : 1 }}>
                    {r.hotM.toFixed(0)}
                  </td>
                  <td style={{ ...td2, textAlign: "center", opacity: r.kind === "forecast" ? 0.65 : 1 }}>
                    {r.coldM.toFixed(0)}
                  </td>
                  <td style={{ ...td2, textAlign: "center", color: "var(--color-text-secondary,#757987)" }}>
                    {r.lo.toFixed(1)}
                  </td>
                  <td style={{ ...td2, textAlign: "center", fontWeight: 700 }}>{r.mid.toFixed(1)}</td>
                  <td style={{ ...td2, textAlign: "center", color: "var(--color-text-secondary,#757987)" }}>
                    {r.hi.toFixed(1)}
                  </td>
                  <td
                    style={{
                      ...td2,
                      textAlign: "center",
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      color: r.closed == null ? "var(--color-text-tertiary,#9AA1AF)" : C_FACT,
                      opacity: r.closedPartial ? 0.7 : 1,
                    }}
                  >
                    {r.closed == null ? "—" : r.closed}
                    {r.closedPartial && (
                      <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.85 }}>месяц не закончен</div>
                    )}
                  </td>
                </tr>
              ))}
              <tr style={{ background: "var(--color-background-secondary,#E8EBEE)" }}>
                <td style={{ ...td2, fontWeight: 700 }} colSpan={2}>
                  Итого {YEAR}
                </td>
                <td style={{ ...td2, textAlign: "center", fontWeight: 700 }}>
                  {rows.reduce((a, r) => a + r.hotM, 0).toFixed(0)}
                </td>
                <td style={{ ...td2, textAlign: "center", fontWeight: 700 }}>
                  {rows.reduce((a, r) => a + r.coldM, 0).toFixed(0)}
                </td>
                <td style={{ ...td2, textAlign: "center", fontWeight: 700 }}>{model.lo.toFixed(0)}</td>
                <td style={{ ...td2, textAlign: "center", fontWeight: 700 }}>{model.mid.toFixed(0)}</td>
                <td style={{ ...td2, textAlign: "center", fontWeight: 700 }}>{model.hi.toFixed(0)}</td>
                <td style={{ ...td2, textAlign: "center", fontWeight: 700, color: C_FACT }}>
                  {closes.ytd}
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 400,
                      color: "var(--color-text-secondary,#757987)",
                    }}
                  >
                    на сегодня
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: 11, color: "var(--color-text-secondary,#757987)", marginTop: 12, lineHeight: 1.6 }}>
          <b>Конверсия</b> берётся за 12 месяцев до последних шести — {fmL(M.base[0])}–
          {fmL(M.base[M.base.length - 1])}: там сделки успели дозреть, поэтому конверсия не
          занижена. Горячие {pct(conv.hot.p)}, холодные {pct(conv.cold.p)}.
          <br />
          <b>Встречи.</b> За последние {YOY_WINDOW} месяца ({fmL(M.recent[0])}–
          {fmL(M.recent[M.recent.length - 1])}) встреч стало{" "}
          {growth.hot.k >= 1 ? "больше" : "меньше"} год к году на{" "}
          {Math.abs((growth.hot.k - 1) * 100).toFixed(0)}% по горячим и{" "}
          {Math.abs((growth.cold.k - 1) * 100).toFixed(0)}% по холодным. Этот коэффициент
          применён к встречам того же месяца год назад: прогноз на месяц = встречи год назад ×
          рост. «Встречи прошли» — цифра фактическая, «прогноз встреч» — смоделированная.
          <br />
          <b>Диапазон</b> — 95% доверительный интервал конверсии базового года (интервал
          Вильсона), применённый к горячим и холодным отдельно. Неопределённость самого потока
          встреч в диапазон не заложена.
          <br />
          <b>Факт закрытий</b> — сделки по дате закрытия («Won time»). Месяц выгрузки показан
          бледным: он ещё идёт и цифра доберётся.
          <br />
          <b>Помесячно прогноз и факт сдвинуты друг относительно друга.</b> Прогноз отвечает на
          вопрос «сколько продаж принесут встречи этого месяца», а факт — «сколько сделок
          закрылось в этом месяце»; между встречей и закрытием проходит около {LAG} месяцев, и в
          факт попадают сделки со встреч прошлых месяцев и прошлого года. Сходятся эти две
          величины на длинной дистанции: годовой итог с годовым итогом, тренд с трендом. Читать
          разрыв в отдельном месяце как ошибку прогноза не стоит.
          <br />
          <b>Источник.</b> Прогноз — встречи и продажи по консультантам, те же данные, что в
          аналитике. Факт — выгрузка сделок из Pipedrive (стадия WON), период с янв {YEAR - 1}.
        </div>
      </div>
    </div>
  );
}
