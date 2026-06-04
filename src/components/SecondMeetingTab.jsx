import { card } from "../utils/styles.js";

// «CR во вторую встречу по людям» — конверсия из первой встречи во вторую,
// в разрезе консультантов. Данные будут добавлены позже; версия с нулями.
export default function SecondMeetingTab({ data, filter }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
        CR во вторую встречу по людям
      </div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary,#888)", lineHeight: 1.6 }}>
        Данные по конверсии из первой встречи во вторую появятся здесь после загрузки.
      </div>
    </div>
  );
}
