import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fetchAthletes, fetchTimeseries } from "../api";

// Charts
import KpiCards from "../components/KpiCards";
import AcwrChart from "../components/AcwrChart";
import ConditionChart from "../components/ConditionChart";

// === テーマ設定 ===
const theme = {
  bg: "var(--surface)",
  textMain: "var(--ink-900)",
  textSub: "var(--ink-600)",
  cardBg: "#ffffff",
  primary: "var(--accent-sun)",
  primaryLight: "var(--accent-sun-soft)",
  border: "var(--border-soft)",
  shadow: "var(--shadow-soft)",
  fpBg: "rgba(14, 165, 233, 0.15)",
  fpText: "#075985",
  gkBg: "rgba(251, 191, 36, 0.2)",
  gkText: "#92400E",
};

const styles = {
  container: {
    width: "100%",
    maxWidth: 1280,
    margin: "0 auto",
    padding: "32px 40px 48px",
    boxSizing: "border-box",
    fontFamily: "var(--font-body)",
    background: theme.bg,
    borderRadius: 28,
    border: `1px solid ${theme.border}`,
    boxShadow: theme.shadow,
    color: theme.textMain,
  },
  topNav: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  topNavLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.28em",
    textTransform: "uppercase",
    color: theme.textSub,
  },
  topNavActions: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 32,
    borderBottom: `1px solid ${theme.border}`,
    paddingBottom: 24,
    gap: 20,
    flexWrap: "wrap",
  },
  brand: { display: "flex", flexDirection: "column", gap: 4 },
  title: {
    margin: 0,
    fontSize: 32,
    fontWeight: 800,
    letterSpacing: "-0.02em",
    fontFamily: "var(--font-display)",
    color: theme.textMain,
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
    borderRadius: 16,
    boxShadow: theme.shadow,
    display: "flex",
    gap: 32,
    alignItems: "center",
    marginBottom: 48,
    border: `1px solid ${theme.border}`,
    flexWrap: "wrap",
  },
  controlGroup: { display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 240 },
  label: { fontSize: 12, fontWeight: 700, color: theme.textSub, letterSpacing: "0.05em" },
  selectContainer: { position: "relative", width: "100%", maxWidth: 420 },
  select: {
    width: "100%",
    padding: "12px 16px",
    borderRadius: 10,
    border: `1px solid ${theme.border}`,
    fontSize: 16,
    fontWeight: 600,
    color: theme.textMain,
    appearance: "none",
    background: "rgba(255, 255, 255, 0.95)",
    cursor: "pointer",
    outline: "none",
  },

  section: {
    marginBottom: 56,
    width: "100%",
  },

  gridHalf: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 28,
    width: "100%",
  },

  chartContainer: {
    position: "relative",
    height: 220,
    width: "100%",
  },
};

export default function DataDetailPage() {
  const navigate = useNavigate();
  const { athleteId: athleteIdParam } = useParams();
  const [athletes, setAthletes] = useState([]);
  const [athleteId, setAthleteId] = useState(athleteIdParam || "");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState(90);

  useEffect(() => {
    setAthleteId(athleteIdParam || "");
  }, [athleteIdParam]);

  useEffect(() => {
    let mounted = true;

    const loadAthletes = async () => {
      try {
        const list = await fetchAthletes();
        if (!mounted) return;
        setAthletes(list);

        if (!athleteIdParam && list.length > 0) {
          navigate(`/data/${list[0].athlete_id}`, { replace: true });
        }
      } catch (e) {
        console.error(e);
      }
    };

    loadAthletes();

    return () => {
      mounted = false;
    };
  }, [athleteIdParam, navigate]);

  useEffect(() => {
    if (!athleteId) return;

    let mounted = true;

    const loadTimeseries = async () => {
      setLoading(true);
      try {
        const ts = await fetchTimeseries(athleteId);
        if (mounted) setRows(ts);
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadTimeseries();

    return () => {
      mounted = false;
    };
  }, [athleteId]);

  const currentAthlete = useMemo(
    () => athletes.find((athlete) => athlete.athlete_id === athleteId),
    [athletes, athleteId]
  );
  const isGk = currentAthlete?.position === "GK";

  const viewRows = useMemo(() => {
    if (!rows?.length) return [];
    return range ? rows.slice(-range) : rows;
  }, [rows, range]);

  const handleAthleteChange = (event) => {
    const nextId = event.target.value;
    setAthleteId(nextId);
    navigate(`/data/${nextId}`);
  };

  return (
    <div className="app-shell">
      <div className="page data-detail-page" style={styles.container}>
        <div style={styles.topNav}>
          <span style={styles.topNavLabel}>Performance Detail</span>
          <div style={styles.topNavActions}>
            <Link className="ghost-button" to="/data">
              一覧へ
            </Link>
            <Link className="ghost-button" to="/home">
              ホームへ
            </Link>
          </div>
        </div>

        <header style={styles.header}>
          <div style={styles.brand}>
            <h1 style={styles.title}>Predict2Protect</h1>
            <p style={styles.subtitle}>怪我予防・コンディション管理システム</p>
          </div>
          <div style={styles.badge(isGk)}>
            <span>{isGk ? "🧤" : "🏃"}</span>
            {isGk ? "ゴールキーパー (GK)" : "フィールドプレーヤー (FP)"}
          </div>
        </header>

        <div style={styles.controlBar}>
          <div style={styles.controlGroup}>
            <label style={styles.label}>選手を選択 (ATHLETE)</label>
            <div style={styles.selectContainer}>
              <select value={athleteId} onChange={handleAthleteChange} style={styles.select}>
                <optgroup label="フィールドプレーヤー (FP)">
                  {athletes
                    .filter((athlete) => athlete.position !== "GK")
                    .map((athlete) => (
                      <option key={athlete.athlete_id} value={athlete.athlete_id}>
                        {athlete.athlete_name}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="ゴールキーパー (GK)">
                  {athletes
                    .filter((athlete) => athlete.position === "GK")
                    .map((athlete) => (
                      <option key={athlete.athlete_id} value={athlete.athlete_id}>
                        🧤 {athlete.athlete_name}
                      </option>
                    ))}
                </optgroup>
              </select>
              <div
                style={{
                  position: "absolute",
                  right: 16,
                  top: "50%",
                  transform: "translateY(-50%)",
                  pointerEvents: "none",
                  color: theme.textSub,
                  fontSize: 10,
                }}
              >
                ▼
              </div>
            </div>
          </div>

          <div style={{ ...styles.controlGroup, flex: "0 0 auto" }}>
            <label style={styles.label}>表示期間 (DAYS)</label>
            <div style={{ display: "flex", gap: 8, background: theme.primaryLight, padding: 6, borderRadius: 10 }}>
              {[30, 90, 180].map((value) => (
                <RangeButton key={value} value={value} active={range === value} onClick={() => setRange(value)} />
              ))}
            </div>
          </div>

          <div style={{ ...styles.controlGroup, flex: "0 0 auto", minWidth: 180 }}>
            <label style={styles.label}>状態</label>
            <p className="inline-status">{loading ? "読み込み中" : "更新済み"}</p>
          </div>
        </div>

        <section style={styles.section}>
          <SectionTitle title="現在のコンディション (KPI)" />
          <div style={{ width: "100%" }}>
            <KpiCards rows={viewRows} isGk={isGk} />
          </div>
        </section>

        <section style={styles.section}>
          <SectionTitle title="負荷分析 (ACWR: 急性/慢性負荷比率)" />
          <div style={styles.gridHalf}>
            <ChartCard title={isGk ? "ダイブ負荷 (全体量)" : "総走行距離 (全体量)"} subtitle="練習量の急激な変化を監視">
              <AcwrChart rows={viewRows} dataKey={isGk ? "acwr_dive" : "acwr_total_distance"} color="#F97316" />
            </ChartCard>

            <ChartCard title={isGk ? "ジャンプ負荷 (強度)" : "高強度走行距離 HSR (強度)"} subtitle="練習強度の急増を監視">
              <AcwrChart rows={viewRows} dataKey={isGk ? "acwr_jump" : "acwr_hsr"} color="#0EA5E9" />
            </ChartCard>
          </div>
        </section>

        <section style={{ ...styles.section, marginBottom: 0 }}>
          <SectionTitle title="怪我リスク要因・詳細分析" />
          <div style={styles.gridHalf}>
            <ChartCard title="モノトニー" subtitle="オーバートレーニングの兆候">
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
    </div>
  );
}

const SectionTitle = ({ title }) => (
  <h2
    style={{
      fontSize: 20,
      fontWeight: 800,
      marginBottom: 24,
      color: theme.textMain,
      display: "flex",
      alignItems: "center",
      gap: 12,
    }}
  >
    <span style={{ display: "block", width: 6, height: 24, background: theme.primary, borderRadius: 2 }}></span>
    {title}
  </h2>
);

const RangeButton = ({ value, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      padding: "8px 20px",
      borderRadius: 8,
      border: "none",
      background: active ? "#fff" : "transparent",
      color: active ? theme.primary : theme.textSub,
      fontWeight: active ? 700 : 500,
      fontSize: 14,
      cursor: "pointer",
      boxShadow: active ? "0 6px 16px rgba(15, 23, 42, 0.12)" : "none",
      transition: "all 0.2s ease",
    }}
  >
    {value}日
  </button>
);

const ChartCard = ({ title, subtitle, children }) => (
  <div
    style={{
      background: theme.cardBg,
      borderRadius: 16,
      padding: 28,
      boxShadow: theme.shadow,
      border: `1px solid ${theme.border}`,
      display: "flex",
      flexDirection: "column",
      minWidth: 0,
    }}
  >
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: theme.textMain }}>{title}</h3>
      <p style={{ margin: "4px 0 0", fontSize: 13, color: theme.textSub }}>{subtitle}</p>
    </div>
    <div style={styles.chartContainer}>{children}</div>
  </div>
);
