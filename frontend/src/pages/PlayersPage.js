import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createAthleteProfile, fetchAthletes } from "../api";
import titleLogo from "../components/title.jpg";

export default function PlayersPage() {
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    athlete_id: "",
    athlete_name: "",
    jersey_number: "",
  });
  const [submitStatus, setSubmitStatus] = useState("idle");
  const [submitMessage, setSubmitMessage] = useState("");

  const loadAthletes = async () => {
    setLoading(true);
    setError("");
    try {
      const list = await fetchAthletes();
      setAthletes(list);
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

  const resetForm = () => {
    setForm({ athlete_id: "", athlete_name: "", jersey_number: "" });
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
                <label htmlFor="athlete_id">athlete_id</label>
                <input
                  id="athlete_id"
                  name="athlete_id"
                  value={form.athlete_id}
                  onChange={handleFormChange}
                  placeholder="例: 0bced2f8-0a31-4d07-b836-f7456918c0dd"
                  required
                />
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

              <button
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
