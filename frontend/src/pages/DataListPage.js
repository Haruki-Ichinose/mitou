import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAthletes } from "../api";

export default function DataListPage() {
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    const loadAthletes = async () => {
      setLoading(true);
      setError("");
      try {
        const list = await fetchAthletes();
        if (mounted) setAthletes(list);
      } catch (err) {
        console.error(err);
        if (mounted) setError("選手データの取得に失敗しました");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadAthletes();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="app-shell">
      <div className="page data-list-page">
        <div className="page-bar">
          <h1 className="page-title">Predict2Protect</h1>
          <Link className="ghost-button" to="/home">
            ホームへ
          </Link>
        </div>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Latest Data</p>
              <h2>最新選手データ一覧</h2>
            </div>
            <span className="panel-count">
              {loading ? "読み込み中" : `${athletes.length}名`}
            </span>
          </div>

          {loading && <p className="status">データを読み込み中...</p>}
          {!loading && error && <p className="status status--error">{error}</p>}
          {!loading && !error && athletes.length === 0 && (
            <p className="status">登録済みの選手がいません</p>
          )}

          {!loading && !error && athletes.length > 0 && (
            <div className="player-grid">
              {athletes.map((athlete) => (
                <Link
                  key={athlete.athlete_id}
                  className="player-card"
                  to={`/data/${athlete.athlete_id}`}
                >
                  <span className="player-card__id">#{athlete.athlete_id}</span>
                  <span className="player-card__name">{athlete.athlete_name}</span>
                  <span className="player-card__meta">
                    {athlete.position === "GK" ? "ゴールキーパー" : "フィールドプレーヤー"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
