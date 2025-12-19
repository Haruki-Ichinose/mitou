import React, { useMemo } from "react";

function sum(arr) {
  return arr.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
}

function mean(arr) {
  const xs = arr.filter(Number.isFinite);
  return xs.length ? sum(xs) / xs.length : null;
}

function Card({ title, value, sub }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.7)",
      border: "1px solid rgba(0,0,0,0.08)",
      borderRadius: 12,
      padding: 12,
      boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
      minWidth: 0
    }}>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
      {sub ? <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>{sub}</div> : null}
    </div>
  );
}

export default function KpiCards({ rows }) {
  const kpi = useMemo(() => {
    const last7 = rows.slice(-7);
    const td7 = sum(last7.map(r => r.total_distance));
    const pl7 = sum(last7.map(r => r.total_player_load));
    const acwrTdMean = mean(last7.map(r => r.workload?.acwr_ewma_total_distance));
    const acwrPlMean = mean(last7.map(r => r.workload?.acwr_ewma_total_player_load));
    const dynCount14 = rows.slice(-14).filter(r => r.dynamic?.dyn_anomaly).length;
    const staticCount14 = rows.slice(-14).filter(r => r.static_anomaly).length;
    const maxStreak30 = Math.max(0, ...rows.slice(-30).map(r => r.dynamic?.dyn_streak ?? 0));

    return { td7, pl7, acwrTdMean, acwrPlMean, dynCount14, staticCount14, maxStreak30 };
  }, [rows]);

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
      gap: 12,
      marginBottom: 12
    }}>
      <Card title="Last 7 days TD" value={kpi.td7 ? kpi.td7.toFixed(0) : "—"} sub="sum total_distance" />
      <Card title="Last 7 days PL" value={kpi.pl7 ? kpi.pl7.toFixed(0) : "—"} sub="sum total_player_load" />
      <Card
        title="ACWR mean (7d)"
        value={
          (kpi.acwrTdMean != null || kpi.acwrPlMean != null)
            ? `${kpi.acwrTdMean?.toFixed?.(2) ?? "—"} / ${kpi.acwrPlMean?.toFixed?.(2) ?? "—"}`
            : "—"
        }
        sub="TD / PL"
      />
      <Card
        title="Anomalies (14d) & Max streak (30d)"
        value={`${kpi.staticCount14} / ${kpi.dynCount14} / ${kpi.maxStreak30}`}
        sub="static / dynamic / max streak"
      />
    </div>
  );
}
