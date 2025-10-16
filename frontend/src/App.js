// frontend/src/App.js
import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [athleteId, setAthleteId] = useState('');
  const [athleteName, setAthleteName] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!athleteId.trim() && !athleteName.trim()) {
      setError('athlete_id か athlete_name のどちらかを入力してください。');
      setResult(null);
      return;
    }

    setError('');
    setLoading(true);
    setResult(null);

    try {
      const params = {};
      if (athleteId.trim()) {
        params.athlete_id = athleteId.trim();
      }
      if (athleteName.trim()) {
        params.athlete_name = athleteName.trim();
      }

      const response = await axios.get(
        'http://localhost:8000/api/daily-training-loads/latest/',
        { params }
      );
      setResult(response.data);
    } catch (err) {
      if (err.response) {
        setError(err.response.data.detail || 'データの取得に失敗しました。');
      } else {
        setError('サーバーに接続できませんでした。');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setAthleteId('');
    setAthleteName('');
    setResult(null);
    setError('');
  };

  return (
    <div className="app">
      <header className="app__header">
        <h1>最新ACWR検索</h1>
        <p className="app__description">
          athlete_id か選手名を入力して、最新の ACWR を確認できます。
        </p>
      </header>

      <main className="app__content">
        <form className="search-form" onSubmit={handleSubmit}>
          <div className="search-form__group">
            <label htmlFor="athlete-id">athlete_id</label>
            <input
              id="athlete-id"
              type="text"
              value={athleteId}
              onChange={(event) => setAthleteId(event.target.value)}
              placeholder="例: 39"
            />
          </div>

          <div className="search-form__group">
            <label htmlFor="athlete-name">athlete_name</label>
            <input
              id="athlete-name"
              type="text"
              value={athleteName}
              onChange={(event) => setAthleteName(event.target.value)}
              placeholder="例: 小川 正人"
            />
          </div>

          <div className="search-form__actions">
            <button type="submit" disabled={loading}>
              {loading ? '検索中…' : '検索'}
            </button>
            <button type="button" className="secondary" onClick={handleReset} disabled={loading}>
              リセット
            </button>
          </div>

          {error && <p className="search-form__error">{error}</p>}
        </form>

        {result && (
          <section className="result-card">
            <h2>検索結果</h2>
            <dl>
              <div>
                <dt>athlete_id</dt>
                <dd>{result.athlete_id}</dd>
              </div>
              <div>
                <dt>athlete_name</dt>
                <dd>{result.athlete_name}</dd>
              </div>
              <div>
                <dt>date</dt>
                <dd>{result.date}</dd>
              </div>
              <div>
                <dt>acwr</dt>
                <dd>{result.acwr === null ? '算出不可' : result.acwr.toFixed(3)}</dd>
              </div>
            </dl>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
