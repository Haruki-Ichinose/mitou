import React, { useMemo } from "react";
import { Line } from "react-chartjs-2";

export default function AcwrChart({ rows, which }) {
  // which: "td" | "pl"
  const { data, options } = useMemo(() => {
    const labels = rows.map(r => r.date);
    const values = rows.map(r =>
      which === "td"
        ? r.workload?.acwr_ewma_total_distance ?? null
        : r.workload?.acwr_ewma_total_player_load ?? null
    );

    const title = which === "td" ? "ACWR (TD)" : "ACWR (PL)";

    return {
      data: {
        labels,
        datasets: [
          {
            label: title,
            data: values,
            borderColor: "#0f172a",
            backgroundColor: "rgba(15,23,42,0.08)",
            fill: true,
            pointRadius: 1.5,
            pointHoverRadius: 5,
            tension: 0.25,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: true },
          annotation: {
            annotations: {
              baseline: {
                type: "line",
                yMin: 1.0,
                yMax: 1.0,
                borderColor: "rgba(220,38,38,0.8)",
                borderWidth: 2,
                label: {
                  display: true,
                  content: "1.0",
                  position: "end",
                  backgroundColor: "rgba(220,38,38,0.9)",
                  color: "white",
                  padding: 4,
                  borderRadius: 6,
                },
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
          y: { grid: { color: "rgba(0,0,0,0.08)" }, suggestedMin: 0.6, suggestedMax: 1.6 },
        },
      },
    };
  }, [rows, which]);

  return (
    <div style={{
      background: "rgba(255,255,255,0.7)",
      border: "1px solid rgba(0,0,0,0.08)",
      borderRadius: 12,
      padding: 12,
      boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
    }}>
      <div style={{ height: 260 }}>
        <Line data={data} options={options} />
      </div>
    </div>
  );
}
