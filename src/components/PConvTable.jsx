import { useState } from "react";
import { card, th2, td2, heatColors } from "../utils/styles.js";
import { TC } from "../constants.js";
import { gM, gS, cv } from "../utils/convUtils.js";
import { actMo, fmL } from "../utils/dateUtils.js";

// Рейтинг людей по конверсиям за выбранный период.
export default function PConvTable({ data }) {
  const allMonths = actMo(data, "all");
  const first = allMonths[0] || "2025-01";
  const last = allMonths[allMonths.length - 1] || "2025-12";
  // Дефолт: янв–дек 2025 (если есть в диапазоне, иначе весь диапазон)
  const [from, setFrom] = useState(allMonths.includes("2025-01") ? "2025-01" : first);
  const [to, setTo] = useState(allMonths.includes("2025-12") ? "2025-12" : last);
  const [sort, setSort] = useState({ key: "allConv", dir: "desc" });

  const range = allMonths.filter((m) => m >= from && m <= to);

  function sumConv(d, type) {
    let meetings = 0;
    let sales = 0;
    for (const k of range) {
      meetings += gM(d, k, type);
      sales += gS(d, k, type);
    }
    return { meetings, sales, conv: cv(meetings, sales) };
  }

  const rows = data.map((d) => {
    const all = sumConv(d, "all");
    const hot = sumConv(d, "hot");
    const cold = sumConv(d, "cold");
    return {
      name: d.name,
      team: d.team,
      hasData: all.meetings > 0 || all.sales > 0,
      allM: all.meetings, allS: all.sales, allConv: all.conv,
      hotM: hot.meetings, hotS: hot.sales, hotConv: hot.conv,
      coldM: cold.meetings, coldS: cold.sales, coldConv: cold.conv,
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
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }
    );
  }
  const sortArrow = (key) => (sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : "");

  const cols = [
    { key: "name", label: "Консультант" },
    { key: "team", label: "Команда" },
    { key: "allM", label: "Всего встр" },
    { key: "allS", label: "Всего прод" },
    { key: "allConv", label: "Конв общая%", heat: true },
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

  const selStyle = {
    padding: "4px 8px",
    fontSize: 12,
    border: "0.5px solid var(--color-border-tertiary,#ddd)",
    borderRadius: 6,
    background: "var(--color-background-primary,#fff)",
    color: "var(--color-text-primary,#333)",
    cursor: "pointer",
  };

  return (
    <div style={card}>
      {/* Период */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary,#888)" }}>Период:</span>
        <select style={selStyle} value={from} onChange={(e) => setFrom(e.target.value)}>
          {allMonths.map((m) => (
            <option key={m} value={m} disabled={m > to}>{fmL(m)}</option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary,#888)" }}>—</span>
        <select style={selStyle} value={to} onChange={(e) => setTo(e.target.value)}>
          {allMonths.map((m) => (
            <option key={m} value={m} disabled={m < from}>{fmL(m)}</option>
          ))}
        </select>
      </div>

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
                  {r.name} {!r.hasData && <span title="Нет данных за период">🆕</span>}
                </td>
                <td style={{ ...td2, color: TC[r.team] || "var(--color-text-secondary,#888)" }}>{r.team || "—"}</td>
                <td style={{ ...td2, textAlign: "center" }}>{r.allM}</td>
                <td style={{ ...td2, textAlign: "center" }}>{r.allS}</td>
                <ConvCell conv={r.allConv} />
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
        Конверсия рассчитана за период {fmL(range[0] || from)} — {fmL(range[range.length - 1] || to)}.
        Продажи привязаны к месяцу встречи. Горячая = заявка/ивент/контент, холодная = все − горячие.
      </div>
    </div>
  );
}
