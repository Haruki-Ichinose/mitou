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

const riskPalette = {
  safety: {
    accent: "#16a34a",
    bg: "rgba(34, 197, 94, 0.12)",
    border: "rgba(34, 197, 94, 0.35)",
    text: "#166534",
  },
  caution: {
    accent: "#f59e0b",
    bg: "rgba(251, 191, 36, 0.16)",
    border: "rgba(251, 191, 36, 0.4)",
    text: "#92400e",
  },
  risky: {
    accent: "#ef4444",
    bg: "rgba(248, 113, 113, 0.16)",
    border: "rgba(248, 113, 113, 0.4)",
    text: "#b91c1c",
  },
};

const riskText = {
  safety: {
    label: "Safety",
    jp: "安定",
    description: "直近の負荷は安定しています。現状のリズムを維持しましょう。",
  },
  caution: {
    label: "Caution",
    jp: "注意",
    description: "負荷が上昇傾向です。回復と強度の調整を意識してください。",
  },
  risky: {
    label: "Risky",
    jp: "危険",
    description: "リスクが高い状態です。回復優先で負荷を調整してください。",
  },
};

const styles = {
  profileRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 20,
  },
  profileName: {
    fontSize: 24,
    fontWeight: 800,
    color: theme.textMain,
  },
  profileMetaRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 14,
    fontSize: 13,
    color: theme.textSub,
    fontWeight: 600,
    alignItems: "center",
  },
  profileBadge: (isGk) => ({
    padding: "6px 14px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 12,
    background: isGk ? theme.gkBg : theme.fpBg,
    color: isGk ? theme.gkText : theme.fpText,
  }),
  conditionHero: (level) => ({
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 24,
    padding: 28,
    borderRadius: 24,
    border: `1px solid ${(riskPalette[level] || riskPalette.safety).border}`,
    background: `linear-gradient(135deg, ${(riskPalette[level] || riskPalette.safety).bg} 0%, rgba(255,255,255,0.9) 70%)`,
    boxShadow: theme.shadow,
  }),
  conditionHeroHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    gap: 12,
    flexWrap: "wrap",
  },
  conditionTitle: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.24em",
    textTransform: "uppercase",
    color: theme.textSub,
  },
  conditionDate: {
    fontSize: 12,
    fontWeight: 700,
    color: theme.textSub,
  },
  conditionLevel: (level) => ({
    fontSize: 40,
    fontWeight: 900,
    color: (riskPalette[level] || riskPalette.safety).text,
    letterSpacing: "-0.02em",
    marginBottom: 8,
  }),
  conditionDesc: {
    margin: "0 0 16px",
    fontSize: 14,
    fontWeight: 600,
    color: theme.textSub,
  },
  reasonList: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  reasonPill: (level) => ({
    padding: "8px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    border: `1px solid ${(riskPalette[level] || riskPalette.safety).border}`,
    background: (riskPalette[level] || riskPalette.safety).bg,
    color: (riskPalette[level] || riskPalette.safety).text,
  }),
  reasonPillMuted: {
    padding: "8px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    border: `1px dashed ${theme.border}`,
    color: theme.textSub,
    background: "#fff",
  },
  section: { width: "100%" },
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
  decisionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: 12,
  },
  metricCard: (highlight, level) => ({
    position: "relative",
    background: "#fff",
    borderRadius: 16,
    padding: 16,
    border: `1px solid ${
      highlight ? (riskPalette[level] || riskPalette.safety).accent : theme.border
    }`,
    boxShadow: highlight ? "0 12px 24px rgba(0,0,0,0.08)" : theme.shadow,
  }),
  metricTag: (level) => ({
    position: "absolute",
    top: 12,
    right: 12,
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
    background: (riskPalette[level] || riskPalette.safety).accent,
    color: "#fff",
  }),
  metricValueLarge: {
    fontSize: 28,
    fontWeight: 800,
    color: theme.textMain,
    marginBottom: 6,
  },
  metricNote: {
    fontSize: 12,
    color: theme.textSub,
    marginTop: 6,
  },
  gaugeWrap: {
    marginTop: 10,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  gaugeTrack: {
    position: "relative",
    height: 10,
    borderRadius: 999,
    background: "#e2e8f0",
    overflow: "hidden",
  },
  gaugeFill: {
    height: "100%",
    borderRadius: 999,
    background: "#94a3b8",
  },
  gaugeIndicator: (color) => ({
    position: "absolute",
    top: -3,
    width: 16,
    height: 16,
    borderRadius: "50%",
    background: "#fff",
    border: `2px solid ${color}`,
    transform: "translateX(-50%)",
  }),
  gaugeMarker: (color) => ({
    position: "absolute",
    top: -6,
    width: 2,
    height: 22,
    borderRadius: 2,
    background: color,
  }),
  metricThreshold: {
    fontSize: 12,
    color: theme.textSub,
  },
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
    return rows.slice(-60); // 直近90日を固定表示
  }, [rows]);

  const latest = useMemo(() => viewRows[viewRows.length - 1], [viewRows]);
  const latestWorkload = latest?.workload || {};
  const riskLevel = latestWorkload.risk_level || "safety";
  const riskReasons = latestWorkload.risk_reasons || [];
  const riskSummary = riskText[riskLevel] || riskText.safety;

  const riskFlags = useMemo(() => {
    const flags = {
      hsr: false,
      load: false,
      monotony: false,
      efficiency: false,
      timeToFeet: false,
      diveAcwr: false,
      asymmetry: false,
    };
    riskReasons.forEach((reason) => {
      if (reason.includes("HSR ACWR")) flags.hsr = true;
      if (reason.includes("Distance ACWR")) flags.load = true;
      if (reason.includes("High Monotony")) flags.monotony = true;
      if (reason.includes("Low Efficiency")) flags.efficiency = true;
      if (reason.includes("Recovery Time")) flags.timeToFeet = true;
      if (reason.includes("Dive ACWR")) flags.diveAcwr = true;
      if (reason.includes("High Asymmetry")) flags.asymmetry = true;
    });
    return flags;
  }, [riskReasons]);

  const decisionMetrics = useMemo(() => {
    if (isGk) {
      return [
        {
          key: "acwr_dive",
          label: "Dive ACWR",
          value: latestWorkload.acwr_dive,
          threshold: ">= 1.5 : Risky",
          highlight: riskFlags.diveAcwr,
          gauge: { min: 0, max: 2.5, danger: 1.5 },
        },
        {
          key: "time_to_feet",
          label: "Time to Feet",
          value: latestWorkload.time_to_feet,
          unit: "s",
          threshold: ">= 1.5 : Caution / >= 2.0 : Risky",
          highlight: riskFlags.timeToFeet,
          gauge: { min: 0, max: 3, warn: 1.5, danger: 2.0 },
        },
        {
          key: "asymmetry",
          label: "Asymmetry",
          value: latestWorkload.val_asymmetry,
          threshold: ">= 0.4 : Caution",
          highlight: riskFlags.asymmetry,
          gauge: { min: 0, max: 1, warn: 0.4 },
        },
        {
          key: "monotony",
          label: "Monotony",
          value: latestWorkload.monotony_load,
          threshold: ">= 2.5 : Caution",
          highlight: riskFlags.monotony,
          gauge: { min: 0, max: 4, warn: 2.5 },
        },
      ];
    }
    return [
      {
        key: "acwr_hsr",
        label: "HSR ACWR",
        value: latestWorkload.acwr_hsr,
        threshold: ">= 1.3 : Caution / >= 1.5 : Risky",
        highlight: riskFlags.hsr,
        gauge: { min: 0, max: 2.5, warn: 1.3, danger: 1.5 },
      },
      {
        key: "acwr_load",
        label: "Load ACWR",
        value: latestWorkload.acwr_load,
        threshold: ">= 1.5 : Caution",
        highlight: riskFlags.load,
        gauge: { min: 0, max: 2.5, warn: 1.5 },
      },
      {
        key: "monotony",
        label: "Monotony",
        value: latestWorkload.monotony_load,
        threshold: ">= 2.5 : Caution",
        highlight: riskFlags.monotony,
        gauge: { min: 0, max: 4, warn: 2.5 },
      },
      {
        key: "efficiency",
        label: "Efficiency",
        value: latestWorkload.efficiency_index,
        threshold: "<= 0.5 : Caution",
        highlight: riskFlags.efficiency,
        gauge: { min: 0, max: 1.2, warn: 0.5 },
        note: "低いほどリスク",
      },
    ];
  }, [isGk, latestWorkload, riskFlags]);

  // Chart data builders
  const timelineData = useMemo(() => {
    const slice = viewRows.slice(-45);
    return {
      labels: slice.map((r) => r.date),
      loads: slice.map((r) => r.total_player_load || 0),
      acwr: slice.map((r) => (isGk ? r.workload?.acwr_dive : r.workload?.acwr_load)),
    };
  }, [viewRows, isGk]);

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

  return (
    <div className="app-shell">
      <div className="page data-detail-page">
        <div className="page-bar">
          <img
            className="title-logo title-logo--page"
            src={titleLogo}
            alt="Predict2Protect"
          />
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="ghost-button" to="/data">
              一覧へ
            </Link>
            <Link className="ghost-button" to="/home">
              ホームへ
            </Link>
          </div>
        </div>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>選手詳細</h2>
            </div>
            <span className="panel-count">更新: {latest?.date || "-"}</span>
          </div>

          <div style={styles.profileRow}>
            <div>
              <div style={styles.profileName}>{currentAthlete?.athlete_name || "-"}</div>
              <div style={styles.profileMetaRow}>
                <span style={styles.profileBadge(isGk)}>{isGk ? "GK" : "FP"}</span>
                <span>背番号: {currentAthlete?.jersey_number || "-"}</span>
                <span>表記: {currentAthlete?.uniform_name || "-"}</span>
                <span>ID: {currentAthlete?.athlete_id || "-"}</span>
              </div>
            </div>
          </div>

          <section style={styles.section}>
            <div style={styles.conditionHero(riskLevel)}>
              <div>
                <div style={styles.conditionHeroHeader}>
                  <span style={styles.conditionTitle}>コンディション判定</span>
                  <span style={styles.conditionDate}>更新: {latest?.date || "-"}</span>
                </div>
                <div style={styles.conditionLevel(riskLevel)}>{riskSummary.label}</div>
                <p style={styles.conditionDesc}>{riskSummary.description}</p>
                <div style={styles.reasonList}>
                  {riskReasons.length > 0 ? (
                    riskReasons.map((reason, index) => (
                      <span key={`${reason}-${index}`} style={styles.reasonPill(riskLevel)}>
                        {reason}
                      </span>
                    ))
                  ) : (
                    <span style={styles.reasonPillMuted}>特記事項なし</span>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section style={styles.section}>
            <SectionTitle title="判定に使用した値" />
            <div style={styles.decisionGrid}>
              {decisionMetrics.map((metric) => {
                const gauge = buildGauge(metric);
                const fillColor = metric.highlight
                  ? (riskPalette[riskLevel] || riskPalette.safety).accent
                  : "#94a3b8";
                return (
                  <div key={metric.key} style={styles.metricCard(metric.highlight, riskLevel)}>
                    {metric.highlight && <span style={styles.metricTag(riskLevel)}>判定要因</span>}
                    <div style={styles.metricLabel}>{metric.label}</div>
                    <div style={styles.metricValueLarge}>
                      {formatMetricValue(metric.value, metric.digits, metric.unit)}
                    </div>
                    <div style={styles.gaugeWrap}>
                      <div style={styles.gaugeTrack}>
                        <div
                          style={{
                            ...styles.gaugeFill,
                            width: `${gauge.position * 100}%`,
                            background: fillColor,
                          }}
                        />
                        {gauge.value !== null && (
                          <span
                            style={{
                              ...styles.gaugeIndicator(fillColor),
                              left: `${gauge.position * 100}%`,
                            }}
                          />
                        )}
                        {gauge.warnPos !== null && (
                          <span
                            style={{
                              ...styles.gaugeMarker(riskPalette.caution.accent),
                              left: `${gauge.warnPos * 100}%`,
                            }}
                          />
                        )}
                        {gauge.dangerPos !== null && (
                          <span
                            style={{
                              ...styles.gaugeMarker(riskPalette.risky.accent),
                              left: `${gauge.dangerPos * 100}%`,
                            }}
                          />
                        )}
                      </div>
                      <div style={styles.metricThreshold}>{metric.threshold}</div>
                      {metric.note && <div style={styles.metricNote}>{metric.note}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section style={styles.section}>
            <SectionTitle title="負荷とACWR 推移 (45日)" />
            <div style={styles.card}>
              <div style={{ height: 320 }}>
                <Chart type="bar" data={timelineChart} options={timelineOptions} />
              </div>
            </div>
          </section>
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

const formatNumber = (v, digits = 2) =>
  typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : "-";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const toNumber = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const formatMetricValue = (value, digits = 2, unit = "") => {
  const base = formatNumber(value, digits);
  if (base === "-") return "-";
  return unit ? `${base} ${unit}` : base;
};

const buildGauge = (metric) => {
  const gauge = metric.gauge || {};
  const min = gauge.min ?? 0;
  const max = gauge.max ?? 1;
  const value = toNumber(metric.value);
  const range = max - min || 1;
  const safeValue = value === null ? min : clamp(value, min, max);
  const position = clamp((safeValue - min) / range, 0, 1);
  const toPos = (raw) => {
    if (raw === null || raw === undefined) return null;
    return clamp((raw - min) / range, 0, 1);
  };
  return {
    min,
    max,
    value,
    position,
    warnPos: toPos(gauge.warn),
    dangerPos: toPos(gauge.danger),
  };
};

const diveCount = (row) => {
  const m = row.metrics || {};
  return (m.dive_left_count || 0) + (m.dive_right_count || 0) + (m.dive_centre_count || 0);
};
