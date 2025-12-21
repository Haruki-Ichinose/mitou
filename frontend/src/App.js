import React, { useEffect, useMemo, useState } from "react";
import { fetchAthletes, fetchTimeseries } from "./api";
import "./App.css";

// Charts
import KpiCards from "./components/KpiCards";
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

// === テーマ設定 ===
const theme = {
  bg: "#F1F5F9",
  textMain: "#0F172A",
  textSub: "#64748B",
  cardBg: "#FFFFFF",
  primary: "#F97316",
  primaryLight: "#FFEDD5",
  border: "#CBD5E1",
  shadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
  fpBg: "#E0F2FE", fpText: "#0369A1",
  gkBg: "#FEF3C7", gkText: "#B45309",
};

const styles = {
  container: {
    width: "100%",
    padding: "32px 48px",
    boxSizing: "border-box",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Hiragino Sans', 'Noto Sans JP', sans-serif",
    background: theme.bg, 
    minHeight: "100vh", 
    color: theme.textMain,
  },
  header: { 
    display: "flex", 
    justifyContent: "space-between", 
    alignItems: "flex-end", 
    marginBottom: 32,
    borderBottom: `1px solid ${theme.border}`,
    paddingBottom: 24
  },
  brand: { display: "flex", flexDirection: "column", gap: 4 },
  title: { 
    margin: 0, 
    fontSize: 32, 
    fontWeight: 800, 
    letterSpacing: "-0.03em",
    background: "linear-gradient(135deg, #F97316 0%, #EA580C 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    display: "inline-block"
  },
  subtitle: { margin: 0, fontSize: 14, color: theme.textSub, fontWeight: 600 },
  badge: (isGk) => ({
    padding: "8px 20px", 
    borderRadius: 99, 
    fontWeight: 700, 
    fontSize: 14,
    display: "flex", 
    alignItems: "center", 
    gap: 8,
    background: isGk ? theme.gkBg : theme.fpBg,
    color: isGk ? theme.gkText : theme.fpText,
  }),
  
  controlBar: {
    background: theme.cardBg, 
    padding: "20px 32px", 
    borderRadius: 12,
    boxShadow: theme.shadow,
    display: "flex", 
    gap: 48, 
    alignItems: "center", 
    marginBottom: 48, // 余白拡大
    border: `1px solid ${theme.border}`
  },
  controlGroup: { display: "flex", flexDirection: "column", gap: 8, flex: 1 },
  label: { fontSize: 12, fontWeight: 700, color: theme.textSub, letterSpacing: "0.05em" },
  selectContainer: { position: "relative", width: "100%", maxWidth: 400 },
  select: {
    width: "100%", padding: "12px 16px", borderRadius: 8,
    border: `1px solid ${theme.border}`, fontSize: 16, fontWeight: 500,
    color: theme.textMain, appearance: "none", background: "#fff", cursor: "pointer", outline: "none"
  },
  
  // ★重要: セクション間の余白を確保するためのスタイル
  section: {
    marginBottom: 64,
    width: "100%"
  },

  // Grid設定
  gridHalf: { 
    display: "grid", 
    // 最小幅を少し緩和(500px)して、狭い画面でも崩れにくくする
    gridTemplateColumns: "repeat(auto-fit, minmax(500px, 1fr))", 
    gap: 32,
    width: "100%"
  },
  
  // ★重要: グラフエリアの高さを固定する（はみ出し防止）
  chartContainer: {
    position: "relative",
    height: 200, // 高さを固定
    width: "100%"
  }
};

function App() {
  const [athletes, setAthletes] = useState([]);
  const [athleteId, setAthleteId] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState(90);

  useEffect(() => {
    (async () => {
      try {
        const list = await fetchAthletes();
        setAthletes(list);
        if (list.length > 0) setAthleteId(list[0].athlete_id);
      } catch (e) { console.error(e); }
    })();
  }, []);

  useEffect(() => {
    if (!athleteId) return;
    (async () => {
      setLoading(true);
      try {
        const ts = await fetchTimeseries(athleteId);
        setRows(ts);
      } catch (e) { console.error(e); } 
      finally { setLoading(false); }
    })();
  }, [athleteId]);

  const currentAthlete = useMemo(() => athletes.find(a => a.athlete_id === athleteId), [athletes, athleteId]);
  const isGk = currentAthlete?.position === "GK";

  const viewRows = useMemo(() => {
    if (!rows?.length) return [];
    return range ? rows.slice(-range) : rows;
  }, [rows, range]);

  return (
    <div className="App" style={styles.container}>
      
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.brand}>
          <h1 style={styles.title}>Predict 2 Protect</h1>
          <p style={styles.subtitle}>怪我予防・コンディション管理システム</p>
        </div>
        <div style={styles.badge(isGk)}>
          <span>{isGk ? "🧤" : "🏃"}</span>
          {isGk ? "ゴールキーパー (GK)" : "フィールドプレーヤー (FP)"}
        </div>
      </header>

      {/* Control Bar */}
      <div style={styles.controlBar}>
        <div style={styles.controlGroup}>
          <label style={styles.label}>選手を選択 (ATHLETE)</label>
          <div style={styles.selectContainer}>
            <select 
              value={athleteId} 
              onChange={(e) => setAthleteId(e.target.value)}
              style={styles.select}
            >
              <optgroup label="フィールドプレーヤー (FP)">
                {athletes.filter(a => a.position !== "GK").map(a => (
                  <option key={a.athlete_id} value={a.athlete_id}>{a.athlete_name}</option>
                ))}
              </optgroup>
              <optgroup label="ゴールキーパー (GK)">
                {athletes.filter(a => a.position === "GK").map(a => (
                  <option key={a.athlete_id} value={a.athlete_id}>🧤 {a.athlete_name}</option>
                ))}
              </optgroup>
            </select>
            <div style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: theme.textSub, fontSize: 10 }}>▼</div>
          </div>
        </div>

        <div style={{...styles.controlGroup, flex: "0 0 auto"}}>
          <label style={styles.label}>表示期間 (DAYS)</label>
          <div style={{ display: "flex", gap: 8, background: theme.primaryLight, padding: 6, borderRadius: 8 }}>
            {[30, 90, 180].map(v => (
              <RangeButton 
                key={v} 
                value={v} 
                active={range === v} 
                onClick={() => setRange(v)} 
              />
            ))}
          </div>
        </div>
      </div>

      {/* 1. KPI Section */}
      <section style={styles.section}>
        <SectionTitle title="現在のコンディション (KPI)" />
        <div style={{ width: "100%" }}>
          <KpiCards rows={viewRows} isGk={isGk} />
        </div>
      </section>

      {/* 2. ACWR Section */}
      <section style={styles.section}>
        <SectionTitle title="負荷分析 (ACWR: 急性/慢性負荷比率)" />
        <div style={styles.gridHalf}>
          <ChartCard 
            title={isGk ? "ダイブ負荷 (全体量)" : "総走行距離 (全体量)"} 
            subtitle="練習量の急激な変化を監視"
          >
            <AcwrChart rows={viewRows} dataKey={isGk ? "acwr_dive" : "acwr_total_distance"} color="#F97316" />
          </ChartCard>
          
          <ChartCard 
            title={isGk ? "ジャンプ負荷 (強度)" : "高強度走行距離 HSR (強度)"} 
            subtitle="練習強度の急増を監視"
          >
            <AcwrChart rows={viewRows} dataKey={isGk ? "acwr_jump" : "acwr_hsr"} color="#F59E0B" />
          </ChartCard>
        </div>
      </section>

      {/* 3. Risk Factors Section */}
      <section style={{...styles.section, marginBottom: 0}}>
        <SectionTitle title="怪我リスク要因・詳細分析" />
        <div style={styles.gridHalf}>
          <ChartCard 
            title="モノトニー" 
            subtitle="オーバートレーニングの兆候"
          >
            <ConditionChart rows={viewRows} type="monotony" dataKey="monotony_load" />
          </ChartCard>

          <ChartCard 
            title="動作の非対称性" 
            subtitle={isGk ? "ダイブ方向の左右バランス" : "高強度動作(IMA)の左右バランス"}
          >
            <ConditionChart rows={viewRows} type="asymmetry" dataKey="val_asymmetry" />
          </ChartCard>
        </div>
      </section>

    </div>
  );
}

// === Sub Components ===

const SectionTitle = ({ title }) => (
  <h2 style={{ 
    fontSize: 20, 
    fontWeight: 800, 
    marginBottom: 24, 
    color: theme.textMain,
    display: "flex", alignItems: "center", gap: 12
  }}>
    <span style={{ display: "block", width: 6, height: 24, background: theme.primary, borderRadius: 2 }}></span>
    {title}
  </h2>
);

const RangeButton = ({ value, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      padding: "8px 20px", borderRadius: 6, border: "none",
      background: active ? "#fff" : "transparent",
      color: active ? theme.primary : theme.textSub,
      fontWeight: active ? 700 : 500, fontSize: 14, cursor: "pointer", 
      boxShadow: active ? "0 2px 4px rgba(0,0,0,0.1)" : "none",
      transition: "all 0.2s ease"
    }}
  >
    {value}日
  </button>
);

const ChartCard = ({ title, subtitle, children }) => (
  <div style={{ 
    background: theme.cardBg, 
    borderRadius: 16, 
    padding: 32, 
    boxShadow: theme.shadow, 
    // カード自体の高さ制限は削除し、中身（children）で高さを決める
    border: `1px solid ${theme.border}`,
    display: "flex", flexDirection: "column",
    minWidth: 0
  }}>
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: theme.textMain }}>{title}</h3>
      <p style={{ margin: "4px 0 0", fontSize: 13, color: theme.textSub }}>{subtitle}</p>
    </div>
    {/* ★修正: グラフを描画するdivに固定の高さを設定 */}
    <div style={styles.chartContainer}>
      {children}
    </div>
  </div>
);

export default App;