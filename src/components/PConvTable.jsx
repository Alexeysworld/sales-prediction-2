import { useState } from "react";
import { card, th2, td2, heatColors } from "../utils/styles.js";
import { TC } from "../constants.js";
import { pConv, has2025 } from "../utils/convUtils.js";

// Факт конверсий за 2025 (рейтинг людей по конверсиям)
export default function PConvTable({ data }) {
  const [sort, setSort] = useState({ key: "hotConv", dir: "desc" });

  const rows = data.map((d) => {
    const hot = pConv(d, "hot");
    const cold = pConv(d, "cold");
    return {
      name: d.name,
      team: d.team,
      hasData: has2025(d),
      hotM: hot.meetings,
      hotS: hot.sales,
      hotConv: hot.conv,
      coldM: cold.meetings,
      coldS: cold.sales,
      coldConv: cold.conv,
    };
  });

  if (sort.key) {
    rows.sort((a, b) => {
      let av = a[sort.key];
      let bv = b[sort.key];
      if (sort.key === "name" || sort.key === "team") {
        return sort.dir === "asc"
          ? String(av).localeCompare(String(bv), "ru")
          : String(bv).localeCompare(String(av), "ru");
      }
      av = av || 0;
      bv = bv || 0;
      return sort.dir === "asc" ? av - bv : bv - av;
    });
  }

  function toggleSort(key) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" }
    );
  }

  const sortArrow = (key) =>
    sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : "";

  const cols = [
    { key: "name", label: "Консультант" },
    { key: "team", label: "Команда" },
    { key: "hotM", label: "Гор. встр" },
    { key: "hotS", label: "Гор. прод" },
    { key: "hotConv", label: "Конв гор%", heat: true },
    { key: "coldM", label: "Хол. встр" },
    { key: "coldS", label: "Хол. прод" },
    { key: "coldConv", label: "Конв хол%", heat: true },
  ];

  function ConvCell({ conv }) {
    const { bg, fg } = heatColors(conv);
    return (
      <td style={{ ...td2, background: bg, color: fg, fontWeight: 500, textAlign: "center" }}>
        {conv == null ? "—" : `${conv.toFixed(1)}%`}
      </td>
    );
  }

  return (
    <div style={card}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 600 }}>
          <thead>
            <tr>
              {cols.map((c) => (
                <th
                  key={c.key}
                  style={{ ...th2, cursor: "pointer", whiteSpace: "nowrap" }}
                  onClick={() => toggleSort(c.key)}
                >
                  {c.label}
                  {sortArrow(c.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td style={{ ...td2, color: "var(--color-text-tertiary,#aaa)" }} colSpan={cols.length}>
                  Нет данных
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.name}>
                <td style={{ ...td2, fontWeight: 500 }}>
                  {r.name} {!r.hasData && <span title="Нет данных за 2025">🆕</span>}
                </td>
                <td style={{ ...td2, color: TC[r.team] }}>{r.team}</td>
                <td style={{ ...td2, textAlign: "center" }}>{r.hotM}</td>
                <td style={{ ...td2, textAlign: "center" }}>{r.hotS}</td>
                <ConvCell conv={r.hotConv} />
                <td style={{ ...td2, textAlign: "center" }}>{r.coldM}</td>
                <td style={{ ...td2, textAlign: "center" }}>{r.coldS}</td>
                <ConvCell conv={r.coldConv} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary,#888)", marginTop: 10 }}>
        Конверсия рассчитана за 2025 год (янв–дек).
      </div>
    </div>
  );
}
