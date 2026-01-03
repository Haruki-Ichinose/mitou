import React from "react";
import { Link } from "react-router-dom";
import titleLogo from "../components/title.jpg";

export default function HomePage() {
  return (
    <div className="app-shell">
      <div className="page home-page">
        <div className="home-header">
          <header className="hero">
            <img
              className="title-logo title-logo--hero"
              src={titleLogo}
              alt="Predict2Protect"
            />
          </header>
          <Link className="ghost-button" to="/">
            ログアウト
          </Link>
        </div>

        <div className="action-grid">
          <Link className="action-card action-card--analysis" to="/data">
            <span className="action-card__title">データの確認</span>
            <span className="action-card__meta">最新の選手データを一覧で確認</span>
          </Link>
          <Link className="action-card action-card--upload" to="/register">
            <span className="action-card__title">データの登録</span>
            <span className="action-card__meta">csvファイルのアップロード</span>
          </Link>
          <Link className="action-card action-card--players" to="/players">
            <span className="action-card__title">選手一覧</span>
            <span className="action-card__meta">登録選手を一覧で確認</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
