import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import "./App.css";

import LoginPage from "./pages/LoginPage";
import HomePage from "./pages/HomePage";
import DataListPage from "./pages/DataListPage";
import DataDetailPage from "./pages/DataDetailPage";
import DataRegisterPage from "./pages/DataRegisterPage";
import PlayersPage from "./pages/PlayersPage";

function App() {
  return (
    <div className="app-root">
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/data" element={<DataListPage />} />
        <Route path="/data/:athleteId" element={<DataDetailPage />} />
        <Route path="/register" element={<DataRegisterPage />} />
        <Route path="/players" element={<PlayersPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
