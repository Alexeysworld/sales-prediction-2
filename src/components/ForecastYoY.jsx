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

// Цвет линии факта — отдельный от зелёного «дозрел», чтобы не путать статус со значением
const C_FACT = "#D76BFE";

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

  // Последний дозревший месяц: у сделок было >= LAG месяцев, чтобы закрыться
  const lastMature = MONTHS_ALL[MONTHS_ALL.length - 1 - LAG];

  // Помесячно за год прогноза
  const rows = [];
  for (let i = 1; i <= 12; i++) {
    const key = `${YEAR}-${String(i).padStart(2, "0")}`;
    const known = MONTHS_ALL.includes(key);
    let hotM;
    let coldM;
    let kind;
    let mSource; // откуда взяты встречи: факт или модель

    if (known) {
      hotM = agg([key], "hot").m;
      coldM = agg([key], "cold").m;
      mSource = "fact";
      kind = key <= lastMature ? "closed" : "maturing";
    } else {
      // Прогноз встреч: столько же, сколько год назад, с поправкой на рост
      const ly = prevYear(key);
      const hasLY = MONTHS_ALL.includes(ly);
      const fallback = (type) => agg(MONTHS_ALL.slice(-YOY_WINDOW), type).m / YOY_WINDOW;
      hotM = (hasLY ? agg([ly], "hot").m : fallback("hot")) * growth.hot.k;
      coldM = (hasLY ? agg([ly], "cold").m : fallback("cold")) * growth.cold.k;
      mSource = "model";
      kind = "forecast";
    }

    // Модель считается ВСЕГДА — в том числе для месяцев, где факт уже известен.
    // Только так видно, насколько факт отклоняется от модели.
    const mid = hotM * conv.hot.p + coldM * conv.cold.p;
    const lo = hotM * conv.hot.lo + coldM * conv.cold.lo;
    const hi = hotM * conv.hot.hi + coldM * conv.cold.hi;

    // Факт продаж (для месяцев со статусом «дозревает» он ещё неполный)
    const fact = known ? agg([key], "all").s : null;
    const dev = fact == null ? null : fact - mid;
    const devPct = fact == null || !mid ? null : (fact - mid) / mid;

    rows.push({ key, kind, mSource, hotM, coldM, lo, mid, hi, fact, dev, devPct });
  }

  // Чистая модель за год
  const model = rows.reduce(
    (a, r) => ({ lo: a.lo + r.lo, mid: a.mid + r.mid, hi: a.hi + r.hi }),
    { lo: 0, mid: 0, hi: 0 }
  );
  // Ожидание: факт там, где месяц дозрел, модель — дальше
  const expected = rows.reduce(
    (a, r) => {
      if (r.kind === "closed") return { lo: a.lo + r.fact, mid: a.mid + r.fact, hi: a.hi + r.fact };
      return { lo: a.lo + r.lo, mid: a.mid + r.mid, hi: a.hi + r.hi };
    },
    { lo: 0, mid: 0, hi: 0 }
  );

  // Проверка модели на дозревших месяцах текущего года
  const closed = rows.filter((r) => r.kind === "closed");
  const check = {
    n: closed.length,
    fact: closed.reduce((a, r) => a + r.fact, 0),
    model: closed.reduce((a, r) => a + r.mid, 0),
  };
  check.dev = check.fact - check.model;
  check.devPct = check.model ? check.dev / check.model : 0;

  const booked = agg(
    MONTHS_ALL.filter((m) => m.startsWith(String(YEAR))),
    "all"
  ).s;

  return {
    base,
    conv,
    growth,
    recent,
    yearAgo,
    lastMature,
    rows,
    model,
    expected,
    check,
    booked,
  };
}

const KIND = {
  closed: { label: "дозрел", color: C_POS, hint: "сделки закрылись, факт финальный" },
  maturing: { label: "дозревает", color: C_WARN, hint: "встречи известны, часть сделок ещё в работе" },
  forecast: { label: "прогноз", color: TC.MS1, hint: "встречи смоделированы по динамике г/г" },
};

export default function ForecastYoY() {
  const M = buildModel();
  const { conv, growth, rows, model, expected, check } = M;

  // ── График: модель (диапазон + реалистичная линия) и факт ────────────────
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
    Math.ceil(Math.max(...rows.map((r) => Math.max(r.hi, r.fact ?? 0))) / 5) * 5
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
  const factRows = rows.filter((r) => r.fact != null);
  const factLine =
    factRows.length > 1
      ? "M" + rows.map((r, i) => (r.fact == null ? null : `${x(i)},${y(r.fact)}`)).filter(Boolean).join("L")
      : "";
  const firstForecast = rows.findIndex((r) => r.kind === "forecast");
  const firstMaturing = rows.findIndex((r) => r.kind === "maturing");

  const devColor = (r) => {
    if (r.dev == null) return "var(--color-text-secondary,#757987)";
    // На недозревших месяцах отставание от модели — норма, не промах
    if (r.kind === "maturing") return "var(--color-text-secondary,#757987)";
    return r.dev >= 0 ? C_POS : C_NEG;
  };

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
          <div style={kpiLabel}>Модель против факта</div>
          <div style={{ ...kpiValue, color: check.dev >= 0 ? C_POS : C_NEG }}>
            {signed(check.devPct * 100, 1)}%
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary,#757987)" }}>
            дозревшие {fmL(`${YEAR}-01`)}–{fmL(M.lastMature)}: факт {check.fact} против модели{" "}
            {check.model.toFixed(1)} ({signed(check.dev)})
          </div>
        </div>
        <div style={{ ...kpiCard, borderColor: C_POS, borderWidth: 2 }}>
          <div style={kpiLabel}>Продажи {YEAR} — итог</div>
          <div style={kpiValue}>{expected.mid.toFixed(0)}</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary,#757987)" }}>
            диапазон {expected.lo.toFixed(0)} – {expected.hi.toFixed(0)} · закрыто {M.booked}
          </div>
        </div>
      </div>

      {/* График */}
      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>
          Продажи {YEAR}: модель и факт
        </div>
        <div style={{ fontSize: 12.5, color: "var(--color-text-secondary,#757987)", margin: "4px 0 12px" }}>
          Полоса — пессимистичный и оптимистичный сценарий, чёрная линия — реалистичный.
          Пунктирная сиреневая линия — фактические продажи. Продажи привязаны к месяцу встречи.
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

          {/* Зона недозревших месяцев */}
          {firstMaturing > 0 && (
            <>
              <rect
                x={x(firstMaturing) - step / 2}
                y={padT}
                width={W - padR - (x(firstMaturing) - step / 2)}
                height={innerH}
                fill="var(--color-background-secondary,#E8EBEE)"
                opacity={0.35}
              />
              <text
                x={x(firstMaturing) - step / 2 + 6}
                y={padT - 6}
                fontSize={9}
                fill="var(--color-text-secondary,#757987)"
                opacity={0.8}
              >
                факт ещё неполный →
              </text>
            </>
          )}
          {/* Зона прогноза встреч */}
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
          <path d={midLine} fill="none" stroke="var(--color-text-primary,#292B32)" strokeWidth={2.4} />

          {/* Факт */}
          {factLine && (
            <path d={factLine} fill="none" stroke={C_FACT} strokeWidth={2.2} strokeDasharray="6,3" />
          )}

          {rows.map((r, i) => (
            <g key={r.key}>
              <circle
                cx={x(i)}
                cy={y(r.mid)}
                r={3.4}
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
              {r.fact != null && (
                <>
                  <circle
                    cx={x(i)}
                    cy={y(r.fact)}
                    r={3.4}
                    fill={C_FACT}
                    stroke="var(--color-background-primary,#fff)"
                    strokeWidth={1.4}
                  />
                  <text
                    x={x(i)}
                    y={y(r.fact) + (r.fact >= r.mid ? -9 : 15)}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={700}
                    fill={C_FACT}
                  >
                    {r.fact}
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
                      (r.mSource === "model" ? " (модель)" : ""),
                    "",
                    `Оптимистично: ${r.hi.toFixed(1)}`,
                    `Реалистично:  ${r.mid.toFixed(1)}`,
                    `Пессимистично: ${r.lo.toFixed(1)}`,
                    ...(r.fact == null
                      ? []
                      : [
                          "",
                          `Факт: ${r.fact} (${signed(r.dev)} к реалистичному, ${signed(
                            r.devPct * 100,
                            0
                          )}%)`,
                          ...(r.kind === "maturing"
                            ? ["Часть сделок ещё в работе — факт вырастет"]
                            : []),
                        ]),
                  ].join("\n")}
                </title>
              </rect>
            </g>
          ))}
        </svg>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8, fontSize: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--color-text-secondary,#757987)" }}>
            <span style={{ width: 16, height: 3, borderRadius: 2, background: "var(--color-text-primary,#292B32)" }} />
            модель, реалистично
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--color-text-secondary,#757987)" }}>
            <span style={{ width: 16, height: 0, borderTop: `2px dashed ${C_FACT}` }} />
            факт
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
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
            <thead>
              <tr>
                <th style={th2}>Месяц</th>
                <th style={th2}>Статус</th>
                <th style={{ ...th2, textAlign: "center" }}>Встречи гор.</th>
                <th style={{ ...th2, textAlign: "center" }}>Встречи хол.</th>
                <th style={{ ...th2, textAlign: "center" }}>Пессим.</th>
                <th style={{ ...th2, textAlign: "center" }}>Реалист.</th>
                <th style={{ ...th2, textAlign: "center" }}>Оптим.</th>
                <th style={{ ...th2, textAlign: "center" }}>Факт</th>
                <th style={{ ...th2, textAlign: "center" }}>Откл. от модели</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td style={{ ...td2, fontWeight: 600, whiteSpace: "nowrap" }}>{fmL(r.key)}</td>
                  <td style={{ ...td2, whiteSpace: "nowrap" }}>
                    <span
                      style={{ color: KIND[r.kind].color, fontWeight: 600, fontSize: 11.5 }}
                      title={KIND[r.kind].hint}
                    >
                      {KIND[r.kind].label}
                    </span>
                  </td>
                  <td style={{ ...td2, textAlign: "center", opacity: r.mSource === "model" ? 0.65 : 1 }}>
                    {r.hotM.toFixed(0)}
                  </td>
                  <td style={{ ...td2, textAlign: "center", opacity: r.mSource === "model" ? 0.65 : 1 }}>
                    {r.coldM.toFixed(0)}
                  </td>
                  <td style={{ ...td2, textAlign: "center", color: "var(--color-text-secondary,#757987)" }}>
                    {r.lo.toFixed(1)}
                  </td>
                  <td style={{ ...td2, textAlign: "center", fontWeight: 700 }}>{r.mid.toFixed(1)}</td>
                  <td style={{ ...td2, textAlign: "center", color: "var(--color-text-secondary,#757987)" }}>
                    {r.hi.toFixed(1)}
                  </td>
                  <td style={{ ...td2, textAlign: "center", fontWeight: 700, color: r.fact == null ? "var(--color-text-tertiary,#9AA1AF)" : C_FACT }}>
                    {r.fact == null ? "—" : r.fact}
                  </td>
                  <td style={{ ...td2, textAlign: "center", whiteSpace: "nowrap", color: devColor(r) }}>
                    {r.dev == null ? (
                      "—"
                    ) : (
                      <>
                        <span style={{ fontWeight: 600 }}>{signed(r.dev)}</span>
                        <span style={{ fontSize: 11, opacity: 0.85 }}> · {signed(r.devPct * 100, 0)}%</span>
                        {r.kind === "maturing" && (
                          <div style={{ fontSize: 10, opacity: 0.8 }}>ещё дозревает</div>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
              <tr style={{ background: "var(--color-background-secondary,#E8EBEE)" }}>
                <td style={{ ...td2, fontWeight: 700 }} colSpan={2}>
                  Модель {YEAR}
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
                <td style={{ ...td2, textAlign: "center", fontWeight: 700, color: C_FACT }}>{M.booked}</td>
                <td
                  style={{
                    ...td2,
                    textAlign: "center",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    color: "var(--color-text-secondary,#757987)",
                  }}
                >
                  закрыто на сегодня
                </td>
              </tr>
              <tr style={{ background: "var(--color-background-secondary,#E8EBEE)" }}>
                <td style={{ ...td2, fontWeight: 700 }} colSpan={4}>
                  Ожидание по году: факт до {fmL(M.lastMature)} + модель дальше
                </td>
                <td style={{ ...td2, textAlign: "center", fontWeight: 700 }}>{expected.lo.toFixed(0)}</td>
                <td style={{ ...td2, textAlign: "center", fontWeight: 700 }}>{expected.mid.toFixed(0)}</td>
                <td style={{ ...td2, textAlign: "center", fontWeight: 700 }}>{expected.hi.toFixed(0)}</td>
                <td style={{ ...td2 }} colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: 11, color: "var(--color-text-secondary,#757987)", marginTop: 12, lineHeight: 1.6 }}>
          <b>Модель считается для всех месяцев</b> — включая те, где факт уже известен. Иначе не
          видно, попадает модель в реальность или нет. Колонка «Откл. от модели» — разница
          между фактом и реалистичным сценарием.
          <br />
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
          рост.
          <br />
          <b>Статусы.</b> «Дозрел» — с месяца встречи прошло {LAG}+ месяцев (до{" "}
          {fmL(M.lastMature)} включительно), факт финальный, отклонение от модели можно читать
          как ошибку модели. «Дозревает» — встречи прошли, но часть сделок ещё в работе: факт
          неполный и почти всегда ниже модели, это не промах прогноза. «Прогноз» — встречи ещё
          не состоялись и смоделированы.
          <br />
          <b>Итог года.</b> «Модель» — что дала бы модель на всех 12 месяцах. «Ожидание» — факт
          за дозревшие месяцы плюс модель за остальные; это рабочая оценка года.
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
