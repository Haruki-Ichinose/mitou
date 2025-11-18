// frontend/src/App.js
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import './App.css';

const API_BASE_URL = 'http://localhost:8000/api';
const SAFE_ACWR_MIN = 0.8;
const SAFE_ACWR_MAX = 1.3;

function App() {
  const [view, setView] = useState('home');
  const [records, setRecords] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [selectedAthleteId, setSelectedAthleteId] = useState(null);

  /*バックエンドからデータを取得*/
  const fetchTrainingLoads = useCallback(async () => {
    const response = await axios.get(`${API_BASE_URL}/daily-training-loads/`);
    return Array.isArray(response.data) ? response.data : [];
  }, []);

  /*エラーメッセージの解析*/
  const parseErrorMessage = useCallback((err) => {
    if (err?.response?.data?.detail) {
      return err.response.data.detail;
    }
    if (err?.message) {
      return err.message;
    }
    return 'データの取得に失敗しました。時間をおいて再度お試しください。';
  }, []);

  /*データの更新*/
  const refreshRecords = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      const data = await fetchTrainingLoads();
      setRecords(data);
      setStatus('loaded');
      return data;
    } catch (err) {
      const message = parseErrorMessage(err);
      setError(message);
      setStatus('error');
      throw err;
    }
  }, [fetchTrainingLoads, parseErrorMessage]);

  /*初回データ読込*/
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setStatus('loading');
      setError('');
      try {
        const data = await fetchTrainingLoads();
        if (cancelled) {
          return;
        }
        setRecords(data);
        setStatus('loaded');
      } catch (err) {
        if (cancelled) {
          return;
        }
        const message = parseErrorMessage(err);
        setError(message);
        setStatus('error');
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [fetchTrainingLoads, parseErrorMessage]);

  /*画面表示用に整理された選手リスト作成*/
  const players = useMemo(() => {
    const map = new Map();
    records.forEach((record) => {
      const id = String(record.athlete_id);
      const name = record.athlete_name || `選手 ${id}`;
      const parsedDate = new Date(record.date);
      const isValidDate = !Number.isNaN(parsedDate.getTime());

      if (!map.has(id)) {
        map.set(id, {
          id,
          name,
          latestDate: isValidDate ? parsedDate : null,
          latestDateRaw: isValidDate ? record.date : null,
        });
        return;
      }

      const entry = map.get(id);
      if (!entry) {
        return;
      }

      if (!entry.name && name) {
        entry.name = name;
      }

      if (isValidDate && (!entry.latestDate || parsedDate > entry.latestDate)) {
        entry.latestDate = parsedDate;
        entry.latestDateRaw = record.date;
      }
    });

    return Array.from(map.values())
      .sort((a, b) => {
        const numA = Number(a.id);
        const numB = Number(b.id);
        if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) {
          return numA - numB;
        }
        if (!Number.isNaN(numA) && Number.isNaN(numB)) {
          return -1;
        }
        if (Number.isNaN(numA) && !Number.isNaN(numB)) {
          return 1;
        }
        return String(a.id).localeCompare(String(b.id), 'ja', { numeric: true });
      })
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        latestDate: entry.latestDate,
        latestDateRaw: entry.latestDateRaw,
      }));
  }, [records]);

  /*選択された選手の記録を日付順に整理*/
  const selectedRecords = useMemo(() => {
    if (!selectedAthleteId) {
      return [];
    }
    return records
      .filter((record) => String(record.athlete_id) === String(selectedAthleteId))
      .map((record) => ({
        ...record,
        dateObj: new Date(record.date),
      }))
      .filter((record) => !Number.isNaN(record.dateObj.getTime()))
      .sort((a, b) => a.dateObj - b.dateObj);
  }, [records, selectedAthleteId]);

  /*選択された選手の最新の記録を取得*/
  const latestRecord = useMemo(() => {
    if (selectedRecords.length === 0) {
      return null;
    }
    return selectedRecords[selectedRecords.length - 1];
  }, [selectedRecords]);

  /*選択された選手の過去1ヶ月のACWRデータを抽出*/
  const chartData = useMemo(() => {
    if (!latestRecord) {
      return [];
    }
    const rangeEnd = latestRecord.dateObj;
    const rangeStart = new Date(rangeEnd);
    rangeStart.setDate(rangeStart.getDate() - 29);

    return selectedRecords
      .filter(
        (record) => record.dateObj >= rangeStart && record.dateObj <= rangeEnd
      )
      .map((record) => ({
        date: record.date,
        dateObj: record.dateObj,
        acwr:
          typeof record.acwr === 'number' && !Number.isNaN(record.acwr)
            ? record.acwr
            : null,
      }));
  }, [selectedRecords, latestRecord]);

  /*CSVアップロード画面へ遷移*/
  const handleCsvUpload = () => {
    setSelectedAthleteId(null);
    setView('upload');
  };

  /*選手選択ハンドラ（各選手の詳細画面へ遷移）*/
  const handleSelectPlayer = (athleteId) => {
    setSelectedAthleteId(String(athleteId));
    setView('detail');
  };

  return (
    /*アプリ全体の「画面ルーター」*/
    <div className="app">
      {view === 'home' && (
        <HomeView
          onAcwrClick={() => setView('overview')}
          onCsvClick={handleCsvUpload}
        />
      )}

      {view === 'overview' && (
        <OverviewView
          onBack={() => setView('home')}
          players={players}
          status={status}
          error={error}
          onSelectPlayer={handleSelectPlayer}
        />
      )}

      {view === 'upload' && (
        <CsvUploadView
          onBack={() => {
            setView('home');
          }}
          onSuccess={async () => {
            await refreshRecords();
          }}
          onNavigateToOverview={() => {
            setSelectedAthleteId(null);
            setView('overview');
          }}
          parseErrorMessage={parseErrorMessage}
        />
      )}

      {view === 'detail' && (
        <AthleteDetailView
          onBack={() => setView('overview')}
          players={players}
          selectedAthleteId={selectedAthleteId}
          onSelectPlayer={handleSelectPlayer}
          latestRecord={latestRecord}
          chartData={chartData}
          status={status}
          error={error}
        />
      )}
    </div>
  );
}

function HomeView({ onAcwrClick, onCsvClick }) {
  return (
    <div className="view-card home-view">
      <header className="view-header">
        <h1>ACWR推移確認システム</h1>
      </header>
      <div className="home-actions">
        <button type="button" className="primary-action" onClick={onAcwrClick}>
          ACWR確認
        </button>
        <button
          type="button"
          className="secondary-action"
          onClick={onCsvClick}
        >
          csvアップロード
        </button>
      </div>
    </div>
  );
}

function OverviewView({ onBack, players, status, error, onSelectPlayer }) {
  return (
    <div className="view-card overview-view">
      <header className="view-header">
        <button type="button" className="link-button" onClick={onBack}>
          ← ホームに戻る
        </button>
        <h1>ACWR確認</h1>
        <p>選手を選択すると、過去1ヶ月のACWR推移を確認できます。</p>
      </header>

      {status === 'loading' && (
        <p className="info-banner">データ読込中です…</p>
      )}
      {status === 'error' && <p className="error-banner">{error}</p>}
      {status === 'loaded' && players.length === 0 && (
        <p className="info-banner">選手データが登録されていません。</p>
      )}

      <div className="player-grid">
        {players.map((player) => (
          <button
            key={player.id}
            type="button"
            className="player-chip"
            onClick={() => onSelectPlayer(player.id)}
          >
            <span className="player-chip__id">{player.id}</span>
            <span className="player-chip__name">{player.name}</span>
            <span className="player-chip__date">
              最新: {player.latestDateRaw ? formatFullDate(player.latestDateRaw) : 'データなし'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function CsvUploadView({
  onBack,
  onSuccess,
  onNavigateToOverview,
  parseErrorMessage,
}) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);

  /*選択されたファイルの変更*/
  const handleFileChange = (event) => {
    const nextFile = event.target?.files?.[0] || null;
    setFile(nextFile);
  };

  /*CSVファイルのアップロード処理*/
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!file) {
      setError('CSVファイルを選択してください。');
      return;
    }

    setUploading(true);
    setError('');
    setSummary(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post(
        `${API_BASE_URL}/ingest/training-load/`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      setSummary(response.data);
      if (onSuccess) {
        await onSuccess();
      }
    } catch (err) {
      const message =
        (parseErrorMessage && parseErrorMessage(err)) ||
        'CSVのアップロードに失敗しました。';
      setError(message);
    } finally {
      setUploading(false);
    }
  };

  /*フォームのリセット処理*/
  const handleReset = () => {
    if (uploading) {
      return;
    }
    setFile(null);
    setError('');
    setSummary(null);
  };

  /*アップロード結果のサマリー項目作成*/
  const summaryItems = summary
    ? [
        { label: 'ファイルパス', value: summary.file_path || '-' },
        { label: '読込行数', value: summary.rows_read },
        { label: '有効行数', value: summary.rows_valid },
        { label: '選手数', value: summary.players_processed },
        { label: '日数', value: summary.days_processed },
        { label: '新規作成', value: summary.created },
        { label: '更新', value: summary.updated },
        {
          label: '除外されたathlete_id',
          value:
            summary.excluded_athlete_ids && summary.excluded_athlete_ids.length
              ? summary.excluded_athlete_ids.join(', ')
              : 'なし',
        },
      ]
    : [];

  return (
    <div className="view-card upload-view">
      <header className="view-header">
        <button
          type="button"
          className="link-button"
          onClick={onBack}
          disabled={uploading}
        >
          ← ホームに戻る
        </button>
        <h1>CSVアップロード</h1>
        <p>トレーニングデータCSVを取り込んでACWRを更新します。</p>
      </header>

      <form className="upload-form" onSubmit={handleSubmit}>
        <div className="upload-field">
          <label htmlFor="csv-file">CSVファイル</label>
          <input
            id="csv-file"
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            disabled={uploading}
          />
          {file && (
            <p className="upload-file-info">
              選択済み: <span>{file.name}</span>
            </p>
          )}
        </div>

        <div className="upload-actions">
          <button
            type="submit"
            className="upload-button upload-button--primary"
            disabled={uploading || !file}
          >
            {uploading ? 'アップロード中…' : 'アップロード'}
          </button>
          <button
            type="button"
            className="upload-button upload-button--secondary"
            onClick={handleReset}
            disabled={uploading}
          >
            クリア
          </button>
        </div>

        {error && <p className="error-banner">{error}</p>}
      </form>

      {summary && (
        <div className="upload-summary">
          <h2>取込結果</h2>
          <dl>
            {summaryItems.map((item) => (
              <div key={item.label} className="upload-summary__row">
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>

          <div className="upload-summary__actions">
            <button
              type="button"
              className="upload-button upload-button--primary"
              onClick={onNavigateToOverview}
              disabled={uploading}
            >
              選手一覧を確認
            </button>
            <button
              type="button"
              className="upload-button upload-button--secondary"
              onClick={handleReset}
              disabled={uploading}
            >
              別のファイルを選択
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AthleteDetailView({
  onBack,
  players,
  selectedAthleteId,
  onSelectPlayer,
  latestRecord,
  chartData,
  status,
  error,
}) {
  /*選択された選手情報の取得*/
  const selectedPlayer = players.find(
    (player) => String(player.id) === String(selectedAthleteId)
  );
  /*グラフ縦軸の最大値計算（2を超えるかどうか）*/
  const chartMetrics = useMemo(() => {
    const numeric = chartData.filter(
      (point) => typeof point.acwr === 'number' && !Number.isNaN(point.acwr)
    );
    if (numeric.length === 0) {
      return { exceededMax: false, maxValue: 2 };
    }
    const exceededMax = numeric.some((point) => point.acwr > 2);
    if (!exceededMax) {
      return { exceededMax: false, maxValue: 2 };
    }
    const highest = Math.max(...numeric.map((point) => point.acwr));
    const adjustedMax = Math.ceil((highest + 0.05) * 10) / 10;
    return { exceededMax: true, maxValue: Math.max(adjustedMax, 2.1) };
  }, [chartData]);

  return (
    <div className="detail-layout">
      <aside className="detail-sidebar">
        <button type="button" className="link-button" onClick={onBack}>
          ← 選手選択に戻る
        </button>
        <div className="sidebar-list">
          {players.map((player) => (
            <button
              key={player.id}
              type="button"
              className={`sidebar-button${
                String(player.id) === String(selectedAthleteId) ? ' is-active' : ''
              }`}
              onClick={() => onSelectPlayer(player.id)}
            >
              <span className="sidebar-button__id">{player.id}</span>
              <span className="sidebar-button__name">{player.name}</span>
              <span className="sidebar-button__date">
                最新: {player.latestDateRaw ? formatFullDate(player.latestDateRaw) : 'データなし'}
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="detail-main">
        <header className="view-header detail-header">
          <h1>
            {selectedPlayer ? (
              <>
                <span className="detail-title__id">{selectedPlayer.id}</span>
                <span className="detail-title__name">{selectedPlayer.name}</span>
              </>
            ) : (
              '選手情報'
            )}
          </h1>
          <p>過去1ヶ月のACWR推移を確認できます。</p>
        </header>

        {status === 'loading' && (
          <p className="info-banner">データ読込中です…</p>
        )}
        {status === 'error' && <p className="error-banner">{error}</p>}

        {status === 'loaded' && latestRecord && (
          <div className="summary-panel">
            <div>
              <span className="summary-label">最新日付</span>
              <span className="summary-value">
                {formatFullDate(latestRecord.date)}
              </span>
            </div>
            <div>
              <span className="summary-label">最新ACWR</span>
              <span className="summary-value">
                {typeof latestRecord.acwr === 'number'
                  ? latestRecord.acwr.toFixed(3)
                  : '算出不可'}
              </span>
            </div>
          </div>
        )}

        {status === 'loaded' && chartData.length > 0 && (
          <div className="chart-card">
            <div className="chart-card-header">
              <h2>ACWR推移</h2>
              <p>ACWRは(0.8 – 1.3)が適正範囲です。</p>
            </div>
            {chartMetrics.exceededMax && (
              <p className="warning-banner">
                ACWRが2.0を超えるデータがあるため、縦軸の上限を
                <span className="warning-banner__value">
                  {chartMetrics.maxValue.toFixed(1)}
                </span>
                に調整しています。
              </p>
            )}
            <AcwrChart data={chartData} maxValue={chartMetrics.maxValue} />
          </div>
        )}

        {status === 'loaded' && latestRecord === null && (
          <p className="info-banner">該当するACWRデータが見つかりません。</p>
        )}
      </section>
    </div>
  );
}

function AcwrChart({ data, maxValue: maxValueProp = 2 }) {
  const [hovered, setHovered] = useState(null);
  const width = 640;
  const height = 340;
  const padding = { top: 24, right: 30, bottom: 48, left: 64 };

  const dates = data.map((entry) => entry.dateObj.getTime());
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const dateSpan = Math.max(maxDate - minDate, 1);

  const numericEntries = data.filter(
    (entry) => typeof entry.acwr === 'number'
  );
  const minValue = 0;
  const maxValue =
    numericEntries.length > 0
      ? Math.max(maxValueProp, SAFE_ACWR_MAX)
      : Math.max(maxValueProp, SAFE_ACWR_MAX);
  const valueSpan = Math.max(maxValue - minValue, 0.1);

  const chartHeight = height - padding.top - padding.bottom;
  const clampValue = (value) => Math.min(Math.max(value, minValue), maxValue);

  const points = data.map((entry) => {
    const x =
      padding.left +
      ((entry.dateObj.getTime() - minDate) / dateSpan) *
        (width - padding.left - padding.right);
    const y =
      typeof entry.acwr === 'number'
        ? padding.top +
          ((maxValue - entry.acwr) / valueSpan) *
            (height - padding.top - padding.bottom)
        : null;
    return { ...entry, x, y };
  });

  let path = '';
  let pathOpen = false;
  points.forEach((point) => {
    if (point.y === null) {
      pathOpen = false;
      return;
    }
    if (!pathOpen) {
      path += `M ${point.x} ${point.y}`;
      pathOpen = true;
    } else {
      path += ` L ${point.x} ${point.y}`;
    }
  });

  const yTicks = createTicks(minValue, maxValue, 5);
  const xTicks = createDateTicks(minDate, maxDate, 4);

  const safeTopValue = clampValue(SAFE_ACWR_MAX);
  const safeBottomValue = clampValue(SAFE_ACWR_MIN);
  const safeTop =
    padding.top +
    ((maxValue - safeTopValue) / valueSpan) * chartHeight;
  const safeBottom =
    padding.top +
    ((maxValue - safeBottomValue) / valueSpan) * chartHeight;
  const safeHeight = Math.max(safeBottom - safeTop, 0);

  return (
    <div className="chart-area">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="ACWR折れ線グラフ"
        onMouseLeave={() => setHovered(null)}
      >
        <g>
          <line
            x1={padding.left}
            y1={height - padding.bottom}
            x2={width - padding.right}
            y2={height - padding.bottom}
            stroke="rgba(122, 46, 29, 0.4)"
            strokeWidth="1"
          />
          <line
            x1={padding.left}
            y1={padding.top}
            x2={padding.left}
            y2={height - padding.bottom}
            stroke="rgba(122, 46, 29, 0.4)"
            strokeWidth="1"
          />
        </g>

        {safeHeight > 0 && (
          <rect
            x={padding.left}
            width={width - padding.left - padding.right}
            y={safeTop}
            height={safeHeight}
            fill="rgba(209, 242, 214, 0.8)"
            stroke="#7ab97a"
            strokeWidth="1"
          />
        )}

        {yTicks.map((tick) => {
          const y =
            padding.top +
            ((maxValue - tick) / valueSpan) *
              (height - padding.top - padding.bottom);
          return (
            <g key={`y-${tick}`}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="rgba(122, 46, 29, 0.12)"
                strokeDasharray="4 4"
              />
              <text
                x={padding.left - 12}
                y={y + 4}
                textAnchor="end"
                className="chart-axis-label"
              >
                {tick.toFixed(1)}
              </text>
            </g>
          );
        })}

        {xTicks.map((tick) => {
          const x =
            padding.left +
            ((tick - minDate) / dateSpan) *
              (width - padding.left - padding.right);
          return (
            <g key={`x-${tick}`}>
              <line
                x1={x}
                y1={padding.top}
                x2={x}
                y2={height - padding.bottom}
                stroke="rgba(122, 46, 29, 0.08)"
                strokeDasharray="4 4"
              />
              <text
                x={x}
                y={height - padding.bottom + 28}
                textAnchor="middle"
                className="chart-axis-label"
              >
                {formatShortDate(new Date(tick))}
              </text>
            </g>
          );
        })}

        <text
          x={padding.left - 40}
          y={padding.top - 8}
          className="chart-axis-title"
        >
          ACWR
        </text>

        {path && (
          <path
            d={path}
            fill="none"
            stroke="#dd2476"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {points.map((point) => {
          if (point.y === null) {
            return null;
          }
          return (
            <circle
              key={point.date}
              cx={point.x}
              cy={point.y}
              r={5}
              fill="#ffffff"
              stroke="#dd2476"
              strokeWidth="2"
              onMouseEnter={() =>
                setHovered({
                  x: point.x,
                  y: point.y,
                  date: point.date,
                  acwr: point.acwr,
                })
              }
            />
          );
        })}
      </svg>

      {hovered && (
        <div
          className="chart-tooltip"
          style={{
            left: hovered.x,
            top: hovered.y,
          }}
        >
          <span>{formatFullDate(hovered.date)}</span>
          <strong>{hovered.acwr.toFixed(3)}</strong>
        </div>
      )}
    </div>
  );
}

function createTicks(min, max, count) {
  if (count <= 1) {
    return [max];
  }
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, index) => min + step * index);
}

function createDateTicks(min, max, count) {
  const minRounded = Math.round(min);
  const maxRounded = Math.round(max);

  if (max <= min || count <= 1) {
    return [minRounded];
  }

  const step = (max - min) / (count - 1);
  const uniqueTicks = [];

  for (let index = 0; index < count; index += 1) {
    const tick = Math.round(min + step * index);
    if (!uniqueTicks.includes(tick)) {
      uniqueTicks.push(tick);
    }
  }

  if (!uniqueTicks.includes(minRounded)) {
    uniqueTicks.unshift(minRounded);
  }
  if (!uniqueTicks.includes(maxRounded)) {
    uniqueTicks.push(maxRounded);
  }

  return uniqueTicks.sort((a, b) => a - b);
}

function formatShortDate(dateObj) {
  return dateObj.toLocaleDateString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
  });
}

function formatFullDate(dateString) {
  const dateObj = new Date(dateString);
  if (Number.isNaN(dateObj.getTime())) {
    return dateString;
  }
  return dateObj.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export default App;
