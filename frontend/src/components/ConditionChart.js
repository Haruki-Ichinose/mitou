import React, { useMemo } from "react";
import { Bar } from "react-chartjs-2";

export default function ConditionChart({ rows, type, dataKey }) {
  const threshold = type === 'monotony' ? 2.0 : 20.0;
  const baseColor = type === 'monotony' ? "#8B5CF6" : "#B45309"; 

  const data = useMemo(() => {
    return {
      labels: rows.map(r => r.date),
      datasets: [
        {
          label: type,
          data: rows.map(r => r.workload?.[dataKey]),
          backgroundColor: rows.map(r => {
            const val = r.workload?.[dataKey];
            // 閾値を超えたら「警告色（赤）」にする
            return val > threshold ? "#EF4444" : baseColor + "66"; 
          }),
          borderRadius: 4,
          borderSkipped: false,
        }
      ],
    };
  }, [rows, dataKey, threshold, baseColor, type]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      annotation: {
        annotations: {
          thresholdLine: {
            type: 'line',
            yMin: threshold,
            yMax: threshold,
            borderColor: '#EF4444',
            borderWidth: 1,
            borderDash: [4, 4],
          }
        }
      }
    },
    scales: {
      y: {
        grid: { color: "#F3F4F6" },
        suggestedMax: threshold * 1.3,
      },
      x: { display: false }
    }
  };

  return (
    <div style={{ height: 180 }}>
      <Bar data={data} options={options} />
    </div>
  );
}