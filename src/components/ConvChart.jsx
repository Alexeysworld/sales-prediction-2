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

// byQuarter — если передан, разрез управляется извне (общий контрол с таблицей)
export default function ConvChart({ data, filter, byQuarter: byQuarterProp, title = "Динамика конверсии", salesLabel = "прод", tailMonths = 3, tailNote = "сделки не дозрели →" }) {
  const [innerQuarter, setInnerQuarter] = useState(false);
  const controlled = byQuarterProp !== undefined;
  const byQuarter = controlled ? byQuarterProp : innerQuarter;
  // По умолчанию показываем только линию «Всего»; команды включаются кнопками MS1/MS2/MS3
  const [activeTeams, setActiveTeams] = useState({ MS1: false, MS2: false, MS3: false });
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

  // Максимум оси Y — только по видимым линиям (скрытые команды не должны
  // растягивать шкалу и сплющивать линию «Всего»)
  const visibleConvs = [
    ...totalSeries.map((p) => p.conv || 0),
    ...TEAMS.filter((t) => activeTeams[t]).flatMap((t) =>
      teamSeries[t].map((p) => p.conv || 0)
    ),
  ];
  const maxConv = Math.max(15, Math.ceil(Math.max(0, ...visibleConvs) / 5) * 5);

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

  // Последние периоды не дозрели: результат ещё может появиться, конверсия занижена.
  // Глубина лага задаётся в месяцах (tailMonths), в кварталах пересчитывается.
  const rawTail = byQuarter ? Math.max(1, Math.ceil(tailMonths / 3)) : tailMonths;
  const tail = Math.min(rawTail, Math.max(0, periods.length - 1));
  const mature = periods.length - tail;
  const immature = (i) => i >= mature;

  // Заливка под линией «Всего» — только по дозревшей части
  function areaPath(series) {
    const pts = series
      .slice(0, mature)
      .map((p, i) => (p.conv == null ? null : `${x(i)},${y(p.conv)}`))
      .filter(Boolean);
    if (pts.length < 2) return "";
    return `M${pts[0]}L${pts.join("L")}L${x(mature - 1)},${y(0)}L${x(0)},${y(0)}Z`;
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
        {controlled ? (
          <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
        ) : (
          <div style={{ display: "flex", gap: 6 }}>
            <button style={pill(!byQuarter)} onClick={() => setInnerQuarter(false)}>
              Месяцы
            </button>
            <button style={pill(byQuarter)} onClick={() => setInnerQuarter(true)}>
              Кварталы
            </button>
          </div>
        )}
        <div style={{ display: "flex", gap: 6 }}>
          {TEAMS.map((t) => (
            <button
              key={t}
              style={{
                ...pill(activeTeams[t]),
                ...(activeTeams[t]
                  ? { background: TC[t], color: "#fff", borderColor: TC[t], fontWeight: 600 }
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
                stroke="var(--color-border-tertiary,#DFE3E8)"
                strokeDasharray="4,4"
                strokeWidth={0.5}
              />
              <text
                x={padL - 6}
                y={y(v) + 3}
                textAnchor="end"
                fontSize={9}
                fill="var(--color-text-tertiary,#9AA1AF)"
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
              fill="var(--color-text-secondary,#757987)"
              opacity={immature(i) ? 0.45 : 1}
            >
              {byQuarter ? fmQ(p) : fmL(p)}
            </text>
          ))}

          {/* Затенение недозревших периодов */}
          {tail > 0 && periods.length > 1 && (
            <rect
              x={x(mature) - (x(1) - x(0)) / 2}
              y={padT}
              width={W - padR - (x(mature) - (x(1) - x(0)) / 2)}
              height={innerH}
              fill="var(--color-background-secondary,#E8EBEE)"
              opacity={0.55}
            />
          )}
          {tail > 0 && (
            <text
              x={W - padR}
              y={padT - 6}
              textAnchor="end"
              fontSize={9}
              fill="var(--color-text-secondary,#757987)"
              opacity={0.75}
            >
              {tailNote}
            </text>
          )}

          {/* Заливка под линией «Всего» */}
          <path d={areaPath(totalSeries)} fill="var(--chart-area,rgba(57,170,93,.10))" stroke="none" />

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
                    <title>{`${t}: ${p.meetings} встр → ${p.sales} ${salesLabel} (${p.conv.toFixed(1)}%)`}</title>
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
              stroke="var(--color-text-primary,#292B32)"
              strokeWidth={2.4}
            />
            {totalSeries.map((p, i) =>
              p.conv == null ? null : (
                <g key={i} opacity={immature(i) ? 0.45 : 1}>
                  <text
                    x={x(i)}
                    y={y(p.conv) - 8}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={600}
                    fill="var(--color-text-primary,#292B32)"
                  >
                    {p.conv.toFixed(1)}%
                  </text>
                  <circle
                    cx={x(i)}
                    cy={y(p.conv)}
                    r={i === mature - 1 ? 4.5 : 3.5}
                    fill={i === mature - 1 ? "var(--accent,#39AA5D)" : "var(--color-text-primary,#292B32)"}
                    stroke="var(--color-background-primary,#fff)"
                    strokeWidth={i === mature - 1 ? 2 : 1}
                  >
                    <title>{`Всего: ${p.meetings} встр → ${p.sales} ${salesLabel} (${p.conv.toFixed(1)}%)`}</title>
                  </circle>
                </g>
              )
            )}
          </g>
          {/* Прозрачные полосы-мишени: тултип показывается при наведении на
              любое место колонки, а не только точно на точку */}
          {periods.map((pk, i) => {
            const half = periods.length > 1 ? (x(1) - x(0)) / 2 : innerW / 2;
            const left = Math.max(padL, x(i) - half);
            const right = Math.min(W - padR, x(i) + half);
            const t = totalSeries[i];
            const fmtRow = (label, v) =>
              `${label}: ${v.meetings} встр → ${v.sales} ${salesLabel}` +
              (v.conv == null ? "" : ` (${v.conv.toFixed(1)}%)`);
            const lines = [
              byQuarter ? fmQ(pk) : fmL(pk),
              fmtRow("Всего", t),
              ...TEAMS.filter((tt) => activeTeams[tt]).map((tt) =>
                fmtRow(tt, teamSeries[tt][i])
              ),
            ];
            return (
              <rect
                key={`hit-${pk}`}
                className="chart-hit"
                x={left}
                y={padT}
                width={Math.max(0, right - left)}
                height={innerH}
              >
                <title>{lines.join("\n")}</title>
              </rect>
            );
          })}

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
          <span style={{ width: 16, height: 3, borderRadius: 2, background: "var(--color-text-primary,#292B32)" }} />
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
