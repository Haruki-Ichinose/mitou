import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fetchAthletes, fetchMatchStats } from "../api";
import titleLogo from "../components/title.jpg";


export default function MatchStatsPage() {
  const navigate = useNavigate();
  const { athleteId: athleteIdParam } = useParams();
  const [athletes, setAthletes] = useState([]);
  const [athleteId, setAthleteId] = useState(athleteIdParam || "");
  const [matches, setMatches] = useState([]);
  const [status, setStatus] = useState("idle");
  const [selectedMatchDate, setSelectedMatchDate] = useState("");
  const [selectedYear, setSelectedYear] = useState("all");

  useEffect(() => {
    setAthleteId(athleteIdParam || "");
  }, [athleteIdParam]);

  useEffect(() => {
    let mounted = true;
    const loadAthletes = async () => {
      try {
        const list = await fetchAthletes();
        if (!mounted) return;
        setAthletes(list);
        if (!athleteIdParam && list.length > 0) {
          navigate(`/matches/${list[0].athlete_id}`, { replace: true });
        }
      } catch (e) {
        console.error(e);
      }
    };
    loadAthletes();
    return () => {
      mounted = false;
    };
  }, [athleteIdParam, navigate]);

  useEffect(() => {
    if (!athleteId) return;
    let mounted = true;
    const loadData = async () => {
      setStatus("loading");
      try {
        const [matchList] = await Promise.all([fetchMatchStats(athleteId)]);
        if (!mounted) return;
        setMatches(matchList);
        setStatus("success");
        setSelectedMatchDate((prev) => prev || matchList[0]?.date || "");
      } catch (e) {
        console.error(e);
        if (mounted) {
          setMatches([]);
          setStatus("error");
        }
      }
    };
    loadData();
    return () => {
      mounted = false;
    };
  }, [athleteId]);

  const currentAthlete = useMemo(
    () => athletes.find((athlete) => athlete.athlete_id === athleteId),
    [athletes, athleteId]
  );
  const isGk = currentAthlete?.position === "GK";

  const matchMetrics = useMemo(() => {
    if (isGk) {
      return [
        { key: "total_dive_count", label: "ダイブ回数", unit: "回", category: "量" },
        { key: "total_jumps", label: "ジャンプ回数", unit: "回", category: "量" },
        { key: "total_player_load", label: "負荷", unit: "au", digits: 2, category: "量" },
        { key: "total_duration", label: "運動時間", unit: "秒", digits: 1, category: "量" },
        { key: "avg_time_to_feet", label: "起き上がり時間", unit: "秒", digits: 2, category: "反応" },
        { key: "dive_asymmetry", label: "左右差", digits: 2, category: "バランス" },
        { key: "mean_heart_rate", label: "平均心拍", unit: "拍/分", digits: 1, category: "心拍" },
        { key: "max_vel", label: "最大速度", unit: "m/秒", digits: 2, category: "強度" },
      ];
    }
    return [
      { key: "total_distance", label: "総距離", unit: "m", digits: 1, category: "量" },
      { key: "total_player_load", label: "負荷", unit: "au", digits: 2, category: "量" },
      { key: "total_duration", label: "運動時間", unit: "秒", digits: 1, category: "量" },
      { key: "hsr_distance", label: "高強度走行距離", unit: "m", digits: 1, category: "強度" },
      { key: "high_decel_count", label: "急減速回数", unit: "回", category: "強度" },
      { key: "max_vel", label: "最大速度", unit: "m/秒", digits: 2, category: "強度" },
      { key: "mean_heart_rate", label: "平均心拍", unit: "拍/分", digits: 1, category: "心拍" },
      { key: "efficiency_index", label: "負荷効率", digits: 2, category: "効率" },
    ];
  }, [isGk]);

  const rateMetricKeys = useMemo(() => {
    if (isGk) {
      return new Set([
        "total_dive_count",
        "total_jumps",
        "total_player_load",
      ]);
    }
    return new Set([
      "total_distance",
      "total_player_load",
      "hsr_distance",
      "high_decel_count",
    ]);
  }, [isGk]);

  const sortedMatches = useMemo(() => {
    return [...matches].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [matches]);

  const availableYears = useMemo(() => {
    const years = new Set();
    sortedMatches.forEach((match) => {
      const date = parseDateKey(match.date);
      if (date) years.add(date.getFullYear());
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [sortedMatches]);

  const filteredMatches = useMemo(() => {
    if (selectedYear === "all") return sortedMatches;
    return sortedMatches.filter((match) => {
      const date = parseDateKey(match.date);
      return date && date.getFullYear().toString() === selectedYear;
    });
  }, [sortedMatches, selectedYear]);

  useEffect(() => {
    setSelectedMatchDate((prev) => prev || sortedMatches[0]?.date || "");
  }, [sortedMatches]);

  useEffect(() => {
    if (!filteredMatches.length) return;
    const exists = filteredMatches.some((match) => match.date === selectedMatchDate);
    if (!exists) {
      setSelectedMatchDate(filteredMatches[0].date);
    }
  }, [filteredMatches, selectedMatchDate]);

  const selectedMatch = useMemo(
    () => sortedMatches.find((match) => match.date === selectedMatchDate) || null,
    [sortedMatches, selectedMatchDate]
  );

  const baselineMap = useMemo(() => {
    const map = new Map();
    sortedMatches.forEach((match) => {
      const entry = {};
      matchMetrics.forEach((metric) => {
        const baseline = calcBaseline(sortedMatches, match.date, metric.key, rateMetricKeys);
        entry[metric.key] = baseline;
      });
      map.set(match.date, entry);
    });
    return map;
  }, [sortedMatches, matchMetrics, rateMetricKeys]);

  const metricGroups = useMemo(() => {
    const order = isGk
      ? ["量", "反応", "バランス", "心拍", "強度"]
      : ["量", "強度", "心拍", "効率"];
    const buckets = new Map(order.map((name) => [name, []]));
    matchMetrics.forEach((metric) => {
      const category = metric.category || "その他";
      if (!buckets.has(category)) buckets.set(category, []);
      buckets.get(category).push(metric);
    });
    return order
      .map((name) => ({ name, items: buckets.get(name) || [] }))
      .filter((group) => group.items.length > 0);
  }, [matchMetrics, isGk]);

  return (
    <div className="app-shell">
      <div className="page match-page">
        <div className="page-bar">
          <img
            className="title-logo title-logo--page"
            src={titleLogo}
            alt="Predict2Protect"
          />
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="ghost-button" to={`/data/${athleteId}`}>
              選手詳細へ
            </Link>
            <Link className="ghost-button" to="/home">
              ホームへ
            </Link>
          </div>
        </div>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>試合日スタッツ</h2>
              <div className="match-profile">
                <div className="match-profile__name">
                  {currentAthlete?.athlete_name || currentAthlete?.athlete_id || "-"}
                </div>
                <div className="match-profile__meta">
                  <span className="match-profile__badge">
                    {isGk ? "ゴールキーパー" : "フィールド選手"}
                  </span>
                  <span>背番号: {currentAthlete?.jersey_number || "-"}</span>
                  <span>表記: {currentAthlete?.uniform_name || "-"}</span>
                  <span>選手コード: {currentAthlete?.athlete_id || "-"}</span>
                </div>
              </div>
            </div>
            <span className="panel-count">
              {status === "loading" ? "読み込み中" : `${sortedMatches.length}試合`}
            </span>
          </div>

          <div className="form-field" style={{ maxWidth: 240 }}>
            <label htmlFor="match-year">年で絞り込み</label>
            <select
              id="match-year"
              value={selectedYear}
              onChange={(event) => setSelectedYear(event.target.value)}
            >
              <option value="all">全期間</option>
              {availableYears.map((year) => (
                <option key={year} value={year.toString()}>
                  {year}年
                </option>
              ))}
            </select>
          </div>

          <div className="form-field" style={{ maxWidth: 420 }}>
            <label htmlFor="match-select">試合日を選択</label>
            <select
              id="match-select"
              value={selectedMatchDate}
              onChange={(event) => setSelectedMatchDate(event.target.value)}
            >
              {filteredMatches.map((match) => (
                <option key={match.date} value={match.date}>
                  {formatDateLabel(match.date)}{" "}
                  {match.session_names?.length ? `(${match.session_names.join(" / ")})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="metric-notes">
            <div className="metric-notes__title">指標の見方</div>
            <ul className="metric-notes__list">
              <li>距離・負荷は1分あたりで比較</li>
              <li>負荷は運動強度の目安</li>
            </ul>
          </div>

          {status === "loading" && (
            <p className="status">試合データを読み込み中...</p>
          )}
          {status === "error" && (
            <p className="status status--error">試合データの取得に失敗しました。</p>
          )}
          {status === "success" && sortedMatches.length === 0 && (
            <p className="status">該当する試合データがありません。</p>
          )}
          {status === "success" && sortedMatches.length > 0 && filteredMatches.length === 0 && (
            <p className="status">該当する試合が見つかりません。</p>
          )}

          {sortedMatches.length > 0 && (
            <div className="match-detail">
              {selectedMatch ? (
                <div className="match-card">
                  <div className="match-card__header">
                    <div>
                      <div className="match-card__date">
                        {formatDateLabel(selectedMatch.date)}
                      </div>
                      <div className="match-card__sessions">
                        {selectedMatch.session_names?.length
                          ? selectedMatch.session_names.join(" / ")
                          : "-"}
                      </div>
                    </div>
                  </div>
                  {metricGroups.map((group) => (
                    <div key={group.name} className="metric-group">
                      <div className="metric-group__title">{group.name}</div>
                      <div className="match-metrics">
                        {group.items.map((metric) => {
                          const value = selectedMatch[metric.key];
                          const perMinute = rateMetricKeys.has(metric.key)
                            ? calcPerMinute(selectedMatch, metric.key)
                            : null;
                          const baseline = baselineMap.get(selectedMatch.date)?.[metric.key];
                          const compareValue = rateMetricKeys.has(metric.key)
                            ? perMinute
                            : value;
                          const deltaValue = calcDeltaValue(compareValue, baseline?.avg);
                          const deltaRatio = calcDeltaRatio(compareValue, baseline?.avg);
                          const deltaTone = getDeltaTone(deltaRatio);
                          const deltaText = buildDeltaText(
                            deltaValue,
                            metric,
                            rateMetricKeys.has(metric.key)
                          );
                          return (
                            <div key={metric.key} className="metric-card">
                              <div className="metric-card__label">
                                {metric.label}
                              </div>
                              <div className="metric-card__value">
                                {formatMetricValue(
                                  value,
                                  metric.digits,
                                  metric.unit
                                )}
                              </div>
                              <div
                                className={[
                                  "metric-card__sub",
                                  deltaTone ? `metric-card__delta metric-card__delta--${deltaTone}` : "",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                              >
                                {baseline?.count
                                  ? deltaText
                                  : "平均との差: データ不足"}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="status">試合を選択してください。</p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const formatNumber = (v, digits = 2) =>
  typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : "-";

const formatMetricValue = (value, digits = 2, unit = "") => {
  const base = formatNumber(value, digits);
  if (base === "-") return "-";
  return unit ? `${base}${unit}` : base;
};

const parseDateKey = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
};

const formatDateLabel = (dateKey) => {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return "-";
  return parsed.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

const calcBaseline = (matches, dateKey, metricKey, rateMetricKeys) => {
  const values = matches
    .filter((match) => {
      if (dateKey && match.date === dateKey) return false;
      const matchDate = parseDateKey(match.date);
      if (!matchDate) return false;
      const value = rateMetricKeys.has(metricKey)
        ? calcPerMinute(match, metricKey)
        : match[metricKey];
      return typeof value === "number" && Number.isFinite(value);
    })
    .map((match) => {
      return rateMetricKeys.has(metricKey)
        ? calcPerMinute(match, metricKey)
        : match[metricKey];
    })
    .filter((value) => typeof value === "number" && Number.isFinite(value));
  if (!values.length) return { avg: null, count: 0 };
  const sum = values.reduce((acc, val) => acc + val, 0);
  return { avg: sum / values.length, count: values.length };
};

const calcDeltaValue = (value, avg) => {
  if (typeof value !== "number" || !Number.isFinite(value) || !avg) {
    return null;
  }
  return value - avg;
};

const calcDeltaRatio = (value, avg) => {
  if (typeof value !== "number" || !Number.isFinite(value) || !avg) {
    return null;
  }
  const ratio = (value - avg) / avg;
  return Math.max(-1, Math.min(1, ratio));
};

const getDeltaTone = (ratio) => {
  if (ratio === null || typeof ratio !== "number") return null;
  if (Math.abs(ratio) < 0.15) return "normal";
  return ratio > 0 ? "high" : "low";
};

const buildDeltaText = (deltaValue, metric, _isRate) => {
  if (deltaValue === null) return "平均との差: データ不足";
  const sign = deltaValue >= 0 ? "+" : "-";
  const absValue = Math.abs(deltaValue);
  return `いつもより ${sign}${formatMetricValue(
    absValue,
    metric.digits,
    metric.unit
  )}`;
};

const calcPerMinute = (match, metricKey) => {
  const duration = match?.total_duration;
  const value = match?.[metricKey];
  if (!duration || typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const minutes = duration / 60;
  if (!minutes || minutes <= 0) return null;
  return value / minutes;
};
