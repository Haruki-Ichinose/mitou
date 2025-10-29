import { render, screen } from '@testing-library/react';
import axios from 'axios';
import App from './App';

jest.mock('axios');

beforeEach(() => {
  axios.get.mockResolvedValue({ data: [] });
});

test('ホーム画面のメニューが表示される', async () => {
  render(<App />);
  expect(
    await screen.findByRole('button', { name: 'ACWR確認' })
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'csvアップロード' })
  ).toBeInTheDocument();
});
