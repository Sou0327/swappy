import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * メンテナンスページのテスト
 *
 * fullモード時に表示されるメンテナンスページのUIテスト
 */

// モック用の環境変数設定ヘルパー
const setRestrictionMode = (mode: string | undefined) => {
  vi.stubEnv('VITE_SERVICE_RESTRICTION_MODE', mode || '');
};

describe('MaintenancePage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  describe('表示内容', () => {
    beforeEach(async () => {
      setRestrictionMode('full');
    });

    it('メンテナンス中のメッセージが表示される', async () => {
      const { MaintenancePage } = await import('./MaintenancePage');
      render(<MaintenancePage />);

      expect(screen.getByText(/メンテナンス中/)).toBeInTheDocument();
    });

    it('資産の安全性に関するメッセージが表示される', async () => {
      const { MaintenancePage } = await import('./MaintenancePage');
      render(<MaintenancePage />);

      expect(screen.getByText(/安全に保管/)).toBeInTheDocument();
    });

    it('サポートへの案内が表示される', async () => {
      const { MaintenancePage } = await import('./MaintenancePage');
      render(<MaintenancePage />);

      expect(screen.getByText(/サポート/)).toBeInTheDocument();
    });

    it('メンテナンスアイコンまたはビジュアルが表示される', async () => {
      const { MaintenancePage } = await import('./MaintenancePage');
      render(<MaintenancePage />);

      // アイコンまたはビジュアル要素のテスト
      const icon = screen.getByTestId('maintenance-icon');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('アクセシビリティ', () => {
    beforeEach(async () => {
      setRestrictionMode('full');
    });

    it('適切なheadingが存在する', async () => {
      const { MaintenancePage } = await import('./MaintenancePage');
      render(<MaintenancePage />);

      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toBeInTheDocument();
    });

    it('mainランドマークが存在する', async () => {
      const { MaintenancePage } = await import('./MaintenancePage');
      render(<MaintenancePage />);

      const main = screen.getByRole('main');
      expect(main).toBeInTheDocument();
    });
  });
});
