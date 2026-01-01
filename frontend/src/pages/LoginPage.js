import React from "react";
import { useNavigate } from "react-router-dom";

export default function LoginPage() {
  const navigate = useNavigate();

  const handleSubmit = (event) => {
    event.preventDefault();
    navigate("/home");
  };

  return (
    <div className="app-shell">
      <div className="page login-page">
        <header className="hero">
          <h1 className="hero-title">Predict2Protect</h1>
          <p className="hero-subtitle">怪我予防・コンディション管理システム</p>
        </header>

        <form className="login-card" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="login-id">ID</label>
            <input
              id="login-id"
              type="text"
              name="id"
              placeholder="ユーザーIDを入力"
              autoComplete="username"
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="login-password">PW</label>
            <input
              id="login-password"
              type="password"
              name="password"
              placeholder="パスワードを入力"
              autoComplete="current-password"
              required
            />
          </div>
          <button className="primary-button" type="submit">
            ログイン
          </button>
        </form>
      </div>
    </div>
  );
}
