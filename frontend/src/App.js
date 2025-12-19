import React, { useEffect, useMemo, useState } from "react";
import { fetchAthletes, fetchRuns, fetchTimeseries } from "./api";
import "./App.css";

import KpiCards from "./components/KpiCards";
import WorkloadChart from "./components/WorkloadChart";
import AcwrChart from "./components/AcwrChart";

function App() {
  const [athletes, setAthletes] = useState([]);
  const [runs, setRuns] = useState([]);
  const [athleteId, setAthleteId] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [range, setRange] = useState(120); // days to show in UI (client-side)
  const [metric, setMetric] = useState("total_distance"); // "total_distance" | "total_player_load"

  const latestDynamicRun = useMemo(() => {
    const d = runs.filter(r => r.run_type === "dynamic").sort((a,b) => b.id - a.id)[0];
    return d?.id;
  }, [runs]);

  useEffect(() => {
    (async () => {
      const [a, r] = await Promise.all([fetchAthletes(), fetchRuns()]);
      setAthletes(a);
      setRuns(r);
      if (a.length > 0) setAthleteId(a[0].athlete_id);
    })();
  }, []);

  useEffect(() => {
    if (!athleteId) return;
    (async () => {
      setLoading(true);
      try {
        const ts = await fetchTimeseries(athleteId, { dynamic_run_id: latestDynamicRun });
        setRows(ts);
      } finally {
        setLoading(false);
      }
    })();
  }, [athleteId, latestDynamicRun]);

  const viewRows = useMemo(() => {
    if (!rows?.length) return [];
    if (!range) return rows;
    return rows.slice(-range);
  }, [rows, range]);

  const selectedAthleteLabel = useMemo(() => {
    const a = athletes.find(x => x.athlete_id === athleteId);
    if (!a) return athleteId;
    return a.athlete_name ? `${a.athlete_name} (${a.athlete_id.slice(0, 8)}…)` : a.athlete_id;
  }, [athletes, athleteId]);

  return (
    <div className="App" style={{ padding: 16, textAlign: "left" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Workload Dashboard</h2>
          <div style={{ opacity: 0.7, marginTop: 4, fontSize: 12 }}>
            {selectedAthleteLabel} {loading ? " / loading…" : ""}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{
        marginTop: 12,
        display: "flex",
        gap: 12,
        alignItems: "center",
        flexWrap: "wrap",
        background: "rgba(255,255,255,0.55)",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 12,
        padding: 12,
        boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Athlete</div>
          <select value={athleteId} onChange={(e) => setAthleteId(e.target.value)}>
            {athletes.map(a => (
              <option key={a.athlete_id} value={a.athlete_id}>
                {a.athlete_name ? `${a.athlete_name} (${a.athlete_id.slice(0,8)}…)` : a.athlete_id}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Range</div>
          {[30, 60, 120, 180, 0].map(v => (
            <button
              key={String(v)}
              onClick={() => setRange(v)}
              style={{
                border: "1px solid rgba(0,0,0,0.15)",
                background: range === v ? "rgba(17,24,39,0.9)" : "rgba(255,255,255,0.8)",
                color: range === v ? "white" : "#111827",
                padding: "6px 10px",
                borderRadius: 10,
                cursor: "pointer"
              }}
            >
              {v === 0 ? "All" : `${v}d`}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Metric</div>
          <button
            onClick={() => setMetric("total_distance")}
            style={{
              border: "1px solid rgba(0,0,0,0.15)",
              background: metric === "total_distance" ? "rgba(17,24,39,0.9)" : "rgba(255,255,255,0.8)",
              color: metric === "total_distance" ? "white" : "#111827",
              padding: "6px 10px",
              borderRadius: 10,
              cursor: "pointer"
            }}
          >
            TD
          </button>
          <button
            onClick={() => setMetric("total_player_load")}
            style={{
              border: "1px solid rgba(0,0,0,0.15)",
              background: metric === "total_player_load" ? "rgba(17,24,39,0.9)" : "rgba(255,255,255,0.8)",
              color: metric === "total_player_load" ? "white" : "#111827",
              padding: "6px 10px",
              borderRadius: 10,
              cursor: "pointer"
            }}
          >
            PL
          </button>
        </div>
      </div>

      {/* KPI */}
      <div style={{ marginTop: 12 }}>
        <KpiCards rows={viewRows} />
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 12, alignItems: "start" }}>
        <WorkloadChart rows={viewRows} metric={metric} />
        <div style={{ display: "grid", gap: 12 }}>
          <AcwrChart rows={viewRows} which="td" />
          <AcwrChart rows={viewRows} which="pl" />
        </div>
      </div>

      {/* Table (detail) */}
      <div style={{
        marginTop: 12,
        background: "rgba(255,255,255,0.55)",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 12,
        padding: 12,
        boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
      }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Recent rows</div>
        <div style={{ overflowX: "auto" }}>
          <table border="1" cellPadding="6" style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th>date</th>
                <th>TD</th>
                <th>PL</th>
                <th>ACWR(TD)</th>
                <th>ACWR(PL)</th>
                <th>static</th>
                <th>dyn</th>
                <th>streak</th>
              </tr>
            </thead>
            <tbody>
              {viewRows.slice(-60).map((r) => (
                <tr key={String(r.date)}>
                  <td>{String(r.date)}</td>
                  <td>{r.total_distance?.toFixed?.(1) ?? ""}</td>
                  <td>{r.total_player_load?.toFixed?.(1) ?? ""}</td>
                  <td>{r.workload?.acwr_ewma_total_distance?.toFixed?.(2) ?? ""}</td>
                  <td>{r.workload?.acwr_ewma_total_player_load?.toFixed?.(2) ?? ""}</td>
                  <td>{r.static_anomaly ? "⚠️" : ""}</td>
                  <td>{r.dynamic?.dyn_anomaly ? "🚨" : ""}</td>
                  <td>{r.dynamic?.dyn_streak ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>
          ※ 次は「異常一覧パネル」「日付クリックで詳細（dyn_error, dyn_thr, top_features）」を付けると完成度が跳ね上がります。
        </p>
      </div>
    </div>
  );
}

export default App;
