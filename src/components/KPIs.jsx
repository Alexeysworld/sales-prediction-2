import { kpiCard, kpiLabel, kpiValue } from "../utils/styles.js";
import { C_POS, C_NEG } from "../constants.js";
import { gM, gS, cv } from "../utils/convUtils.js";
import { actMo } from "../utils/dateUtils.js";

// 4 KPI-карточки: Встречи, Продажи, Конверсия, Тренд квартала
// salesLabel — как называется результат (продажи / вторые встречи)
export default function KPIs({ data, filter, salesLabel = "Продажи", tailMonths = 3 }) {
  const months = actMo(data, filter);

  let meetings = 0;
  let sales = 0;
  for (const d of data) {
    for (const k of months) {
      meetings += gM(d, k, filter);
      sales += gS(d, k, filter);
    }
  }
  const conv = cv(meetings, sales);

  // Тренд квартала: исключаем недозревшие месяцы, из оставшихся берём
  // последние 3 vs предыдущие 3.
  const trendMonths = months.slice(0, Math.max(0, months.length - tailMonths));
  function periodConv(monthKeys) {
    let m = 0;
    let s = 0;
    for (const d of data) {
      for (const k of monthKeys) {
        m += gM(d, k, filter);
        s += gS(d, k, filter);
      }
    }
    return cv(m, s);
  }
  let trend = null;
  if (trendMonths.length >= 6) {
    const recent = periodConv(trendMonths.slice(-3));
    const prev = periodConv(trendMonths.slice(-6, -3));
    if (recent != null && prev != null) trend = recent - prev;
  }

  const items = [
    { label: "Встречи", value: meetings.toLocaleString("ru-RU"), color: undefined },
    { label: salesLabel, value: sales.toLocaleString("ru-RU"), color: undefined },
    {
      label: "Конверсия",
      value: conv == null ? "—" : `${conv.toFixed(1)}%`,
      color: C_POS,
    },
    {
      label: "Тренд квартала",
      value:
        trend == null
          ? "—"
          : `${trend >= 0 ? "+" : ""}${trend.toFixed(1)} п.п.`,
      color: trend == null ? undefined : trend >= 0 ? C_POS : C_NEG,
      subtitle:
        trend == null
          ? "мало данных для сравнения"
          : `последние ${tailMonths} мес исключены`,
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 12,
        marginBottom: 12,
      }}
    >
      {items.map((it) => (
        <div key={it.label} style={kpiCard}>
          <div style={kpiLabel}>{it.label}</div>
          <div
            style={{
              ...kpiValue,
              color: it.color || "var(--color-text-primary,#292B32)",
            }}
          >
            {it.value}
          </div>
          {it.subtitle && (
            <div style={{ fontSize: 11.5, color: "var(--color-text-secondary,#757987)" }}>
              {it.subtitle}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
