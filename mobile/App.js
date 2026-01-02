import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import axios from 'axios';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  VictoryArea,
  VictoryAxis,
  VictoryChart,
  VictoryLine,
  VictoryScatter,
  VictoryTheme,
  VictoryTooltip,
  VictoryVoronoiContainer,
} from 'victory-native';

const SAFE_ACWR_MIN = 0.8;
const SAFE_ACWR_MAX = 1.3;
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:8000/api';

export default function App() {
  const [athleteInput, setAthleteInput] = useState('');
  const [selectedAthlete, setSelectedAthlete] = useState(null);
  const [records, setRecords] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [latestRecord, setLatestRecord] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const metricKey = selectedAthlete?.metricKey || 'acwr_total_distance';
  const metricLabel = selectedAthlete?.metricLabel || '総走行距離';

  const chartMetrics = useMemo(() => {
    if (!chartData.length) {
      return {
        maxValue: 2,
        yTicks: createTicks(0, 2, 5),
        dateTicks: [],
        rangeStart: null,
        rangeEnd: null,
        exceededMax: false,
      };
    }

    const numeric = chartData.map((point) => point.y).filter((y) => typeof y === 'number');
    const exceededMax = numeric.some((value) => value > 2);
    const highest = numeric.length ? Math.max(...numeric) : 2;
    const adjustedMax = exceededMax
      ? Math.max(Math.ceil((highest + 0.05) * 10) / 10, 2.1)
      : 2;
    const maxValue = Math.max(adjustedMax, SAFE_ACWR_MAX);

    const timestamps = chartData.map((point) => point.x.getTime());
    const rangeStart = new Date(Math.min(...timestamps));
    const rangeEnd = new Date(Math.max(...timestamps));

    return {
      maxValue,
      yTicks: createTicks(0, maxValue, 5),
      dateTicks: createDateTicks(rangeStart.getTime(), rangeEnd.getTime(), 4).map(
        (tick) => new Date(tick)
      ),
      rangeStart,
      rangeEnd,
      exceededMax,
    };
  }, [chartData]);

  const handleLogin = async () => {
    const keyword = athleteInput.trim();
    if (!keyword) {
      setError('選手名または選手IDを入力してください。');
      return;
    }

    setStatus('loading');
    setError('');

    try {
      const athleteResponse = await axios.get(
        `${API_BASE_URL}/workload/athletes/`
      );
      const athleteList = normalizeAthletes(athleteResponse.data);
      const athlete = findAthlete(athleteList, keyword);

      if (!athlete) {
        setStatus('idle');
        setError('該当する選手が見つかりません。');
        return;
      }

      const timeseriesResponse = await axios.get(
        `${API_BASE_URL}/workload/athletes/${athlete.athlete_id}/timeseries/`
      );
      const normalized = normalizeRecords(timeseriesResponse.data);
      const sorted = [...normalized].sort((a, b) => a.dateObj - b.dateObj);
      const latest = sorted[sorted.length - 1];
      const metricKey =
        athlete.position === 'GK' ? 'acwr_dive' : 'acwr_total_distance';
      const metricLabel =
        athlete.position === 'GK' ? 'ダイブ負荷' : '総走行距離';
      const points = buildChartData(sorted, latest, metricKey);

      setRecords(sorted);
      setLatestRecord(latest);
      setChartData(points);
      setSelectedAthlete({
        id: String(athlete.athlete_id),
        name: athlete.athlete_name || `選手 ${athlete.athlete_id}`,
        position: athlete.position || 'FP',
        metricKey,
        metricLabel,
      });
      setStatus('loaded');
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.message ||
        'データの取得に失敗しました。';
      setStatus('error');
      setError(message);
    }
  };

  const handleReset = () => {
    setSelectedAthlete(null);
    setRecords([]);
    setChartData([]);
    setLatestRecord(null);
    setError('');
    setStatus('idle');
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <RNStatusBar barStyle="dark-content" />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.select({ ios: 'padding', android: undefined })}
        >
          {selectedAthlete ? (
            <ScrollView contentContainerStyle={styles.scrollContainer}>
              <View style={styles.header}>
                <View>
                  <Text style={styles.kicker}>ACWR Dashboard</Text>
                  <Text style={styles.title}>{selectedAthlete.name}</Text>
                  <Text style={styles.subtitle}>ID: {selectedAthlete.id}</Text>
                </View>
                <TouchableOpacity style={styles.linkButton} onPress={handleReset}>
                  <Text style={styles.linkButtonText}>別の選手を選ぶ</Text>
                </TouchableOpacity>
              </View>

              {status === 'loading' && (
                <View style={styles.banner}>
                  <ActivityIndicator color="#7a2e1d" />
                  <Text style={styles.bannerText}>データ取得中です…</Text>
                </View>
              )}
              {status === 'error' && (
                <View style={[styles.banner, styles.errorBanner]}>
                  <Text style={styles.bannerText}>{error}</Text>
                </View>
              )}

              {status === 'loaded' && latestRecord && (
                <View style={styles.summaryCard}>
                  <View>
                    <Text style={styles.summaryLabel}>最新日付</Text>
                    <Text style={styles.summaryValue}>
                      {formatFullDate(latestRecord.dateObj)}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.summaryLabel}>
                      最新ACWR（{metricLabel}）
                    </Text>
                    <Text style={styles.summaryValue}>
                      {typeof latestRecord.workload?.[metricKey] === 'number'
                        ? latestRecord.workload[metricKey].toFixed(3)
                        : '算出不可'}
                    </Text>
                  </View>
                </View>
              )}

              {status === 'loaded' && chartData.length > 0 && (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.cardTitle}>ACWR推移 (直近30日)</Text>
                      <Text style={styles.cardSubTitle}>
                        適正範囲は {SAFE_ACWR_MIN} - {SAFE_ACWR_MAX} です。
                      </Text>
                    </View>
                    {chartMetrics.exceededMax && (
                      <Text style={styles.alertText}>
                        ACWRが2.0を超えたため縦軸を拡張しています。
                      </Text>
                    )}
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chartScroll}
                  >
                    <AcwrChart
                      data={chartData}
                      rangeStart={chartMetrics.rangeStart}
                      rangeEnd={chartMetrics.rangeEnd}
                      maxValue={chartMetrics.maxValue}
                      yTicks={chartMetrics.yTicks}
                      dateTicks={chartMetrics.dateTicks}
                    />
                  </ScrollView>
                </View>
              )}

              {status === 'loaded' && chartData.length === 0 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>ACWR推移</Text>
                  <Text style={styles.cardSubTitle}>
                    該当期間のACWRデータがありません。
                  </Text>
                </View>
              )}
            </ScrollView>
          ) : (
            <View style={styles.loginContainer}>
              <View style={styles.loginHeader}>
                <Text style={styles.kicker}>ACWR Mobile</Text>
                <Text style={styles.title}>選手ログイン</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>選手ID / 選手名</Text>
                <TextInput
                  style={styles.input}
                  placeholder="例: 12 または 佐藤太郎"
                  placeholderTextColor="#b36b2f"
                  value={athleteInput}
                  autoCapitalize="none"
                  onChangeText={setAthleteInput}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
              </View>

              {error && (
                <View style={[styles.banner, styles.errorBanner]}>
                  <Text style={styles.bannerText}>{error}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.primaryButton, status === 'loading' && styles.primaryButtonDisabled]}
                onPress={handleLogin}
                disabled={status === 'loading'}
              >
                {status === 'loading' ? (
                  <ActivityIndicator color="#fff8ed" />
                ) : (
                  <Text style={styles.primaryButtonText}>ログイン</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function AcwrChart({ data, rangeStart, rangeEnd, maxValue, yTicks, dateTicks }) {
  if (!data.length || !rangeStart || !rangeEnd) {
    return null;
  }

  const safeBand = [
    { x: rangeStart, y: SAFE_ACWR_MAX, y0: SAFE_ACWR_MIN },
    { x: rangeEnd, y: SAFE_ACWR_MAX, y0: SAFE_ACWR_MIN },
  ];

  return (
    <VictoryChart
      height={340}
      width={780}
      padding={{ top: 24, bottom: 56, left: 72, right: 32 }}
      theme={VictoryTheme.material}
      scale={{ x: 'time', y: 'linear' }}
      domain={{ x: [rangeStart, rangeEnd], y: [0, maxValue] }}
      containerComponent={
        <VictoryVoronoiContainer
          voronoiBlacklist={['safe-band', 'line']}
          labels={({ datum }) =>
            `${formatFullDate(datum.x)}\n${typeof datum.y === 'number' ? datum.y.toFixed(3) : '-'}`
          }
          labelComponent={
            <VictoryTooltip
              style={{ fontSize: 12, fill: '#4a1f1f' }}
              flyoutStyle={{ fill: '#fff7eb', stroke: '#dd2476' }}
              constrainToVisibleArea
            />
          }
        />
      }
    >
      <VictoryArea
        name="safe-band"
        data={safeBand}
        style={{
          data: {
            fill: 'rgba(120, 202, 136, 0.35)', // yellow-green band to match admin
            stroke: '#16a34a',
            strokeWidth: 2,
          },
        }}
      />
      <VictoryAxis
        tickValues={dateTicks}
        tickFormat={(tick) => formatShortDate(tick)}
        style={{
          axis: { stroke: '#b64b12' },
          tickLabels: { fill: '#4a1f1f', fontSize: 12, padding: 12, angle: -20 },
          grid: { stroke: '#f2c48c', strokeDasharray: '4,4' },
        }}
      />
      <VictoryAxis
        dependentAxis
        tickValues={yTicks}
        tickFormat={(tick) => tick.toFixed(1)}
        style={{
          axis: { stroke: '#b64b12' },
          tickLabels: { fill: '#4a1f1f', fontSize: 12, padding: 8 },
          grid: { stroke: '#f2c48c', strokeDasharray: '4,4' },
        }}
      />
      <VictoryLine
        name="line"
        data={data}
        style={{
          data: { stroke: '#dd2476', strokeWidth: 3 },
        }}
      />
      <VictoryScatter
        name="points"
        data={data}
        size={5}
        style={{
          data: { fill: '#fff2d5', stroke: '#dd2476', strokeWidth: 2 },
        }}
      />
    </VictoryChart>
  );
}

function normalizeAthletes(rawAthletes) {
  if (!Array.isArray(rawAthletes)) {
    return [];
  }

  return rawAthletes
    .map((item) => {
      if (!item) {
        return null;
      }
      return {
        athlete_id: item.athlete_id,
        athlete_name: item.athlete_name || '',
        position: item.position || 'FP',
        is_active: item.is_active ?? true,
      };
    })
    .filter(Boolean);
}

function findAthlete(athletes, keyword) {
  const normalized = keyword.trim().toLowerCase();
  const idMatch = athletes.find(
    (athlete) => String(athlete.athlete_id) === keyword.trim()
  );
  if (idMatch) {
    return idMatch;
  }

  return athletes.find(
    (athlete) =>
      typeof athlete.athlete_name === 'string' &&
      athlete.athlete_name.trim().toLowerCase() === normalized
  );
}

function normalizeRecords(rawRecords) {
  if (!Array.isArray(rawRecords)) {
    return [];
  }

  return rawRecords
    .map((item) => {
      const dateObj = new Date(item.date);
      if (Number.isNaN(dateObj.getTime())) {
        return null;
      }

      return {
        ...item,
        date: item.date,
        dateObj,
        workload: item.workload || {},
      };
    })
    .filter(Boolean);
}

function buildChartData(records, latestRecord, metricKey) {
  if (!latestRecord) {
    return [];
  }
  const rangeEnd = latestRecord.dateObj;
  const rangeStart = new Date(rangeEnd);
  rangeStart.setDate(rangeStart.getDate() - 29);

  return records
    .filter(
      (record) => record.dateObj >= rangeStart && record.dateObj <= rangeEnd
    )
    .filter((record) => typeof record.workload?.[metricKey] === 'number')
    .map((record) => ({
      x: record.dateObj,
      y: record.workload[metricKey],
    }));
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

function formatFullDate(dateObj) {
  return dateObj.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f6d365',
  },
  flex: {
    flex: 1,
  },
  scrollContainer: {
    padding: 20,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  kicker: {
    color: '#7a2e1d',
    fontSize: 16,
    letterSpacing: 1.1,
  },
  title: {
    color: '#9d2121',
    fontSize: 32,
    fontWeight: '700',
    marginTop: 4,
  },
  linkButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderColor: '#dd2476',
    borderWidth: 1,
  },
  linkButtonText: {
    color: '#dd2476',
    fontWeight: '700',
  },
  banner: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  errorBanner: {
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  bannerText: {
    color: '#b91c1c',
    fontSize: 14,
  },
  summaryCard: {
    backgroundColor: 'rgba(255, 231, 186, 0.92)',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: 'rgba(157, 33, 33, 0.18)',
    shadowColor: 'rgba(122, 46, 29, 0.28)',
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
  },
  summaryLabel: {
    color: '#7a2e1d',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  summaryValue: {
    color: '#9d2121',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 6,
  },
  card: {
    backgroundColor: 'rgba(255, 231, 186, 0.92)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: 'rgba(157, 33, 33, 0.18)',
    gap: 12,
    shadowColor: 'rgba(122, 46, 29, 0.28)',
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  cardTitle: {
    color: '#9d2121',
    fontSize: 18,
    fontWeight: '700',
  },
  cardSubTitle: {
    color: '#7a2e1d',
    marginTop: 4,
  },
  alertText: {
    color: '#b64b12',
    fontSize: 12,
    textAlign: 'right',
  },
  chartScroll: {
    paddingVertical: 4,
  },
  loginContainer: {
    flex: 1,
    backgroundColor: '#f6d365',
    padding: 24,
    justifyContent: 'center',
    gap: 24,
  },
  loginHeader: {
    gap: 8,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    color: '#7a2e1d',
    fontSize: 16,
  },
  input: {
    backgroundColor: '#fff2d5',
    color: '#4a1f1f',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(157, 33, 33, 0.25)',
    fontSize: 18,
  },
  primaryButton: {
    backgroundColor: '#dd2476',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: 'rgba(221, 36, 118, 0.6)',
    shadowOpacity: 0.6,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 3,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#fff8ed',
    fontSize: 18,
    fontWeight: '700',
  },
});
