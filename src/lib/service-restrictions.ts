/**
 * サービス制限機能
 *
 * システムの状態に応じて、サービスの一部機能を制限します。
 * 既存ユーザーの資産保護を最優先とし、重要な機能（ログイン、出金）は維持します。
 *
 * 制限モード:
 * - 'none': 制限なし（通常運用）
 * - 'partial': 部分制限 - 「開発中」表記（新規登録・KYC・入金・管理画面を制限）
 * - 'full': 完全制限 - 「メンテナンス」表記（アプリケーション全体を制限）
 *
 * 環境変数: VITE_SERVICE_RESTRICTION_MODE
 */

type RestrictionMode = 'none' | 'partial' | 'full';

/**
 * 現在の制限モードを取得
 */
const getRestrictionMode = (): RestrictionMode => {
  const mode = import.meta.env.VITE_SERVICE_RESTRICTION_MODE;

  // 環境変数が未設定または不正な値の場合は 'none' (制限なし)
  if (mode !== 'partial' && mode !== 'full') {
    return 'none';
  }

  return mode;
};

/**
 * サービス制限の状態と判定機能を提供
 */
export const SERVICE_RESTRICTIONS = {
  /**
   * 現在の制限モード
   */
  get mode(): RestrictionMode {
    return getRestrictionMode();
  },

  /**
   * 新規ユーザー登録が有効かどうか
   */
  isRegistrationEnabled(): boolean {
    return this.mode === 'none';
  },

  /**
   * KYC申請が有効かどうか
   */
  isKYCEnabled(): boolean {
    return this.mode === 'none';
  },

  /**
   * 入金機能が有効かどうか
   */
  isDepositEnabled(): boolean {
    return this.mode === 'none';
  },

  /**
   * 管理画面へのアクセスが有効かどうか
   */
  isAdminAccessEnabled(): boolean {
    return this.mode === 'none';
  },

  /**
   * ログイン機能が有効かどうか
   * fullモードのみ無効
   */
  isLoginEnabled(): boolean {
    return this.mode !== 'full';
  },

  /**
   * 取引機能が有効かどうか
   * fullモードのみ無効
   */
  isTradeEnabled(): boolean {
    return this.mode !== 'full';
  },

  /**
   * 出金機能が有効かどうか
   * fullモードのみ無効
   */
  isWithdrawalEnabled(): boolean {
    return this.mode !== 'full';
  },

  /**
   * 残高表示が有効かどうか
   * fullモードのみ無効
   */
  isBalanceViewEnabled(): boolean {
    return this.mode !== 'full';
  },

  /**
   * 完全制限モードかどうか
   */
  isFullRestriction(): boolean {
    return this.mode === 'full';
  },

  /**
   * メンテナンスページを表示すべきかどうか
   */
  shouldShowMaintenancePage(): boolean {
    return this.mode === 'full';
  },

  /**
   * エンドユーザー向けの制限メッセージを取得
   */
  getRestrictionMessage(): string {
    if (this.mode === 'none') {
      return '';
    }

    // partial モードは「開発中」表記
    if (this.mode === 'partial') {
      return `
🚧 現在、一部機能を開発中です。

【開発中の機能】
- 新規ユーザー登録
- KYC（本人確認）申請
- 新規入金
- 出金申請の承認処理

【ご利用いただける機能】
- ログイン
- 取引機能
- 残高確認
- 既存資産の保管

開発完了まで今しばらくお待ちください。
      `.trim();
    }

    // full モードは「メンテナンス」表記
    return `
現在、システムメンテナンス中のため、一部機能を一時的に制限しております。

【メンテナンス中の制限機能】
- 新規ユーザー登録
- KYC（本人確認）申請
- 新規入金
- 新規出金申請の承認処理

【ご利用いただける機能】
- ログイン
- 取引機能
- 残高確認
- 既存資産の保管（安全に保護されています）

【メンテナンス完了後】
すべての機能が通常通りご利用いただけます。

【お問い合わせ】
ご不明な点がございましたら、サポートまでお問い合わせください。
    `.trim();
  },

  /**
   * 管理者向けの制限メッセージを取得
   */
  getAdminRestrictionMessage(): string {
    if (this.mode === 'none') {
      return '';
    }

    // partial モードは「開発中」表記
    if (this.mode === 'partial') {
      return `
🚧 管理画面は現在開発中です。

【開発中の機能】
管理機能へのアクセスは開発完了までご利用いただけません。

【ユーザーサービスへの影響】
- ログイン、取引機能は正常に稼働
- 新規の入出金申請は承認待ち状態となります
- 既存の資産は安全に保管されています

開発完了まで今しばらくお待ちください。
      `.trim();
    }

    // full モードは「メンテナンス」表記
    return `
管理画面は現在メンテナンス中です。

【メンテナンスについて】
システムの安定性とセキュリティ向上のため、一時的に管理機能へのアクセスを制限しております。

【ユーザーサービスへの影響】
- ログイン、取引機能は正常に稼働
- 新規の入出金申請は承認待ち状態となります
- 既存の資産は安全に保管されています

【お問い合わせ】
詳細については開発チームまでお問い合わせください。
    `.trim();
  },

  /**
   * 完全制限モード用のメンテナンスメッセージを取得
   */
  getFullRestrictionMessage(): string {
    return `
現在、システムメンテナンス中です。

【お知らせ】
すべてのサービスを一時的に停止しております。
ご不便をおかけして申し訳ございません。

【お客様の資産について】
お客様の資産は安全に保管されております。
メンテナンス完了後、すべての機能をご利用いただけます。

【お問い合わせ】
お問い合わせはサポートまでご連絡ください。
    `.trim();
  },
} as const;
