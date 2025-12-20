import React, { useMemo } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler
);

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
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.1,
        },
        // 安全圏 (0.8 - 1.3) を背景表示するためのダミーデータ
        {
          label: "Safe Zone Top",
          data: rows.map(() => 1.3),
          borderColor: "rgba(16, 185, 129, 0)", // 透明
          backgroundColor: "rgba(16, 185, 129, 0.1)", // 緑の帯
          pointRadius: 0,
          fill: "+1", // 次のデータセットまで埋める
        },
        {
          label: "Safe Zone Bottom",
          data: rows.map(() => 0.8),
          borderColor: "rgba(16, 185, 129, 0)",
          pointRadius: 0,
          fill: false,
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
        // chartjs-plugin-annotationがあればライン引けるが、今回はシンプルに
      }
    },
    scales: {
      y: {
        min: 0,
        max: 2.5,
        grid: { color: "#F3F4F6" }
      },
      x: {
        grid: { display: false },
        ticks: { maxTicksLimit: 10 }
      }
    }
  };

  return (
    <div style={{ height: 250 }}>
      <Line data={data} options={options} />
    </div>
  );
}