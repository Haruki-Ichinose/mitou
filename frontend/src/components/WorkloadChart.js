import React, { useMemo } from "react";
import { Line } from "react-chartjs-2";

export default function WorkloadChart({ rows, metric }) {
  // metric: "total_distance" | "total_player_load"
  const { data, options } = useMemo(() => {
    const labels = rows.map(r => r.date);

    const main = rows.map(r => r[metric]);
    const dynPoints = rows.map(r => (r.dynamic?.dyn_anomaly ? r[metric] : null));
    const staticPoints = rows.map(r => (r.static_anomaly ? r[metric] : null));

    const title = metric === "total_distance" ? "Total Distance" : "Total Player Load";

    return {
      data: {
        labels,
        datasets: [
          {
            label: title,
            data: main,
            borderColor: "#111827",
            backgroundColor: "rgba(17,24,39,0.10)",
            fill: true,
            pointRadius: 0,
            tension: 0.25,
          },
          {
            label: "Dynamic anomaly",
            data: dynPoints,
            showLine: false,
            pointRadius: 4,
            pointHoverRadius: 7,
            pointBackgroundColor: "rgba(220,38,38,0.95)",
            pointBorderColor: "rgba(255,255,255,0.9)",
            pointBorderWidth: 1,
          },
          {
            label: "Static anomaly",
            data: staticPoints,
            showLine: false,
            pointStyle: "triangle",
            pointRadius: 5,
            pointHoverRadius: 8,
            pointBackgroundColor: "rgba(124,58,237,0.95)",
            pointBorderColor: "rgba(255,255,255,0.9)",
            pointBorderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "top", labels: { boxWidth: 12, boxHeight: 12 } },
          tooltip: { enabled: true },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxTicksLimit: 8 },
          },
          y: {
            grid: { color: "rgba(0,0,0,0.08)" },
          },
        },
      },
    };
  }, [rows, metric]);

  return (
    <div style={{
      background: "rgba(255,255,255,0.7)",
      border: "1px solid rgba(0,0,0,0.08)",
      borderRadius: 12,
      padding: 12,
      boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
    }}>
      <div style={{ height: 320 }}>
        <Line data={data} options={options} />
      </div>
    </div>
  );
}

