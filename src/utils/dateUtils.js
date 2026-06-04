import { MONTHS } from "../constants.js";

// Добавить N месяцев к ключу "YYYY-MM"
export function addMo(key, offset) {
  const [y, m] = key.split("-").map(Number);
  const idx = (y * 12 + (m - 1)) + offset;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

// Номер месяца (1..12) из ключа "YYYY-MM"
export function moN(key) {
  return Number(key.split("-")[1]);
}

// Форматирование подписи месяца: "2025-03" → "мар '25"
export function fmL(key) {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} '${String(y).slice(-2)}`;
}

// Форматирование подписи квартала: "2026-Q2" → "Q2'26"
export function fmQ(key) {
  const [y, q] = key.split("-");
  return `${q}'${String(y).slice(-2)}`;
}

// Квартал по ключу месяца: "2026-04" → "2026-Q2"
export function quarterOf(key) {
  const [y, m] = key.split("-").map(Number);
  const q = Math.floor((m - 1) / 3) + 1;
  return `${y}-Q${q}`;
}

// Сортированный список уникальных кварталов из списка месяцев
export function quartersOf(monthKeys) {
  const set = new Set(monthKeys.map(quarterOf));
  return [...set].sort();
}

// Месяцы, входящие в квартал, из заданного множества месяцев
export function monthsInQuarter(qKey, monthKeys) {
  return monthKeys.filter((m) => quarterOf(m) === qKey);
}

// Список месяцев, где есть встречи или продажи (по данным консультантов)
export function actMo(data, filter) {
  const set = new Set();
  for (const d of data) {
    for (const k of Object.keys(d.meetings || {})) set.add(k);
    for (const k of Object.keys(d.sales || {})) set.add(k);
  }
  return [...set].sort();
}

// Диапазон месяцев от start до end включительно
export function monthRange(start, end) {
  const out = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    cur = addMo(cur, 1);
  }
  return out;
}
