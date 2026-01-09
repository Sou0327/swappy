import { TatumSDK, Network, NotificationSubscription, ResponseDto } from '@tatumio/tatum';
import { logger } from './enhanced-logger.js';

// Tatum SDK型定義
interface TatumNotificationAPI {
  getAll: () => Promise<ResponseDto<NotificationSubscription[]>>;
  subscribe: {
    addressEvent: (params: { address: string; url: string }) => Promise<ResponseDto<{ id: string }>>;
    incomingNativeTx: (params: { address: string; url: string }) => Promise<ResponseDto<{ id: string }>>;
    incomingFungibleTx: (params: { address: string; url: string; contractAddress: string }) => Promise<ResponseDto<{ id: string }>>;
  };
  unsubscribe: (id: string) => Promise<ResponseDto<unknown>>;
  getAllExecutedWebhooks: () => Promise<ResponseDto<unknown[]>>;
}

interface TatumSDKInstance {
  notification: TatumNotificationAPI;
  destroy: () => Promise<void>;
}

export interface CreateSubscriptionOptions {
  address: string;
  chain: string;
  network: string;
  type: 'ADDRESS_EVENT' | 'INCOMING_NATIVE_TX' | 'INCOMING_FUNGIBLE_TX';
  webhookUrl: string;
}

export interface NetworkConfig {
  chain: string;
  network: string;
  tatumNetwork: Network; // Tatum SDK の Network enum 値
}

export interface SubscriptionSummary {
  id: string;
  address?: string;
  chain?: string;
  type: string;
  network: string;
  url: string;
  createdAt?: string;
  contractAddress?: string;  // ERC-20トークンのコントラクトアドレス（マルチアセット対応）
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  retryableErrors: string[];
}

export enum ErrorType {
  NETWORK = 'NETWORK',
  AUTHENTICATION = 'AUTHENTICATION',
  RATE_LIMIT = 'RATE_LIMIT',
  VALIDATION = 'VALIDATION',
  PERMANENT = 'PERMANENT'
}

/**
 * Tatum SDK クライアントラッパー - 動的マルチネットワーク対応
 */
export class TatumClient {
  private sdkInstances: Map<string, TatumSDKInstance> = new Map();
  private apiKey: string;
  private webhookUrl: string;

  // サポートされているネットワーク設定
  private readonly supportedNetworks: Map<string, NetworkConfig> = new Map([
    // EVM チェーン
    ['evm-ethereum', { chain: 'evm', network: 'ethereum', tatumNetwork: Network.ETHEREUM }],
    ['evm-sepolia', { chain: 'evm', network: 'sepolia', tatumNetwork: Network.ETHEREUM_SEPOLIA }],
    ['evm-polygon', { chain: 'evm', network: 'polygon', tatumNetwork: Network.POLYGON }],
    ['evm-bsc', { chain: 'evm', network: 'bsc', tatumNetwork: Network.BINANCE_SMART_CHAIN }],

    // Bitcoin チェーン
    ['btc-mainnet', { chain: 'btc', network: 'mainnet', tatumNetwork: Network.BITCOIN }],
    ['btc-testnet', { chain: 'btc', network: 'testnet', tatumNetwork: Network.BITCOIN_TESTNET }],

    // XRP チェーン
    ['xrp-mainnet', { chain: 'xrp', network: 'mainnet', tatumNetwork: Network.XRP }],
    ['xrp-testnet', { chain: 'xrp', network: 'testnet', tatumNetwork: Network.XRP_TESTNET }]
  ]);

  private retryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000, // 1秒
    maxDelay: 10000, // 10秒
    retryableErrors: ['NETWORK_ERROR', 'TIMEOUT', 'RATE_LIMIT', 'SERVICE_UNAVAILABLE']
  };

  constructor() {
    this.validateEnvironment();
    this.apiKey = process.env.TATUM_API_KEY!;
    this.webhookUrl = process.env.TATUM_WEBHOOK_URL!;
  }

  /**
   * 環境変数の検証
   * @private
   */
  private validateEnvironment(): void {
    const requiredEnvs = {
      TATUM_API_KEY: process.env.TATUM_API_KEY,
      TATUM_WEBHOOK_URL: process.env.TATUM_WEBHOOK_URL
    };

    const missingEnvs = Object.entries(requiredEnvs)
      .filter(([_, value]) => !value || value.trim() === '')
      .map(([key, _]) => key);

    if (missingEnvs.length > 0) {
      throw new Error(`必須環境変数が設定されていません: ${missingEnvs.join(', ')}`);
    }

    // APIキーの形式検証（基本的な形式チェック）
    if (process.env.TATUM_API_KEY && process.env.TATUM_API_KEY.length < 10) {
      throw new Error('TATUM_API_KEY の形式が無効です');
    }

    // Webhook URLの形式検証
    if (process.env.TATUM_WEBHOOK_URL) {
      try {
        new URL(process.env.TATUM_WEBHOOK_URL);
      } catch {
        throw new Error('TATUM_WEBHOOK_URL の形式が無効です');
      }
    }
  }

  /**
   * エラータイプの分類
   * @private
   */
  private classifyError(error: unknown): ErrorType {
    if (!error) return ErrorType.PERMANENT;

    // エラーオブジェクトの型安全なプロパティアクセス
    const errorObj = error as Record<string, unknown>;
    const message = (typeof errorObj === 'object' && errorObj?.message) ?
      String(errorObj.message) :
      String(error);
    const status = (typeof errorObj === 'object' && errorObj !== null) ?
      (errorObj.status || errorObj.code || errorObj.statusCode) :
      undefined;

    // ネットワークエラー
    if (/network|connection|timeout|ECONNRESET|ENOTFOUND/.test(message)) {
      return ErrorType.NETWORK;
    }

    // 認証エラー
    if (status === 401 || status === 403 || /unauthorized|forbidden|invalid.*key/.test(message)) {
      return ErrorType.AUTHENTICATION;
    }

    // レート制限
    if (status === 429 || /rate.limit|too.many.requests/.test(message)) {
      return ErrorType.RATE_LIMIT;
    }

    // バリデーションエラー
    if (status === 400 || /invalid.*parameter|validation|bad.request/.test(message)) {
      return ErrorType.VALIDATION;
    }

    // その他は永続的エラーとして扱う
    return ErrorType.PERMANENT;
  }

  /**
   * リトライ可能かどうかの判定
   * @private
   */
  private isRetryableError(errorType: ErrorType): boolean {
    return [ErrorType.NETWORK, ErrorType.RATE_LIMIT].includes(errorType);
  }

  /**
   * 指数バックオフ計算
   * @private
   */
  private calculateDelay(attempt: number): number {
    const delay = this.retryConfig.baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.1 * delay; // 10%のジッター
    return Math.min(delay + jitter, this.retryConfig.maxDelay);
  }

  /**
   * スリープ関数
   * @private
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * リトライ機能付き実行 (強化されたログ付き)
   * @private
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    chain?: string,
    network?: string
  ): Promise<T> {
    const operationId = logger.startOperation(`executeWithRetry:${operationName}`, chain, network);
    const startTime = Date.now();
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const result = await operation();
        const duration = Date.now() - startTime;

        logger.success(
          `executeWithRetry:${operationName}`,
          operationId,
          duration,
          chain,
          network,
          { attempts: attempt + 1 }
        );

        return result;
      } catch (error) {
        lastError = error;
        const errorType = this.classifyError(error);

        // 最後の試行または非リトライ可能エラーの場合
        if (attempt === this.retryConfig.maxRetries || !this.isRetryableError(errorType)) {
          logger.error(`executeWithRetry:${operationName}`, error, operationId, chain, network, attempt + 1);
          throw error;
        }

        const delay = this.calculateDelay(attempt);
        logger.retry(
          operationName,
          attempt + 1,
          this.retryConfig.maxRetries + 1,
          delay,
          `${errorType}: ${this.sanitizeErrorMessage(error)}`
        );

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * エラーメッセージのサニタイゼーション
   * @private
   */
  private sanitizeErrorMessage(error: unknown): string {
    if (!error) return 'Unknown error';

    // 型安全なメッセージ取得
    const errorObj = error as Record<string, unknown>;
    let message: string;

    if (typeof errorObj === 'object' && errorObj !== null && errorObj.message) {
      message = String(errorObj.message);
    } else {
      message = String(error);
    }

    // APIキーなどの機密情報を除去
    if (this.apiKey) {
      message = message.replace(new RegExp(this.apiKey, 'g'), '[REDACTED]');
    }

    // URLから機密パラメータを除去
    message = message.replace(/([?&])(api[kK]ey|token|secret)=[^&\s]*/g, '$1$2=[REDACTED]');

    // 内部パスの除去
    message = message.replace(/\/Users\/[^\s]*/g, '[PATH_REDACTED]');

    return message;
  }

  /**
   * 動的ネットワーク対応の初期化 - 実際には何もしない（互換性維持）
   */
  async initialize(): Promise<void> {
    const operationId = logger.startOperation('TatumClient.initialize');

    try {
      logger.success('TatumClient.initialize', operationId, undefined, undefined, undefined, {
        message: 'Tatum SDK 動的マルチネットワーク対応モード起動',
        info: 'SDKインスタンスは必要時に動的生成されます',
        supportedNetworks: Array.from(this.supportedNetworks.keys())
      });
    } catch (error) {
      logger.error('TatumClient.initialize', error, operationId);
      throw error;
    }
  }

  /**
   * 特定のチェーン・ネットワーク組み合わせ用のSDKインスタンスを取得
   * 存在しない場合は動的に生成してキャッシュ
   */
  private async getOrCreateSDKInstance(chain: string, network: string): Promise<TatumSDKInstance> {
    const networkKey = `${chain}-${network}`;
    const operationId = logger.startOperation('getOrCreateSDKInstance', chain, network, { networkKey });
    const startTime = Date.now();

    // 既にキャッシュされている場合はそれを返す
    if (this.sdkInstances.has(networkKey)) {
      const duration = Date.now() - startTime;
      logger.success('getOrCreateSDKInstance', operationId, duration, chain, network, {
        source: 'cache',
        networkKey
      });
      return this.sdkInstances.get(networkKey)!;
    }

    // サポートされているネットワークかチェック
    const networkConfig = this.supportedNetworks.get(networkKey);
    if (!networkConfig) {
      const error = new Error(`サポートされていないネットワーク: ${chain}/${network}`);
      logger.error('getOrCreateSDKInstance', error, operationId, chain, network);
      throw error;
    }

    try {
      logger.log('info', `SDK初期化中: ${chain}/${network}`, {
        operationId,
        networkKey,
        tatumNetwork: networkConfig.tatumNetwork
      });

      // 動的にSDKインスタンスを生成
      const sdkInstance = await TatumSDK.init({
        network: networkConfig.tatumNetwork,
        apiKey: { v4: this.apiKey },
        verbose: false
      }) as unknown as TatumSDKInstance;

      // キャッシュに保存
      this.sdkInstances.set(networkKey, sdkInstance);

      const duration = Date.now() - startTime;
      logger.success('getOrCreateSDKInstance', operationId, duration, chain, network, {
        source: 'new_instance',
        networkKey,
        tatumNetwork: networkConfig.tatumNetwork
      });

      return sdkInstance;
    } catch (error) {
      logger.error('getOrCreateSDKInstance', error, operationId, chain, network);
      throw new Error(`SDK初期化に失敗しました (${chain}/${network}): ${this.sanitizeErrorMessage(error)}`);
    }
  }

  /**
   * Tatum SDK が返すネットワーク名を内部ネットワーク名に正規化
   * @private
   */
  private normalizeNetworkName(chain: string, tatumNetworkName: string): string {
    // 未定義値の防御：Tatum SDKから未定義のネットワーク値が返される可能性への対応
    if (!tatumNetworkName || typeof tatumNetworkName !== 'string') {
      console.warn(`⚠️ 未定義ネットワーク名 (chain: ${chain}), デフォルトネットワークを使用`);
      // チェーン別のデフォルトネットワークを返す
      const defaultNetworks: { [key: string]: string } = {
        'evm': 'ethereum',
        'btc': 'mainnet',
        'xrp': 'mainnet'
      };
      return defaultNetworks[chain] || 'mainnet';
    }

    // NetworkConfigマッピングから逆引きして内部ネットワーク名を取得
    for (const [networkKey, config] of this.supportedNetworks) {
      if (config.chain === chain) {
        // Tatum Network enumとの厳密比較（部分一致を避ける）
        const tatumNetworkValue = config.tatumNetwork.toString().toLowerCase();
        const inputNetwork = tatumNetworkName.toLowerCase();

        // 厳密一致を優先（ethereum-sepolia vs ethereum の誤認識を防ぐ）
        if (inputNetwork === tatumNetworkValue ||
            inputNetwork === `${config.chain}-${config.network}` ||
            inputNetwork === config.network) {
          return config.network;
        }
      }
    }

    // より詳細なマッピングテーブル（確実性向上）
    const networkMappings: { [key: string]: string } = {
      'ethereum-mainnet': 'ethereum',
      'ethereum-sepolia': 'sepolia',
      'polygon-mainnet': 'polygon',
      'bsc-mainnet': 'bsc',
      'bitcoin-mainnet': 'mainnet',
      'bitcoin-testnet': 'testnet',
      'ripple-mainnet': 'mainnet',
      'ripple-testnet': 'testnet'
    };

    const mapped = networkMappings[tatumNetworkName.toLowerCase()];
    if (mapped) {
      return mapped;
    }

    // フォールバック: ハイフンがある場合は最後の部分を取得
    const parts = tatumNetworkName.split('-');
    return parts.length > 1 ? parts[parts.length - 1] : tatumNetworkName;
  }

  /**
   * チェーン・ネットワーク組み合わせに応じた適切なSDKインスタンスを取得
   * @private
   */
  private async getTatumInstance(chain: string, network: string): Promise<TatumSDKInstance> {
    return await this.getOrCreateSDKInstance(chain, network);
  }

  /**
   * 全サブスクリプション一覧取得 (全ネットワーク統合 + 強化ログ)
   */
  async getAllSubscriptions(): Promise<SubscriptionSummary[]> {
    const operationId = logger.startOperation('getAllSubscriptions');
    const startTime = Date.now();
    const allSubscriptions: SubscriptionSummary[] = [];

    // 全サポートネットワークからサブスクリプションを取得（動的SDK生成）
    for (const [networkKey, networkConfig] of this.supportedNetworks) {
      const [chain, network] = networkKey.split('-');

      try {
        // 必要に応じてSDKインスタンスを動的生成
        const sdkInstance = await this.getOrCreateSDKInstance(chain, network);

        const subscriptions = await this.executeWithRetry(async () => {
          const response: ResponseDto<NotificationSubscription[]> = await sdkInstance.notification.getAll();

          if (response.status === 'SUCCESS' && response.data) {
            return response.data.map((sub) => {
              const subData = sub as unknown as Record<string, unknown>;
              const attr = subData.attr as Record<string, unknown> | undefined;
              return {
                id: sub.id,
                address: sub.address,
                chain: chain,
                type: sub.type,
                network: this.normalizeNetworkName(chain, sub.network),  // Tatum SDK戻り値を内部形式に正規化
                url: sub.url,
                contractAddress: (attr?.contractAddress as string) || (subData.contractAddress as string)  // Tatum APIレスポンスからcontractAddressを取得
              };
            });
          }

          logger.warn('getAllSubscriptions', `${networkKey} サブスクリプション取得で空のレスポンス`, chain, network, { response });
          return [];
        }, `${networkKey}_サブスクリプション一覧取得`, chain, network);

        allSubscriptions.push(...subscriptions);
      } catch (error) {
        // ⚠️ 重大修正: API取得失敗時は同期処理を中断してエラー伝播
        // 一時的な500/429エラーでも大量再登録を防ぐため、クリティカルエラーとして扱う
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('getAllSubscriptions', error, operationId, chain, network);

        // 同期処理を安全に中断（大量再登録防止）
        throw new Error(`サブスクリプション取得失敗: ${networkKey} - ${errorMessage}`);
      }
    }

    const duration = Date.now() - startTime;
    logger.success('getAllSubscriptions', operationId, duration, undefined, undefined, {
      totalSubscriptions: allSubscriptions.length,
      networksQueried: this.supportedNetworks.size
    });

    return allSubscriptions;
  }

  /**
   * 共通サブスクリプション作成ヘルパー (動的ネットワーク対応 + 強化ログ)
   * @private
   */
  private async createSubscriptionHelper<T extends Record<string, string>>(
    chain: string,
    network: string,
    subscribeParams: T,
    logLabel: string,
    subscribeFn: (tatum: TatumSDKInstance, params: T) => Promise<ResponseDto<{ id: string }>>
  ): Promise<string> {
    const operationName = `${logLabel.split(':')[0]}_サブスクリプション作成`;

    return this.executeWithRetry(async () => {
      const operationId = logger.startOperation(operationName, chain, network, {
        address: subscribeParams.address,
        url: subscribeParams.url
      });
      const startTime = Date.now();

      const tatum = await this.getTatumInstance(chain, network);
      const response: ResponseDto<{ id: string }> = await subscribeFn(tatum, subscribeParams);

      const duration = Date.now() - startTime;

      // ResponseDto パターンの正しい処理
      if (response.status === 'SUCCESS' && response.data?.id) {
        logger.success(operationName, operationId, duration, chain, network, {
          subscriptionId: response.data.id,
          address: subscribeParams.address,
          responseStatus: response.status
        });
        return response.data.id;
      }

      // エラーレスポンスの詳細ログ
      if (response.status === 'ERROR') {
        const errorMessage = response.error?.message || 'APIエラーが発生しました';
        const error = new Error(`Tatum API エラー (${chain}/${network}): ${errorMessage}`);
        logger.error(operationName, error, operationId, chain, network);
        throw error;
      }

      // 成功だがIDが取得できない場合
      const error = new Error(`サブスクリプション作成の応答でIDが取得できませんでした (${chain}/${network})。レスポンス状態: ${response.status}`);
      logger.error(operationName, error, operationId, chain, network);
      throw error;
    }, operationName, chain, network);
  }

  /**
   * アドレスイベントサブスクリプション作成 (動的ネットワーク対応)
   */
  async createAddressEventSubscription(address: string, chain: string, network: string): Promise<string> {
    return this.createSubscriptionHelper(
      chain,
      network,
      { address, url: this.webhookUrl },
      `📡 アドレスイベント サブスクリプション作成: ${address}`,
      (tatum, params) => tatum.notification.subscribe.addressEvent(params)
    );
  }

  /**
   * 入金ネイティブトランザクション サブスクリプション作成 (動的ネットワーク対応)
   */
  async createIncomingNativeSubscription(address: string, chain: string, network: string): Promise<string> {
    return this.createSubscriptionHelper(
      chain,
      network,
      { address, url: this.webhookUrl },
      `📥 入金ネイティブTx サブスクリプション作成: ${address}`,
      (tatum, params) => tatum.notification.subscribe.incomingNativeTx(params)
    );
  }

  /**
   * 入金トークン サブスクリプション作成 (動的ネットワーク対応 + contractAddress対応)
   */
  async createIncomingTokenSubscription(
    address: string,
    chain: string,
    network: string,
    contractAddress: string
  ): Promise<string> {
    return this.createSubscriptionHelper(
      chain,
      network,
      { address, url: this.webhookUrl, contractAddress },
      `🪙 入金トークン サブスクリプション作成: ${address} (contract: ${contractAddress})`,
      (tatum, params) => tatum.notification.subscribe.incomingFungibleTx(params)
    );
  }

  /**
   * サブスクリプション削除 (動的ネットワーク対応 + 強化ログ)
   */
  async unsubscribe(subscriptionId: string, chain?: string, network?: string): Promise<void> {
    const operationId = logger.startOperation('unsubscribe', chain, network, { subscriptionId });
    const startTime = Date.now();

    // 特定のネットワークが指定されている場合はそのネットワークでのみ削除
    if (chain && network) {
      return this.executeWithRetry(async () => {
        const tatum = await this.getTatumInstance(chain, network);
        const response = await tatum.notification.unsubscribe(subscriptionId);

        // Tatum SDK戻り値のステータス確認（削除失敗時の適切なエラー検知）
        if (response && response.status !== 'SUCCESS') {
          const errorMessage = Array.isArray(response.error?.message)
            ? response.error.message.join(', ')
            : response.error?.message || response.error || 'Unknown error';
          throw new Error(`サブスクリプション削除に失敗しました: ${response.status} - ${errorMessage}`);
        }

        const duration = Date.now() - startTime;
        logger.success('unsubscribe', operationId, duration, chain, network, {
          subscriptionId,
          targetNetwork: `${chain}/${network}`
        });
      }, `サブスクリプション削除`, chain, network);
    }

    // ネットワークが指定されていない場合は全サポートネットワークで動的初期化して試行
    let deletionSuccessful = false;
    const attemptedNetworks: string[] = [];

    for (const [networkKey, networkConfig] of this.supportedNetworks) {
      const [currentChain, currentNetwork] = networkKey.split('-');
      const sdkInstance = await this.getOrCreateSDKInstance(currentChain, currentNetwork);
      attemptedNetworks.push(networkKey);

      try {
        await this.executeWithRetry(async () => {
          const response = await sdkInstance.notification.unsubscribe(subscriptionId);

          // Tatum SDK戻り値のステータス確認（削除失敗時の適切なエラー検知）
          if (response && response.status !== 'SUCCESS') {
            const errorMessage = Array.isArray(response.error?.message)
              ? response.error.message.join(', ')
              : response.error?.message || response.error || 'Unknown error';
            throw new Error(`サブスクリプション削除に失敗しました: ${response.status} - ${errorMessage}`);
          }
        }, `${networkKey}_サブスクリプション削除`, currentChain, currentNetwork);

        deletionSuccessful = true;
        const duration = Date.now() - startTime;
        logger.success('unsubscribe', operationId, duration, currentChain, currentNetwork, {
          subscriptionId,
          successfulNetwork: networkKey,
          attemptedNetworks
        });
        break; // 成功したら他のネットワークは試行しない
      } catch (error) {
        // このネットワークには該当するサブスクリプションがない可能性
        logger.log('info', `${networkKey} での削除失敗 (続行)`, {
          subscriptionId,
          networkKey,
          error: this.sanitizeErrorMessage(error)
        });
      }
    }

    if (!deletionSuccessful) {
      const error = new Error(`サブスクリプション ${subscriptionId} の削除に失敗しました（全ネットワークで試行済み）`);
      logger.error('unsubscribe', error, operationId, undefined, undefined, undefined);
      throw error;
    }
  }

  /**
   * Webhook実行履歴取得 (動的ネットワーク対応 + 強化ログ)
   */
  async getExecutedWebhooks(chain?: string, network?: string): Promise<unknown[]> {
    const operationId = logger.startOperation('getExecutedWebhooks', chain, network);
    const startTime = Date.now();

    // 特定のネットワークが指定されている場合
    if (chain && network) {
      return this.executeWithRetry(async () => {
        const tatum = await this.getTatumInstance(chain, network);
        const response: ResponseDto<unknown[]> = await tatum.notification.getAllExecutedWebhooks();

        if (response.status === 'SUCCESS' && response.data) {
          const duration = Date.now() - startTime;
          logger.success('getExecutedWebhooks', operationId, duration, chain, network, {
            webhookCount: response.data.length,
            targetNetwork: `${chain}/${network}`
          });
          return response.data;
        }

        logger.warn('getExecutedWebhooks', `${chain}/${network} Webhook履歴取得で空のレスポンス`, chain, network, { response });
        return [];
      }, `Webhook履歴取得`, chain, network);
    }

    // 全ネットワーク統合取得
    const allWebhooks: unknown[] = [];
    let successfulNetworks = 0;

    for (const [networkKey, networkConfig] of this.supportedNetworks) {
      const [currentChain, currentNetwork] = networkKey.split('-');
      const sdkInstance = await this.getOrCreateSDKInstance(currentChain, currentNetwork);

      try {
        const webhooks = await this.executeWithRetry(async () => {
          const response: ResponseDto<unknown[]> = await sdkInstance.notification.getAllExecutedWebhooks();

          if (response.status === 'SUCCESS' && response.data) {
            return response.data;
          }

          logger.warn('getExecutedWebhooks', `${networkKey} Webhook履歴取得で空のレスポンス`, currentChain, currentNetwork, { response });
          return [];
        }, `${networkKey}_Webhook履歴取得`, currentChain, currentNetwork);

        allWebhooks.push(...webhooks);
        successfulNetworks++;
      } catch (error) {
        // 特定のネットワークでエラーが発生しても他のネットワークは続行
        logger.warn('getExecutedWebhooks', `${networkKey} ネットワークでエラー`, currentChain, currentNetwork, {
          error: this.sanitizeErrorMessage(error)
        });
      }
    }

    const duration = Date.now() - startTime;
    logger.success('getExecutedWebhooks', operationId, duration, undefined, undefined, {
      totalWebhooks: allWebhooks.length,
      successfulNetworks,
      totalNetworks: this.sdkInstances.size
    });

    return allWebhooks;
  }

  /**
   * SDK インスタンス破棄 (動的ネットワーク対応 + 強化ログ)
   */
  async destroy(): Promise<void> {
    const operationId = logger.startOperation('destroy', undefined, undefined, {
      instanceCount: this.sdkInstances.size
    });
    const startTime = Date.now();

    const destroyPromises: Promise<void>[] = [];
    let successfulDestroys = 0;
    let failedDestroys = 0;

    for (const [networkKey, sdkInstance] of this.sdkInstances) {
      const [chain, network] = networkKey.split('-');

      destroyPromises.push(
        (async () => {
          try {
            await sdkInstance.destroy();
            successfulDestroys++;
            logger.log('info', `${networkKey} SDK破棄完了`, {
              networkKey,
              chain,
              network
            });
          } catch (error) {
            failedDestroys++;
            logger.warn('destroy', `${networkKey} SDK破棄でエラー`, chain, network, {
              error: this.sanitizeErrorMessage(error)
            });
          }
        })()
      );
    }

    // 全インスタンスの破棄を並列実行
    await Promise.allSettled(destroyPromises);

    // キャッシュをクリア
    const originalSize = this.sdkInstances.size;
    this.sdkInstances.clear();

    const duration = Date.now() - startTime;
    logger.success('destroy', operationId, duration, undefined, undefined, {
      originalInstanceCount: originalSize,
      successfulDestroys,
      failedDestroys,
      cacheCleared: true
    });
  }
}