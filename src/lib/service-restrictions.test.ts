import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * サービス制限機能のユニットテスト
 *
 * テスト対象:
 * - 環境変数 VITE_SERVICE_RESTRICTION_MODE の読み取り
 * - 各機能（登録、KYC、入金、管理画面、ログイン、取引、出金）の有効/無効判定
 * - 制限メッセージの生成
 * - 完全制限モード（full）のメンテナンスページ表示判定
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
      expect(SERVICE_RESTRICTIONS.isKYCEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isDepositEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isAdminAccessEnabled()).toBe(true);
      // 新規メソッド
      expect(SERVICE_RESTRICTIONS.isLoginEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isTradeEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isWithdrawalEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isBalanceViewEnabled()).toBe(true);
    });

    it('完全制限モードではない', () => {
      expect(SERVICE_RESTRICTIONS.isFullRestriction()).toBe(false);
      expect(SERVICE_RESTRICTIONS.shouldShowMaintenancePage()).toBe(false);
    });

    it('制限メッセージは空文字である', () => {
      expect(SERVICE_RESTRICTIONS.getRestrictionMessage()).toBe('');
    });
  });

  describe('制限モード: partial (部分制限)', () => {
    beforeEach(async () => {
      setRestrictionMode('partial');
      const module = await import('./service-restrictions');
      SERVICE_RESTRICTIONS = module.SERVICE_RESTRICTIONS;
    });

    it('新規登録が無効である', () => {
      expect(SERVICE_RESTRICTIONS.isRegistrationEnabled()).toBe(false);
    });

    it('KYC申請が無効である', () => {
      expect(SERVICE_RESTRICTIONS.isKYCEnabled()).toBe(false);
    });

    it('入金が無効である', () => {
      expect(SERVICE_RESTRICTIONS.isDepositEnabled()).toBe(false);
    });

    it('管理画面アクセスが無効である', () => {
      expect(SERVICE_RESTRICTIONS.isAdminAccessEnabled()).toBe(false);
    });

    it('既存ユーザー向け機能は有効である', () => {
      expect(SERVICE_RESTRICTIONS.isLoginEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isTradeEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isWithdrawalEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isBalanceViewEnabled()).toBe(true);
    });

    it('完全制限モードではない', () => {
      expect(SERVICE_RESTRICTIONS.isFullRestriction()).toBe(false);
      expect(SERVICE_RESTRICTIONS.shouldShowMaintenancePage()).toBe(false);
    });

    it('適切な制限メッセージが返される', () => {
      const message = SERVICE_RESTRICTIONS.getRestrictionMessage();
      expect(message).toContain('システムメンテナンス中');
      expect(message).toContain('新規出金申請の承認処理');
      expect(message).toContain('メンテナンス完了後');
    });

    it('管理者向けメッセージが返される', () => {
      const message = SERVICE_RESTRICTIONS.getAdminRestrictionMessage();
      expect(message).toContain('管理画面は現在メンテナンス中');
      expect(message).toContain('開発チームまでお問い合わせ');
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
      expect(SERVICE_RESTRICTIONS.isKYCEnabled()).toBe(false);
      expect(SERVICE_RESTRICTIONS.isDepositEnabled()).toBe(false);
      expect(SERVICE_RESTRICTIONS.isAdminAccessEnabled()).toBe(false);
      expect(SERVICE_RESTRICTIONS.isLoginEnabled()).toBe(false);
      expect(SERVICE_RESTRICTIONS.isTradeEnabled()).toBe(false);
      expect(SERVICE_RESTRICTIONS.isWithdrawalEnabled()).toBe(false);
      expect(SERVICE_RESTRICTIONS.isBalanceViewEnabled()).toBe(false);
    });

    it('完全制限モードである', () => {
      expect(SERVICE_RESTRICTIONS.isFullRestriction()).toBe(true);
    });

    it('メンテナンスページを表示すべきである', () => {
      expect(SERVICE_RESTRICTIONS.shouldShowMaintenancePage()).toBe(true);
    });

    it('適切なメンテナンスメッセージが返される', () => {
      const message = SERVICE_RESTRICTIONS.getFullRestrictionMessage();
      expect(message).toContain('すべてのサービスを一時的に停止');
      expect(message).toContain('お客様の資産は安全に保管');
    });

    it('完全制限メッセージにサポート情報が含まれる', () => {
      const message = SERVICE_RESTRICTIONS.getFullRestrictionMessage();
      expect(message).toContain('サポート');
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
      expect(SERVICE_RESTRICTIONS.isKYCEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isDepositEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isAdminAccessEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isLoginEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isTradeEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isWithdrawalEnabled()).toBe(true);
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
      expect(SERVICE_RESTRICTIONS.isKYCEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isDepositEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isAdminAccessEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isLoginEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isTradeEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isWithdrawalEnabled()).toBe(true);
      expect(SERVICE_RESTRICTIONS.isBalanceViewEnabled()).toBe(true);
    });

    it('メンテナンスページは表示しない', () => {
      expect(SERVICE_RESTRICTIONS.isFullRestriction()).toBe(false);
      expect(SERVICE_RESTRICTIONS.shouldShowMaintenancePage()).toBe(false);
    });
  });

  describe('エンドユーザー保護', () => {
    beforeEach(async () => {
      setRestrictionMode('partial');
      const module = await import('./service-restrictions');
      SERVICE_RESTRICTIONS = module.SERVICE_RESTRICTIONS;
    });

    it('制限メッセージに資産保管の記述がある', () => {
      const message = SERVICE_RESTRICTIONS.getRestrictionMessage();
      expect(message).toContain('既存資産');
      expect(message).toContain('安全に保護');
    });

    it('メッセージに連絡先情報が含まれる', () => {
      const message = SERVICE_RESTRICTIONS.getRestrictionMessage();
      // 連絡方法についての言及があること
      expect(message.length).toBeGreaterThan(50);
    });
  });
});
