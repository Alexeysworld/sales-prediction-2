import { card } from "../utils/styles.js";

// «Качество первой встречи» — оценка качества первичных встреч.
// Данные будут добавлены позже; пока опубликована версия с нулями.
export default function MeetingQualityTab({ data, filter }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
        Качество первой встречи
      </div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary,#888)", lineHeight: 1.6 }}>
        Данные по качеству первичных встреч появятся здесь после загрузки.
      </div>
    </div>
  );
}
