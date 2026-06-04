// Карточка
export const card = {
  background: "var(--color-background-primary,#fff)",
  border: "0.5px solid var(--color-border-tertiary,#e0e0e0)",
  borderRadius: 12,
  padding: "1rem 1.25rem",
  marginBottom: 12,
};

// Pill-кнопка
export const pill = (active) =>
  active
    ? {
        padding: "5px 14px",
        fontSize: 12,
        border: "none",
        borderRadius: 8,
        cursor: "pointer",
        background: "var(--color-text-primary,#333)",
        color: "var(--color-background-primary,#fff)",
        fontWeight: 500,
      }
    : {
        padding: "5px 14px",
        fontSize: 12,
        borderRadius: 8,
        cursor: "pointer",
        border: "0.5px solid var(--color-border-tertiary,#ddd)",
        background: "transparent",
        color: "var(--color-text-secondary,#888)",
        fontWeight: 400,
      };

// Sub-tab
export const subT = (active) => ({
  padding: "5px 14px",
  fontSize: 12,
  borderRadius: 8,
  cursor: "pointer",
  border: active
    ? "0.5px solid var(--color-border-secondary,#aaa)"
    : "0.5px solid transparent",
  background: active ? "var(--color-background-primary,#fff)" : "transparent",
  color: active
    ? "var(--color-text-primary,#333)"
    : "var(--color-text-secondary,#888)",
  fontWeight: active ? 500 : 400,
});

// Заголовок таблицы
export const th2 = {
  textAlign: "left",
  padding: "6px 8px",
  color: "var(--color-text-secondary,#888)",
  fontWeight: 400,
  fontSize: 12,
  borderBottom: "0.5px solid var(--color-border-tertiary,#e0e0e0)",
};

// Ячейка таблицы
export const td2 = {
  padding: "7px 8px",
  fontSize: 12,
  borderBottom: "0.5px solid var(--color-border-tertiary,#e0e0e0)",
};

// Числовой инпут
export const numIn2 = {
  width: 52,
  padding: "4px",
  border: "0.5px solid var(--color-border-tertiary,#ddd)",
  borderRadius: 4,
  fontSize: 12,
  textAlign: "center",
  background: "transparent",
  color: "var(--color-text-primary,#333)",
};

// KPI-карточка
export const kpiCard = {
  background: "var(--color-background-secondary,#f5f5f5)",
  borderRadius: 8,
  padding: "0.85rem 1rem",
};

// Heatmap-цвета для конверсии (зелёный градиент)
export function heatColors(conv) {
  if (conv == null || conv === 0)
    return { bg: "transparent", fg: "var(--color-text-tertiary,#aaa)" };
  if (conv < 3) return { bg: "#EAF3DE", fg: "#3B6D11" };
  if (conv < 7) return { bg: "#C0DD97", fg: "#27500A" };
  if (conv < 12) return { bg: "#97C459", fg: "#173404" };
  return { bg: "#639922", fg: "#fff" };
}
