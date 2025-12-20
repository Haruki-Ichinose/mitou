import React, { useMemo } from "react";
import { Line } from "react-chartjs-2";

export default function AcwrChart({ rows, dataKey, color }) {
  const data = useMemo(() => {
    return {
      labels: rows.map(r => r.date),
      datasets: [
        {
          label: "ACWR",
          data: rows.map(r => r.workload?.[dataKey]),
          borderColor: color,
          backgroundColor: color,
          borderWidth: 2.5,
          pointRadius: 0, // 通常は点なし
          pointHoverRadius: 6,
          tension: 0.3,   // なめらかな曲線
        }
      ],
    };
  }, [rows, dataKey, color]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      annotation: {
        annotations: {
          safeZone: {
            type: 'box',
            yMin: 0.8,
            yMax: 1.3,
            backgroundColor: 'rgba(16, 185, 129, 0.1)', // 薄い緑
            borderWidth: 0,
            label: {
              display: true,
              content: "Safe Zone",
              color: "rgba(16, 185, 129, 0.6)",
              font: { size: 11 }
            }
          },
          dangerLine: {
            type: 'line',
            yMin: 1.5,
            yMax: 1.5,
            borderColor: 'rgba(239, 68, 68, 0.6)',
            borderWidth: 1,
            borderDash: [4, 4],
            label: {
              display: true,
              content: "Risk > 1.5",
              position: "end",
              color: "#EF4444",
              font: { size: 10 }
            }
          }
        }
      }
    },
    scales: {
      y: {
        min: 0,
        max: 2.5,
        grid: { color: "#F3F4F6" }
      },
      x: {
        display: false 
      }
    },
    interaction: {
      mode: 'index',
      intersect: false,
    },
  };

  return (
    <div style={{ height: 200 }}>
      <Line data={data} options={options} />
    </div>
  );
}