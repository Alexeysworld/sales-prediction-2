import { useState } from "react";
import { card, pill } from "../utils/styles.js";
import { TEAMS, TC } from "../constants.js";
import { gM, gS, cv } from "../utils/convUtils.js";
import { actMo, fmL, fmQ, quartersOf, monthsInQuarter } from "../utils/dateUtils.js";

// Агрегирует встречи/продажи по списку консультантов за период
function agg(data, periodKeys, filter, isQuarter) {
  // periodKeys — массив ключей периодов (месяцы или кварталы)
  // Возвращает для каждого периода { meetings, sales, conv }
  const allMonths = actMo(data, filter);
  return periodKeys.map((pk) => {
    const months = isQuarter ? monthsInQuarter(pk, allMonths) : [pk];
    let m = 0;
    let s = 0;
    for (const d of data) {
      for (const k of months) {
        m += gM(d, k, filter);
        s += gS(d, k, filter);
      }
    }
    return { key: pk, meetings: m, sales: s, conv: cv(m, s) };
  });
}

export default function ConvChart({ data, filter }) {
  const [byQuarter, setByQuarter] = useState(false);
  const [activeTeams, setActiveTeams] = useState({ MS1: true, MS2: true, MS3: true });
  const [hover, setHover] = useState(null); // ключ выделенной линии

  const months = actMo(data, filter);
  const periods = byQuarter ? quartersOf(months) : months;

  const W = 920;
  const H = 320;
  const padL = 40;
  const padR = 16;
  const padT = 24;
  const padB = 36;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // Серия «Всего»
  const totalSeries = agg(data, periods, filter, byQuarter);
  // Серии по командам
  const teamSeries = {};
  for (const t of TEAMS) {
    const teamData = data.filter((d) => d.team === t);
    teamSeries[t] = agg(teamData, periods, filter, byQuarter);
  }

  // Максимум конверсии для оси Y (минимум 15%)
  let maxConv = 15;
  const allConvs = [
    ...totalSeries.map((p) => p.conv || 0),
    ...TEAMS.flatMap((t) => teamSeries[t].map((p) => p.conv || 0)),
  ];
  maxConv = Math.max(15, Math.ceil(Math.max(0, ...allConvs) / 5) * 5);

  const x = (i) =>
    padL + (periods.length <= 1 ? innerW / 2 : (innerW * i) / (periods.length - 1));
  const y = (conv) => padT + innerH - (innerH * (conv || 0)) / maxConv;

  // Y-сетка с шагом 5%
  const yTicks = [];
  for (let v = 0; v <= maxConv; v += 5) yTicks.push(v);

  function linePath(series) {
    const pts = series
      .map((p, i) => (p.conv == null ? null : `${x(i)},${y(p.conv)}`))
      .filter(Boolean);
    return pts.length ? "M" + pts.join("L") : "";
  }

  const lineOpacity = (key) => (hover && hover !== key ? 0.12 : 1);

  const emptyData = periods.length === 0;

  return (
    <div style={card}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          <button style={pill(!byQuarter)} onClick={() => setByQuarter(false)}>
            Месяцы
          </button>
          <button style={pill(byQuarter)} onClick={() => setByQuarter(true)}>
            Кварталы
          </button>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {TEAMS.map((t) => (
            <button
              key={t}
              style={{
                ...pill(activeTeams[t]),
                ...(activeTeams[t]
                  ? { background: TC[t], color: "#fff" }
                  : { color: TC[t], borderColor: TC[t] }),
              }}
              onClick={() =>
                setActiveTeams((s) => ({ ...s, [t]: !s[t] }))
              }
              onMouseEnter={() => setHover(t)}
              onMouseLeave={() => setHover(null)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {emptyData ? (
        <div
          style={{
            height: H,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-text-tertiary,#aaa)",
            fontSize: 13,
          }}
        >
          Нет данных за период
        </div>
      ) : (
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
          {/* Y-сетка */}
          {yTicks.map((v) => (
            <g key={v}>
              <line
                x1={padL}
                x2={W - padR}
                y1={y(v)}
                y2={y(v)}
                stroke="var(--color-border-tertiary,#e0e0e0)"
                strokeDasharray="4,4"
                strokeWidth={0.5}
              />
              <text
                x={padL - 6}
                y={y(v) + 3}
                textAnchor="end"
                fontSize={9}
                fill="var(--color-text-tertiary,#aaa)"
              >
                {v}%
              </text>
            </g>
          ))}

          {/* Подписи X */}
          {periods.map((p, i) => (
            <text
              key={p}
              x={x(i)}
              y={H - padB + 16}
              textAnchor="middle"
              fontSize={9}
              fill="var(--color-text-secondary,#888)"
            >
              {byQuarter ? fmQ(p) : fmL(p)}
            </text>
          ))}

          {/* Линии команд (пунктир) */}
          {TEAMS.filter((t) => activeTeams[t]).map((t) => (
            <g key={t} opacity={lineOpacity(t)}>
              <path
                d={linePath(teamSeries[t])}
                fill="none"
                stroke={TC[t]}
                strokeWidth={1.5}
                strokeDasharray="6,3"
              />
              {teamSeries[t].map((p, i) =>
                p.conv == null ? null : (
                  <circle key={i} cx={x(i)} cy={y(p.conv)} r={3.5} fill={TC[t]} stroke="#fff" strokeWidth={1}>
                    <title>
                      {t}: {p.meetings} встр → {p.sales} прод ({p.conv.toFixed(1)}%)
                    </title>
                  </circle>
                )
              )}
            </g>
          ))}

          {/* Линия «Всего» (жирная сплошная) */}
          <g opacity={lineOpacity("total")}>
            <path
              d={linePath(totalSeries)}
              fill="none"
              stroke="var(--color-text-primary,#333)"
              strokeWidth={2.5}
            />
            {totalSeries.map((p, i) =>
              p.conv == null ? null : (
                <g key={i}>
                  <text
                    x={x(i)}
                    y={y(p.conv) - 8}
                    textAnchor="middle"
                    fontSize={9}
                    fill="var(--color-text-primary,#333)"
                  >
                    {p.conv.toFixed(1)}%
                  </text>
                  <circle
                    cx={x(i)}
                    cy={y(p.conv)}
                    r={3.5}
                    fill="var(--color-text-primary,#333)"
                    stroke="#fff"
                    strokeWidth={1}
                  >
                    <title>
                      Всего: {p.meetings} встр → {p.sales} прод ({p.conv.toFixed(1)}%)
                    </title>
                  </circle>
                </g>
              )
            )}
          </g>
        </svg>
      )}

      {/* Легенда */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginTop: 8,
          fontSize: 11,
          flexWrap: "wrap",
        }}
      >
        <span
          onMouseEnter={() => setHover("total")}
          onMouseLeave={() => setHover(null)}
          style={{ display: "flex", alignItems: "center", gap: 5, cursor: "default" }}
        >
          <span style={{ width: 16, height: 2.5, background: "var(--color-text-primary,#333)" }} />
          Всего
        </span>
        {TEAMS.filter((t) => activeTeams[t]).map((t) => (
          <span
            key={t}
            onMouseEnter={() => setHover(t)}
            onMouseLeave={() => setHover(null)}
            style={{ display: "flex", alignItems: "center", gap: 5, cursor: "default" }}
          >
            <span
              style={{
                width: 16,
                height: 0,
                borderTop: `1.5px dashed ${TC[t]}`,
              }}
            />
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
