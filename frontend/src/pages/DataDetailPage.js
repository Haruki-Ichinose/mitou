import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fetchAthletes, fetchTimeseries } from "../api";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import annotationPlugin from "chartjs-plugin-annotation";
import { Chart } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
  annotationPlugin
);

const SectionTitle = ({ title }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "0 0 12px", justifyContent: "flex-start" }}>
    <span style={{ display: "block", width: 6, height: 20, background: "var(--accent-sun)", borderRadius: 2 }}></span>
    <h2 style={{ fontSize: 20, fontWeight: 800, color: "var(--ink-900)", margin: 0, textAlign: "left" }}>
      {title}
    </h2>
  </div>
);

const formatNumber = (v) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(3) : "-");

const diveCount = (row) => {
  const m = row.metrics || {};
  return (m.dive_left_count || 0) + (m.dive_right_count || 0) + (m.dive_centre_count || 0);
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
    return rows.slice(-90); // 直近90日固定
  }, [rows]);

  const latest = useMemo(() => viewRows[viewRows.length - 1], [viewRows]);
  const latestWorkload = latest?.workload || {};
  const riskLevel = latestWorkload.risk_level || "safety";
  const riskReasons = latestWorkload.risk_reasons || [];
  const kpiAcwr = isGk ? latestWorkload.acwr_dive : latestWorkload.acwr_total_distance;
  const kpiLoad = isGk ? latest?.total_dive_load : latest?.total_player_load;

  const timelineData = useMemo(() => {
    const slice = viewRows.slice(-45);
    return {
      labels: slice.map((r) => r.date),
      loads: slice.map((r) => r.total_player_load || 0),
      acwr: slice.map((r) => (isGk ? r.workload?.acwr_dive : r.workload?.acwr_total_distance)),
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
        backgroundColor: "rgba(239,68,68,0.18)",
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

  const lineOptions = (max) => ({
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

  const chartBlock = (title, labels, values, color, max) => (
    <div className="panel" style={{ padding: 20 }}>
      <h4 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 800 }}>{title}</h4>
      <div style={{ height: 220 }}>
        <Chart
          type="line"
          data={{
            labels,
            datasets: [
              {
                label: title,
                data: values,
                borderColor: color,
                backgroundColor: `${color}1f`,
                tension: 0.3,
                pointRadius: 0,
              },
            ],
          }}
          options={lineOptions(max)}
        />
      </div>
    </div>
  );

  const riskBadge = (level) => ({
    padding: "12px 18px",
    borderRadius: 14,
    fontSize: 18,
    fontWeight: 900,
    letterSpacing: "0.04em",
    background: level === "caution" ? "#fee2e2" : level === "risky" ? "#fef3c7" : "#dcfce7",
    color: level === "caution" ? "#b91c1c" : level === "risky" ? "#b45309" : "#166534",
    boxShadow: "0 10px 22px rgba(0,0,0,0.06)",
    textTransform: "uppercase",
  });

  return (
    <div className="app-shell">
      <div className="page data-detail-page">
        <div className="page-bar">
          <h1 className="page-title">Predict2Protect</h1>
          <div className="page-bar__actions">
            <Link className="ghost-button" to="/data">
              一覧へ
            </Link>
            <Link className="ghost-button" to="/home">
              ホームへ
            </Link>
          </div>
        </div>

        <div className="panel" style={{ gap: 12 }}>
          <div className="hero">
            <p className="hero-eyebrow">Performance Detail</p>
            <h2 className="hero-title" style={{ fontSize: "2.4rem", marginBottom: 4 }}>
              {currentAthlete?.athlete_name || "-"}
            </h2>
            <p className="hero-subtitle" style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span>{isGk ? "ゴールキーパー (GK)" : "フィールドプレーヤー (FP)"}</span>
              <span style={riskBadge(riskLevel)}>{riskLevel}</span>
            </p>
            <p className="hero-subtitle">Date: {latest?.date || "-"} {loading && "(更新中...)"}</p>
          </div>
        </div>

        <div className="panel">
          <SectionTitle title="Profile & KPIs" />
          <div className="player-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <div className="player-card" style={{ border: "1px solid var(--border-soft)" }}>
              <span className="player-card__meta">ACWR</span>
              <span className="player-card__name" style={{ fontSize: 28 }}>{formatNumber(kpiAcwr)}</span>
            </div>
            <div className="player-card" style={{ border: "1px solid var(--border-soft)" }}>
              <span className="player-card__meta">{isGk ? "Dive Load" : "Daily Load"}</span>
              <span className="player-card__name" style={{ fontSize: 28 }}>{formatNumber(kpiLoad)}</span>
            </div>
            <div className="player-card" style={{ border: "1px solid var(--border-soft)" }}>
              <span className="player-card__meta">Risk Reasons</span>
              <span className="player-card__name" style={{ fontSize: 16 }}>
                {riskReasons.join(", ") || "特記事項なし"}
              </span>
            </div>
          </div>
        </div>

        <div className="panel">
          <SectionTitle title="負荷とACWR 推移 (45日)" />
          <div style={{ height: 340 }}>
            <Chart type="bar" data={timelineChart} options={timelineOptions} />
          </div>
        </div>

        <div className="panel">
          <SectionTitle title="コンディション指標の推移" />
          <div className="player-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            {chartBlock(
              "モノトニー (7日)",
              viewRows.map((r) => r.date),
              viewRows.map((r) => r.workload?.monotony_load ?? null),
              "#0ea5e9",
              3
            )}
            {chartBlock(
              isGk ? "ダイブ左右非対称" : "動作左右非対称",
              viewRows.map((r) => r.date),
              viewRows.map((r) => r.workload?.val_asymmetry ?? null),
              "#f97316",
              1
            )}
            {chartBlock(
              "減速密度",
              viewRows.map((r) => r.date),
              viewRows.map((r) => r.workload?.decel_density ?? null),
              "#6366f1"
            )}
            {chartBlock(
              "機械的効率 (load/m)",
              viewRows.map((r) => r.date),
              viewRows.map((r) => r.workload?.load_per_meter ?? null),
              "#22c55e"
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
