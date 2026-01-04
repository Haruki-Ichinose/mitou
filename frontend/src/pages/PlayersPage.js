import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createAthleteProfile, fetchAthletes } from "../api";
import titleLogo from "../components/title.jpg";
import playerJersey from "../components/player.png";
import keeperJersey from "../components/keeper.png";

export default function PlayersPage() {
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [candidateStatus, setCandidateStatus] = useState("idle");
  const [candidateError, setCandidateError] = useState("");
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [athleteIdOptions, setAthleteIdOptions] = useState([]);
  const [form, setForm] = useState({
    athlete_id: "",
    athlete_name: "",
    jersey_number: "",
    uniform_name: "",
  });
  const [submitStatus, setSubmitStatus] = useState("idle");
  const [submitMessage, setSubmitMessage] = useState("");

  const loadAthletes = async () => {
    setLoading(true);
    setError("");
    try {
      const list = await fetchAthletes();
      setAthletes([...list].sort(compareAthletes));
    } catch (err) {
      console.error(err);
      setError("選手データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAthletes();
  }, []);

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCandidateSelect = (event) => {
    const nextId = event.target.value;
    setSelectedCandidateId(nextId);
    if (!nextId) return;
    const candidate = candidates.find((item) => item.athlete_id === nextId);
    if (!candidate) return;
    setForm((prev) => ({
      ...prev,
      athlete_id: candidate.athlete_id || "",
      athlete_name: candidate.athlete_name || "",
    }));
  };

  const resetForm = () => {
    setForm({
      athlete_id: "",
      athlete_name: "",
      jersey_number: "",
      uniform_name: "",
    });
    setSelectedCandidateId("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitStatus("loading");
    setSubmitMessage("");

    try {
      const payload = {
        athlete_id: form.athlete_id.trim(),
        athlete_name: form.athlete_name.trim(),
        jersey_number: form.jersey_number.trim(),
        uniform_name: form.uniform_name.trim(),
      };
      await createAthleteProfile(payload);
      setSubmitStatus("success");
      setSubmitMessage("新しい選手を登録しました。");
      resetForm();
      loadAthletes();
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.message ||
        "登録に失敗しました。";
      setSubmitStatus("error");
      setSubmitMessage(message);
    }
  };

  return (
    <div className="app-shell">
      <div className="page">
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
              <h2>登録済み選手一覧</h2>
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

          <div style={{ marginTop: 24 }}>
            <button
              className="primary-button"
              type="button"
              onClick={() => setShowForm((prev) => !prev)}
            >
              新しい選手を登録する
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleSubmit} style={{ marginTop: 20 }}>
              <div className="form-field">
                <label htmlFor="candidate_athlete">CSV登録候補</label>
                <select
                  id="candidate_athlete"
                  value={selectedCandidateId}
                  onChange={handleCandidateSelect}
                >
                  <option value="">候補から選択 (任意)</option>
                  {candidates.map((item) => (
                    <option key={item.athlete_id} value={item.athlete_id}>
                      {formatCandidateLabel(item)}
                    </option>
                  ))}
                </select>
                {candidateStatus === "loading" && (
                  <p className="form-hint">候補を読み込み中...</p>
                )}
                {candidateStatus === "error" && (
                  <p className="status status--error">{candidateError}</p>
                )}
                {candidateStatus === "success" && candidates.length === 0 && (
                  <p className="form-hint">未登録の候補がありません。</p>
                )}
              </div>

              <div className="form-field">
                <label htmlFor="athlete_id">athlete_id</label>
                <input
                  id="athlete_id"
                  name="athlete_id"
                  value={form.athlete_id}
                  onChange={handleFormChange}
                  placeholder="csvファイルのathlete_id列と同じ値を入力"
                  list="athlete-id-list"
                  required
                />
                <datalist id="athlete-id-list">
                  {athleteIdOptions.map((athleteId) => (
                    <option key={athleteId} value={athleteId} />
                  ))}
                </datalist>
              </div>

              <div className="form-field">
                <label htmlFor="athlete_name">選手名</label>
                <input
                  id="athlete_name"
                  name="athlete_name"
                  value={form.athlete_name}
                  onChange={handleFormChange}
                  placeholder="例: 佐藤 太郎"
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="jersey_number">背番号</label>
                <input
                  id="jersey_number"
                  name="jersey_number"
                  value={form.jersey_number}
                  onChange={handleFormChange}
                  placeholder="例: 8"
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="uniform_name">ユニフォーム表記 (ローマ字)</label>
                <input
                  id="uniform_name"
                  name="uniform_name"
                  value={form.uniform_name}
                  onChange={handleFormChange}
                  placeholder="例: SATO"
                  required
                />
              </div>

              <button
                style={{ marginTop: 12 }}
                className="primary-button"
                type="submit"
                disabled={submitStatus === "loading"}
              >
                {submitStatus === "loading" ? "登録中..." : "登録する"}
              </button>

              {submitMessage && (
                <p
                  className={
                    submitStatus === "error" ? "status status--error" : "status"
                  }
                >
                  {submitMessage}
                </p>
              )}
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

function getUniformNameSizeClass(name) {
  const length = name.replace(/\s+/g, "").length;
  if (length >= 14) return "player-card__uniform-name--long";
  if (length >= 10) return "player-card__uniform-name--medium";
  return "player-card__uniform-name--short";
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

function formatCandidateLabel(candidate) {
  const name = candidate.athlete_name || "名前未登録";
  const position = candidate.position === "GK" ? "GK" : "FP";
  return `${name} (${position}) / ${candidate.athlete_id}`;
}
