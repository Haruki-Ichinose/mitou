import React, { useMemo, useState } from "react";
import { Line } from "react-chartjs-2";

export default function WorkloadChart({ rows, isGk }) {
  // 表示する指標を選択可能に
  const [metric, setMetric] = useState(isGk ? "total_dive_load" : "total_distance");

  // モードが変わったらデフォルト値リセット
  useMemo(() => {
    setMetric(isGk ? "total_dive_load" : "total_distance");
  }, [isGk]);

  const data = useMemo(() => {
    return {
      labels: rows.map(r => r.date),
      datasets: [
        {
          label: metric,
          data: rows.map(r => r[metric]),
          borderColor: "#F97316", // オレンジ
          backgroundColor: "rgba(249, 115, 22, 0.1)",
          fill: true,
          tension: 0.3,
          pointRadius: 1,
        }
      ],
    };
  }, [rows, metric]);

  return (
    <div>
      <div style={{ marginBottom: 12, display: "flex", gap: 8 }}>
        {isGk ? (
          <>
            <MetricBtn label="ダイブ負荷" active={metric === "total_dive_load"} onClick={() => setMetric("total_dive_load")} />
            <MetricBtn label="ジャンプ数" active={metric === "total_jumps"} onClick={() => setMetric("total_jumps")} />
            <MetricBtn label="プレイヤーロード" active={metric === "total_player_load"} onClick={() => setMetric("total_player_load")} />
          </>
        ) : (
          <>
            <MetricBtn label="総走行距離" active={metric === "total_distance"} onClick={() => setMetric("total_distance")} />
            <MetricBtn label="スプリント距離(HSR)" active={metric === "hsr_distance"} onClick={() => setMetric("hsr_distance")} />
            <MetricBtn label="プレイヤーロード" active={metric === "total_player_load"} onClick={() => setMetric("total_player_load")} />
          </>
        )}
      </div>
      <div style={{ height: 300 }}>
        <Line data={data} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } } } }} />
      </div>
    </div>
  );
}

const MetricBtn = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      padding: "4px 12px",
      fontSize: 12,
      borderRadius: 16,
      border: "none",
      background: active ? "#F97316" : "#FFF7ED",
      color: active ? "#fff" : "#9A3412",
      fontWeight: active ? 700 : 500,
      cursor: "pointer",
      border: active ? "none" : "1px solid #FED7AA"
    }}
  >
    {label}
  </button>
);