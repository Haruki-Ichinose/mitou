import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchUploadHistory, uploadWorkloadCsv } from "../api";
import titleLogo from "../components/title.jpg";

export default function DataRegisterPage() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("idle");
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyStatus, setHistoryStatus] = useState("idle");
  const [historyError, setHistoryError] = useState("");
  const [loginId, setLoginId] = useState("");
  const [allowDuplicate, setAllowDuplicate] = useState(false);

  const fileLabel = useMemo(() => {
    if (!file) return "CSVファイルを選択してください";
    return `${file.name} (${Math.round(file.size / 1024).toLocaleString()} KB)`;
  }, [file]);

  const resetState = () => {
    setStatus("idle");
    setSummary(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!file) {
      setStatus("error");
      return;
    }

    setStatus("loading");
    setSummary(null);

    try {
      const result = await uploadWorkloadCsv(
        file,
        loginId.trim(),
        allowDuplicate
      );
      setSummary(result);
      setStatus("success");
      loadHistory();
    } catch (err) {
      setStatus("error");
    }
  };

  const resultText = useMemo(() => {
    if (!summary) return "";
    const count = summary.athletes?.length || 0;
    if (summary.skipped) {
      return `結果: 既存ファイルのためスキップ / 対象選手数: ${count}名`;
    }
    return `結果: 成功 / 対象選手数: ${count}名`;
  }, [summary]);

  const loadHistory = async () => {
    setHistoryStatus("loading");
    setHistoryError("");
    try {
      const list = await fetchUploadHistory();
      setHistory(list);
      setHistoryStatus("success");
    } catch (err) {
      console.error(err);
      setHistoryError("履歴の取得に失敗しました");
      setHistoryStatus("error");
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    const storedLoginId = sessionStorage.getItem("loginId") || "";
    setLoginId(storedLoginId);
  }, []);

  const formatDate = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
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

        <section className="panel upload-panel">
          <div className="panel-header">
            <div>
              <h2>CSVアップロード</h2>
            </div>
          </div>

          <div className="upload-grid">
            <form className="upload-form" onSubmit={handleSubmit}>
              <div className="form-field">
                <label htmlFor="csv-file">CSVファイル</label>
                <label className="file-input" htmlFor="csv-file">
                  <span>{fileLabel}</span>
                  <span className="file-input__cta">選択</span>
                </label>
                <input
                  id="csv-file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => {
                    resetState();
                    const nextFile = event.target.files?.[0] || null;
                    setFile(nextFile);
                  }}
                  className="file-input__native"
                />
              </div>
              <div className="form-field">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={allowDuplicate}
                    onChange={(event) => setAllowDuplicate(event.target.checked)}
                  />
                  <span>同一ファイルでも再計算する</span>
                </label>
                <p className="form-hint">
                  既存のCSVを再アップロードして計算をやり直します。
                </p>
              </div>

              <button
                className="primary-button"
                type="submit"
                disabled={status === "loading"}
              >
                {status === "loading" ? "アップロード中..." : "アップロード"}
              </button>

              {status === "success" && summary && (
                <p className="status upload-result">{resultText}</p>
              )}
              {status === "error" && (
                <p className="status status--error">結果: 失敗</p>
              )}
            </form>

            <div className="upload-history">
              <h3>アップロード履歴</h3>
              {historyStatus === "loading" && (
                <p className="status">履歴を読み込み中...</p>
              )}
              {historyStatus === "error" && (
                <p className="status status--error">{historyError}</p>
              )}
              {historyStatus === "success" && history.length === 0 && (
                <p className="status">履歴はまだありません。</p>
              )}
              {historyStatus === "success" && history.length > 0 && (
                <ul className="upload-history__list">
                  {history.map((item) => {
                    let statusLabel = "失敗";
                    if (item.status === "success") {
                      statusLabel = "成功";
                    } else if (item.status === "pending") {
                      statusLabel = "処理中";
                    }
                    return (
                      <li key={item.upload_id} className="upload-history__item">
                        <div className="upload-history__main">
                          <span className="upload-history__file">
                            {item.filename || "-"}
                          </span>
                          <span className="upload-history__date">
                            {formatDate(item.uploaded_at)}
                          </span>
                          <span className="upload-history__user">
                            ユーザーID: {item.uploaded_by || "-"}
                          </span>
                        </div>
                        <div className="upload-history__meta">
                          <span
                            className={`upload-history__status upload-history__status--${item.status}`}
                          >
                            {statusLabel}
                          </span>
                          <span>対象選手数: {item.athletes}名</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
