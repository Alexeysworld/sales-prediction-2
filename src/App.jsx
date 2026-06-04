import { useState } from "react";
import { pill, subT } from "./utils/styles.js";
import { D } from "./data/consultants.js";
import KPIs from "./components/KPIs.jsx";
import ConvChart from "./components/ConvChart.jsx";
import StatsTable from "./components/StatsTable.jsx";
import PConvTable from "./components/PConvTable.jsx";
import MeetingQualityTab from "./components/MeetingQualityTab.jsx";
import SecondMeetingTab from "./components/SecondMeetingTab.jsx";
import ForecastTab from "./components/ForecastTab.jsx";

// Подвкладки аналитики
const SUB_TABS = [
  { id: "dynamics", label: "Общая динамика" },
  { id: "teams", label: "CR в продажу по командам" },
  { id: "people", label: "CR в продажу по людям" },
  { id: "rating", label: "Рейтинг людей по конверсиям" },
  { id: "quality", label: "Качество первой встречи" },
  { id: "second", label: "CR во вторую встречу по людям" },
];

const FILTERS = [
  { id: "all", label: "Все" },
  { id: "hot", label: "Горячие" },
  { id: "cold", label: "Холодные" },
];

// Подвкладки, к которым применим фильтр Все/Горячие/Холодные (продажи из встреч)
const CONV_TABS = ["dynamics", "teams", "people", "rating"];

export default function App() {
  const [topTab, setTopTab] = useState("analytics"); // analytics | forecast
  const [subTab, setSubTab] = useState("dynamics");
  const [filter, setFilter] = useState("all");

  // Фильтр виден на вкладках конверсии и в прогнозе
  const showFilter = topTab === "forecast" || CONV_TABS.includes(subTab);

  const topTabStyle = (active) => ({
    padding: "8px 4px",
    fontSize: 14,
    cursor: "pointer",
    background: "transparent",
    border: "none",
    fontWeight: active ? 500 : 400,
    color: active ? "#378ADD" : "var(--color-text-secondary,#888)",
    borderBottom: active ? "2px solid #378ADD" : "2px solid transparent",
  });

  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        maxWidth: 960,
        margin: "0 auto",
        padding: "1.5rem 1rem 4rem",
        color: "var(--color-text-primary,#333)",
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>
        Дашборд команды продаж
      </h1>

      {/* Верхний уровень навигации */}
      <div
        style={{
          display: "flex",
          gap: 20,
          borderBottom: "0.5px solid var(--color-border-tertiary,#e0e0e0)",
          marginBottom: 16,
        }}
      >
        <button style={topTabStyle(topTab === "analytics")} onClick={() => setTopTab("analytics")}>
          Аналитика
        </button>
        <button style={topTabStyle(topTab === "forecast")} onClick={() => setTopTab("forecast")}>
          Прогноз
        </button>
      </div>

      {/* Второй уровень + фильтр */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {topTab === "analytics" &&
            SUB_TABS.map((t) => (
              <button
                key={t.id}
                style={subT(subTab === t.id)}
                onClick={() => setSubTab(t.id)}
              >
                {t.label}
              </button>
            ))}
        </div>

        {showFilter && (
          <div style={{ display: "flex", gap: 6 }}>
            {FILTERS.map((f) => (
              <button
                key={f.id}
                style={pill(filter === f.id)}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Контент */}
      {topTab === "analytics" && (
        <>
          {CONV_TABS.includes(subTab) && <KPIs data={D} filter={filter} />}
          {subTab === "dynamics" && <ConvChart data={D} filter={filter} />}
          {subTab === "teams" && <StatsTable data={D} filter={filter} mode="teams" />}
          {subTab === "people" && <StatsTable data={D} filter={filter} mode="consultants" />}
          {subTab === "rating" && <PConvTable data={D} />}
          {subTab === "quality" && <MeetingQualityTab />}
          {subTab === "second" && <SecondMeetingTab />}
        </>
      )}

      {topTab === "forecast" && <ForecastTab filter={filter} />}
    </div>
  );
}
