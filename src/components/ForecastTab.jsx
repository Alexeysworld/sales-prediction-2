import { useState } from "react";
import { card, numIn2, td2, th2 } from "../utils/styles.js";
import {
  DEF_DH,
  DEF_DC,
  DEF_SEASON,
  FORECAST_START,
  FORECAST_LEN,
  MNS,
} from "../constants.js";
import { HIST_HOT, HIST_COLD } from "../data/meetings.js";
import { addMo, moN, fmL, fmQ, quarterOf } from "../utils/dateUtils.js";

const SCENARIOS = [
  {
    id: "pess",
    name: "Пессимистичный",
    color: "#E24B4A",
    hotConv: 14,
    coldConv: 5.3,
    hotMeet: 40,
    coldMeet: 110,
  },
  {
    id: "real",
    name: "Реалистичный",
    color: "#EF9F27",
    hotConv: 19,
    coldConv: 8,
    hotMeet: 36,
    coldMeet: 140,
  },
  {
    id: "opt",
    name: "Оптимистичный",
    color: "#1D9E75",
    hotConv: 22,
    coldConv: 8.5,
    hotMeet: 47,
    coldMeet: 165,
  },
];

function defaultParams(s) {
  return {
    hotConv: s.hotConv,
    coldConv: s.coldConv,
    hotMeet: s.hotMeet,
    coldMeet: s.coldMeet,
    distHot: [...DEF_DH],
    distCold: [...DEF_DC],
    season: [...DEF_SEASON],
  };
}

// Прогнозные месяцы
function forecastMonths() {
  const out = [];
  for (let i = 0; i < FORECAST_LEN; i++) out.push(addMo(FORECAST_START, i));
  return out;
}

// Расчёт прогноза продаж по месяцам
function computeForecast(p) {
  const fMonths = forecastMonths();
  const fSet = new Set(fMonths);
  const sales = {};
  for (const m of fMonths) sales[m] = 0;

  const types = [
    { hist: HIST_HOT, conv: p.hotConv, dist: p.distHot, future: p.hotMeet },
    { hist: HIST_COLD, conv: p.coldConv, dist: p.distCold, future: p.coldMeet },
  ];

  for (const t of types) {
    // A. Хвосты от исторических встреч
    for (const [m, count] of Object.entries(t.hist)) {
      const expected = count * (t.conv / 100);
      for (let L = 0; L < 9; L++) {
        const target = addMo(m, L);
        if (fSet.has(target)) {
          const seas = p.season[moN(target) - 1];
          sales[target] += expected * (t.dist[L] / 100) * seas;
        }
      }
    }
    // B. Продажи от будущих встреч
    for (const F of fMonths) {
      const expected = t.future * (t.conv / 100);
      for (let L = 0; L < 9; L++) {
        const target = addMo(F, L);
        if (fSet.has(target)) {
          const seas = p.season[moN(target) - 1];
          sales[target] += expected * (t.dist[L] / 100) * seas;
        }
      }
    }
  }
  return { fMonths, sales };
}

export default function ForecastTab({ filter }) {
  const [active, setActive] = useState("real");
  const [open, setOpen] = useState(false);
  const [params, setParams] = useState(() => {
    const o = {};
    for (const s of SCENARIOS) o[s.id] = defaultParams(s);
    return o;
  });

  function upd(id, patch) {
    setParams((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }
  function updArr(id, field, idx, val) {
    setParams((prev) => {
      const arr = [...prev[id][field]];
      arr[idx] = val;
      return { ...prev, [id]: { ...prev[id], [field]: arr } };
    });
  }

  // Итоги по каждому сценарию (для карточек)
  const scenarioTotals = {};
  for (const s of SCENARIOS) {
    const { sales } = computeForecast(params[s.id]);
    scenarioTotals[s.id] = Object.values(sales).reduce((a, b) => a + b, 0);
  }

  const actScenario = SCENARIOS.find((s) => s.id === active);
  const p = params[active];
  const { fMonths, sales } = computeForecast(p);
  const total = Object.values(sales).reduce((a, b) => a + b, 0);

  // Кварталы (первые 3 и последние 3 месяца)
  const q1Key = quarterOf(fMonths[0]);
  const q2Key = quarterOf(fMonths[fMonths.length - 1]);
  const q1Sum = fMonths.slice(0, 3).reduce((a, m) => a + sales[m], 0);
  const q2Sum = fMonths.slice(3, 6).reduce((a, m) => a + sales[m], 0);

  const distSum = (arr) => arr.reduce((a, b) => a + b, 0).toFixed(1);

  return (
    <div>
      {/* Карточки сценариев */}
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        {SCENARIOS.map((s) => {
          const sp = params[s.id];
          const isActive = s.id === active;
          return (
            <div
              key={s.id}
              onClick={() => setActive(s.id)}
              style={{
                ...card,
                flex: 1,
                marginBottom: 0,
                cursor: "pointer",
                borderLeft: `3px solid ${s.color}`,
                outline: isActive ? `2px solid ${s.color}` : "none",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 500, color: s.color }}>
                {s.name}
              </div>
              <div style={{ fontSize: 20, fontWeight: 500 }}>
                {scenarioTotals[s.id].toFixed(0)}
              </div>
              <div style={{ fontSize: 10, color: "var(--color-text-secondary,#888)" }}>
                конв {sp.hotConv}/{sp.coldConv}%, встр {sp.hotMeet}+{sp.coldMeet}/мес
              </div>
            </div>
          );
        })}
      </div>

      {/* Таблица прогноза */}
      <div style={card}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 600 }}>
            <thead>
              <tr>
                <th style={th2}></th>
                {fMonths.map((m) => {
                  const seas = p.season[moN(m) - 1];
                  return (
                    <th key={m} style={{ ...th2, background: "#fffbe6", textAlign: "center" }}>
                      {fmL(m)}
                      {seas !== 1 && (
                        <div style={{ fontSize: 10, color: "var(--color-text-tertiary,#aaa)" }}>
                          ×{seas}
                        </div>
                      )}
                    </th>
                  );
                })}
                <th style={{ ...th2, background: "#f0f7ff", textAlign: "center" }}>
                  {fmQ(q1Key)}
                </th>
                <th style={{ ...th2, background: "#f0f7ff", textAlign: "center" }}>
                  {fmQ(q2Key)}
                </th>
                <th
                  style={{
                    ...th2,
                    background: "var(--color-background-secondary,#f5f5f5)",
                    textAlign: "center",
                  }}
                >
                  Итого
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...td2, fontWeight: 500 }}>Продажи</td>
                {fMonths.map((m) => (
                  <td key={m} style={{ ...td2, background: "#fffbe6", textAlign: "center" }}>
                    {sales[m].toFixed(1)}
                  </td>
                ))}
                <td style={{ ...td2, background: "#f0f7ff", textAlign: "center", fontWeight: 500 }}>
                  {q1Sum.toFixed(1)}
                </td>
                <td style={{ ...td2, background: "#f0f7ff", textAlign: "center", fontWeight: 500 }}>
                  {q2Sum.toFixed(1)}
                </td>
                <td
                  style={{
                    ...td2,
                    background: "var(--color-background-secondary,#f5f5f5)",
                    textAlign: "center",
                    fontWeight: 600,
                  }}
                >
                  {total.toFixed(1)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Параметры под таблицей */}
        <div style={{ opacity: 0.5, fontSize: 11, marginTop: 10, lineHeight: 1.5 }}>
          <div>
            Конверсии: горячие {p.hotConv}%, холодные {p.coldConv}%.
          </div>
          <div>
            Встречи в месяц: горячие {p.hotMeet}, холодные {p.coldMeet}.
          </div>
          <div>
            Распределение (цикл сделки) горячие: [{p.distHot.join(", ")}] (Σ{distSum(p.distHot)}%),
            холодные: [{p.distCold.join(", ")}] (Σ{distSum(p.distCold)}%).
          </div>
          <div>
            Продажи привязаны к месяцу встречи. Последние месяцы прогноза занижены: продажи от
            поздних встреч уходят за горизонт.
          </div>
        </div>
      </div>

      {/* Настройки сценария */}
      <div style={{ ...card, borderLeft: `3px solid ${actScenario.color}` }}>
        <div
          onClick={() => setOpen((o) => !o)}
          style={{
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 500,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>Настройки сценария «{actScenario.name}»</span>
          <span>{open ? "▲" : "▼"}</span>
        </div>

        {open && (
          <div style={{ marginTop: 16 }}>
            {/* 1. Конверсия */}
            <Section title="Конверсия">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <Slider
                  label="Горячие"
                  value={p.hotConv}
                  min={0}
                  max={40}
                  step={0.5}
                  unit="%"
                  color={actScenario.color}
                  onChange={(v) => upd(active, { hotConv: v })}
                />
                <Slider
                  label="Холодные"
                  value={p.coldConv}
                  min={0}
                  max={20}
                  step={0.1}
                  unit="%"
                  color={actScenario.color}
                  onChange={(v) => upd(active, { coldConv: v })}
                />
              </div>
            </Section>

            {/* 2. Встречи в месяц */}
            <Section title="Количество встреч в месяц">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <Slider
                  label="Горячие"
                  value={p.hotMeet}
                  min={0}
                  max={100}
                  step={1}
                  color={actScenario.color}
                  onChange={(v) => upd(active, { hotMeet: v })}
                />
                <Slider
                  label="Холодные"
                  value={p.coldMeet}
                  min={0}
                  max={300}
                  step={5}
                  color={actScenario.color}
                  onChange={(v) => upd(active, { coldMeet: v })}
                />
              </div>
            </Section>

            {/* 3. Цикл сделки */}
            <Section title="Цикл сделки (распределение по месяцам, %)">
              <DistRow
                label="Горячие"
                arr={p.distHot}
                onChange={(i, v) => updArr(active, "distHot", i, v)}
              />
              <DistRow
                label="Холодные"
                arr={p.distCold}
                onChange={(i, v) => updArr(active, "distCold", i, v)}
              />
            </Section>

            {/* 4. Сезонность */}
            <Section title="Сезонность">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {p.season.map((v, i) => (
                  <div key={i} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "var(--color-text-secondary,#888)" }}>
                      {MNS[i]}
                    </div>
                    <input
                      type="number"
                      step={0.1}
                      style={numIn2}
                      value={v}
                      onChange={(e) =>
                        updArr(active, "season", i, parseFloat(e.target.value) || 0)
                      }
                    />
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function Slider({ label, value, min, max, step, unit, color, onChange }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary,#888)", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          style={{ flex: 1, accentColor: color }}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
        <span style={{ fontSize: 13, fontWeight: 500, minWidth: 48, textAlign: "right" }}>
          {value}
          {unit || ""}
        </span>
      </div>
    </div>
  );
}

function DistRow({ label, arr, onChange }) {
  const sum = arr.reduce((a, b) => a + b, 0);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary,#888)", marginBottom: 4 }}>
        {label} (Σ {sum.toFixed(1)}%)
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {arr.map((v, i) => (
          <div key={i} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "var(--color-text-tertiary,#aaa)" }}>+{i}</div>
            <input
              type="number"
              step={0.1}
              style={numIn2}
              value={v}
              onChange={(e) => onChange(i, parseFloat(e.target.value) || 0)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
