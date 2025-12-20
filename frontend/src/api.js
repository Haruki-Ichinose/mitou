import axios from "axios";

const client = axios.create({
  baseURL: "http://localhost:8000/api",
});

export async function fetchAthletes() {
  const { data } = await client.get("/workload/athletes/");
  return data;
}

export async function fetchTimeseries(athleteId, params = {}) {
  // バックエンドの新しいパスに合わせます
  const { data } = await client.get(`/workload/athletes/${athleteId}/timeseries/`, { params });
  return data;
}