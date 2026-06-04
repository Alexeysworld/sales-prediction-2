import { actMo } from "./dateUtils.js";

// Встречи консультанта d за месяц по фильтру
//   "hot"  → hotM
//   "cold" → meetings − hotM
//   "all"  → meetings
export function gM(d, key, filter) {
  const all = (d.meetings && d.meetings[key]) || 0;
  const hot = (d.hotM && d.hotM[key]) || 0;
  if (filter === "hot") return hot;
  if (filter === "cold") return Math.max(0, all - hot);
  return all;
}

// Продажи консультанта d за месяц по фильтру
export function gS(d, key, filter) {
  const all = (d.sales && d.sales[key]) || 0;
  const hot = (d.hotS && d.hotS[key]) || 0;
  if (filter === "hot") return hot;
  if (filter === "cold") return Math.max(0, all - hot);
  return all;
}

// Конверсия в %, null если встреч нет
export function cv(meetings, sales) {
  if (!meetings) return null;
  return (sales / meetings) * 100;
}

// Среднее встреч за последние 3 активных месяца
export function avg3(d, filter) {
  const months = actMo([d], filter);
  if (!months.length) return 0;
  const last3 = months.slice(-3);
  const sum = last3.reduce((acc, k) => acc + gM(d, k, filter), 0);
  return last3.length ? sum / last3.length : 0;
}

// Персональная конверсия за янв–дек 2025
//   type: "hot" | "cold"
export function pConv(d, type) {
  let meetings = 0;
  let sales = 0;
  for (let m = 1; m <= 12; m++) {
    const key = `2025-${String(m).padStart(2, "0")}`;
    meetings += gM(d, key, type);
    sales += gS(d, key, type);
  }
  return { meetings, sales, conv: cv(meetings, sales) };
}

// Есть ли у консультанта вообще данные за 2025 год
export function has2025(d) {
  for (let m = 1; m <= 12; m++) {
    const key = `2025-${String(m).padStart(2, "0")}`;
    if (gM(d, key, "all") > 0 || gS(d, key, "all") > 0) return true;
  }
  return false;
}
