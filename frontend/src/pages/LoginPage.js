import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import titleLogo from "../components/title.jpg";

export default function LoginPage() {
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();
    sessionStorage.setItem("loginId", loginId.trim());
    navigate("/home");
  };

  return (
    <div className="app-shell">
      <div className="page login-page">
        <header className="hero">
          <img
            className="title-logo title-logo--hero"
            src={titleLogo}
            alt="Predict2Protect"
          />
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
              value={loginId}
              onChange={(event) => setLoginId(event.target.value)}
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
