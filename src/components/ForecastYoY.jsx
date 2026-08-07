import { card, th2, td2, kpiCard, kpiLabel, kpiValue } from "../utils/styles.js";
import { C_POS, C_NEG } from "../constants.js";
import { gM, gS } from "../utils/convUtils.js";
import { actMo, fmL } from "../utils/dateUtils.js";
import { D } from "../data/consultants.js";
import {
  SF_MONTHS,
  WON_BY_MONTH,
  WIN_LAG,
  WIN_LAG_META,
  CLOSE_OBS_MONTH,
} from "../data/salesFact.js";

// ── Параметры модели ────────────────────────────────────────────────────────
const MIN_MATURITY_AGE = 6; // с какого возраста когорта считается дозревшей для базы конверсии
const YOY_WINDOW = 3;       // по скольким последним месяцам считаем рост встреч г/г
const Z = 1.96;             // 95% доверительный интервал

const C_FACT = "#14B8A6"; // факт: закрытые сделки

const MONTHS_ALL = actMo(D, "all");
const LAST_MEETING_MONTH = MONTHS_ALL[MONTHS_ALL.length - 1];
const YEAR = Number(LAST_MEETING_MONTH.slice(0, 4));

const CLOSED = Object.fromEntries(WON_BY_MONTH.map((r) => [r.month, r.won]));

// Накопленная доля закрытий: сколько сделок когорты закроется за k месяцев
const LAG_CUM = WIN_LAG.map((_, i) => WIN_LAG.slice(0, i + 1).reduce((a, b) => a + b, 0));

// ── Календарные хелперы ─────────────────────────────────────────────────────
const monthDiff = (a, b) =>
  (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5)) - Number(a.slice(5)));

const shift = (m, k) => {
  let y = Number(m.slice(0, 4));
  let mo = Number(m.slice(5)) - k;
  while (mo < 1) {
    mo += 12;
    y -= 1;
  }
  while (mo > 12) {
    mo -= 12;
    y += 1;
  }
  return `${y}-${String(mo).padStart(2, "0")}`;
};

const prevYear = (m) => shift(m, 12);
const pct = (v) => `${(v * 100).toFixed(1)}%`;
const signed = (v, digits = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}`;

// Какая доля сделок когорты месяца m уже успела закрыться к моменту выгрузки
function maturity(m) {
  const age = monthDiff(m, CLOSE_OBS_MONTH);
  if (age < 0) return 0;
  return age >= LAG_CUM.length ? 1 : LAG_CUM[age];
}

// Встречи/продажи за месяц по срезу
function agg(monthKey, type) {
  let m = 0;
  let s = 0;
  for (const d of D) {
    m += gM(d, monthKey, type);
    s += gS(d, monthKey, type);
  }
  return { m, s };
}

function wilson(successes, n) {
  if (!n) return { p: 0, lo: 0, hi: 0 };
  const p = successes / n;
  const denom = 1 + (Z * Z) / n;
  const centre = (p + (Z * Z) / (2 * n)) / denom;
  const margin = (Z * Math.sqrt((p * (1 - p)) / n + (Z * Z) / (4 * n * n))) / denom;
  return { p, lo: Math.max(0, centre - margin), hi: centre + margin };
}

// ── Модель ──────────────────────────────────────────────────────────────────
// Продажи месяца T = сумма по прошлым месяцам M: встречи(M) × конверсия ×
// доля сделок, закрывающихся ровно через (T − M) месяцев.
function buildModel() {
  // 1. Конверсия. Берём когорты, успевшие дозреть, и всё равно правим на
  //    остаточную незрелость: наблюдаемые продажи / зрелость когорты.
  const base = MONTHS_ALL.filter((m) => monthDiff(m, CLOSE_OBS_MONTH) >= MIN_MATURITY_AGE);
  const convOf = (type) => {
    let meetings = 0;
    let sales = 0;
    for (const m of base) {
      const a = agg(m, type);
      meetings += a.m;
      sales += a.s / maturity(m);
    }
    return wilson(sales, meetings);
  };
  const conv = { hot: convOf("hot"), cold: convOf("cold") };

  // 2. Рост встреч год к году — им продлеваем поток встреч в будущее
  const recent = MONTHS_ALL.slice(-YOY_WINDOW);
  const growthOf = (type) => {
    const now = recent.reduce((a, m) => a + agg(m, type).m, 0);
    const before = recent.reduce((a, m) => a + agg(prevYear(m), type).m, 0);
    return { now, before, k: before ? now / before : 1 };
  };
  const growth = { hot: growthOf("hot"), cold: growthOf("cold") };

  // 3. Поток встреч: факт там, где месяц прошёл, иначе год назад × рост
  const meetingsOf = (m, type) => {
    if (MONTHS_ALL.includes(m)) return { n: agg(m, type).m, known: true };
    const ly = prevYear(m);
    const fallback = recent.reduce((a, k) => a + agg(k, type).m, 0) / YOY_WINDOW;
    const baseN = MONTHS_ALL.includes(ly) ? agg(ly, type).m : fallback;
    return { n: baseN * growth[type].k, known: false };
  };

  // 4. Свёртка: продажи месяца T
  const closesOf = (T) => {
    const out = { lo: 0, mid: 0, hi: 0, ready: 0, fromKnown: 0, fromModel: 0 };
    WIN_LAG.forEach((w, k) => {
      const m = shift(T, k);
      const hot = meetingsOf(m, "hot");
      const cold = meetingsOf(m, "cold");
      out.lo += w * (hot.n * conv.hot.lo + cold.n * conv.cold.lo);
      out.mid += w * (hot.n * conv.hot.p + cold.n * conv.cold.p);
      out.hi += w * (hot.n * conv.hot.hi + cold.n * conv.cold.hi);
      const part = w * (hot.n * conv.hot.p + cold.n * conv.cold.p);
      if (hot.known) {
        out.ready += w;
        out.fromKnown += part;
      } else {
        out.fromModel += part;
      }
    });
    return out;
  };

  const rows = [];
  for (let i = 1; i <= 12; i++) {
    const key = `${YEAR}-${String(i).padStart(2, "0")}`;
    const c = closesOf(key);
    rows.push({
      key,
      ...c,
      closed: key in CLOSED ? CLOSED[key] : null,
      // месяц выгрузки ещё идёт, его факт неполный
      partial: key === CLOSE_OBS_MONTH,
      // месяц завершён: факт финальный
      done: key in CLOSED && key !== CLOSE_OBS_MONTH,
    });
  }

  const model = rows.reduce(
    (a, r) => ({ lo: a.lo + r.lo, mid: a.mid + r.mid, hi: a.hi + r.hi }),
    { lo: 0, mid: 0, hi: 0 }
  );

  // Ожидание по году: факт за завершённые месяцы + модель за остальные.
  // Обе части на одной оси — месяц закрытия сделки, поэтому складываются.
  const expected = rows.reduce(
    (a, r) =>
      r.done
        ? { lo: a.lo + r.closed, mid: a.mid + r.closed, hi: a.hi + r.closed }
        : { lo: a.lo + r.lo, mid: a.mid + r.mid, hi: a.hi + r.hi },
    { lo: 0, mid: 0, hi: 0 }
  );

  // Сверка модели с фактом на завершённых месяцах года
  const done = rows.filter((r) => r.done);
  const check = {
    from: done[0]?.key,
    to: done[done.length - 1]?.key,
    fact: done.reduce((a, r) => a + r.closed, 0),
    model: done.reduce((a, r) => a + r.mid, 0),
  };
  check.devPct = check.model ? check.fact / check.model - 1 : 0;

  // Закрытия год к году по завершённым месяцам
  const doneKeys = done.map((r) => r.key);
  const sumClosed = (ms) => ms.reduce((a, m) => a + (CLOSED[m] || 0), 0);
  const closes = {
    ytd: sumClosed(SF_MONTHS.filter((m) => m.startsWith(String(YEAR)))),
    full: sumClosed(doneKeys),
    fullPrev: sumClosed(doneKeys.map(prevYear)),
    prevYearTotal: sumClosed(SF_MONTHS.filter((m) => m.startsWith(String(YEAR - 1)))),
    from: doneKeys[0],
    to: doneKeys[doneKeys.length - 1],
  };
  closes.k = closes.fullPrev ? closes.full / closes.fullPrev : 1;

  return { base, conv, growth, recent, rows, model, expected, check, closes };
}

export default function ForecastYoY() {
  const M = buildModel();
  const { conv, growth, rows, model, expected, check, closes } = M;

  // ── График ────────────────────────────────────────────────────────────────
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
  // с какого месяца часть встреч уже смоделирована
  const firstPartial = rows.findIndex((r) => r.ready < 0.999);

  return (
    <div>
      {/* Сводка модели */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(196px, 1fr))",
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
          <div style={kpiLabel}>Цикл сделки</div>
          <div style={kpiValue}>{WIN_LAG_META.meanMonths.toFixed(1)} мес</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary,#757987)" }}>
            медиана {WIN_LAG_META.medianMonths} · {(WIN_LAG_META.closedBy6 * 100).toFixed(0)}%
            закрывается за 6 мес
          </div>
        </div>
        <div style={kpiCard}>
          <div style={kpiLabel}>Закрыто в {YEAR}</div>
          <div style={{ ...kpiValue, color: C_FACT }}>{closes.ytd}</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary,#757987)" }}>
            {fmL(closes.from)}–{fmL(closes.to)}: {closes.full} против {closes.fullPrev} год назад{" "}
            <span style={{ color: closes.k >= 1 ? C_POS : C_NEG, fontWeight: 600 }}>
              ({signed((closes.k - 1) * 100, 0)}%)
            </span>
          </div>
        </div>
        <div style={{ ...kpiCard, borderColor: C_POS, borderWidth: 2 }}>
          <div style={kpiLabel}>Продажи {YEAR} — итог</div>
          <div style={kpiValue}>{expected.mid.toFixed(0)}</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary,#757987)" }}>
            диапазон {expected.lo.toFixed(0)} – {expected.hi.toFixed(0)} · в {YEAR - 1} закрыто{" "}
            {closes.prevYearTotal}
          </div>
        </div>
      </div>

      {/* График */}
      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>
          Продажи {YEAR} по месяцам закрытия
        </div>
        <div style={{ fontSize: 12.5, color: "var(--color-text-secondary,#757987)", margin: "4px 0 12px" }}>
          Штриховая линия — прогноз: сколько сделок закроется в этом месяце по встречам
          предыдущих месяцев, конверсии и циклу сделки. Полоса — пессимистичный и оптимистичный
          сценарий. Сплошная линия — факт закрытий.
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

          {/* Зона, где часть встреч ещё не состоялась */}
          {firstPartial > 0 && (
            <>
              <rect
                x={x(firstPartial) - step / 2}
                y={padT}
                width={W - padR - (x(firstPartial) - step / 2)}
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
                часть встреч ещё не состоялась →
              </text>
            </>
          )}

          <path d={band} fill="var(--chart-area,rgba(86,214,127,.10))" stroke="none" />
          <path
            d={midLine}
            fill="none"
            stroke="var(--color-text-primary,#292B32)"
            strokeWidth={2.2}
            strokeDasharray="7,4"
          />
          {factLine && <path d={factLine} fill="none" stroke={C_FACT} strokeWidth={2.6} />}

          {rows.map((r, i) => (
            <g key={r.key}>
              <circle
                cx={x(i)}
                cy={y(r.mid)}
                r={3.2}
                fill="var(--color-text-primary,#292B32)"
                stroke="var(--color-background-primary,#fff)"
                strokeWidth={1.4}
                opacity={r.ready < 0.999 ? 0.55 : 1}
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
                    opacity={r.partial ? 0.5 : 1}
                  />
                  <text
                    x={x(i)}
                    y={y(r.closed) + (r.closed >= r.mid ? -9 : 15)}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={700}
                    fill={C_FACT}
                    opacity={r.partial ? 0.55 : 1}
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
                    fmL(r.key),
                    `Оптимистично: ${r.hi.toFixed(1)}`,
                    `Реалистично:  ${r.mid.toFixed(1)}`,
                    `Пессимистично: ${r.lo.toFixed(1)}`,
                    "",
                    `Из встреч, которые уже прошли: ${(r.ready * 100).toFixed(0)}% прогноза` +
                      (r.ready < 0.999 ? ` (${r.fromKnown.toFixed(1)} из ${r.mid.toFixed(1)})` : ""),
                    ...(r.closed == null
                      ? []
                      : [
                          "",
                          `Факт закрытий: ${r.closed}` +
                            (r.partial ? " (месяц не закончился)" : ` (${signed(r.closed - r.mid)})`),
                        ]),
                  ].join("\n")}
                </title>
              </rect>
            </g>
          ))}
        </svg>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8, fontSize: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--color-text-secondary,#757987)" }}>
            <span style={{ width: 16, height: 0, borderTop: "2px dashed var(--color-text-primary,#292B32)" }} />
            прогноз, реалистично
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--color-text-secondary,#757987)" }}>
            <span style={{ width: 16, height: 3, borderRadius: 2, background: C_FACT }} />
            факт закрытий
          </span>
        </div>
      </div>

      {/* Таблица */}
      <div style={card}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 720 }}>
            <thead>
              <tr>
                <th style={th2}>Месяц</th>
                <th style={{ ...th2, textAlign: "center" }}>Пессим.</th>
                <th style={{ ...th2, textAlign: "center" }}>Реалист.</th>
                <th style={{ ...th2, textAlign: "center" }}>Оптим.</th>
                <th style={{ ...th2, textAlign: "center" }}>Обеспечено прошедшими встречами</th>
                <th style={{ ...th2, textAlign: "center" }}>Факт закрытий</th>
                <th style={{ ...th2, textAlign: "center" }}>Откл.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td style={{ ...td2, fontWeight: 600, whiteSpace: "nowrap" }}>{fmL(r.key)}</td>
                  <td style={{ ...td2, textAlign: "center", color: "var(--color-text-secondary,#757987)" }}>
                    {r.lo.toFixed(1)}
                  </td>
                  <td style={{ ...td2, textAlign: "center", fontWeight: 700 }}>{r.mid.toFixed(1)}</td>
                  <td style={{ ...td2, textAlign: "center", color: "var(--color-text-secondary,#757987)" }}>
                    {r.hi.toFixed(1)}
                  </td>
                  <td style={{ ...td2, textAlign: "center" }}>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        color:
                          r.ready > 0.999
                            ? C_POS
                            : "var(--color-text-secondary,#757987)",
                        fontWeight: r.ready > 0.999 ? 600 : 400,
                      }}
                    >
                      <span
                        style={{
                          width: 40,
                          height: 5,
                          borderRadius: 3,
                          background: "var(--color-border-tertiary,#DFE3E8)",
                          overflow: "hidden",
                          display: "inline-block",
                        }}
                      >
                        <span
                          style={{
                            display: "block",
                            width: `${r.ready * 100}%`,
                            height: "100%",
                            background: r.ready > 0.999 ? C_POS : "var(--color-text-tertiary,#9AA1AF)",
                          }}
                        />
                      </span>
                      {(r.ready * 100).toFixed(0)}%
                    </div>
                  </td>
                  <td
                    style={{
                      ...td2,
                      textAlign: "center",
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      color: r.closed == null ? "var(--color-text-tertiary,#9AA1AF)" : C_FACT,
                      opacity: r.partial ? 0.7 : 1,
                    }}
                  >
                    {r.closed == null ? "—" : r.closed}
                    {r.partial && (
                      <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.85 }}>месяц идёт</div>
                    )}
                  </td>
                  <td
                    style={{
                      ...td2,
                      textAlign: "center",
                      whiteSpace: "nowrap",
                      fontWeight: 600,
                      color: !r.done
                        ? "var(--color-text-tertiary,#9AA1AF)"
                        : r.closed >= r.mid
                          ? C_POS
                          : C_NEG,
                    }}
                  >
                    {r.done ? signed(r.closed - r.mid) : "—"}
                  </td>
                </tr>
              ))}
              <tr style={{ background: "var(--color-background-secondary,#E8EBEE)" }}>
                <td style={{ ...td2, fontWeight: 700 }}>Модель {YEAR}</td>
                <td style={{ ...td2, textAlign: "center", fontWeight: 700 }}>{model.lo.toFixed(0)}</td>
                <td style={{ ...td2, textAlign: "center", fontWeight: 700 }}>{model.mid.toFixed(0)}</td>
                <td style={{ ...td2, textAlign: "center", fontWeight: 700 }}>{model.hi.toFixed(0)}</td>
                <td style={{ ...td2 }} />
                <td style={{ ...td2, textAlign: "center", fontWeight: 700, color: C_FACT }}>
                  {closes.ytd}
                  <div style={{ fontSize: 10, fontWeight: 400, color: "var(--color-text-secondary,#757987)" }}>
                    на сегодня
                  </div>
                </td>
                <td style={{ ...td2 }} />
              </tr>
              <tr style={{ background: "var(--color-background-secondary,#E8EBEE)" }}>
                <td style={{ ...td2, fontWeight: 700, whiteSpace: "nowrap" }}>
                  Ожидание: факт по {fmL(check.to)} + модель
                </td>
                <td style={{ ...td2, textAlign: "center", fontWeight: 700 }}>{expected.lo.toFixed(0)}</td>
                <td style={{ ...td2, textAlign: "center", fontWeight: 700 }}>{expected.mid.toFixed(0)}</td>
                <td style={{ ...td2, textAlign: "center", fontWeight: 700 }}>{expected.hi.toFixed(0)}</td>
                <td style={{ ...td2 }} colSpan={3} />
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: 11, color: "var(--color-text-secondary,#757987)", marginTop: 12, lineHeight: 1.6 }}>
          <b>Как считается прогноз на месяц.</b> Продажи месяца T = сумма по всем предыдущим
          месяцам M: встречи(M) × конверсия × доля сделок, закрывающихся ровно через (T − M)
          месяцев. То есть месяц наполняется сделками со встреч, которые прошли раньше, а не
          своими собственными.
          <br />
          <b>Цикл сделки.</b> Распределение лага «первая встреча → закрытие» посчитано по{" "}
          {WIN_LAG_META.deals} закрытым сделкам, созданным достаточно давно, чтобы почти все
          успели дозреть. Средний цикл {WIN_LAG_META.meanMonths.toFixed(1)} мес, медиана{" "}
          {WIN_LAG_META.medianMonths},{" "}
          {(WIN_LAG_META.closedBy6 * 100).toFixed(0)}% закрывается за 6 месяцев. По месяцам:{" "}
          {WIN_LAG.map((w, k) => `${k} мес — ${(w * 100).toFixed(0)}%`).join(", ")}. Дата
          создания сделки взята как прокси даты первичной встречи: на сделках, где известны обе,
          расхождение медианно 0.4 месяца.
          <br />
          <b>Конверсия</b> считается по когортам возрастом от {MIN_MATURITY_AGE} месяцев (
          {fmL(M.base[0])}–{fmL(M.base[M.base.length - 1])}) и дополнительно правится на
          остаточную незрелость: наблюдаемые продажи делятся на долю сделок, успевших закрыться
          к дате выгрузки. Без этой поправки конверсия занижается, а с ней — горячие{" "}
          {pct(conv.hot.p)}, холодные {pct(conv.cold.p)}.
          <br />
          <b>Встречи.</b> До {fmL(LAST_MEETING_MONTH)} включительно — факт. Дальше: встречи того
          же месяца год назад × рост за последние {YOY_WINDOW} месяца ({fmL(M.recent[0])}–
          {fmL(M.recent[M.recent.length - 1])}: горячие{" "}
          {signed((growth.hot.k - 1) * 100, 0)}%, холодные {signed((growth.cold.k - 1) * 100, 0)}
          %).
          <br />
          <b>Колонка «обеспечено прошедшими встречами»</b> показывает, какая доля прогноза месяца
          опирается на встречи, которые уже состоялись. У ближайших месяцев она близка к 100% —
          там прогноз почти детерминирован; к декабрю падает до{" "}
          {(rows[11].ready * 100).toFixed(0)}%, потому что декабрьские закрытия придут в основном
          со встреч, которых ещё не было.
          <br />
          <b>Проверка на факте.</b> За {fmL(check.from)}–{fmL(check.to)} модель дала{" "}
          {check.model.toFixed(0)} продаж, фактически закрылось {check.fact} — факт выше модели
          на {Math.abs(check.devPct * 100).toFixed(0)}%. На {YEAR - 1} расхождения нет, так что
          это скорее удачное полугодие, чем систематический сдвиг, но прогноз на остаток года
          стоит читать как нижнюю границу. Помесячные отклонения ещё больше: сделки приходят
          рывками, а свёртка по определению даёт гладкую линию.
          <br />
          <b>Диапазон</b> — 95% доверительный интервал конверсии (интервал Вильсона), отдельно по
          горячим и холодным. Неопределённость потока встреч и самого цикла сделки в него не
          заложена, поэтому реальный разброс шире нарисованного.
          <br />
          <b>Источник.</b> Встречи — отчёты по консультантам, те же, что в аналитике. Закрытия и
          цикл сделки — выгрузка сделок из Pipedrive (стадия WON, поля «Won time» и «Deal created»).
        </div>
      </div>
    </div>
  );
}
