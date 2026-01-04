import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import titleLogo from "../components/title.jpg";
import settingIcon from "../components/setting.png";

export default function HomePage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [loginId, setLoginId] = useState("");
  const menuRef = useRef(null);

  useEffect(() => {
    const storedLoginId = sessionStorage.getItem("loginId") || "";
    setLoginId(storedLoginId);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
          <div className="settings-menu" ref={menuRef}>
            <button
              className="settings-button"
              type="button"
              aria-haspopup="true"
              aria-expanded={isMenuOpen}
              onClick={() => setIsMenuOpen((prev) => !prev)}
            >
              <img className="settings-button__icon" src={settingIcon} alt="" />
              <span className="sr-only">設定</span>
            </button>
            {isMenuOpen && (
              <div className="settings-panel" role="menu">
                <div className="settings-panel__id">
                  ID <span>{loginId || "未設定"}</span>
                </div>
                <button className="settings-panel__button" type="button">
                  PW変更
                </button>
                <Link
                  className="settings-panel__button settings-panel__button--logout"
                  to="/"
                  onClick={() => sessionStorage.removeItem("loginId")}
                >
                  ログアウト
                </Link>
              </div>
            )}
          </div>
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
            <span className="action-card__meta">選手の確認・登録</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
