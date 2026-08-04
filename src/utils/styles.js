// Стили компонентов. Все цвета/радиусы — через токены темы (src/theme.css),
// палитра общая с рабочим пространством CSM (Mindbox brand).

// Карточка
export const card = {
  background: "var(--color-background-primary,#fff)",
  border: "1px solid var(--color-border-tertiary,#DFE3E8)",
  borderRadius: 12,
  padding: "1.1rem 1.25rem",
  marginBottom: 14,
  boxShadow: "var(--card-shadow,none)",
};

// Pill-кнопка
export const pill = (active) =>
  active
    ? {
        padding: "5px 14px",
        fontSize: 12,
        border: "1px solid var(--color-text-primary,#292B32)",
        borderRadius: 8,
        cursor: "pointer",
        background: "var(--color-text-primary,#292B32)",
        color: "var(--color-background-primary,#fff)",
        fontWeight: 600,
      }
    : {
        padding: "5px 14px",
        fontSize: 12,
        borderRadius: 8,
        cursor: "pointer",
        border: "1px solid var(--color-border-tertiary,#DFE3E8)",
        background: "transparent",
        color: "var(--color-text-secondary,#757987)",
        fontWeight: 400,
      };

// Sub-tab
export const subT = (active) => ({
  padding: "6px 11px",
  fontSize: 12,
  borderRadius: 8,
  cursor: "pointer",
  border: active
    ? "1px solid var(--color-border-secondary,#C6CCD4)"
    : "1px solid transparent",
  background: active ? "var(--color-background-primary,#fff)" : "transparent",
  color: active
    ? "var(--color-text-primary,#292B32)"
    : "var(--color-text-secondary,#757987)",
  fontWeight: active ? 600 : 400,
  boxShadow: active ? "var(--card-shadow,none)" : "none",
});

// Заголовок таблицы — правило из globals.css: uppercase, tracking, muted
export const th2 = {
  textAlign: "left",
  padding: "7px 9px",
  color: "var(--color-text-secondary,#757987)",
  fontWeight: 600,
  fontSize: 10.5,
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  borderBottom: "1px solid var(--color-border-tertiary,#DFE3E8)",
};

// Ячейка таблицы
export const td2 = {
  padding: "8px 9px",
  fontSize: 13,
  borderBottom: "1px solid var(--color-border-tertiary,#DFE3E8)",
};

// Числовой инпут
export const numIn2 = {
  width: 52,
  padding: "4px",
  border: "1px solid var(--color-border-tertiary,#DFE3E8)",
  borderRadius: 6,
  fontSize: 12,
  textAlign: "center",
  background: "transparent",
  color: "var(--color-text-primary,#292B32)",
};

// KPI-карточка
export const kpiCard = {
  background: "var(--color-background-primary,#fff)",
  border: "1px solid var(--color-border-tertiary,#DFE3E8)",
  borderRadius: 12,
  padding: "0.9rem 1.05rem",
  boxShadow: "var(--card-shadow,none)",
};

// Подпись KPI — капсом, как в рабочем пространстве
export const kpiLabel = {
  fontSize: 10.5,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.09em",
  color: "var(--color-text-secondary,#757987)",
};

// Значение KPI
export const kpiValue = {
  fontSize: 26,
  fontWeight: 700,
  letterSpacing: "-0.02em",
  lineHeight: 1.15,
  fontVariantNumeric: "tabular-nums",
};

// Heatmap-цвета для конверсии (ступенчатая шкала на бренд-зелёном)
export function heatColors(conv) {
  if (conv == null || conv === 0)
    return { bg: "transparent", fg: "var(--color-text-tertiary,#9AA1AF)" };
  if (conv < 3) return { bg: "var(--heat-1-bg,#EAF4EC)", fg: "var(--heat-1-fg,#1F5B33)" };
  if (conv < 7) return { bg: "var(--heat-2-bg,#CBE8D5)", fg: "var(--heat-2-fg,#17512C)" };
  if (conv < 12) return { bg: "var(--heat-3-bg,#9BD5AE)", fg: "var(--heat-3-fg,#0E3D20)" };
  return { bg: "var(--heat-4-bg,#39AA5D)", fg: "var(--heat-4-fg,#fff)" };
}
