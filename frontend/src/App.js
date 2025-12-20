import React, { useEffect, useMemo, useState } from "react";
import { fetchAthletes, fetchTimeseries } from "./api";
import "./App.css";

import KpiCards from "./components/KpiCards";
import WorkloadChart from "./components/WorkloadChart";
import AcwrChart from "./components/AcwrChart";
import ConditionChart from "./components/ConditionChart";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from "chart.js";
import annotationPlugin from "chartjs-plugin-annotation";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  annotationPlugin
);

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
        const list = await fetchAthletes();
        setAthletes(list);
        if (list.length > 0) setAthleteId(list[0].athlete_id);
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
      } catch (e) {
        console.error("Failed to fetch timeseries", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [athleteId]);

  // 選択中の選手
  const currentAthlete = useMemo(() => 
    athletes.find(a => a.athlete_id === athleteId), 
  [athletes, athleteId]);

  // GK判定（APIからの情報を優先、なければデータから推測）
  const isGk = useMemo(() => {
    if (currentAthlete?.position === "GK") return true;
    if (currentAthlete?.position === "FP") return false;
    // Fallback
    if (!rows.length) return false;
    const totalDive = rows.reduce((acc, r) => acc + (r.total_dive_load || 0), 0);
    return totalDive > 500;
  }, [currentAthlete, rows]);

  // 表示用データフィルタ
  const viewRows = useMemo(() => {
    if (!rows?.length) return [];
    if (!range) return rows;
    return rows.slice(-range);
  }, [rows, range]);

  // === オレンジテーマ設定 ===
  const theme = {
    bg: "#FFF7ED",       // 全体背景（薄いオレンジ）
    textMain: "#7C2D12", // メイン文字（濃いオレンジブラウン）
    textSub: "#C2410C",  // サブ文字
    cardBg: "#FFFFFF",   // カード背景
    border: "#FED7AA",   // 枠線
    primary: "#F97316",  // アクセント（オレンジ）
  };

  return (
    <div className="App" style={{ padding: "24px 40px", maxWidth: 1400, margin: "0 auto", fontFamily: "'Inter', sans-serif", background: theme.bg, minHeight: "100vh", color: theme.textMain }}>
      
      {/* Header */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em" }}>
            Predict 2 Protect
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: theme.textSub, fontWeight: 600 }}>
            怪我予防・コンディション管理システム
          </p>
        </div>
        
        {/* Position Badge */}
        <div style={{ 
          padding: "6px 16px", 
          borderRadius: 99, 
          fontWeight: 700, 
          fontSize: 14,
          display: "flex", 
          alignItems: "center",
          gap: 8,
          background: isGk ? "#FEF3C7" : "#E0F2FE", // GKは黄色系、FPは青系
          color: isGk ? "#B45309" : "#0369A1",
          border: `1px solid ${isGk ? "#FCD34D" : "#7DD3FC"}`
        }}>
          <span style={{ fontSize: 18 }}>{isGk ? "🧤" : "🏃"}</span>
          {isGk ? "GKモード (ゴールキーパー)" : "FPモード (フィールド選手)"}
        </div>
      </header>

      {/* Control Bar */}
      <div style={{ background: theme.cardBg, padding: 20, borderRadius: 16, boxShadow: "0 4px 6px -1px rgba(249, 115, 22, 0.1)", display: "flex", gap: 32, alignItems: "flex-end", marginBottom: 32, border: `1px solid ${theme.border}` }}>
        
        {/* Player Selector (Grouped by Position) */}
        <div style={{ flex: 1 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: theme.textSub, marginBottom: 8, letterSpacing: "0.05em" }}>
            選手選択 (ATHLETE)
          </label>
          <div style={{ position: "relative" }}>
            <select 
              value={athleteId} 
              onChange={(e) => setAthleteId(e.target.value)}
              style={{ 
                width: "100%", padding: "12px 16px", borderRadius: 8, 
                border: `1px solid ${theme.border}`, fontSize: 16, fontWeight: 600, color: theme.textMain,
                appearance: "none", background: "#fff", cursor: "pointer"
              }}
            >
              <optgroup label="フィールドプレーヤー">
                {athletes.filter(a => a.position !== "GK").map(a => (
                  <option key={a.athlete_id} value={a.athlete_id}>{a.athlete_name}</option>
                ))}
              </optgroup>
              <optgroup label="ゴールキーパー">
                {athletes.filter(a => a.position === "GK").map(a => (
                  <option key={a.athlete_id} value={a.athlete_id}>🧤 {a.athlete_name}</option>
                ))}
              </optgroup>
            </select>
            <div style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: theme.textSub }}>▼</div>
          </div>
        </div>

        {/* Range Selector */}
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: theme.textSub, marginBottom: 8, letterSpacing: "0.05em" }}>
            表示期間 (DAYS)
          </label>
          <div style={{ display: "flex", background: "#FFF7ED", padding: 4, borderRadius: 8, border: `1px solid ${theme.border}` }}>
            {[30, 90, 180].map(v => (
              <button
                key={v}
                onClick={() => setRange(v)}
                style={{
                  padding: "8px 16px", borderRadius: 6, border: "none",
                  background: range === v ? theme.primary : "transparent",
                  color: range === v ? "#fff" : theme.textSub,
                  fontWeight: range === v ? 700 : 500,
                  fontSize: 14, cursor: "pointer",
                  transition: "all 0.2s"
                }}
              >
                {v}日
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 1. KPI Cards */}
      <section style={{ marginBottom: 32 }}>
        <KpiCards rows={viewRows} isGk={isGk} />
      </section>

      {/* 2. Main Charts (ACWR) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
        <ChartCard title={isGk ? "① ダイブ負荷 ACWR (全体負荷)" : "① 総走行距離 ACWR (全体負荷)"}>
          <AcwrChart 
            rows={viewRows} 
            dataKey={isGk ? "acwr_dive" : "acwr_total_distance"} 
            color="#EA580C" 
          />
        </ChartCard>
        
        <ChartCard title={isGk ? "② ジャンプ負荷 ACWR (強度)" : "② スプリント距離(HSR) ACWR (強度)"}>
          <AcwrChart 
            rows={viewRows} 
            dataKey={isGk ? "acwr_jump" : "acwr_hsr"} 
            color="#D97706" 
          />
        </ChartCard>
      </div>

      {/* 3. Sub Charts (Layout Fixed) */}
      {/* 日次負荷推移は横長で見たいので1段使う */}
      <div style={{ marginBottom: 24 }}>
        <ChartCard title="日次負荷推移 (実測値)">
          <WorkloadChart rows={viewRows} isGk={isGk} />
        </ChartCard>
      </div>

      {/* 詳細分析（単調性と非対称性）は2列で並べる */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <ChartCard title="トレーニング単調性 (オーバートレーニング兆候)">
          <ConditionChart rows={viewRows} type="monotony" dataKey="monotony_load" />
        </ChartCard>

        <ChartCard title={isGk ? "左右非対称性 (ダイブ方向の偏り)" : "左右非対称性 (IMA動作の偏り)"}>
          <ConditionChart rows={viewRows} type="asymmetry" dataKey="val_asymmetry" />
        </ChartCard>
      </div>

    </div>
  );
}

// Wrapper Component for consistent styling
const ChartCard = ({ title, children }) => (
  <div style={{ background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", height: "100%", border: "1px solid #FED7AA" }}>
    <h3 style={{ margin: "0 0 16px 0", fontSize: 16, fontWeight: 700, color: "#7C2D12" }}>{title}</h3>
    {children}
  </div>
);

export default App;