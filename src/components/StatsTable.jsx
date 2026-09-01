import { useState, Fragment } from "react";
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
import { teamOf, wasInTeam } from "../utils/teams.js";

// mode: "teams" — команды с раскрытием по консультантам; "consultants" — плоский список
// title — заголовок карточки (необязательный)
// byQuarter — если передан, разрез управляется извне (общий контрол с графиком)
export default function StatsTable({ data, filter, mode, title, byQuarter: byQuarterProp, salesLabel = "win", note, tailMonths = 3 }) {
  const [innerQuarter, setInnerQuarter] = useState(false);
  const controlled = byQuarterProp !== undefined;
  const byQuarter = controlled ? byQuarterProp : innerQuarter;

  const [sort, setSort] = useState({ key: null, dir: "desc" });
  const [expanded, setExpanded] = useState({}); // { MS1: true }

  const months = actMo(data, filter);
  const periods = byQuarter ? quartersOf(months) : months;

  // Значения по периодам для набора консультантов.
  // team — если задана, месяц человека учитывается только когда он в этом
  // месяце был в этой команде: переход не переписывает прошлое.
  function periodVals(members, team) {
    return periods.map((pk) => {
      const ms = byQuarter ? monthsInQuarter(pk, months) : [pk];
      let m = 0;
      let s = 0;
      for (const d of members) {
        for (const k of ms) {
          if (team && teamOf(d, k) !== team) continue;
          m += gM(d, k, filter);
          s += gS(d, k, filter);
        }
      }
      return { meetings: m, sales: s, conv: cv(m, s) };
    });
  }

  function totals(members, team) {
    let m = 0;
    let s = 0;
    for (const d of members) {
      for (const k of months) {
        if (team && teamOf(d, k) !== team) continue;
        m += gM(d, k, filter);
        s += gS(d, k, filter);
      }
    }
    return { meetings: m, sales: s, conv: cv(m, s) };
  }

  // Тренд: последние периоды исключены (результат ещё не дозрел)
  const tailPeriods = byQuarter ? Math.max(1, Math.ceil(tailMonths / 3)) : tailMonths;
  function trendOf(vals) {
    const usable = vals.slice(0, Math.max(0, vals.length - tailPeriods));
    const convs = usable.map((v) => v.conv).filter((c) => c != null);
    if (convs.length < 2) return { dir: 0, series: usable.map((v) => v.conv || 0) };
    const last = convs[convs.length - 1];
    const prev = convs[convs.length - 2];
    return { dir: last >= prev ? 1 : -1, series: usable.map((v) => v.conv || 0) };
  }

  // teamFilter — по какой команде резать месяцы (для строк команд и их детей)
  function compute(label, team, members, teamFilter) {
    const vals = periodVals(members, teamFilter);
    return {
      label,
      team,
      members,
      vals,
      tot: totals(members, teamFilter),
      tr: trendOf(vals),
    };
  }

  // Сортировка по выбранному столбцу (применяется и к командам, и к людям внутри)
  function sortRows(rows) {
    if (sort.key == null) return rows;
    const val = (r) =>
      sort.key === "total" ? r.tot.conv || 0 : r.vals[sort.key]?.conv || 0;
    return [...rows].sort((a, b) => {
      if (sort.key === "label") {
        const r = String(a.label).localeCompare(String(b.label), "ru");
        return sort.dir === "asc" ? r : -r;
      }
      return sort.dir === "asc" ? val(a) - val(b) : val(b) - val(a);
    });
  }

  // Строки: команды (с детьми-консультантами) либо плоский список людей
  let computed;
  if (mode === "teams") {
    computed = sortRows(
      // В состав команды попадают все, кто был в ней хотя бы один месяц.
      // Перешедший консультант виден в обеих командах — каждая со своим
      // отрезком месяцев, поэтому сумма по командам равна общему итогу.
      TEAMS.map((t) => {
        const members = data.filter((d) => wasInTeam(d, t, months));
        return { ...compute(t, t, members, t), teamKey: t };
      })
    ).map((r) => ({
      ...r,
      children: sortRows(
        r.members.map((d) => ({
          ...compute(d.name, r.teamKey, [d], r.teamKey),
          // человек числится в другой команде — значит перешёл
          movedTo: d.teamHistory && d.team !== r.teamKey ? d.team : null,
        }))
      ),
    }));
  } else {
    computed = sortRows(data.map((d) => compute(d.name, d.team, [d])));
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

  function PeriodCell({ v, prev, dim }) {
    const grew = v.conv != null && prev != null && v.conv > prev;
    const fell = v.conv != null && prev != null && v.conv < prev;
    return (
      <td style={{ ...td2, whiteSpace: "nowrap" }}>
        <div
          style={{
            fontSize: dim ? 12 : 13,
            fontWeight: (v.conv || 0) > 0 ? (dim ? 500 : 600) : 400,
            color: "var(--color-text-primary,#292B32)",
          }}
        >
          {v.conv == null ? "—" : `${v.conv.toFixed(1)}%`}{" "}
          {grew && <span style={{ color: C_POS }}>▲</span>}
          {fell && <span style={{ color: C_NEG }}>▼</span>}
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-secondary,#757987)" }}>
          {v.meetings} встреч → {v.sales} {salesLabel}
        </div>
      </td>
    );
  }

  function Sparkline({ tr }) {
    const series = tr.series;
    const w = 72;
    const h = 24;
    if (series.length < 2) return <svg width={w} height={h} />;
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

  function TotalCell({ tot, bold }) {
    return (
      <td style={{ ...td2, fontWeight: bold ? 700 : 600 }}>
        {tot.conv == null ? "—" : `${tot.conv.toFixed(1)}%`}
        <div style={{ fontSize: 11, color: "var(--color-text-secondary,#757987)" }}>
          {tot.meetings} → {tot.sales}
        </div>
      </td>
    );
  }

  const sortArrow = (key) =>
    sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : "";

  return (
    <div style={card}>
      {title && (
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 4 }}>
          {title}
        </div>
      )}
      {mode === "teams" && (
        <div style={{ fontSize: 12.5, color: "var(--color-text-secondary,#757987)", marginBottom: 12 }}>
          Нажмите на команду, чтобы раскрыть консультантов.
        </div>
      )}

      {!controlled && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <button style={pill(!byQuarter)} onClick={() => setInnerQuarter(false)}>
            Месяцы
          </button>
          <button style={pill(byQuarter)} onClick={() => setInnerQuarter(true)}>
            Кварталы
          </button>
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 600 }}>
          <thead>
            <tr>
              <th style={{ ...stickyTh, cursor: "pointer" }} onClick={() => toggleSort("label")}>
                {mode === "teams" ? "Команда / консультант" : "Имя"}
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
            {computed.map((r) => {
              const open = !!expanded[r.label];
              return (
                <Fragment key={r.label}>
                  <tr>
                    <td
                      style={{
                        ...stickyTd,
                        fontWeight: 700,
                        cursor: mode === "teams" ? "pointer" : "default",
                        whiteSpace: "nowrap",
                      }}
                      onClick={
                        mode === "teams"
                          ? () => setExpanded((s) => ({ ...s, [r.label]: !s[r.label] }))
                          : undefined
                      }
                      title={mode === "teams" ? "Показать консультантов" : undefined}
                    >
                      {mode === "teams" ? (
                        <span style={{ color: TC[r.team] }}>
                          <span
                            style={{
                              display: "inline-block",
                              width: 12,
                              color: "var(--color-text-secondary,#757987)",
                            }}
                          >
                            {open ? "▾" : "▸"}
                          </span>{" "}
                          {r.label}
                          <span
                            style={{
                              fontWeight: 400,
                              fontSize: 11,
                              color: "var(--color-text-secondary,#757987)",
                            }}
                          >
                            {" "}
                            · {r.members.length}
                          </span>
                        </span>
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
                    <TotalCell tot={r.tot} />
                    <td style={td2}>
                      <Sparkline tr={r.tr} />
                    </td>
                  </tr>

                  {/* Консультанты раскрытой команды */}
                  {open &&
                    r.children.map((c) => (
                      <tr key={`${r.label}-${c.label}`}>
                        <td
                          style={{
                            ...stickyTd,
                            paddingLeft: 30,
                            whiteSpace: "nowrap",
                            borderLeft: `3px solid ${TC[r.team]}`,
                          }}
                        >
                          {c.label}
                          {c.movedTo && (
                            <span
                              title={`Перешёл в ${c.movedTo}; месяцы в ${r.teamKey} остались здесь`}
                              style={{
                                marginLeft: 6,
                                fontSize: 10,
                                color: TC[c.movedTo],
                                border: `1px solid ${TC[c.movedTo]}`,
                                borderRadius: 4,
                                padding: "0 3px",
                                verticalAlign: "middle",
                              }}
                            >
                              → {c.movedTo}
                            </span>
                          )}
                        </td>
                        {c.vals.map((v, i) => (
                          <PeriodCell
                            key={i}
                            v={v}
                            prev={i > 0 ? c.vals[i - 1].conv : null}
                            dim
                          />
                        ))}
                        <TotalCell tot={c.tot} />
                        <td style={td2}>
                          <Sparkline tr={c.tr} />
                        </td>
                      </tr>
                    ))}
                </Fragment>
              );
            })}

            {/* Строка «Всего» */}
            <tr style={{ background: "var(--color-background-secondary,#E8EBEE)" }}>
              <td
                style={{
                  ...stickyTd,
                  fontWeight: 700,
                  background: "var(--color-background-secondary,#E8EBEE)",
                }}
              >
                Всего
              </td>
              {mode === "consultants" && <td style={td2} />}
              {allVals.map((v, i) => (
                <PeriodCell key={i} v={v} prev={i > 0 ? allVals[i - 1].conv : null} />
              ))}
              <TotalCell tot={allTot} bold />
              <td style={td2}>
                <Sparkline tr={allTr} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {periods.length > 0 && (
        <div style={{ fontSize: 11, color: "var(--color-text-secondary,#757987)", marginTop: 10 }}>
          Данные за период {fmL(months[0])} — {fmL(months[months.length - 1])}.{" "}
          {note ||
            "Продажи привязаны к месяцу встречи, а не к месяцу закрытия сделки."}
        </div>
      )}
    </div>
  );
}
