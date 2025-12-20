import React, { useMemo } from "react";

export default function KpiCards({ rows, isGk }) {
  const kpi = useMemo(() => {
    const last = rows[rows.length - 1] || {};
    const workload = last.workload || {};
    
    return {
      date: last.date,
      mainLoad: isGk ? last.total_dive_load : last.total_distance,
      subLoad: isGk ? last.total_jumps : last.hsr_distance,
      acwrMain: isGk ? workload.acwr_dive : workload.acwr_total_distance,
      acwrSub: isGk ? workload.acwr_jump : workload.acwr_hsr,
      monotony: workload.monotony_load,
      asymmetry: workload.val_asymmetry
    };
  }, [rows, isGk]);

  if (!kpi.date) return null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
      <Card 
        title={isGk ? "Daily Dive Load" : "Daily Distance"} 
        value={kpi.mainLoad?.toFixed(0) || "-"} 
        unit={isGk ? "au" : "m"} 
      />
      <Card 
        title={isGk ? "ACWR (Dive)" : "ACWR (Dist)"} 
        value={kpi.acwrMain?.toFixed(2) || "-"} 
        status={getAcwrStatus(kpi.acwrMain)}
      />
      <Card 
        title="Monotony" 
        value={kpi.monotony?.toFixed(2) || "-"} 
        status={kpi.monotony > 2.0 ? "danger" : "good"}
      />
      <Card 
        title="Asymmetry" 
        value={(kpi.asymmetry?.toFixed(1) || "0") + "%"} 
        status={kpi.asymmetry > 15 ? "warning" : "good"}
      />
    </div>
  );
}

function getAcwrStatus(val) {
  if (!val) return "neutral";
  if (val > 1.5) return "danger";
  if (val < 0.8) return "warning";
  return "good";
}

function Card({ title, value, unit, status }) {
  let color = "#111827";
  if (status === "danger") color = "#EF4444";
  if (status === "warning") color = "#F59E0B";
  if (status === "good") color = "#10B981";

  return (
    <div style={{ background: "#fff", padding: "16px", borderRadius: 12, boxShadow: "0 1px 2px rgba(0,0,0,0.05)", border: "1px solid #F3F4F6" }}>
      <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>
        {value} <span style={{ fontSize: 14, color: "#9CA3AF", fontWeight: 400 }}>{unit}</span>
      </div>
    </div>
  );
}