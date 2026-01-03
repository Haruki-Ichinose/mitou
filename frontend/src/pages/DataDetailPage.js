import React, { useEffect, useMemo, useState } from "react";
import { Chart } from "react-chartjs-2";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fetchAthletes, fetchTimeseries } from "../api";
import titleLogo from "../components/title.jpg";

const theme = {
  bg: "var(--surface)",
  textMain: "var(--ink-900)",
  textSub: "var(--ink-600)",
  cardBg: "#ffffff",
  primary: "var(--accent-sun)",
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
    maxWidth: 1320,
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
    justifyContent: "flex-end",
    alignItems: "center",
    marginBottom: 12,
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
    marginBottom: 16,
    borderBottom: `1px solid ${theme.border}`,
    paddingBottom: 14,
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
  headline: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    flexWrap: "wrap",
    gap: 12,
  },
  conditionBadge: (level) => ({
    padding: "10px 16px",
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 800,
    background: level === "caution" ? "#fee2e2" : level === "risky" ? "#fef3c7" : "#dcfce7",
    color: level === "caution" ? "#b91c1c" : level === "risky" ? "#b45309" : "#166534",
    boxShadow: "0 8px 18px rgba(0,0,0,0.05)",
  }),
  section: { marginBottom: 28, width: "100%" },
  gridRow: {
    display: "grid",
    gridTemplateColumns: "0.35fr 0.65fr",
    gap: 16,
    alignItems: "stretch",
  },
  card: {
    background: theme.cardBg,
    borderRadius: 16,
    padding: 18,
    border: `1px solid ${theme.border}`,
    boxShadow: theme.shadow,
    height: "100%",
  },
  kpiStack: { display: "grid", gridTemplateColumns: "1fr", gap: 12 },
  metricLabel: { fontSize: 12, fontWeight: 700, color: theme.textSub, letterSpacing: "0.08em" },
  metricValue: { fontSize: 26, fontWeight: 800, color: theme.textMain },
  metricHint: { fontSize: 12, color: theme.textSub },
  chartsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
    gap: 16,
  },
};

export default function DataDetailPage() {
  const navigate = useNavigate();
  const { athleteId: athleteIdParam } = useParams();
  const [athletes, setAthletes] = useState([]);
  const [athleteId, setAthleteId] = useState(athleteIdParam || "");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

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
    return rows.slice(-90); // 直近90日を固定表示
  }, [rows]);

  const latest = useMemo(() => viewRows[viewRows.length - 1], [viewRows]);
  const latestWorkload = latest?.workload || {};
  const riskLevel = latestWorkload.risk_level || "safety";
  const riskReasons = latestWorkload.risk_reasons || [];
  const kpiAcwr = isGk ? latestWorkload.acwr_dive : latestWorkload.acwr_total_distance;
  const kpiLoad = isGk ? latest?.total_dive_load : latest?.total_player_load;

  // Chart data builders
  const timelineData = useMemo(() => {
    const slice = viewRows.slice(-45);
    return {
      labels: slice.map((r) => r.date),
      loads: slice.map((r) => r.total_player_load || 0),
      acwr: slice.map((r) => (isGk ? r.workload?.acwr_dive : r.workload?.acwr_total_distance)),
    };
  }, [viewRows, isGk]);

  const monotonyData = useMemo(
    () => ({
      labels: viewRows.map((r) => r.date),
      values: viewRows.map((r) => r.workload?.monotony_load ?? null),
    }),
    [viewRows]
  );

  const asymData = useMemo(
    () => ({
      labels: viewRows.map((r) => r.date),
      values: viewRows.map((r) => r.workload?.val_asymmetry ?? null),
    }),
    [viewRows]
  );

  const decelEffData = useMemo(
    () => ({
      labels: viewRows.map((r) => r.date),
      decel: viewRows.map((r) => r.workload?.decel_density ?? null),
      eff: viewRows.map((r) => r.workload?.load_per_meter ?? null),
    }),
    [viewRows]
  );

  const timelineChart = {
    labels: timelineData.labels,
    datasets: [
      {
        type: "bar",
        label: "Daily Load",
        data: timelineData.loads,
        backgroundColor: "rgba(59,130,246,0.25)",
        borderRadius: 6,
        yAxisID: "load",
      },
      {
        type: "line",
        label: "ACWR",
        data: timelineData.acwr,
        borderColor: "#ef4444",
        backgroundColor: "rgba(239,68,68,0.2)",
        yAxisID: "acwr",
        tension: 0.3,
        pointRadius: 2,
        pointHoverRadius: 4,
      },
    ],
  };

  const timelineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "top" },
      annotation: {
        annotations: {
          risk: {
            type: "line",
            yMin: 1.5,
            yMax: 1.5,
            borderColor: "#ef4444",
            borderWidth: 1,
            borderDash: [6, 4],
            yScaleID: "acwr",
            label: {
              display: true,
              content: "ACWR=1.5",
              position: "end",
              backgroundColor: "rgba(239,68,68,0.08)",
              color: "#b91c1c",
            },
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false } },
      load: {
        position: "left",
        grid: { color: "#f3f4f6" },
        title: { display: true, text: "Daily Load" },
      },
      acwr: {
        position: "right",
        grid: { display: false },
        title: { display: true, text: "ACWR" },
        min: 0,
        max: 3,
      },
    },
  };

  const lineOptions = (title, max) => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false } },
      y: {
        grid: { color: "#f3f4f6" },
        suggestedMax: max || undefined,
      },
    },
  });

  return (
    <div className="app-shell">
      <div className="page data-detail-page" style={styles.container}>
        <div style={styles.topNav}>
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
            <img
              className="title-logo title-logo--detail"
              src={titleLogo}
              alt="Predict2Protect"
            />
          </div>
          <div style={styles.badge(isGk)}>
            <span>{isGk ? "🧤" : "🏃"}</span>
            {isGk ? "ゴールキーパー (GK)" : "フィールドプレーヤー (FP)"}
          </div>
        </header>

        <div style={styles.headline}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{currentAthlete?.athlete_name || "-"}</div>
            <div style={{ color: theme.textSub, fontWeight: 600 }}>Date: {latest?.date || "-"}</div>
          </div>
          <div style={styles.conditionBadge(riskLevel)}>{riskLevel}</div>
        </div>

        <div style={{ ...styles.gridRow, marginBottom: 20 }}>
          <div style={styles.card}>
            <SectionTitle title="Profile & KPIs" />
            <div style={styles.kpiStack}>
              <div>
                <div style={styles.metricLabel}>ACWR</div>
                <div style={styles.metricValue}>{formatNumber(kpiAcwr)}</div>
              </div>
              <div>
                <div style={styles.metricLabel}>{isGk ? "Dive Load" : "Daily Load"}</div>
                <div style={styles.metricValue}>{formatNumber(kpiLoad)}</div>
              </div>
              <div>
                <div style={styles.metricLabel}>Risk Reasons</div>
                <div style={styles.metricHint}>{riskReasons.join(", ") || "特記事項なし"}</div>
              </div>
            </div>
          </div>

          <div style={styles.card}>
            <SectionTitle title="負荷とACWR 推移 (45日)" />
            <div style={{ height: 320 }}>
              <Chart type="bar" data={timelineChart} options={timelineOptions} />
            </div>
          </div>
        </div>

        <section style={styles.section}>
          <SectionTitle title="コンディション指標の推移" />
          <div style={styles.chartsGrid}>
            <div style={styles.card}>
              <h4 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 800 }}>モノトニー (7日)</h4>
              <div style={{ height: 220 }}>
                <Chart
                  type="line"
                  data={{
                    labels: monotonyData.labels,
                    datasets: [
                      {
                        label: "Monotony",
                        data: monotonyData.values,
                        borderColor: "#0ea5e9",
                        backgroundColor: "rgba(14,165,233,0.12)",
                        tension: 0.3,
                        pointRadius: 0,
                      },
                    ],
                  }}
                  options={lineOptions("Monotony", 3)}
                />
              </div>
            </div>

            <div style={styles.card}>
              <h4 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 800 }}>
                {isGk ? "ダイブ左右非対称" : "動作左右非対称"}
              </h4>
              <div style={{ height: 220 }}>
                <Chart
                  type="line"
                  data={{
                    labels: asymData.labels,
                    datasets: [
                      {
                        label: "Asymmetry",
                        data: asymData.values,
                        borderColor: "#f97316",
                        backgroundColor: "rgba(249,115,22,0.12)",
                        tension: 0.3,
                        pointRadius: 0,
                      },
                    ],
                  }}
                  options={lineOptions("Asymmetry", 1)}
                />
              </div>
            </div>

            <div style={styles.card}>
              <h4 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 800 }}>減速密度</h4>
              <div style={{ height: 220 }}>
                <Chart
                  type="line"
                  data={{
                    labels: decelEffData.labels,
                    datasets: [
                      {
                        label: "Decel Density",
                        data: decelEffData.decel,
                        borderColor: "#6366f1",
                        backgroundColor: "rgba(99,102,241,0.12)",
                        tension: 0.3,
                        pointRadius: 0,
                      },
                    ],
                  }}
                  options={lineOptions("Decel", undefined)}
                />
              </div>
            </div>

            <div style={styles.card}>
              <h4 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 800 }}>機械的効率 (load/m)</h4>
              <div style={{ height: 220 }}>
                <Chart
                  type="line"
                  data={{
                    labels: decelEffData.labels,
                    datasets: [
                      {
                        label: "Mechanical Efficiency",
                        data: decelEffData.eff,
                        borderColor: "#22c55e",
                        backgroundColor: "rgba(34,197,94,0.12)",
                        tension: 0.3,
                        pointRadius: 0,
                      },
                    ],
                  }}
                  options={lineOptions("Efficiency", undefined)}
                />
              </div>
            </div>
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
      marginBottom: 12,
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

const formatNumber = (v) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(3) : "-");

const diveCount = (row) => {
  const m = row.metrics || {};
  return (m.dive_left_count || 0) + (m.dive_right_count || 0) + (m.dive_centre_count || 0);
};
