import { card, th2, td2, kpiCard, kpiLabel, kpiValue } from "../utils/styles.js";
import { C_POS, C_NEG, C_WARN, TC } from "../constants.js";
import { gM, gS } from "../utils/convUtils.js";
import { actMo, fmL } from "../utils/dateUtils.js";
import { D } from "../data/consultants.js";

// ── Параметры модели ────────────────────────────────────────────────────────
const LAG = 3;          // месяцев дозревания сделки
const BASE_LEN = 12;    // длина базового окна для конверсии
const YOY_WINDOW = 3;   // по скольким последним месяцам считаем рост г/г
const Z = 1.96;         // 95% доверительный интервал

const MONTHS_ALL = actMo(D, "all");
const LAST = MONTHS_ALL[MONTHS_ALL.length - 1];
const YEAR = Number(LAST.slice(0, 4));

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

  // Последний дозревший месяц
  const lastMature = MONTHS_ALL[MONTHS_ALL.length - 1 - LAG];

  // Помесячно за год прогноза
  const rows = [];
  for (let i = 1; i <= 12; i++) {
    const key = `${YEAR}-${String(i).padStart(2, "0")}`;
    const known = MONTHS_ALL.includes(key);
    let hotM;
    let coldM;
    let kind;

    if (known) {
      hotM = agg([key], "hot").m;
      coldM = agg([key], "cold").m;
      kind = key <= lastMature ? "fact" : "maturing";
    } else {
      // Прогноз встреч: столько же, сколько год назад, с поправкой на рост
      const ly = prevYear(key);
      const hasLY = MONTHS_ALL.includes(ly);
      const fallback = (type) => agg(MONTHS_ALL.slice(-YOY_WINDOW), type).m / YOY_WINDOW;
      hotM = (hasLY ? agg([ly], "hot").m : fallback("hot")) * growth.hot.k;
      coldM = (hasLY ? agg([ly], "cold").m : fallback("cold")) * growth.cold.k;
      kind = "forecast";
    }

    let lo;
    let mid;
    let hi;
    if (kind === "fact") {
      // Месяц дозрел — берём факт продаж, без диапазона
      mid = agg([key], "all").s;
      lo = mid;
      hi = mid;
    } else {
      // Встречи известны или смоделированы — продажи считаем по конверсии базы
      mid = hotM * conv.hot.p + coldM * conv.cold.p;
      lo = hotM * conv.hot.lo + coldM * conv.cold.lo;
      hi = hotM * conv.hot.hi + coldM * conv.cold.hi;
    }
    rows.push({ key, kind, hotM, coldM, lo, mid, hi });
  }

  const total = rows.reduce(
    (a, r) => ({ lo: a.lo + r.lo, mid: a.mid + r.mid, hi: a.hi + r.hi }),
    { lo: 0, mid: 0, hi: 0 }
  );
  const booked = agg(
    MONTHS_ALL.filter((m) => m.startsWith(String(YEAR))),
    "all"
  ).s;

  return { base, conv, growth, recent, yearAgo, lastMature, rows, total, booked };
}

const KIND = {
  fact: { label: "факт", color: C_POS },
  maturing: { label: "дозревает", color: C_WARN },
  forecast: { label: "прогноз", color: TC.MS1 },
};

export default function ForecastYoY() {
  const M = buildModel();
  const { conv, growth, rows, total } = M;

  // ── График диапазонов ─────────────────────────────────────────────────────
  const W = 920;
  const H = 300;
  const padL = 40;
  const padR = 16;
  const padT = 22;
  const padB = 34;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const yMax = Math.max(25, Math.ceil(Math.max(...rows.map((r) => r.hi)) / 5) * 5);
  const x = (i) => padL + (innerW * i) / (rows.length - 1);
  const y = (v) => padT + innerH - (innerH * v) / yMax;
  const yTicks = [];
  for (let v = 0; v <= yMax; v += 5) yTicks.push(v);

  const band =
    "M" +
    rows.map((r, i) => `${x(i)},${y(r.hi)}`).join("L") +
    "L" +
    [...rows].reverse().map((r, i) => `${x(rows.length - 1 - i)},${y(r.lo)}`).join("L") +
    "Z";
  const midLine = "M" + rows.map((r, i) => `${x(i)},${y(r.mid)}`).join("L");
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
          <div style={kpiLabel}>Рост встреч год к году</div>
          <div style={kpiValue}>
            <span style={{ color: growth.hot.k >= 1 ? C_POS : C_NEG }}>
              {growth.hot.k >= 1 ? "+" : ""}
              {((growth.hot.k - 1) * 100).toFixed(0)}%
            </span>
            <span style={{ color: "var(--color-text-tertiary,#6B7787)", fontSize: 15 }}> / </span>
            <span style={{ color: growth.cold.k >= 1 ? C_POS : C_NEG }}>
              {growth.cold.k >= 1 ? "+" : ""}
              {((growth.cold.k - 1) * 100).toFixed(0)}%
            </span>
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary,#757987)" }}>
            горячие / холодные, {fmL(M.recent[0])}–{fmL(M.recent[M.recent.length - 1])} к году ранее
          </div>
        </div>
        <div style={{ ...kpiCard, borderColor: C_POS, borderWidth: 2 }}>
          <div style={kpiLabel}>Продажи {YEAR} — итог</div>
          <div style={kpiValue}>{total.mid.toFixed(0)}</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary,#757987)" }}>
            диапазон {total.lo.toFixed(0)} – {total.hi.toFixed(0)} · закрыто {M.booked}
          </div>
        </div>
      </div>

      {/* График диапазонов */}
      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>
          Продажи {YEAR} по месяцам
        </div>
        <div style={{ fontSize: 12.5, color: "var(--color-text-secondary,#757987)", margin: "4px 0 12px" }}>
          Полоса — диапазон при нижней и верхней границе конверсии, линия — центральная
          оценка. Продажи привязаны к месяцу встречи.
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

          {/* Зона прогноза */}
          {firstForecast > 0 && (
            <>
              <rect
                x={x(firstForecast) - (x(1) - x(0)) / 2}
                y={padT}
                width={W - padR - (x(firstForecast) - (x(1) - x(0)) / 2)}
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
          <path d={midLine} fill="none" stroke="var(--color-text-primary,#292B32)" strokeWidth={2.4} />

          {rows.map((r, i) => (
            <g key={r.key}>
              <circle
                cx={x(i)}
                cy={y(r.mid)}
                r={3.4}
                fill={r.kind === "fact" ? "var(--color-text-primary,#292B32)" : KIND[r.kind].color}
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
              <text
                x={x(i)}
                y={H - padB + 16}
                textAnchor="middle"
                fontSize={9}
                fill="var(--color-text-secondary,#757987)"
              >
                {fmL(r.key)}
              </text>
              <rect className="chart-hit" x={x(i) - (x(1) - x(0)) / 2} y={padT} width={x(1) - x(0)} height={innerH}>
                <title>
                  {`${fmL(r.key)} · ${KIND[r.kind].label}\n` +
                    `Встречи: ${r.hotM.toFixed(0)} гор + ${r.coldM.toFixed(0)} хол\n` +
                    (r.kind === "fact"
                      ? `Продажи: ${r.mid.toFixed(0)}`
                      : `Продажи: ${r.mid.toFixed(1)} (${r.lo.toFixed(1)} – ${r.hi.toFixed(1)})`)}
                </title>
              </rect>
            </g>
          ))}
        </svg>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8, fontSize: 12 }}>
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
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 620 }}>
            <thead>
              <tr>
                <th style={th2}>Месяц</th>
                <th style={th2}>Статус</th>
                <th style={{ ...th2, textAlign: "center" }}>Встречи гор.</th>
                <th style={{ ...th2, textAlign: "center" }}>Встречи хол.</th>
                <th style={{ ...th2, textAlign: "center" }}>Продажи</th>
                <th style={{ ...th2, textAlign: "center" }}>Диапазон</th>
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
                  <td style={{ ...td2, textAlign: "center" }}>{r.hotM.toFixed(0)}</td>
                  <td style={{ ...td2, textAlign: "center" }}>{r.coldM.toFixed(0)}</td>
                  <td style={{ ...td2, textAlign: "center", fontWeight: 700 }}>
                    {r.kind === "fact" ? r.mid.toFixed(0) : r.mid.toFixed(1)}
                  </td>
                  <td style={{ ...td2, textAlign: "center", color: "var(--color-text-secondary,#757987)", whiteSpace: "nowrap" }}>
                    {r.kind === "fact" ? "—" : `${r.lo.toFixed(1)} – ${r.hi.toFixed(1)}`}
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
                <td style={{ ...td2, textAlign: "center", fontWeight: 700 }}>{total.mid.toFixed(0)}</td>
                <td style={{ ...td2, textAlign: "center", fontWeight: 700, whiteSpace: "nowrap" }}>
                  {total.lo.toFixed(0)} – {total.hi.toFixed(0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: 11, color: "var(--color-text-secondary,#757987)", marginTop: 12, lineHeight: 1.6 }}>
          <b>Как считается.</b> Конверсия берётся за 12 месяцев до последних шести —{" "}
          {fmL(M.base[0])}–{fmL(M.base[M.base.length - 1])}: там сделки успели дозреть, поэтому
          конверсия не занижена. Горячие {pct(conv.hot.p)}, холодные {pct(conv.cold.p)}.
          <br />
          <b>Встречи.</b> За последние {YOY_WINDOW} месяца ({fmL(M.recent[0])}–
          {fmL(M.recent[M.recent.length - 1])}) встреч стало{" "}
          {growth.hot.k >= 1 ? "больше" : "меньше"} год к году на{" "}
          {Math.abs((growth.hot.k - 1) * 100).toFixed(0)}% по горячим и{" "}
          {Math.abs((growth.cold.k - 1) * 100).toFixed(0)}% по холодным. Этот коэффициент
          применён к встречам того же месяца год назад: прогноз на месяц = встречи год назад ×
          рост.
          <br />
          <b>Статусы.</b> «Факт» — месяц дозрел (до {fmL(M.lastMature)} включительно), взяты
          реальные продажи. «Дозревает» — встречи уже известны, но сделки ещё закрываются,
          поэтому продажи считаются по конверсии, а не по факту. «Прогноз» — встречи
          смоделированы.
          <br />
          <b>Диапазон</b> — 95% доверительный интервал конверсии базового года (интервал
          Вильсона), применённый к горячим и холодным отдельно. Неопределённость самого потока
          встреч в диапазон не заложена.
          <br />
          <b>Источник.</b> Встречи и продажи по консультантам (те же данные, что в аналитике),
          чтобы конверсия и объём считались по одной и той же выборке.
        </div>
      </div>
    </div>
  );
}
