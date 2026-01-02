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

export async function uploadWorkloadCsv(file, uploadedBy = "", allowDuplicate = false) {
  const formData = new FormData();
  formData.append("file", file);
  if (uploadedBy) {
    formData.append("uploaded_by", uploadedBy);
  }
  if (allowDuplicate) {
    formData.append("allow_duplicate", "true");
  }
  const { data } = await client.post("/workload/ingest/", formData);
  return data;
}
