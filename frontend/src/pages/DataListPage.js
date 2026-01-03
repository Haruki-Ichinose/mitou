import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAthletes } from "../api";
import titleLogo from "../components/title.jpg";

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

  const riskGroups = useMemo(() => {
    const groups = {
      risky: [],
      caution: [],
      safety: [],
    };
    athletes.forEach((athlete) => {
      const level = athlete.risk_level || "safety";
      if (level === "risky") {
        groups.risky.push(athlete);
      } else if (level === "caution") {
        groups.caution.push(athlete);
      } else {
        groups.safety.push(athlete);
      }
    });
    return groups;
  }, [athletes]);

  return (
    <div className="app-shell">
      <div className="page data-list-page">
        <div className="page-bar">
          <img
            className="title-logo title-logo--page"
            src={titleLogo}
            alt="Predict2Protect"
          />
          <Link className="ghost-button" to="/home">
            ホームへ
          </Link>
        </div>

        <section className="panel">
          <div className="panel-header">
            <div>
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
            <div className="risk-grid">
              {[
                {
                  key: "risky",
                  label: "Risky",
                  tone: "risk-section--risky",
                  list: riskGroups.risky,
                },
                {
                  key: "caution",
                  label: "Caution",
                  tone: "risk-section--caution",
                  list: riskGroups.caution,
                },
                {
                  key: "safety",
                  label: "Safety",
                  tone: "risk-section--safety",
                  list: riskGroups.safety,
                },
              ].map((section) => (
                <div key={section.key} className={`risk-section ${section.tone}`}>
                  <div className="risk-section__header">
                    <h3>{section.label}</h3>
                    <span className="risk-section__count">
                      {section.list.length}名
                    </span>
                  </div>
                  {section.list.length === 0 ? (
                    <p className="status">該当者なし</p>
                  ) : (
                    <div className="player-grid">
                      {section.list.map((athlete) => (
                        <Link
                          key={athlete.athlete_id}
                          className="player-card"
                          to={`/data/${athlete.athlete_id}`}
                        >
                          <span className="player-card__id">
                            #{athlete.jersey_number || "-"}
                          </span>
                          <span className="player-card__name">
                            {athlete.athlete_name || "未登録"}
                          </span>
                          <span className="player-card__meta">
                            {athlete.position === "GK"
                              ? "ゴールキーパー"
                              : "フィールドプレーヤー"}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
