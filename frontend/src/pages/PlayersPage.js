import React from "react";
import { Link } from "react-router-dom";

export default function PlayersPage() {
  return (
    <div className="app-shell">
      <div className="page">
        <div className="page-bar">
          <h1 className="page-title">Predict2Protect</h1>
          <Link className="ghost-button" to="/home">
            ホームへ
          </Link>
        </div>

        <section className="panel panel--center">
          <p className="panel-kicker">Players</p>
          <h2>選手一覧ページ</h2>
          <p className="panel-description">一覧表示や検索機能は今後追加予定です。</p>
          <Link className="primary-button" to="/home">
            ホームへ戻る
          </Link>
        </section>
      </div>
    </div>
  );
}
