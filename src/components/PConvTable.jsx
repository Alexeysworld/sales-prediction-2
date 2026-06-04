import { useState } from "react";
import { card, th2, td2, heatColors, kpiCard } from "../utils/styles.js";
import { TC, C_POS, C_NEG } from "../constants.js";
import { gM, gS, cv } from "../utils/convUtils.js";
import { actMo, fmL, addMo } from "../utils/dateUtils.js";

// Рейтинг людей по конверсиям за выбранный период (период — на уровне вкладки).
export default function PConvTable({ data, filter = "all" }) {
  const allMonths = actMo(data, "all");
  const first = allMonths[0] || "2025-01";
  const last = allMonths[allMonths.length - 1] || "2025-12";
  const [from, setFrom] = useState(allMonths.includes("2025-01") ? "2025-01" : first);
  const [to, setTo] = useState(allMonths.includes("2025-12") ? "2025-12" : last);
  const [sort, setSort] = useState({ key: "allConv", dir: "desc" });

  const range = allMonths.filter((m) => m >= from && m <= to);
  const L = range.length;
  // Предыдущий период той же длительности (непосредственно перед выбранным)
  const prevMonths = Array.from({ length: L }, (_, i) => addMo(from, -L + i));

  // Агрегат по списку месяцев и всем консультантам (с учётом фильтра гор/хол/все)
  function aggMonths(mList, type) {
    let m = 0;
    let s = 0;
    for (const d of data) {
      for (const k of mList) {
        m += gM(d, k, type);
        s += gS(d, k, type);
      }
    }
    return { m, s, conv: cv(m, s) };
  }

  // KPI за выбранный период (по текущему фильтру) + тренд vs предыдущий период
  const cur = aggMonths(range, filter);
  const prev = aggMonths(prevMonths, filter);
  const trend = cur.conv != null && prev.conv != null && prev.m > 0 ? cur.conv - prev.conv : null;

  // Конверсии по консультанту за период (для таблицы — все/гор/хол)
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

  const kpis = [
    { label: "Встречи", value: cur.m.toLocaleString("ru-RU") },
    { label: "Продажи", value: cur.s.toLocaleString("ru-RU") },
    { label: "Конверсия", value: cur.conv == null ? "—" : `${cur.conv.toFixed(1)}%`, color: C_POS },
    {
      label: "Тренд",
      value: trend == null ? "—" : `${trend >= 0 ? "+" : ""}${trend.toFixed(1)} п.п.`,
      color: trend == null ? undefined : trend >= 0 ? C_POS : C_NEG,
      subtitle: trend == null ? "нет данных за пред. период" : `vs ${fmL(prevMonths[0])} — ${fmL(prevMonths[L - 1])}`,
    },
  ];

  return (
    <div>
      {/* Период — на уровне всей вкладки */}
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

      {/* KPI за выбранный период */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
        {kpis.map((it) => (
          <div key={it.label} style={kpiCard}>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary,#888)" }}>{it.label}</div>
            <div style={{ fontSize: 22, fontWeight: 500, color: it.color || "var(--color-text-primary,#333)" }}>
              {it.value}
            </div>
            {it.subtitle && (
              <div style={{ fontSize: 11, color: "var(--color-text-tertiary,#aaa)" }}>{it.subtitle}</div>
            )}
          </div>
        ))}
      </div>

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
          Тренд сравнивает выбранный период с предыдущим такой же длительности. Продажи привязаны к
          месяцу встречи; горячая = заявка/ивент/контент, холодная = все − горячие.
        </div>
      </div>
    </div>
  );
}
