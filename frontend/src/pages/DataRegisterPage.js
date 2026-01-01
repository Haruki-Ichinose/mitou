import React from "react";
import { Link } from "react-router-dom";

export default function DataRegisterPage() {
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
          <p className="panel-kicker">Data Upload</p>
          <h2>データ登録ページ</h2>
          <p className="panel-description">このページは準備中です。次の更新で機能を追加します。</p>
          <Link className="primary-button" to="/home">
            ホームへ戻る
          </Link>
        </section>
      </div>
    </div>
  );
}
