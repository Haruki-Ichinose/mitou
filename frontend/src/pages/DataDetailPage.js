import React, { useEffect, useMemo, useState } from "react";
import { Chart } from "react-chartjs-2";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  fetchAthleteCalendar,
  fetchAthletes,
  fetchTimeseries,
} from "../api";
import titleLogo from "../components/title.jpg";

const theme = {
  bg: "var(--surface)",
  textMain: "var(--ink-900)",
  textSub: "var(--ink-600)",
  cardBg: "#ffffff",
  primary: "var(--accent-sun)",
  border: "var(--border-soft)",
  shadow: "var(--shadow-soft)",
  fpBg: "rgba(14, 165, 233, 0.15)",
  fpText: "#075985",
  gkBg: "rgba(251, 191, 36, 0.2)",
  gkText: "#92400E",
};

const riskPalette = {
  pending: {
    accent: "#64748b",
    bg: "rgba(100, 116, 139, 0.16)",
    border: "rgba(100, 116, 139, 0.35)",
    text: "#475569",
  },
  safety: {
    accent: "#16a34a",
    bg: "rgba(34, 197, 94, 0.12)",
    border: "rgba(34, 197, 94, 0.35)",
    text: "#166534",
  },
  caution: {
    accent: "#f59e0b",
    bg: "rgba(251, 191, 36, 0.16)",
    border: "rgba(251, 191, 36, 0.4)",
    text: "#92400e",
  },
  risky: {
    accent: "#ef4444",
    bg: "rgba(248, 113, 113, 0.16)",
    border: "rgba(248, 113, 113, 0.4)",
    text: "#b91c1c",
  },
};

const riskText = {
  pending: {
    label: "Loading",
    jp: "判定中",
    description: "データを取得しています。しばらくお待ちください。",
  },
  safety: {
    label: "Safety",
    jp: "安定",
    description: "直近の負荷は安定しています。現状のリズムを維持しましょう。",
  },
  caution: {
    label: "Caution",
    jp: "注意",
    description: "負荷が上昇傾向です。回復と強度の調整を意識してください。",
  },
  risky: {
    label: "Risky",
    jp: "危険",
    description: "リスクが高い状態です。回復優先で負荷を調整してください。",
  },
};

const styles = {
  profileRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 20,
  },
  profileName: {
    fontSize: 24,
    fontWeight: 800,
    color: theme.textMain,
  },
  profileMetaRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 14,
    fontSize: 13,
    color: theme.textSub,
    fontWeight: 600,
    alignItems: "center",
  },
  profileBadge: (isGk) => ({
    padding: "6px 14px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 12,
    whiteSpace: "nowrap",
    background: isGk ? theme.gkBg : theme.fpBg,
    color: isGk ? theme.gkText : theme.fpText,
  }),
  conditionHero: (level) => ({
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 24,
    padding: 28,
    borderRadius: 24,
    border: `1px solid ${(riskPalette[level] || riskPalette.pending).border}`,
    background: `linear-gradient(135deg, ${(riskPalette[level] || riskPalette.pending).bg} 0%, rgba(255,255,255,0.9) 70%)`,
    boxShadow: theme.shadow,
  }),
  conditionHeroHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    gap: 12,
    flexWrap: "wrap",
  },
  conditionTitle: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.24em",
    textTransform: "uppercase",
    color: theme.textSub,
  },
  conditionDate: {
    fontSize: 12,
    fontWeight: 700,
    color: theme.textSub,
  },
  conditionLevel: (level) => ({
    fontSize: 40,
    fontWeight: 900,
    color: (riskPalette[level] || riskPalette.pending).text,
    letterSpacing: "-0.02em",
    marginBottom: 8,
  }),
  conditionDesc: {
    margin: "0 0 16px",
    fontSize: 14,
    fontWeight: 600,
    color: theme.textSub,
  },
  reasonList: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  reasonPill: (level) => ({
    padding: "8px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    border: `1px solid ${(riskPalette[level] || riskPalette.pending).border}`,
    background: (riskPalette[level] || riskPalette.pending).bg,
    color: (riskPalette[level] || riskPalette.pending).text,
  }),
  reasonPillMuted: {
    padding: "8px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    border: `1px dashed ${theme.border}`,
    color: theme.textSub,
    background: "#fff",
  },
  section: { width: "100%" },
  gridRow: {
    display: "grid",
    gridTemplateColumns: "0.35fr 0.65fr",
    gap: 16,
    alignItems: "stretch",
  },
  card: {
    background: theme.cardBg,
    borderRadius: 16,
    padding: 18,
    border: `1px solid ${theme.border}`,
    boxShadow: theme.shadow,
    height: "100%",
  },
  kpiStack: { display: "grid", gridTemplateColumns: "1fr", gap: 12 },
  metricLabel: { fontSize: 12, fontWeight: 700, color: theme.textSub, letterSpacing: "0.08em" },
  metricDesc: { fontSize: 11, color: theme.textSub, marginBottom: 6 },
  metricValue: { fontSize: 26, fontWeight: 800, color: theme.textMain },
  metricHint: { fontSize: 12, color: theme.textSub },
  decisionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: 12,
  },
  metricCard: (highlight, level) => ({
    position: "relative",
    background: "#fff",
    borderRadius: 16,
    padding: 16,
    border: `1px solid ${
      highlight ? (riskPalette[level] || riskPalette.pending).accent : theme.border
    }`,
    boxShadow: highlight ? "0 12px 24px rgba(0,0,0,0.08)" : theme.shadow,
    borderLeft: highlight
      ? `6px solid ${(riskPalette[level] || riskPalette.pending).accent}`
      : `1px solid ${theme.border}`,
  }),
  metricTag: (level) => ({
    position: "absolute",
    top: 12,
    right: 12,
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
    background: (riskPalette[level] || riskPalette.pending).accent,
    color: "#fff",
  }),
  metricValueLarge: {
    fontSize: 28,
    fontWeight: 800,
    color: theme.textMain,
    marginBottom: 6,
  },
  metricNote: {
    fontSize: 12,
    color: theme.textSub,
    marginTop: 6,
  },
  gaugeWrap: {
    marginTop: 10,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  gaugeTrack: {
    position: "relative",
    height: 10,
    borderRadius: 999,
    background: "#e2e8f0",
    overflow: "hidden",
  },
  gaugeFill: {
    height: "100%",
    borderRadius: 999,
    background: "#94a3b8",
  },
  gaugeIndicator: (color) => ({
    position: "absolute",
    top: -3,
    width: 16,
    height: 16,
    borderRadius: "50%",
    background: "#fff",
    border: `2px solid ${color}`,
    transform: "translateX(-50%)",
  }),
  gaugeMarker: (color) => ({
    position: "absolute",
    top: -6,
    width: 2,
    height: 22,
    borderRadius: 2,
    background: color,
  }),
  metricThreshold: {
    fontSize: 12,
    color: theme.textSub,
  },
  rangeTable: {
    marginTop: 12,
    display: "grid",
    gap: 8,
  },
  rangeRow: {
    display: "grid",
    gridTemplateColumns: "52px 1fr auto",
    gap: 10,
    alignItems: "center",
  },
  rangeLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: theme.textSub,
  },
  rangeValue: {
    fontSize: 13,
    fontWeight: 700,
    color: theme.textMain,
  },
  rangeBadge: {
    fontSize: 11,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 999,
    border: `1px solid ${theme.border}`,
    color: theme.textSub,
    background: "#f8fafc",
  },
  metricMeta: {
    marginTop: 6,
    fontSize: 12,
    color: theme.textSub,
  },
  chartTitle: {
    fontSize: 13,
    fontWeight: 800,
    color: theme.textSub,
    letterSpacing: "0.06em",
    marginBottom: 10,
  },
  chartsGrid: {
    display: "grid",
    gap: 16,
  },
};

export default function DataDetailPage() {
  const navigate = useNavigate();
  const { athleteId: athleteIdParam } = useParams();
  const [athletes, setAthletes] = useState([]);
  const [athleteId, setAthleteId] = useState(athleteIdParam || "");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [calendarDays, setCalendarDays] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    setAthleteId(athleteIdParam || "");
  }, [athleteIdParam]);

  useEffect(() => {
    setSelectedDate(null);
    setCalendarMonth(null);
  }, [athleteId]);

  useEffect(() => {
    let mounted = true;
    const loadAthletes = async () => {
      try {
        const list = await fetchAthletes();
        if (!mounted) return;
        setAthletes(list);
        if (!athleteIdParam && list.length > 0) {
          navigate(`/data/${list[0].athlete_id}`, { replace: true });
        }
      } catch (e) {
        console.error(e);
      }
    };
    loadAthletes();
    return () => {
      mounted = false;
    };
  }, [athleteIdParam, navigate]);

  useEffect(() => {
    if (!athleteId) return;
    let mounted = true;
    const loadTimeseries = async () => {
      setLoading(true);
      try {
        const ts = await fetchTimeseries(athleteId);
        if (mounted) setRows(ts);
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadTimeseries();
    return () => {
      mounted = false;
    };
  }, [athleteId]);

  useEffect(() => {
    if (!athleteId) return;
    let mounted = true;
    const loadCalendar = async () => {
      try {
        const days = await fetchAthleteCalendar(athleteId);
        if (!mounted) return;
        setCalendarDays(days);
        if (days.length > 0) {
          const lastDate = days[days.length - 1].date;
          setSelectedDate((prev) => prev || lastDate);
          setCalendarMonth(getMonthAnchor(parseDateKey(lastDate)));
        }
      } catch (e) {
        console.error(e);
        if (mounted) setCalendarDays([]);
      }
    };
    loadCalendar();
    return () => {
      mounted = false;
    };
  }, [athleteId]);

  const currentAthlete = useMemo(
    () => athletes.find((athlete) => athlete.athlete_id === athleteId),
    [athletes, athleteId]
  );
  const isGk = currentAthlete?.position === "GK";

  const selectedRow = useMemo(() => {
    if (!selectedDate) return null;
    return rows.find((row) => normalizeDateKey(row.date) === selectedDate) || null;
  }, [rows, selectedDate]);

  const viewRows = useMemo(() => {
    if (!rows?.length) return [];
    const anchorKey = selectedDate || normalizeDateKey(rows[rows.length - 1]?.date);
    const anchorDate = parseDateKey(anchorKey);
    if (!anchorDate || Number.isNaN(anchorDate.valueOf())) return rows.slice(-30);
    const start = new Date(anchorDate);
    start.setDate(start.getDate() - 30);
    return rows.filter((row) => {
      const rowDate = parseDateKey(row.date);
      return rowDate && rowDate >= start && rowDate <= anchorDate;
    });
  }, [rows, selectedDate]);

  const activeRow = useMemo(
    () => selectedRow || viewRows[viewRows.length - 1],
    [selectedRow, viewRows]
  );
  const latestWorkload = activeRow?.workload || {};
  const riskLevel = latestWorkload.risk_level || "pending";
  const riskReasons = (latestWorkload.risk_reasons || []).map((reason) =>
    translateRiskReason(reason)
  );
  const riskSummary = riskText[riskLevel] || riskText.pending;
  const metricOrder = useMemo(
    () =>
      isGk
        ? ["acwr_dive", "time_to_feet", "monotony", "asymmetry"]
        : ["acwr_hsr", "acwr_load", "acwr_ima_decel", "monotony", "efficiency"],
    [isGk]
  );

  const riskFlags = useMemo(() => {
    const flags = {
      hsr: false,
      load: false,
      highDecelAcwr: false,
      efficiency: false,
      monotony: false,
      timeToFeet: false,
      diveAcwr: false,
      asymmetry: false,
    };
    riskReasons.forEach((reason) => {
      if (reason.includes("高強度走行ACWR")) flags.hsr = true;
      if (reason.includes("負荷ACWR")) flags.load = true;
      if (reason.includes("急減速ACWR")) flags.highDecelAcwr = true;
      if (reason.includes("効率")) flags.efficiency = true;
      if (reason.includes("単調性")) flags.monotony = true;
      if (reason.includes("起き上がり時間")) flags.timeToFeet = true;
      if (reason.includes("ダイブACWR")) flags.diveAcwr = true;
      if (reason.includes("左右差")) flags.asymmetry = true;
    });
    return flags;
  }, [riskReasons]);

  const decisionMetrics = useMemo(() => {
    if (isGk) {
      return [
        {
          key: "acwr_dive",
          label: "ダイブACWR",
          desc: "ダイブ負荷の急増バランス",
          value: latestWorkload.acwr_dive,
          threshold: ">= 1.5 : Risky",
          highlight: riskFlags.diveAcwr,
          gauge: { min: 0, max: 2.5, danger: 1.5 },
        },
        {
          key: "time_to_feet",
          label: "起き上がり時間",
          desc: "反応・疲労の目安",
          value: latestWorkload.time_to_feet,
          unit: "秒",
          threshold: ">= 1.5 : Caution / >= 2.0 : Risky",
          highlight: riskFlags.timeToFeet,
          gauge: { min: 0, max: 3, warn: 1.5, danger: 2.0 },
        },
        {
          key: "asymmetry",
          label: "左右差",
          desc: "左右のバランス",
          value: latestWorkload.val_asymmetry,
          threshold: ">= 0.4 : Caution",
          highlight: riskFlags.asymmetry,
          gauge: { min: 0, max: 1, warn: 0.4 },
        },
        {
          key: "monotony",
          label: "単調性",
          desc: "負荷の偏り",
          value: latestWorkload.monotony_load,
          threshold: ">= 2.5 : Caution",
          highlight: riskFlags.monotony,
          gauge: { min: 0, max: 4, warn: 2.5 },
        },
      ];
    }
    return [
      {
        key: "acwr_hsr",
        label: "高強度走行ACWR",
        desc: "高強度走行の急増バランス",
        value: latestWorkload.acwr_hsr,
        threshold: ">= 1.3 : Caution / >= 1.5 : Risky",
        highlight: riskFlags.hsr,
        gauge: { min: 0, max: 2.5, warn: 1.3, danger: 1.5 },
      },
      {
        key: "acwr_load",
        label: "負荷ACWR",
        desc: "全体負荷の急増バランス",
        value: latestWorkload.acwr_load,
        threshold: ">= 1.5 : Caution",
        highlight: riskFlags.load,
        gauge: { min: 0, max: 2.5, warn: 1.5 },
      },
      {
        key: "acwr_ima_decel",
        label: "急減速ACWR",
        desc: "急減速の急増バランス",
        value: latestWorkload.acwr_ima_decel,
        threshold: ">= 1.3 : Caution / >= 1.5 : Risky",
        highlight: riskFlags.highDecelAcwr,
        gauge: { min: 0, max: 2.5, warn: 1.3, danger: 1.5 },
      },
      {
        key: "efficiency",
        label: "効率",
        desc: "負荷と心拍の効率",
        value: latestWorkload.efficiency_index,
        threshold: "<= 0.5 : Caution",
        highlight: riskFlags.efficiency,
        gauge: { min: 0, max: 1.2, warn: 0.5 },
        note: "低いほどリスク",
      },
      {
        key: "monotony",
        label: "単調性",
        desc: "負荷の偏り",
        value: latestWorkload.monotony_load,
        threshold: ">= 2.5 : Caution",
        highlight: riskFlags.monotony,
        gauge: { min: 0, max: 4, warn: 2.5 },
      },
    ];
  }, [isGk, latestWorkload, riskFlags]);

  const trendMetrics = useMemo(() => {
    if (isGk) {
      return [
        {
          key: "acwr_dive",
          label: "ダイブACWR",
          dataKey: "acwr_dive",
          color: "#475569",
          fill: "rgba(71, 85, 105, 0.08)",
          thresholds: [{ value: 1.5, label: "Risky 1.5", color: riskPalette.risky.accent }],
          suggestedMax: 2.5,
        },
        {
          key: "time_to_feet",
          label: "起き上がり時間",
          dataKey: "time_to_feet",
          color: "#475569",
          fill: "rgba(71, 85, 105, 0.08)",
          thresholds: [
            { value: 1.5, label: "Caution 1.5秒", color: riskPalette.caution.accent },
            { value: 2.0, label: "Risky 2.0秒", color: riskPalette.risky.accent },
          ],
          suggestedMax: 3,
        },
        {
          key: "monotony",
          label: "単調性",
          dataKey: "monotony_load",
          color: "#475569",
          fill: "rgba(71, 85, 105, 0.08)",
          thresholds: [{ value: 2.5, label: "Caution 2.5", color: riskPalette.caution.accent }],
          suggestedMax: 4,
        },
      ];
    }

    return [
      {
        key: "acwr_hsr",
        label: "高強度走行ACWR",
        dataKey: "acwr_hsr",
        color: "#475569",
        fill: "rgba(71, 85, 105, 0.08)",
        thresholds: [
          { value: 1.3, label: "Caution 1.3", color: riskPalette.caution.accent },
          { value: 1.5, label: "Risky 1.5", color: riskPalette.risky.accent },
        ],
        suggestedMax: 2.5,
      },
      {
        key: "acwr_load",
        label: "負荷ACWR",
        dataKey: "acwr_load",
        color: "#475569",
        fill: "rgba(71, 85, 105, 0.08)",
        thresholds: [{ value: 1.5, label: "Caution 1.5", color: riskPalette.caution.accent }],
        suggestedMax: 2.5,
      },
      {
        key: "acwr_ima_decel",
        label: "急減速ACWR",
        dataKey: "acwr_ima_decel",
        color: "#475569",
        fill: "rgba(71, 85, 105, 0.08)",
        thresholds: [
          { value: 1.3, label: "Caution 1.3", color: riskPalette.caution.accent },
          { value: 1.5, label: "Risky 1.5", color: riskPalette.risky.accent },
        ],
        suggestedMax: 2.5,
      },
      {
        key: "monotony",
        label: "単調性",
        dataKey: "monotony_load",
        color: "#475569",
        fill: "rgba(71, 85, 105, 0.08)",
        thresholds: [{ value: 2.5, label: "Caution 2.5", color: riskPalette.caution.accent }],
        suggestedMax: 4,
      },
    ];
  }, [isGk]);

  const summaryMetrics = useMemo(() => {
    if (isGk) {
      return [
        {
          key: "asymmetry",
          label: "左右差",
          dataKey: "val_asymmetry",
          digits: 2,
          isValid: (row, _value) => (row.total_dive_count || 0) > 0,
        },
      ];
    }

    return [
      {
        key: "efficiency",
        label: "効率",
        dataKey: "efficiency_index",
        digits: 2,
        isValid: (row, _value) => (row.mean_heart_rate || 0) > 0,
      },
    ];
  }, [isGk]);

  const summaryStats = useMemo(() => {
    const parseRowDate = (row) => {
      const parsed = row?.date ? new Date(row.date) : null;
      return parsed && !Number.isNaN(parsed.valueOf()) ? parsed : null;
    };

    const isMetricValueValid = (row, metric) => {
      const value = toNumber(row.workload?.[metric.dataKey]);
      if (value === null) return false;
      if (metric.isValid && !metric.isValid(row, value)) return false;
      return true;
    };

    const findLatestRow = (metric) => {
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        const row = rows[i];
        if (isMetricValueValid(row, metric)) return row;
      }
      return null;
    };

    const filterRowsByDays = (metric, anchorDate, days) => {
      const start = new Date(anchorDate);
      start.setDate(start.getDate() - (days - 1));
      return rows.filter((row) => {
        const rowDate = parseRowDate(row);
        if (!rowDate) return false;
        if (rowDate < start || rowDate > anchorDate) return false;
        return isMetricValueValid(row, metric);
      });
    };

    const buildRangeStats = (rangeRows, metric) => {
      const values = rangeRows.map((row) => toNumber(row.workload?.[metric.dataKey]));
      if (!values.length) return { min: null, max: null, count: 0 };
      return {
        min: Math.min(...values),
        max: Math.max(...values),
        count: values.length,
      };
    };

    return summaryMetrics.map((metric) => {
      const latestRow = findLatestRow(metric);
      const anchorDate = latestRow ? parseRowDate(latestRow) : null;
      const rows7 = anchorDate ? filterRowsByDays(metric, anchorDate, 7) : [];
      const rows28 = anchorDate ? filterRowsByDays(metric, anchorDate, 28) : [];
      return {
        metric,
        latestRow,
        range7: buildRangeStats(rows7, metric),
        range28: buildRangeStats(rows28, metric),
      };
    });
  }, [rows, summaryMetrics]);

  const orderedTrendMetrics = useMemo(
    () => sortByOrder(trendMetrics, metricOrder, (item) => item.key),
    [trendMetrics, metricOrder]
  );

  const orderedDecisionMetrics = useMemo(
    () => sortByOrder(decisionMetrics, metricOrder, (item) => item.key),
    [decisionMetrics, metricOrder]
  );

  const orderedSummaryStats = useMemo(
    () => sortByOrder(summaryStats, metricOrder, (item) => item.metric.key),
    [summaryStats, metricOrder]
  );

  const calendarMap = useMemo(() => {
    const map = new Map();
    calendarDays.forEach((day) => {
      if (day?.date) {
        map.set(day.date, day);
      }
    });
    return map;
  }, [calendarDays]);

  const latestMonthAnchor = useMemo(() => {
    const latestKey =
      calendarDays[calendarDays.length - 1]?.date ||
      normalizeDateKey(rows[rows.length - 1]?.date);
    const latestDate = parseDateKey(latestKey);
    return getMonthAnchor(latestDate || new Date());
  }, [calendarDays, rows]);

  const calendarAnchor = useMemo(
    () => calendarMonth || latestMonthAnchor || getMonthAnchor(new Date()),
    [calendarMonth, latestMonthAnchor]
  );

  const calendarCells = useMemo(
    () => buildCalendarCells(calendarAnchor),
    [calendarAnchor]
  );

  const formatRange = (range, digits, unit = "") => {
    if (!range || range.count === 0) return "データなし";
    const min = range.min.toFixed(digits);
    const max = range.max.toFixed(digits);
    return unit ? `${min}〜${max}${unit}` : `${min}〜${max}`;
  };

  const buildMetricTrendChart = (metric) => {
    const labels = viewRows.map((row) => row.date);
    const values = viewRows.map((row) => row.workload?.[metric.dataKey] ?? null);
    const annotations = {};
    (metric.thresholds || []).forEach((threshold, index) => {
      annotations[`${metric.key}-threshold-${index}`] = {
        type: "line",
        yMin: threshold.value,
        yMax: threshold.value,
        borderColor: threshold.color,
        borderDash: [6, 4],
        borderWidth: 1,
        label: {
          display: true,
          content: threshold.label,
          position: "end",
          backgroundColor: "rgba(255,255,255,0.85)",
          color: threshold.color,
        },
      };
    });

    return {
      data: {
        labels,
        datasets: [
          {
            type: "line",
            label: metric.label,
            data: values,
            borderColor: metric.color,
            backgroundColor: metric.fill,
            tension: 0.3,
            borderWidth: 1.5,
            pointRadius: 1,
            pointHoverRadius: 3,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          annotation: { annotations },
        },
        scales: {
          x: { display: false },
          y: {
            grid: { color: "#f3f4f6" },
            suggestedMin: 0,
            suggestedMax: metric.suggestedMax,
          },
        },
      },
    };
  };

  return (
    <div className="app-shell">
      <div className="page data-detail-page">
        <div className="page-bar">
          <img
            className="title-logo title-logo--page"
            src={titleLogo}
            alt="Predict2Protect"
          />
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="ghost-button" to="/data">
              一覧へ
            </Link>
            <Link className="ghost-button" to="/home">
              ホームへ
            </Link>
          </div>
        </div>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>選手詳細</h2>
            </div>
            <span className="panel-count">更新: {activeRow?.date || "-"}</span>
          </div>

          <div style={styles.profileRow}>
            <div>
              <div style={styles.profileName}>{currentAthlete?.athlete_name || "-"}</div>
              <div style={styles.profileMetaRow}>
                <span style={styles.profileBadge(isGk)}>
                  {isGk ? "ゴールキーパー" : "フィールド選手"}
                </span>
                <span>背番号: {currentAthlete?.jersey_number || "-"}</span>
                <span>表記: {currentAthlete?.uniform_name || "-"}</span>
                <span>選手コード: {currentAthlete?.athlete_id || "-"}</span>
              </div>
            </div>
            <Link
              className="ghost-button"
              to={`/matches/${currentAthlete?.athlete_id || ""}`}
            >
              試合日スタッツへ
            </Link>
          </div>

          <section style={styles.section}>
            <div style={styles.conditionHero(riskLevel)}>
              <div>
                <div style={styles.conditionHeroHeader}>
                  <span style={styles.conditionTitle}>コンディション判定</span>
                  <span style={styles.conditionDate}>更新: {activeRow?.date || "-"}</span>
                </div>
                <div style={styles.conditionLevel(riskLevel)}>{riskSummary.label}</div>
                <p style={styles.conditionDesc}>{riskSummary.description}</p>
                {/* 特記事項は非表示 */}
              </div>
            </div>
          </section>

          <section style={styles.section}>
            <SectionTitle title="判定に使用した値" />
            <div style={styles.decisionGrid}>
              {orderedDecisionMetrics.map((metric) => {
                const gauge = buildGauge(metric);
                const fillColor = metric.highlight
                  ? (riskPalette[riskLevel] || riskPalette.pending).accent
                  : "#94a3b8";
                return (
                  <div key={metric.key} style={styles.metricCard(metric.highlight, riskLevel)}>
                    {metric.highlight && <span style={styles.metricTag(riskLevel)}>判定要因</span>}
                    <div style={styles.metricLabel}>{metric.label}</div>
                    {metric.desc && <div style={styles.metricDesc}>{metric.desc}</div>}
                    <div style={styles.metricValueLarge}>
                      {formatMetricValue(metric.value, metric.digits, metric.unit)}
                    </div>
                    <div style={styles.gaugeWrap}>
                      <div style={styles.gaugeTrack}>
                        <div
                          style={{
                            ...styles.gaugeFill,
                            width: `${gauge.position * 100}%`,
                            background: fillColor,
                          }}
                        />
                        {gauge.value !== null && (
                          <span
                            style={{
                              ...styles.gaugeIndicator(fillColor),
                              left: `${gauge.position * 100}%`,
                            }}
                          />
                        )}
                        {gauge.warnPos !== null && (
                          <span
                            style={{
                              ...styles.gaugeMarker(riskPalette.caution.accent),
                              left: `${gauge.warnPos * 100}%`,
                            }}
                          />
                        )}
                        {gauge.dangerPos !== null && (
                          <span
                            style={{
                              ...styles.gaugeMarker(riskPalette.risky.accent),
                              left: `${gauge.dangerPos * 100}%`,
                            }}
                          />
                        )}
                      </div>
                      <div style={styles.metricThreshold}>{metric.threshold}</div>
                      {metric.note && <div style={styles.metricNote}>{metric.note}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section style={styles.section}>
            <SectionTitle title="判定指標の推移（30日）" />
            <div className="metric-charts-grid" style={styles.chartsGrid}>
              {orderedTrendMetrics.map((metric) => {
                const chart = buildMetricTrendChart(metric);
                return (
                  <div key={metric.key} className="chart-card" style={styles.card}>
                    <div style={styles.chartTitle}>{metric.label}</div>
                    <div style={{ height: 200 }}>
                      <Chart type="line" data={chart.data} options={chart.options} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section style={styles.section}>
            <SectionTitle title="補助指標のレンジ（7日・28日）" />
            <div className="metric-charts-grid" style={styles.chartsGrid}>
              {orderedSummaryStats.map(({ metric, latestRow, range7, range28 }) => {
                return (
                  <div key={metric.key} className="chart-card" style={styles.card}>
                    <div style={styles.metricLabel}>{metric.label}</div>
                    <div style={styles.metricValueLarge}>
                      {formatMetricValue(
                        latestRow?.workload?.[metric.dataKey],
                        metric.digits,
                        metric.unit
                      )}
                    </div>
                    <div style={styles.metricMeta}>
                      最終記録日: {latestRow?.date || "-"}
                    </div>
                    <div style={styles.rangeTable}>
                      <div style={styles.rangeRow}>
                        <span style={styles.rangeLabel}>7日</span>
                        <span style={styles.rangeValue}>
                          {formatRange(range7, metric.digits || 2, metric.unit)}
                        </span>
                        <span style={styles.rangeBadge}>{`${range7.count}件`}</span>
                      </div>
                      <div style={styles.rangeRow}>
                        <span style={styles.rangeLabel}>28日</span>
                        <span style={styles.rangeValue}>
                          {formatRange(range28, metric.digits || 2, metric.unit)}
                        </span>
                        <span style={styles.rangeBadge}>{`${range28.count}件`}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section style={styles.section}>
            <SectionTitle title="リスクカレンダー" />
            <div className="calendar-panel">
              <div className="calendar-header">
                <button
                  type="button"
                  className="ghost-button calendar-nav"
                  onClick={() =>
                    setCalendarMonth((prev) => {
                      const base = prev || calendarAnchor;
                      return getMonthAnchor(
                        new Date(base.getFullYear(), base.getMonth() - 1, 1)
                      );
                    })
                  }
                >
                  前月
                </button>
                <div className="calendar-title">
                  {formatMonthLabel(calendarAnchor)}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    type="button"
                    className="ghost-button calendar-nav"
                    onClick={() => setCalendarMonth(latestMonthAnchor)}
                  >
                    最新へ
                  </button>
                  <button
                    type="button"
                    className="ghost-button calendar-nav"
                    onClick={() =>
                      setCalendarMonth((prev) => {
                        const base = prev || calendarAnchor;
                        return getMonthAnchor(
                          new Date(base.getFullYear(), base.getMonth() + 1, 1)
                        );
                      })
                    }
                  >
                    次月
                  </button>
                </div>
              </div>
              <div className="calendar-week">
                {["日", "月", "火", "水", "木", "金", "土"].map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
              <p className="calendar-help">日付をクリックすると、その日の判定に切り替わります。</p>
              <div className="calendar-grid">
                {calendarCells.map((cell) => {
                  const dateKey = formatDateKey(cell.date);
                  const entry = calendarMap.get(dateKey);
                  const risk = entry?.risk_level;
                  const isSelected = selectedDate === dateKey;
                  const hasData = Boolean(entry);
                  const title =
                    entry?.risk_reasons?.length
                      ? entry.risk_reasons.join(" / ")
                      : "データなし";
                  return (
                    <button
                      type="button"
                      key={dateKey}
                      className={[
                        "calendar-day",
                        cell.isCurrentMonth ? "" : "calendar-day--muted",
                        risk ? `calendar-day--${risk}` : "",
                        isSelected ? "calendar-day--selected" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => {
                        if (hasData) {
                          setSelectedDate(dateKey);
                          setCalendarMonth(getMonthAnchor(cell.date));
                        }
                      }}
                      disabled={!hasData}
                      title={title}
                    >
                      <span className="calendar-day__number">
                        {cell.date.getDate()}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="calendar-legend">
                <span className="calendar-legend__item">
                  <span className="calendar-dot calendar-dot--risky" />
                  Risky
                </span>
                <span className="calendar-legend__item">
                  <span className="calendar-dot calendar-dot--caution" />
                  Caution
                </span>
                <span className="calendar-legend__item">
                  <span className="calendar-dot calendar-dot--safety" />
                  Safety
                </span>
                <span className="calendar-legend__item">
                  <span className="calendar-dot calendar-dot--none" />
                  データなし
                </span>
              </div>
            </div>
          </section>
        </section>
      </div>
    </div>
  );
}

const SectionTitle = ({ title }) => (
  <h2
    style={{
      fontSize: 20,
      fontWeight: 800,
      marginBottom: 12,
      color: theme.textMain,
      display: "flex",
      alignItems: "center",
      gap: 12,
    }}
  >
    <span style={{ display: "block", width: 6, height: 24, background: theme.primary, borderRadius: 2 }}></span>
    {title}
  </h2>
);

const formatNumber = (v, digits = 2) =>
  typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : "-";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const toNumber = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const formatMetricValue = (value, digits = 2, unit = "") => {
  const base = formatNumber(value, digits);
  if (base === "-") return "-";
  return unit ? `${base}${unit}` : base;
};

const formatDateKey = (date) => {
  if (!(date instanceof Date)) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateKey = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
};

const normalizeDateKey = (value) => {
  const parsed = parseDateKey(value);
  return parsed ? formatDateKey(parsed) : "";
};

const getMonthAnchor = (date) => {
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth(), 1);
};

const buildCalendarCells = (anchorDate) => {
  const monthStart = getMonthAnchor(anchorDate || new Date());
  const start = new Date(monthStart);
  start.setDate(start.getDate() - start.getDay());
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    cells.push({
      date,
      isCurrentMonth: date.getMonth() === monthStart.getMonth(),
    });
  }
  return cells;
};

const formatMonthLabel = (date) => {
  if (!date) return "-";
  return date.toLocaleString("ja-JP", { year: "numeric", month: "long" });
};

const formatDateLabel = (dateKey) => {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return "-";
  return parsed.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

const buildGauge = (metric) => {
  const gauge = metric.gauge || {};
  const min = gauge.min ?? 0;
  const max = gauge.max ?? 1;
  const value = toNumber(metric.value);
  const range = max - min || 1;
  const safeValue = value === null ? min : clamp(value, min, max);
  const position = clamp((safeValue - min) / range, 0, 1);
  const toPos = (raw) => {
    if (raw === null || raw === undefined) return null;
    return clamp((raw - min) / range, 0, 1);
  };
  return {
    min,
    max,
    value,
    position,
    warnPos: toPos(gauge.warn),
    dangerPos: toPos(gauge.danger),
  };
};

const sortByOrder = (items, order, keySelector) => {
  const orderMap = new Map(order.map((key, index) => [key, index]));
  return [...items].sort((a, b) => {
    const aKey = keySelector(a);
    const bKey = keySelector(b);
    const aIndex = orderMap.has(aKey) ? orderMap.get(aKey) : Number.MAX_SAFE_INTEGER;
    const bIndex = orderMap.has(bKey) ? orderMap.get(bKey) : Number.MAX_SAFE_INTEGER;
    return aIndex - bIndex;
  });
};

const diveCount = (row) => {
  const m = row.metrics || {};
  return (m.dive_left_count || 0) + (m.dive_right_count || 0) + (m.dive_centre_count || 0);
};

const translateRiskReason = (reason) => {
  if (!reason) return "";
  return reason
    .replace("HSR ACWR", "高強度走行ACWR")
    .replace("High Decel ACWR", "急減速ACWR")
    .replace("Load ACWR", "負荷ACWR")
    .replace("Low Efficiency", "効率低下")
    .replace("Efficiency Low", "効率低下")
    .replace("Recovery Time", "起き上がり時間")
    .replace("Dive ACWR", "ダイブACWR")
    .replace("High Asymmetry", "左右差が大きい")
    .replace("Asymmetry", "左右差")
    .replace("High Monotony", "単調性が高い")
    .replace("Monotony", "単調性");
};
