import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { uploadWorkloadCsv } from "../api";

export default function DataRegisterPage() {
  const [file, setFile] = useState(null);
  const [uploadedBy, setUploadedBy] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);

  const fileLabel = useMemo(() => {
    if (!file) return "CSVファイルを選択してください";
    return `${file.name} (${Math.round(file.size / 1024).toLocaleString()} KB)`;
  }, [file]);

  const resetState = () => {
    setStatus("idle");
    setError("");
    setSummary(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!file) {
      setError("CSVファイルを選択してください。");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setError("");
    setSummary(null);

    try {
      const result = await uploadWorkloadCsv(file, uploadedBy.trim());
      setSummary(result);
      setStatus("success");
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.message ||
        "アップロードに失敗しました。";
      setError(message);
      setStatus("error");
    }
  };

  const athletePreview = useMemo(() => {
    if (!summary?.athletes?.length) return "";
    const slice = summary.athletes.slice(0, 8);
    const suffix = summary.athletes.length > slice.length ? " ..." : "";
    return `${slice.join(", ")}${suffix}`;
  }, [summary]);

  return (
    <div className="app-shell">
      <div className="page">
        <div className="page-bar">
          <h1 className="page-title">Predict2Protect</h1>
          <Link className="ghost-button" to="/home">
            ホームへ
          </Link>
        </div>

        <section className="panel upload-panel">
          <p className="panel-kicker">Data Upload</p>
          <div className="panel-header">
            <div>
              <h2>CSVアップロード</h2>
              <p className="panel-description">
                StatsAllGroup形式のCSVをアップロードすると、日次集計と分析指標まで自動で更新します。
              </p>
            </div>
            <div className="panel-count">Workload</div>
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
                <label htmlFor="uploaded-by">アップロード者 (任意)</label>
                <input
                  id="uploaded-by"
                  type="text"
                  placeholder="例: admin / system"
                  value={uploadedBy}
                  onChange={(event) => setUploadedBy(event.target.value)}
                />
              </div>

              <button
                className="primary-button"
                type="submit"
                disabled={status === "loading"}
              >
                {status === "loading" ? "アップロード中..." : "アップロード"}
              </button>

              {status === "error" && (
                <p className="status status--error">{error}</p>
              )}
              {status === "success" && summary?.skipped && (
                <p className="status">
                  同じCSVが既に登録済みのためスキップしました。
                </p>
              )}
            </form>

            <div className="upload-summary">
              <h3>アップロード結果</h3>
              {status === "success" && summary ? (
                <div className="upload-summary__body">
                  <div>
                    <span className="upload-summary__label">Upload ID</span>
                    <span className="upload-summary__value">{summary.upload_id}</span>
                  </div>
                  <div>
                    <span className="upload-summary__label">取り込み行数</span>
                    <span className="upload-summary__value">{summary.rows_imported}</span>
                  </div>
                  <div>
                    <span className="upload-summary__label">対象選手数</span>
                    <span className="upload-summary__value">
                      {summary.athletes?.length || 0}
                    </span>
                  </div>
                  <div>
                    <span className="upload-summary__label">選手IDサンプル</span>
                    <span className="upload-summary__value">{athletePreview || "-"}</span>
                  </div>
                  <div>
                    <span className="upload-summary__label">重複判定</span>
                    <span className="upload-summary__value">
                      {summary.skipped ? `重複 (id=${summary.duplicate_of})` : "新規"}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="status">
                  まだアップロード結果はありません。
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
