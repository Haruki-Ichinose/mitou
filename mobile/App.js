import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
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

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:8000/api';

const FONT_DISPLAY = Platform.select({
  ios: 'AvenirNextCondensed-DemiBold',
  android: 'sans-serif-condensed',
  default: 'System',
});
const FONT_BODY = Platform.select({
  ios: 'Avenir Next',
  android: 'sans-serif',
  default: 'System',
});
const FONT_BODY_BOLD = Platform.select({
  ios: 'AvenirNext-Bold',
  android: 'sans-serif-medium',
  default: 'System',
});
const titleLogo = require('./assets/title.jpg');

const RISK_META = {
  risky: {
    label: 'Risky',
    title: '負荷が高い可能性があります',
    message: '今日のコンディションは要注意です。',
    color: '#dc2626',
    background: 'rgba(220, 38, 38, 0.12)',
    border: 'rgba(220, 38, 38, 0.4)',
  },
  caution: {
    label: 'Caution',
    title: '注意レベルです',
    message: '強度を意識しながら調整しましょう。',
    color: '#f59e0b',
    background: 'rgba(245, 158, 11, 0.16)',
    border: 'rgba(245, 158, 11, 0.4)',
  },
  safety: {
    label: 'Safety',
    title: 'リスクは低めです',
    message: '良いペースで継続できています。',
    color: '#16a34a',
    background: 'rgba(22, 163, 74, 0.12)',
    border: 'rgba(22, 163, 74, 0.4)',
  },
};

export default function App() {
  const [athleteInput, setAthleteInput] = useState('');
  const [selectedAthlete, setSelectedAthlete] = useState(null);
  const [latestRecord, setLatestRecord] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const loginAnim = useRef(new Animated.Value(0)).current;
  const homeAnims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  const metricKey =
    selectedAthlete?.position === 'GK' ? 'acwr_dive' : 'acwr_total_distance';
  const metricLabel =
    selectedAthlete?.position === 'GK' ? 'ダイブ負荷' : '総走行距離';

  const riskMeta = useMemo(
    () => getRiskMeta(selectedAthlete?.riskLevel),
    [selectedAthlete?.riskLevel]
  );

  useEffect(() => {
    if (!selectedAthlete) {
      loginAnim.setValue(0);
      Animated.timing(loginAnim, {
        toValue: 1,
        duration: 520,
        useNativeDriver: true,
      }).start();
    }
  }, [selectedAthlete, loginAnim]);

  useEffect(() => {
    if (selectedAthlete) {
      homeAnims.forEach((anim) => anim.setValue(0));
      Animated.stagger(
        140,
        homeAnims.map((anim) =>
          Animated.timing(anim, {
            toValue: 1,
            duration: 420,
            useNativeDriver: true,
          })
        )
      ).start();
    }
  }, [selectedAthlete, homeAnims]);

  const handleLogin = async () => {
    const keyword = athleteInput.trim();
    if (!keyword) {
      setError('IDを入力してください。');
      return;
    }

    setStatus('loading');
    setError('');

    try {
      const athleteResponse = await axios.get(
        `${API_BASE_URL}/workload/athletes/`
      );
      const athleteList = normalizeAthletes(athleteResponse.data);
      const athlete = findAthleteByJersey(athleteList, keyword);

      if (!athlete) {
        setStatus('idle');
        setError('該当するIDが見つかりません。');
        return;
      }

      const timeseriesResponse = await axios.get(
        `${API_BASE_URL}/workload/athletes/${athlete.athlete_id}/timeseries/`
      );
      const normalized = normalizeRecords(timeseriesResponse.data);
      const sorted = [...normalized].sort((a, b) => a.dateObj - b.dateObj);
      const latest = sorted[sorted.length - 1] || null;
      const riskLevel = normalizeRiskLevel(
        latest?.workload?.risk_level || athlete.risk_level
      );
      const riskReasons = Array.isArray(latest?.workload?.risk_reasons)
        ? latest.workload.risk_reasons
        : [];

      setLatestRecord(latest);
      setSelectedAthlete({
        id: String(athlete.athlete_id),
        name: athlete.athlete_name || `選手 ${athlete.jersey_number}`,
        jerseyNumber: athlete.jersey_number,
        position: athlete.position || 'FP',
        riskLevel,
        riskReasons,
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
    setLatestRecord(null);
    setAthleteInput('');
    setError('');
    setStatus('idle');
  };

  const handleDetailPress = () => {
    Alert.alert('準備中', '詳細画面は準備中です。');
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
            <ScrollView
              contentContainerStyle={styles.homeContainer}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.headerRow}>
                <View style={styles.headerLeft}>
                  <Image
                    source={titleLogo}
                    style={styles.logoSmall}
                    resizeMode="contain"
                  />
                  <Text style={styles.screenTitle}>ホーム</Text>
                  <Text style={styles.subTitle}>
                    {selectedAthlete.name} #{selectedAthlete.jerseyNumber || '-'}
                  </Text>
                </View>
                <TouchableOpacity style={styles.ghostButton} onPress={handleReset}>
                  <Text style={styles.ghostButtonText}>選手切替</Text>
                </TouchableOpacity>
              </View>

              <Animated.View
                style={[
                  styles.riskCard,
                  {
                    backgroundColor: riskMeta.background,
                    borderColor: riskMeta.border,
                  },
                  buildFadeSlide(homeAnims[0]),
                ]}
              >
                <View style={styles.riskHeader}>
                  <Text style={[styles.riskLabel, { color: riskMeta.color }]}>
                    {riskMeta.label}
                  </Text>
                  <Text style={styles.riskTag}>Risk Level</Text>
                </View>
                <Text style={styles.riskTitle}>{riskMeta.title}</Text>
                <Text style={styles.riskMessage}>
                  {selectedAthlete.riskReasons?.length
                    ? `主な指標: ${selectedAthlete.riskReasons.join(' / ')}`
                    : riskMeta.message}
                </Text>
              </Animated.View>

              <Animated.View
                style={[styles.actionWrapper, buildFadeSlide(homeAnims[1])]}
              >
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handleDetailPress}
                >
                  <Text style={styles.primaryButtonText}>詳細な結果を見る</Text>
                </TouchableOpacity>
              </Animated.View>

              <Animated.View
                style={[styles.infoCard, buildFadeSlide(homeAnims[2])]}
              >
                <Text style={styles.cardTitle}>最新データ</Text>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>ポジション</Text>
                  <Text style={styles.infoValue}>
                    {formatPosition(selectedAthlete.position)}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>最新更新日</Text>
                  <Text style={styles.infoValue}>
                    {latestRecord
                      ? formatFullDate(latestRecord.dateObj)
                      : 'データなし'}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>
                    最新ACWR（{metricLabel}）
                  </Text>
                  <Text style={styles.infoValue}>
                    {formatMetricValue(latestRecord?.workload?.[metricKey])}
                  </Text>
                </View>
              </Animated.View>
            </ScrollView>
          ) : (
            <ScrollView
              contentContainerStyle={styles.loginContainer}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.hero}>
                <Image
                  source={titleLogo}
                  style={styles.logoLarge}
                  resizeMode="contain"
                />
              </View>

              <Animated.View
                style={[styles.loginCard, buildFadeSlide(loginAnim)]}
              >
                <View style={styles.formField}>
                  <Text style={styles.label}>ID</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="IDを入力してください"
                    placeholderTextColor="rgba(15, 23, 42, 0.4)"
                    value={athleteInput}
                    autoCapitalize="none"
                    keyboardType="number-pad"
                    onChangeText={setAthleteInput}
                    returnKeyType="go"
                    onSubmitEditing={handleLogin}
                  />
                </View>

                {error ? (
                  <View style={styles.errorCard}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    styles.loginButton,
                    status === 'loading' && styles.primaryButtonDisabled,
                  ]}
                  onPress={handleLogin}
                  disabled={status === 'loading'}
                >
                  {status === 'loading' ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={[styles.primaryButtonText, styles.loginButtonText]}>
                      ログイン
                    </Text>
                  )}
                </TouchableOpacity>
              </Animated.View>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function buildFadeSlide(animatedValue) {
  return {
    opacity: animatedValue,
    transform: [
      {
        translateY: animatedValue.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
    ],
  };
}

function getRiskMeta(level) {
  const normalized = normalizeRiskLevel(level);
  return RISK_META[normalized] || RISK_META.safety;
}

function normalizeRiskLevel(value) {
  if (!value || typeof value !== 'string') {
    return 'safety';
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'risky' || normalized === 'caution' || normalized === 'safety') {
    return normalized;
  }
  return 'safety';
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
        jersey_number:
          item.jersey_number !== undefined && item.jersey_number !== null
            ? String(item.jersey_number)
            : '',
        position: item.position || 'FP',
        risk_level: item.risk_level || 'safety',
        is_active: item.is_active ?? true,
      };
    })
    .filter(Boolean);
}

function findAthleteByJersey(athletes, jerseyNumber) {
  const normalized = jerseyNumber.trim();
  return athletes.find(
    (athlete) =>
      typeof athlete.jersey_number === 'string' &&
      athlete.jersey_number.trim() === normalized
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

function formatMetricValue(value) {
  if (typeof value === 'number') {
    return value.toFixed(3);
  }
  return '算出中';
}

function formatPosition(position) {
  return position === 'GK' ? 'ゴールキーパー' : 'フィールドプレーヤー';
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
    backgroundColor: '#fff7ed',
  },
  flex: {
    flex: 1,
  },
  hero: {
    alignItems: 'center',
    gap: 10,
  },
  logoLarge: {
    width: 360,
    height: 170,
  },
  heroSubTitle: {
    fontFamily: FONT_BODY,
    fontSize: 15,
    color: '#475569',
  },
  loginContainer: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
    gap: 26,
  },
  loginCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderRadius: 28,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.12)',
    gap: 18,
    shadowColor: 'rgba(15, 23, 42, 0.15)',
    shadowOpacity: 0.6,
    shadowOffset: { width: 0, height: 16 },
    shadowRadius: 28,
    elevation: 4,
  },
  formField: {
    gap: 8,
  },
  label: {
    fontFamily: FONT_BODY_BOLD,
    fontSize: 22,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#475569',
  },
  input: {
    backgroundColor: '#ffffff',
    color: '#0f172a',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.15)',
    fontSize: 24,
    fontFamily: FONT_BODY_BOLD,
  },
  errorCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(220, 38, 38, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.35)',
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 14,
    fontFamily: FONT_BODY_BOLD,
  },
  primaryButton: {
    backgroundColor: '#b91c1c',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: 'rgba(185, 28, 28, 0.35)',
    shadowOpacity: 0.5,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 4,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontFamily: FONT_BODY_BOLD,
  },
  loginButton: {
    paddingVertical: 20,
  },
  loginButtonText: {
    fontSize: 20,
  },
  homeContainer: {
    padding: 22,
    gap: 18,
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  headerLeft: {
    gap: 6,
  },
  logoSmall: {
    width: 130,
    height: 42,
  },
  screenTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 36,
    color: '#0f172a',
  },
  subTitle: {
    fontFamily: FONT_BODY,
    fontSize: 14,
    color: '#475569',
  },
  ghostButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.16)',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  },
  ghostButtonText: {
    fontFamily: FONT_BODY_BOLD,
    color: '#0f172a',
    fontSize: 12,
  },
  riskCard: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    gap: 10,
    shadowColor: 'rgba(15, 23, 42, 0.1)',
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 20,
    elevation: 3,
  },
  riskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  riskLabel: {
    fontFamily: FONT_BODY_BOLD,
    fontSize: 18,
  },
  riskTag: {
    fontFamily: FONT_BODY,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#475569',
  },
  riskTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 24,
    color: '#0f172a',
  },
  riskMessage: {
    fontFamily: FONT_BODY,
    fontSize: 14,
    color: '#475569',
  },
  actionWrapper: {
    alignItems: 'stretch',
  },
  infoCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.12)',
    gap: 12,
    shadowColor: 'rgba(15, 23, 42, 0.1)',
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 20,
    elevation: 3,
  },
  cardTitle: {
    fontFamily: FONT_BODY_BOLD,
    fontSize: 16,
    color: '#0f172a',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  infoLabel: {
    fontFamily: FONT_BODY,
    fontSize: 13,
    color: '#475569',
  },
  infoValue: {
    fontFamily: FONT_BODY_BOLD,
    fontSize: 14,
    color: '#0f172a',
  },
});
