/**
 * サービス制限機能
 *
 * システムの状態に応じて、サービスの一部機能を制限します。
 * セルフホスト型ウォレットプラットフォーム向けの設計です。
 *
 * 制限モード:
 * - 'none': 制限なし（通常運用）
 * - 'partial': 部分制限 - 準備中モード（入金・出金・取引を制限）
 * - 'full': 完全制限 - メンテナンスモード（アプリケーション全体を制限）
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
   * partialモードでも登録は許可（ショーケース用）
   */
  isRegistrationEnabled(): boolean {
    return this.mode !== 'full';
  },

  /**
   * 入金機能が有効かどうか
   * partialモードで制限
   */
  isDepositEnabled(): boolean {
    return this.mode === 'none';
  },

  /**
   * 出金機能が有効かどうか
   * partialモードで制限
   */
  isWithdrawalEnabled(): boolean {
    return this.mode === 'none';
  },

  /**
   * 取引機能が有効かどうか
   * partialモードで制限
   */
  isTradeEnabled(): boolean {
    return this.mode === 'none';
  },

  /**
   * 管理画面へのアクセスが有効かどうか
   * partialモードでも管理画面は許可
   */
  isAdminAccessEnabled(): boolean {
    return this.mode !== 'full';
  },

  /**
   * ログイン機能が有効かどうか
   * fullモードのみ無効
   */
  isLoginEnabled(): boolean {
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
   * エンドユーザー向けの制限メッセージを取得（日本語）
   */
  getRestrictionMessage(): string {
    if (this.mode === 'none') {
      return '';
    }

    // partial モードは「準備中」表記（カジュアルなトーン）
    if (this.mode === 'partial') {
      return `
🚧 現在準備中です

この機能は現在開発中のため、ご利用いただけません。
もうしばらくお待ちください！

【準備中の機能】
- 入金
- 出金
- 取引

【ご利用いただける機能】
- アカウント作成・ログイン
- ウォレット残高の確認
- 画面の閲覧

準備が整い次第、すべての機能をご利用いただけます。
      `.trim();
    }

    // full モードは「メンテナンス」表記
    return `
🔧 システムメンテナンス中

現在、すべての機能を一時的に制限しております。

【制限されている機能】
- 入金・出金
- 取引
- ログイン

メンテナンス完了後、すべての機能が復旧します。
    `.trim();
  },

  /**
   * エンドユーザー向けの制限メッセージを取得（英語）
   */
  getRestrictionMessageEn(): string {
    if (this.mode === 'none') {
      return '';
    }

    // partial mode - "Under Preparation" (casual tone)
    if (this.mode === 'partial') {
      return `
🚧 Under Preparation

This feature is currently under development.
Please wait a moment!

[Features in Preparation]
- Deposits
- Withdrawals
- Trading

[Available Features]
- Account creation & login
- Wallet balance viewing
- Interface browsing

All features will be available once preparation is complete.
      `.trim();
    }

    // full mode - "Maintenance"
    return `
🔧 System Maintenance

All features are temporarily restricted.

[Restricted Features]
- Deposits & Withdrawals
- Trading
- Login

All features will be restored after maintenance is complete.
    `.trim();
  },

  /**
   * 管理者向けの制限メッセージを取得（日本語）
   */
  getAdminRestrictionMessage(): string {
    if (this.mode === 'none') {
      return '';
    }

    // partial モードは「準備中」表記
    if (this.mode === 'partial') {
      return `
🚧 準備中モード稼働中

【制限状況】
- 入金・出金・取引機能は無効化されています
- ユーザーは閲覧のみ可能です

【管理者への影響】
- 管理画面へのアクセスは可能です
- 設定の変更は反映されます

本番運用を開始する場合は、環境変数 VITE_SERVICE_RESTRICTION_MODE を削除または 'none' に設定してください。
      `.trim();
    }

    // full モードは「メンテナンス」表記
    return `
🔧 メンテナンスモード稼働中

【制限状況】
- すべてのユーザー機能が無効化されています
- 管理画面へのアクセスも制限されています

メンテナンス完了後、環境変数 VITE_SERVICE_RESTRICTION_MODE を削除してください。
    `.trim();
  },

  /**
   * 管理者向けの制限メッセージを取得（英語）
   */
  getAdminRestrictionMessageEn(): string {
    if (this.mode === 'none') {
      return '';
    }

    // partial mode - "Under Preparation"
    if (this.mode === 'partial') {
      return `
🚧 Preparation Mode Active

[Restriction Status]
- Deposit, withdrawal, and trading features are disabled
- Users can only browse

[Admin Impact]
- Admin dashboard access is available
- Configuration changes will be applied

To start production operation, remove or set VITE_SERVICE_RESTRICTION_MODE to 'none'.
      `.trim();
    }

    // full mode - "Maintenance"
    return `
🔧 Maintenance Mode Active

[Restriction Status]
- All user features are disabled
- Admin dashboard access is also restricted

After maintenance, remove the VITE_SERVICE_RESTRICTION_MODE environment variable.
    `.trim();
  },

  /**
   * 完全制限モード用のメンテナンスメッセージを取得（日本語）
   */
  getFullRestrictionMessage(): string {
    return `
🔧 システムメンテナンス中

すべてのサービスを一時的に停止しております。
ご不便をおかけして申し訳ございません。

メンテナンス完了後、すべての機能をご利用いただけます。
    `.trim();
  },

  /**
   * 完全制限モード用のメンテナンスメッセージを取得（英語）
   */
  getFullRestrictionMessageEn(): string {
    return `
🔧 System Maintenance

All services are temporarily suspended.
We apologize for any inconvenience.

All features will be available after maintenance is complete.
    `.trim();
  },
} as const;
