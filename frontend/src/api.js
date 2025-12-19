import axios from "axios";

const client = axios.create({
  baseURL: "http://localhost:8000/api", // Django側に合わせて必要なら変更
});

export async function fetchAthletes() {
  const { data } = await client.get("/workload/athletes/");
  return data;
}

export async function fetchRuns() {
  const { data } = await client.get("/workload/runs/");
  return data;
}

export async function fetchTimeseries(athleteId, params = {}) {
  const { data } = await client.get(`/workload/athletes/${athleteId}/timeseries/`, { params });
  return data;
}

export async function fetchDynamicAnomalies(params = {}) {
  const { data } = await client.get("/workload/anomalies/dynamic/", { params });
  return data;
}
