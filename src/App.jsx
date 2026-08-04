import { useState } from "react";
import { pill, subT } from "./utils/styles.js";
import { C_ACCENT } from "./constants.js";
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
  { id: "rating", label: "Рейтинг людей по конверсиям" },
  { id: "quality", label: "Качество первой встречи" },
  { id: "second", label: "CR во 2-ю встречу" },
];

const FILTERS = [
  { id: "all", label: "Все" },
  { id: "hot", label: "Горячие" },
  { id: "cold", label: "Холодные" },
];

// Подвкладки, к которым применим фильтр Все/Горячие/Холодные (продажи из встреч)
const CONV_TABS = ["dynamics", "rating"];

export default function App() {
  const [topTab, setTopTab] = useState("analytics"); // analytics | forecast
  const [subTab, setSubTab] = useState("dynamics");
  const [filter, setFilter] = useState("all");
  // Разрез периодов — общий для графика и таблицы на «Общей динамике»
  const [byQuarter, setByQuarter] = useState(false);

  // Фильтр виден на вкладках конверсии и в прогнозе
  const showFilter = topTab === "forecast" || CONV_TABS.includes(subTab);

  const topTabStyle = (active) => ({
    padding: "8px 4px",
    fontSize: 14,
    cursor: "pointer",
    background: "transparent",
    border: "none",
    fontWeight: active ? 600 : 400,
    color: active ? "var(--color-text-primary,#292B32)" : "var(--color-text-secondary,#757987)",
    borderBottom: active ? `2px solid ${C_ACCENT}` : "2px solid transparent",
  });

  return (
    <div
      style={{
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
        maxWidth: 1120,
        margin: "0 auto",
        padding: "1.5rem 1rem 4rem",
        color: "var(--color-text-primary,#292B32)",
      }}
    >
      <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 18px" }}>
        Дашборд команды продаж
      </h1>

      {/* Верхний уровень навигации + фильтр справа */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          borderBottom: "1px solid var(--color-border-tertiary,#DFE3E8)",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", gap: 20 }}>
          <button style={topTabStyle(topTab === "analytics")} onClick={() => setTopTab("analytics")}>
            Аналитика
          </button>
          <button style={topTabStyle(topTab === "forecast")} onClick={() => setTopTab("forecast")}>
            Прогноз
          </button>
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

      {/* Второй уровень — подвкладки в одну строку */}
      {topTab === "analytics" && (
        <div
          style={{
            display: "flex",
            gap: 4,
            flexWrap: "nowrap",
            overflowX: "auto",
            marginBottom: 16,
          }}
        >
          {SUB_TABS.map((t) => (
            <button
              key={t.id}
              style={{ ...subT(subTab === t.id), padding: "5px 9px", whiteSpace: "nowrap", flexShrink: 0 }}
              onClick={() => setSubTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Контент */}
      {topTab === "analytics" && (
        <>
          {CONV_TABS.includes(subTab) && subTab !== "rating" && <KPIs data={D} filter={filter} />}
          {subTab === "dynamics" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: "var(--color-text-secondary,#757987)", marginRight: 2 }}>
                  Разрез:
                </span>
                <button style={pill(!byQuarter)} onClick={() => setByQuarter(false)}>
                  Месяцы
                </button>
                <button style={pill(byQuarter)} onClick={() => setByQuarter(true)}>
                  Кварталы
                </button>
              </div>
              <ConvChart data={D} filter={filter} byQuarter={byQuarter} />
              <StatsTable
                data={D}
                filter={filter}
                mode="teams"
                title="CR в продажу по командам и людям"
                byQuarter={byQuarter}
              />
            </>
          )}
          {subTab === "rating" && <PConvTable data={D} filter={filter} />}
          {subTab === "quality" && <MeetingQualityTab />}
          {subTab === "second" && <SecondMeetingTab />}
        </>
      )}

      {topTab === "forecast" && <ForecastTab filter={filter} />}
    </div>
  );
}
