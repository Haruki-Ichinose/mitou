import React, { useMemo } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  BarElement
} from 'chart.js';

ChartJS.register(BarElement);

export default function ConditionChart({ rows, type, dataKey }) {
  // type: 'monotony' | 'asymmetry'
  const threshold = type === 'monotony' ? 2.0 : 20.0;
  const color = type === 'monotony' ? "#8B5CF6" : "#B45309"; // Purple / Brown

  const data = useMemo(() => {
    return {
      labels: rows.map(r => r.date),
      datasets: [
        {
          label: type,
          data: rows.map(r => r.workload?.[dataKey]),
          backgroundColor: rows.map(r => {
            const val = r.workload?.[dataKey];
            return val > threshold ? "rgba(239, 68, 68, 0.8)" : color + "88"; // 超えたら赤
          }),
          borderRadius: 4,
        }
      ],
    };
  }, [rows, dataKey, threshold, color, type]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: {
        grid: { color: "#F3F4F6" },
        suggestedMax: threshold * 1.5,
      },
      x: {
        grid: { display: false },
        ticks: { maxTicksLimit: 8 }
      }
    }
  };

  return (
    <div style={{ height: 200, position: "relative" }}>
      {/* 簡易的な警告ラインの描画 (CSSで代用) */}
      <div style={{
        position: "absolute",
        top: type === 'monotony' ? "33%" : "40%", // 大体の位置 (調整必要)
        left: 30, right: 10,
        borderTop: "2px dashed #EF4444",
        pointerEvents: "none",
        zIndex: 10
      }} />
      <Bar data={data} options={options} />
    </div>
  );
}