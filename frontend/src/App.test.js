import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

test("ログイン画面が表示される", () => {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>
  );

  expect(screen.getByRole("heading", { name: "Predict2Protect" })).toBeInTheDocument();
  expect(screen.getByLabelText("ID")).toBeInTheDocument();
  expect(screen.getByLabelText("PW")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "ログイン" })).toBeInTheDocument();
});

test("ホーム画面のメニューが表示される", () => {
  render(
    <MemoryRouter initialEntries={["/home"]}>
      <App />
    </MemoryRouter>
  );

  expect(screen.getByRole("link", { name: "データの確認" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "データの登録" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "選手一覧" })).toBeInTheDocument();
});
