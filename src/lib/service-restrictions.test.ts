import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * サービス制限機能のユニットテスト
 *
 * テスト対象:
 * - 環境変数 VITE_SERVICE_RESTRICTION_MODE の読み取り
 * - 各機能（登録、入金、出金、取引、管理画面、ログイン）の有効/無効判定
 * - 制限メッセージの生成（日本語・英語）
 * - 完全制限モード（full）のメンテナンスページ表示判定
 *
 * モード定義:
 * - none: 制限なし（通常運用）
 * - partial: 準備中モード（入金・出金・取引を制限）
 * - full: メンテナンスモード（すべてを制限）
 */

// モック用の環境変数設定ヘルパー
const setRestrictionMode = (mode: string | undefined) => {
  vi.stubEnv('VITE_SERVICE_RESTRICTION_MODE', mode || '');
};

describe('SERVICE_RESTRICTIONS', () => {
  let SERVICE_RESTRICTIONS: typeof import('./service-restrictions').SERVICE_RESTRICTIONS;

  beforeEach(async () => {
    // 各テスト前にモジュールをリセット
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  describe('制限モード: none (制限なし)', () => {
    beforeEach(async () => {
      setRestrictionMode('none');
      const module = await import('./service-restrictions');
      SERVICE_RESTRICTIONS = module.SERVICE_RESTRICTIONS;
    });

    it('すべての機能が有効である', () => {
      expect(SERVICE_RESTRICTIONS.isRegistrationEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isDepositEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isWithdrawalEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isTradeEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isAdminAccessEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isLoginEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isBalanceViewEnabled()).toBe(true);
    });

    it('完全制限モードではない', () => {
      expect(SERVICE_RESTRICTIONS.isFullRestriction()).toBe(false);
      expect(SERVICE_RESTRICTIONS.shouldShowMaintenancePage()).toBe(false);
    });

    it('制限メッセージは空文字である', () => {
      expect(SERVICE_RESTRICTIONS.getRestrictionMessage()).toBe('');
      expect(SERVICE_RESTRICTIONS.getRestrictionMessageEn()).toBe('');
    });
  });

  describe('制限モード: partial (準備中モード)', () => {
    beforeEach(async () => {
      setRestrictionMode('partial');
      const module = await import('./service-restrictions');
      SERVICE_RESTRICTIONS = module.SERVICE_RESTRICTIONS;
    });

    it('入金・出金・取引が無効である', () => {
      expect(SERVICE_RESTRICTIONS.isDepositEnabled()).toBe(false);
      expect(SERVICE_RESTRICTIONS.isWithdrawalEnabled()).toBe(false);
      expect(SERVICE_RESTRICTIONS.isTradeEnabled()).toBe(false);
    });

    it('登録・ログイン・管理画面・残高表示は有効である', () => {
      expect(SERVICE_RESTRICTIONS.isRegistrationEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isLoginEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isAdminAccessEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isBalanceViewEnabled()).toBe(true);
    });

    it('完全制限モードではない', () => {
      expect(SERVICE_RESTRICTIONS.isFullRestriction()).toBe(false);
      expect(SERVICE_RESTRICTIONS.shouldShowMaintenancePage()).toBe(false);
    });

    it('適切な制限メッセージが返される（日本語）', () => {
      const message = SERVICE_RESTRICTIONS.getRestrictionMessage();
      expect(message).toContain('準備中');
      expect(message).toContain('入金');
      expect(message).toContain('出金');
      expect(message).toContain('取引');
    });

    it('適切な制限メッセージが返される（英語）', () => {
      const message = SERVICE_RESTRICTIONS.getRestrictionMessageEn();
      expect(message).toContain('Under Preparation');
      expect(message).toContain('Deposits');
      expect(message).toContain('Withdrawals');
      expect(message).toContain('Trading');
    });

    it('管理者向けメッセージが返される（日本語）', () => {
      const message = SERVICE_RESTRICTIONS.getAdminRestrictionMessage();
      expect(message).toContain('準備中');
      expect(message).toContain('VITE_SERVICE_RESTRICTION_MODE');
    });

    it('管理者向けメッセージが返される（英語）', () => {
      const message = SERVICE_RESTRICTIONS.getAdminRestrictionMessageEn();
      expect(message).toContain('Preparation Mode');
      expect(message).toContain('VITE_SERVICE_RESTRICTION_MODE');
    });
  });

  describe('制限モード: full (完全制限)', () => {
    beforeEach(async () => {
      setRestrictionMode('full');
      const module = await import('./service-restrictions');
      SERVICE_RESTRICTIONS = module.SERVICE_RESTRICTIONS;
    });

    it('すべての機能が無効である', () => {
      expect(SERVICE_RESTRICTIONS.isRegistrationEnabled()).toBe(false);
      expect(SERVICE_RESTRICTIONS.isDepositEnabled()).toBe(false);
      expect(SERVICE_RESTRICTIONS.isWithdrawalEnabled()).toBe(false);
      expect(SERVICE_RESTRICTIONS.isTradeEnabled()).toBe(false);
      expect(SERVICE_RESTRICTIONS.isAdminAccessEnabled()).toBe(false);
      expect(SERVICE_RESTRICTIONS.isLoginEnabled()).toBe(false);
      expect(SERVICE_RESTRICTIONS.isBalanceViewEnabled()).toBe(false);
    });

    it('完全制限モードである', () => {
      expect(SERVICE_RESTRICTIONS.isFullRestriction()).toBe(true);
    });

    it('メンテナンスページを表示すべきである', () => {
      expect(SERVICE_RESTRICTIONS.shouldShowMaintenancePage()).toBe(true);
    });

    it('適切なメンテナンスメッセージが返される（日本語）', () => {
      const message = SERVICE_RESTRICTIONS.getFullRestrictionMessage();
      expect(message).toContain('メンテナンス');
      expect(message).toContain('すべてのサービス');
    });

    it('適切なメンテナンスメッセージが返される（英語）', () => {
      const message = SERVICE_RESTRICTIONS.getFullRestrictionMessageEn();
      expect(message).toContain('Maintenance');
      expect(message).toContain('All services');
    });
  });

  describe('制限モード: 未設定（デフォルト）', () => {
    beforeEach(async () => {
      setRestrictionMode(undefined);
      const module = await import('./service-restrictions');
      SERVICE_RESTRICTIONS = module.SERVICE_RESTRICTIONS;
    });

    it('デフォルトで制限なし（none）として動作する', () => {
      expect(SERVICE_RESTRICTIONS.isRegistrationEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isDepositEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isWithdrawalEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isTradeEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isAdminAccessEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isLoginEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isBalanceViewEnabled()).toBe(true);
    });

    it('メンテナンスページは表示しない', () => {
      expect(SERVICE_RESTRICTIONS.isFullRestriction()).toBe(false);
      expect(SERVICE_RESTRICTIONS.shouldShowMaintenancePage()).toBe(false);
    });
  });

  describe('制限モード: 不正な値', () => {
    beforeEach(async () => {
      setRestrictionMode('invalid_mode');
      const module = await import('./service-restrictions');
      SERVICE_RESTRICTIONS = module.SERVICE_RESTRICTIONS;
    });

    it('不正な値の場合は制限なし（none）として動作する', () => {
      expect(SERVICE_RESTRICTIONS.isRegistrationEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isDepositEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isWithdrawalEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isTradeEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isAdminAccessEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isLoginEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isBalanceViewEnabled()).toBe(true);
    });

    it('メンテナンスページは表示しない', () => {
      expect(SERVICE_RESTRICTIONS.isFullRestriction()).toBe(false);
      expect(SERVICE_RESTRICTIONS.shouldShowMaintenancePage()).toBe(false);
    });
  });

  describe('多言語対応', () => {
    beforeEach(async () => {
      setRestrictionMode('partial');
      const module = await import('./service-restrictions');
      SERVICE_RESTRICTIONS = module.SERVICE_RESTRICTIONS;
    });

    it('日本語と英語のメッセージが両方存在する', () => {
      expect(SERVICE_RESTRICTIONS.getRestrictionMessage().length).toBeGreaterThan(0);
      expect(SERVICE_RESTRICTIONS.getRestrictionMessageEn().length).toBeGreaterThan(0);
      expect(SERVICE_RESTRICTIONS.getAdminRestrictionMessage().length).toBeGreaterThan(0);
      expect(SERVICE_RESTRICTIONS.getAdminRestrictionMessageEn().length).toBeGreaterThan(0);
      expect(SERVICE_RESTRICTIONS.getFullRestrictionMessage().length).toBeGreaterThan(0);
      expect(SERVICE_RESTRICTIONS.getFullRestrictionMessageEn().length).toBeGreaterThan(0);
    });

    it('日本語と英語のメッセージは異なる内容である', () => {
      expect(SERVICE_RESTRICTIONS.getRestrictionMessage())
        .not.toBe(SERVICE_RESTRICTIONS.getRestrictionMessageEn());
      expect(SERVICE_RESTRICTIONS.getAdminRestrictionMessage())
        .not.toBe(SERVICE_RESTRICTIONS.getAdminRestrictionMessageEn());
      expect(SERVICE_RESTRICTIONS.getFullRestrictionMessage())
        .not.toBe(SERVICE_RESTRICTIONS.getFullRestrictionMessageEn());
    });
  });
});
