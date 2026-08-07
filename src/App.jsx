import { useState } from "react";
import { pill, subT } from "./utils/styles.js";
import { C_ACCENT } from "./constants.js";
import { D } from "./data/consultants.js";
import { SECOND_AS_D } from "./data/secondMeetings.js";
import KPIs from "./components/KPIs.jsx";
import ConvChart from "./components/ConvChart.jsx";
import StatsTable from "./components/StatsTable.jsx";
import MeetingQualityTab from "./components/MeetingQualityTab.jsx";
import ExperimentTab from "./components/ExperimentTab.jsx";
import ForecastTab from "./components/ForecastTab.jsx";
import ForecastYoY from "./components/ForecastYoY.jsx";

// Подвкладки аналитики
const SUB_TABS = [
  { id: "dynamics", label: "Общая динамика" },
  { id: "quality", label: "Качество первой встречи" },
  { id: "experiment", label: "✦ Рейтинг консультантов" },
];

const FILTERS = [
  { id: "all", label: "Все" },
  { id: "hot", label: "Горячие" },
  { id: "cold", label: "Холодные" },
];

// Подвкладки прогноза
const FORECAST_TABS = [
  { id: "yoy", label: "По динамике встреч" },
  { id: "scenarios", label: "Сценарии" },
];

// Подвкладки, к которым применим фильтр Все/Горячие/Холодные (продажи из встреч)
const CONV_TABS = ["dynamics"];

export default function App() {
  const [topTab, setTopTab] = useState("analytics"); // analytics | forecast
  const [subTab, setSubTab] = useState("dynamics");
  const [fcTab, setFcTab] = useState("yoy"); // yoy | scenarios
  const [filter, setFilter] = useState("all");
  // Разрез периодов — общий для графика и таблицы на «Общей динамике»
  const [byQuarter, setByQuarter] = useState(false);
  // Метрика «Общей динамики»: конверсия в продажу или во вторую встречу
  const [metric, setMetric] = useState("sales"); // sales | second
  // Тема: тёмная по умолчанию, класс .light на <html> включает светлую
  const [light, setLight] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("light")
  );

  function toggleTheme() {
    const next = !light;
    setLight(next);
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("light", next);
      try {
        localStorage.setItem("theme", next ? "light" : "dark");
      } catch {
        /* приватный режим — просто не запоминаем выбор */
      }
    }
  }

  const isSecond = metric === "second";
  // У конверсии во вторую встречу нет разреза «горячие/холодные»
  const dynData = isSecond ? SECOND_AS_D : D;
  const dynFilter = isSecond ? "all" : filter;
  const dynLabels = isSecond
    ? {
        kpi: "Вторые встречи",
        chartTitle: "Динамика конверсии во вторую встречу",
        chartUnit: "втор",
        chartTail: 1,
        chartTailNote: "месяц не дозрел →",
        tableTitle: "CR во вторую встречу по командам и людям",
        tableUnit: "втор",
        note:
          "Вторые встречи привязаны к месяцу первичной встречи. Этап «вторая встреча» появился 16.02.2026.",
      }
    : {
        kpi: "Продажи",
        chartTitle: "Динамика конверсии в продажу",
        chartUnit: "прод",
        chartTail: 3,
        chartTailNote: "сделки не дозрели →",
        tableTitle: "CR в продажу по командам и людям",
        tableUnit: "win",
        note: undefined,
      };

  // Фильтр виден на вкладках конверсии и в прогнозе
  const showFilter =
    (topTab === "forecast" && fcTab === "scenarios") ||
    (topTab === "analytics" && CONV_TABS.includes(subTab) && !(subTab === "dynamics" && isSecond));

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

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {showFilter &&
            FILTERS.map((f) => (
              <button
                key={f.id}
                style={pill(filter === f.id)}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          <button
            onClick={toggleTheme}
            title={light ? "Тёмная тема" : "Светлая тема"}
            aria-label={light ? "Включить тёмную тему" : "Включить светлую тему"}
            style={{
              marginLeft: 6,
              width: 30,
              height: 30,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              lineHeight: 1,
              cursor: "pointer",
              borderRadius: 8,
              border: "1px solid var(--color-border-tertiary,#DFE3E8)",
              background: "transparent",
              color: "var(--color-text-secondary,#757987)",
            }}
          >
            {light ? "☾" : "☀"}
          </button>
        </div>
      </div>

      {/* Второй уровень — подвкладки в одну строку */}
      <div
        style={{
          display: "flex",
          gap: 4,
          flexWrap: "nowrap",
          overflowX: "auto",
          marginBottom: 16,
        }}
      >
        {(topTab === "analytics" ? SUB_TABS : FORECAST_TABS).map((t) => {
          const active = topTab === "analytics" ? subTab === t.id : fcTab === t.id;
          return (
            <button
              key={t.id}
              style={{ ...subT(active), padding: "5px 9px", whiteSpace: "nowrap", flexShrink: 0 }}
              onClick={() => (topTab === "analytics" ? setSubTab(t.id) : setFcTab(t.id))}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Контент */}
      {topTab === "analytics" && (
        <>
          {subTab === "dynamics" && (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 12,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontSize: 12, color: "var(--color-text-secondary,#757987)", marginRight: 2 }}>
                  Конверсия:
                </span>
                <button style={pill(!isSecond)} onClick={() => setMetric("sales")}>
                  В продажу
                </button>
                <button style={pill(isSecond)} onClick={() => setMetric("second")}>
                  Во 2-ю встречу
                </button>
                <span style={{ width: 14 }} />
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
              <KPIs
                data={dynData}
                filter={dynFilter}
                salesLabel={dynLabels.kpi}
                tailMonths={dynLabels.chartTail}
              />
              <ConvChart
                data={dynData}
                filter={dynFilter}
                byQuarter={byQuarter}
                title={dynLabels.chartTitle}
                salesLabel={dynLabels.chartUnit}
                tailMonths={dynLabels.chartTail}
                tailNote={dynLabels.chartTailNote}
              />
              <StatsTable
                data={dynData}
                filter={dynFilter}
                mode="teams"
                title={dynLabels.tableTitle}
                byQuarter={byQuarter}
                salesLabel={dynLabels.tableUnit}
                note={dynLabels.note}
                tailMonths={dynLabels.chartTail}
              />
            </>
          )}
          {subTab === "quality" && <MeetingQualityTab />}
          {subTab === "experiment" && <ExperimentTab />}
        </>
      )}

      {topTab === "forecast" && fcTab === "yoy" && <ForecastYoY />}
      {topTab === "forecast" && fcTab === "scenarios" && <ForecastTab filter={filter} />}
    </div>
  );
}
