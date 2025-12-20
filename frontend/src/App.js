import React, { useEffect, useMemo, useState } from "react";
import { fetchAthletes, fetchTimeseries } from "./api";
import "./App.css";

import KpiCards from "./components/KpiCards";
import WorkloadChart from "./components/WorkloadChart";
import AcwrChart from "./components/AcwrChart";
import ConditionChart from "./components/ConditionChart";

// === 修正 1: Chart.jsの部品をここで一括登録する ===
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement, // これが重要
  Title,
  Tooltip,
  Legend,
  Filler
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);
// ===============================================

function App() {
  const [athletes, setAthletes] = useState([]);
  const [athleteId, setAthleteId] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState(90);

  // 初回ロード
  useEffect(() => {
    (async () => {
      try {
        const a = await fetchAthletes();
        setAthletes(a);
        if (a.length > 0) setAthleteId(a[0].athlete_id);
      } catch (e) {
        console.error("Failed to fetch athletes", e);
      }
    })();
  }, []);

  // データ取得
  useEffect(() => {
    if (!athleteId) return;
    (async () => {
      setLoading(true);
      try {
        const ts = await fetchTimeseries(athleteId);
        setRows(ts);
        console.log("Fetched Data:", ts); // コンソールでデータ確認
      } catch (e) {
        console.error("Failed to fetch timeseries", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [athleteId]);

  const isGk = useMemo(() => {
    if (!rows.length) return false;
    const totalDive = rows.reduce((acc, r) => acc + (r.total_dive_load || 0), 0);
    return totalDive > 500;
  }, [rows]);

  const viewRows = useMemo(() => {
    if (!rows?.length) return [];
    if (!range) return rows;
    return rows.slice(-range);
  }, [rows, range]);

  return (
    <div className="App" style={{ padding: 24, maxWidth: 1200, margin: "0 auto", fontFamily: "Inter, sans-serif" }}>
      <header style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Condition Dashboard</h1>
          {/* === 修正 2: データ状態のデバッグ表示 === */}
          <div style={{ fontSize: 12, color: "#EF4444", fontWeight: "bold" }}>
            Debug: データ件数 {rows.length}件 / 選択中: {athleteId}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: isGk ? "#D97706" : "#059669", background: isGk ? "#FEF3C7" : "#D1FAE5", padding: "4px 12px", borderRadius: 16, display: "inline-block" }}>
            {isGk ? "GK Mode" : "FP Mode"}
          </div>
        </div>
      </header>

      {/* Controls */}
      <div style={{ background: "#fff", padding: 16, borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.1)", display: "flex", gap: 20, alignItems: "center", marginBottom: 24 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", marginBottom: 4 }}>ATHLETE</label>
          <select 
            value={athleteId} 
            onChange={(e) => setAthleteId(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #D1D5DB", minWidth: 200 }}
          >
            {athletes.map(a => (
              <option key={a.athlete_id} value={a.athlete_id}>{a.athlete_name || a.athlete_id}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", marginBottom: 4 }}>RANGE</label>
          <div style={{ display: "flex", gap: 4 }}>
            {[30, 90, 180, 0].map(v => (
              <button
                key={v}
                onClick={() => setRange(v)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "1px solid #E5E7EB",
                  background: range === v ? "#111827" : "#fff",
                  color: range === v ? "#fff" : "#374151",
                  fontSize: 13,
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
              >
                {v === 0 ? "All" : `${v} Days`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <section style={{ marginBottom: 24 }}>
        <KpiCards rows={viewRows} isGk={isGk} />
      </section>

      {/* Charts Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 24 }}>
        {/* Row 1: ACWR */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div style={cardStyle}>
            <h3 style={titleStyle}>① {isGk ? "Dive Load ACWR" : "Total Distance ACWR"}</h3>
            <AcwrChart 
              rows={viewRows} 
              dataKey={isGk ? "acwr_dive" : "acwr_total_distance"} 
              color="#2563EB" 
            />
          </div>
          <div style={cardStyle}>
            <h3 style={titleStyle}>② {isGk ? "Jump Load ACWR" : "HSR (Sprint) ACWR"}</h3>
            <AcwrChart 
              rows={viewRows} 
              dataKey={isGk ? "acwr_jump" : "acwr_hsr"} 
              color="#D97706" 
            />
          </div>
        </div>

        {/* Row 2: Raw Load */}
        <div style={cardStyle}>
          <h3 style={titleStyle}>Daily Load (Raw)</h3>
          <WorkloadChart rows={viewRows} isGk={isGk} />
        </div>

        {/* Row 3: Condition */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div style={cardStyle}>
            <h3 style={titleStyle}>③ Training Monotony</h3>
            <ConditionChart 
              rows={viewRows} 
              type="monotony"
              dataKey="monotony_load"
            />
          </div>
          <div style={cardStyle}>
            <h3 style={titleStyle}>④ {isGk ? "Dive Asymmetry" : "IMA Asymmetry"}</h3>
            <ConditionChart 
              rows={viewRows} 
              type="asymmetry"
              dataKey="val_asymmetry"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

const cardStyle = {
  background: "#fff",
  borderRadius: 12,
  padding: 20,
  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
  border: "1px solid #F3F4F6"
};

const titleStyle = {
  margin: "0 0 16px 0",
  fontSize: 15,
  fontWeight: 600,
  color: "#374151"
};

export default App;