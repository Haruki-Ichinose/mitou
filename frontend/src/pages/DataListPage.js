import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAthletes } from "../api";
import playerJersey from "../components/player.png";
import keeperJersey from "../components/keeper.png";
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

  const sortedAthletes = useMemo(
    () => [...athletes].sort(compareAthletes),
    [athletes]
  );

  const riskGroups = useMemo(() => {
    const groups = {
      risky: [],
      caution: [],
      safety: [],
    };
    sortedAthletes.forEach((athlete) => {
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
  }, [sortedAthletes]);

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
                          className="player-card player-card--jersey"
                          to={`/data/${athlete.athlete_id}`}
                        >
                          <div className="player-card__jersey-wrap">
                            <img
                              className="player-card__jersey"
                              src={athlete.position === "GK" ? keeperJersey : playerJersey}
                              alt=""
                            />
                            <div className="player-card__overlay">
                              <span className="player-card__number">
                                {athlete.jersey_number || "-"}
                              </span>
                              <span
                                className={`player-card__uniform-name ${getUniformNameSizeClass(
                                  athlete.uniform_name || athlete.athlete_name || ""
                                )}`}
                              >
                                {(athlete.uniform_name || athlete.athlete_name || "-").toUpperCase()}
                              </span>
                            </div>
                          </div>
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

function compareAthletes(a, b) {
  const posA = a.position === "GK" ? 0 : 1;
  const posB = b.position === "GK" ? 0 : 1;
  if (posA !== posB) return posA - posB;

  const aNum = parseInt(a.jersey_number, 10);
  const bNum = parseInt(b.jersey_number, 10);
  const aHasNum = Number.isFinite(aNum);
  const bHasNum = Number.isFinite(bNum);
  if (aHasNum && bHasNum && aNum !== bNum) return aNum - bNum;
  if (aHasNum && !bHasNum) return -1;
  if (!aHasNum && bHasNum) return 1;

  return String(a.jersey_number || "").localeCompare(
    String(b.jersey_number || ""),
    "ja"
  );
}
function getUniformNameSizeClass(name) {
  const length = name.replace(/\s+/g, "").length;
  if (length >= 14) return "player-card__uniform-name--long";
  if (length >= 10) return "player-card__uniform-name--medium";
  return "player-card__uniform-name--short";
}
