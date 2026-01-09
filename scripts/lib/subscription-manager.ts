import { TatumClient, SubscriptionSummary } from './tatum-client.js';
import { SupabaseClient, DepositAddress, ChainConfig } from './supabase-client.js';
import { logger } from './enhanced-logger.js';
import * as readline from 'readline';

interface SyncResult {
  created: number;
  skipped: number;
  errors: string[];
}

interface RetryableOperation {
  maxRetries: number;
  baseDelay: number;
  operation: () => Promise<unknown>;
  operationName: string;
  context?: Partial<ErrorContext>;
}

interface SyncItem {
  address: string;
  chain: string;
  network: string;
  asset: string;
  shouldCreate: boolean;
  reason?: string;
}

interface ErrorContext {
  operation: string;
  address?: string;
  chain?: string;
  network?: string;
  attempt: number;
  maxRetries: number;
}

/**
 * Tatumサブスクリプション管理ロジック
 */
export class SubscriptionManager {
  private readonly maxConcurrentOperations = 5;
  private readonly defaultRetryConfig = {
    maxRetries: 2,
    baseDelay: 2000 // 2秒
  };

  // 逆引きマッピングキャッシュ（性能最適化）
  private reverseContractMappingCache: { [address: string]: string } | null = null;

  constructor(
    private tatumClient: TatumClient,
    private supabaseClient: SupabaseClient
  ) {}

  /**
   * deposit_addresses とTatumサブスクリプションの同期 (強化ログ付き)
   */
  async syncSubscriptions(): Promise<SyncResult> {
    const operationId = logger.startOperation('syncSubscriptions');
    const startTime = Date.now();

    const result: SyncResult = {
      created: 0,
      skipped: 0,
      errors: []
    };

    try {
      // 1. 現在のTatumサブスクリプション一覧を取得
      const existingSubscriptions = await this.tatumClient.getAllSubscriptions();
      logger.log('info', `既存のサブスクリプション: ${existingSubscriptions.length} 件`, {
        operationId,
        subscriptionCount: existingSubscriptions.length
      });

      // 2. アクティブなdeposit_addressesを取得
      const depositAddresses = await this.supabaseClient.getActiveDepositAddresses();
      logger.log('info', `アクティブなdeposit_addresses: ${depositAddresses.length} 件`, {
        operationId,
        addressCount: depositAddresses.length
      });

      if (depositAddresses.length === 0) {
        logger.warn('syncSubscriptions', 'アクティブなdeposit_addressesがありません', undefined, undefined, { operationId });
        const duration = Date.now() - startTime;
        logger.success('syncSubscriptions', operationId, duration, undefined, undefined, result);
        return result;
      }

      // 3. 有効なチェーン設定を取得
      const chainConfigs = await this.supabaseClient.getActiveChainConfigs();
      logger.log('info', `アクティブなチェーン設定: ${chainConfigs.length} 件`, {
        operationId,
        chainConfigCount: chainConfigs.length
      });

      // 4. 同期対象を分析
      const analysis = await this.analyzeSyncItems(depositAddresses, chainConfigs, existingSubscriptions);
      const { items: syncItems, subscribedKeys } = analysis;

      // 5. 必要なサブスクリプションを作成（バッチ処理）
      const createItems = syncItems.filter(item => item.shouldCreate);
      const skipItems = syncItems.filter(item => !item.shouldCreate);

      // スキップしたアイテムのログ出力
      skipItems.forEach(item => {
        result.skipped++;
        logger.log('info', `スキップ: ${item.address}`, {
          operationId,
          address: item.address,
          chain: item.chain,
          network: item.network,
          reason: item.reason
        });
      });

      // 作成アイテムをバッチ処理
      if (createItems.length > 0) {
        logger.log('info', `バッチ処理開始: ${createItems.length} 件`, {
          operationId,
          createItemCount: createItems.length
        });
        await this.processBatch(createItems, result, subscribedKeys);
      }

      const duration = Date.now() - startTime;

      // ⚠️ 重大修正: 部分失敗の場合は成功ログではなく警告ログを出力し、例外を投げる
      if (result.errors.length > 0) {
        logger.warn('syncSubscriptions', `同期処理が部分的に失敗: ${result.errors.length}件のエラー`, undefined, undefined, {
          operationId,
          created: result.created,
          skipped: result.skipped,
          errors: result.errors.length,
          totalItems: syncItems.length,
          errorDetails: result.errors
        });

        // 部分失敗は運用上クリティカルなため例外として扱う
        throw new Error(`同期処理が部分的に失敗しました: ${result.errors.length}件のエラーが発生`);
      }

      logger.success('syncSubscriptions', operationId, duration, undefined, undefined, {
        created: result.created,
        skipped: result.skipped,
        errors: result.errors.length,
        totalItems: syncItems.length
      });

      return result;

    } catch (error) {
      logger.error('syncSubscriptions', error, operationId);
      result.errors.push(`同期処理エラー: ${this.sanitizeErrorMessage(error)}`);

      // ⚠️ 重大修正: catch節でもresultを返さず例外を再throw
      // 呼び出し側に「失敗」として正しく伝播させる
      throw error;
    }
  }

  /**
   * 同期対象アイテムの分析
   */
  private async analyzeSyncItems(
    depositAddresses: DepositAddress[],
    chainConfigs: ChainConfig[],
    existingSubscriptions: SubscriptionSummary[]
  ): Promise<{ items: SyncItem[], subscribedKeys: Set<string> }> {
    const items: SyncItem[] = [];

    // 入力データの正規化: 重複防止ロジックの一貫性を確保
    // 正規化ルール:
    // - asset: 大文字統一 (ETH, BTC, USDT など)
    // - network: 小文字統一 (ethereum, bitcoin, sepolia など)
    // - chain: 変更なし (evm, btc, xrp など)
    const normalizedDepositAddresses = depositAddresses.map(addr => ({
      ...addr,
      asset: (addr.asset || this.getNativeAssetName(addr.chain, addr.network.toLowerCase())).toUpperCase(),
      network: addr.network.toLowerCase()
    }));

    // 既存サブスクリプションの アドレス+チェーン+ネットワーク+アセット+タイプ別キー一覧を作成
    // マルチアセット対応: アセット情報を含むキー生成で重複検知
    const subscribedKeys = new Set(
      existingSubscriptions
        .filter(sub => sub.address)
        .map(sub => {
          // Tatumサブスクリプションの chain/network 情報がない場合のフォールバック
          const chain = sub.chain || 'unknown';
          // ネットワーク名正規化: Tatum APIは大文字を返すことがあるので小文字に統一
          const network = (sub.network || 'unknown').toLowerCase();

          // 既存のサブスクリプションからアセットを推定
          const inferredAsset = this.inferAssetFromSubscription(sub, sub.address!, chain, network, existingSubscriptions) || 'UNKNOWN';

          // 新しいキー生成ロジック（ADDRESS_EVENTアセット非依存対応）
          return this.generateSubscriptionKey(sub.address!, chain, network, inferredAsset, sub.type);
        })
    );

    for (const addr of normalizedDepositAddresses) {
      // チェーン設定の確認（修正版: ネイティブアセット補正とアセットマッチングロジック修正）
      const addrAsset = addr.asset; // 既に正規化済み
      const chainConfig = chainConfigs.find(config => {
        // ⚠️ 重大修正: configAssetがnullの場合もnetworkを小文字化してからネイティブアセット名を取得
        const configAsset = (config.asset || this.getNativeAssetName(config.chain, config.network.toLowerCase())).toUpperCase();
        return config.chain === addr.chain &&
               config.network.toLowerCase() === addr.network &&
               // config.networkを小文字化してaddr.network（正規化済み）と比較
               addrAsset === configAsset;
      });

      if (!chainConfig) {
        items.push({
          address: addr.address,
          chain: addr.chain,
          network: addr.network,
          asset: addrAsset,
          shouldCreate: false,
          reason: '対応するチェーン設定が見つかりません'
        });
        continue;
      }

      // 既存サブスクリプションの確認（タイプベース）
      // 正規化済みの asset をそのまま使用（154-158行目で既に正規化済み）
      const asset = addr.asset;
      const expectedTypes = this.getExpectedSubscriptionTypes(asset, addr.chain);

      // この address+chain+network+asset に必要な全てのサブスクリプションタイプが既に存在するかチェック
      const hasAllRequiredSubscriptions = expectedTypes.every(expectedType => {
        // 新しいキー生成ロジック（ADDRESS_EVENTアセット非依存対応）
        const subscriptionKey = this.generateSubscriptionKey(addr.address, addr.chain, addr.network, asset, expectedType);
        return subscribedKeys.has(subscriptionKey);
      });

      if (hasAllRequiredSubscriptions) {
        items.push({
          address: addr.address,
          chain: addr.chain,
          network: addr.network,
          asset: asset,
          shouldCreate: false,
          reason: '既にサブスクリプションが存在します'
        });
        continue;
      }

      // サポートされているチェーンの確認
      if (!this.isSupportedChain(addr.chain, addr.network)) {
        items.push({
          address: addr.address,
          chain: addr.chain,
          network: addr.network,
          asset: addr.asset || this.getNativeAssetName(addr.chain, addr.network.toLowerCase()),
          shouldCreate: false,
          reason: 'サポートされていないチェーン/ネットワークです'
        });
        continue;
      }

      // 作成対象
      items.push({
        address: addr.address,
        chain: addr.chain,
        network: addr.network,
        asset: asset,
        shouldCreate: true,
        reason: 'サブスクリプションを作成します'
      });
    }

    return { items, subscribedKeys };
  }

  /**
   * アドレス用のサブスクリプション作成 (不足タイプのみ個別作成・ADDRESS_EVENT重複回避対応)
   */
  private async createSubscriptionForAddress(
    address: string,
    chain: string,
    network: string,
    asset: string,
    missingTypes: string[],
    subscribedKeys: Set<string>
  ): Promise<void> {
    // 不足しているサブスクリプションタイプのみを個別作成
    for (const type of missingTypes) {
      if (type === 'INCOMING_NATIVE_TX') {
        // ネイティブトークン用
        await this.tatumClient.createIncomingNativeSubscription(address, chain, network);
        // 作成成功後にsubscribedKeysを更新
        const key = this.generateSubscriptionKey(address, chain, network, asset, type);
        subscribedKeys.add(key);
        console.log(`✅ subscribedKeys更新: ${key}`);
      } else if (type === 'INCOMING_FUNGIBLE_TX') {
        // ERC-20トークン用 (アセット対応のcontractAddress取得)
        const contractAddress = this.getContractAddressForAsset(asset, chain, network);
        await this.tatumClient.createIncomingTokenSubscription(address, chain, network, contractAddress);
        // 作成成功後にsubscribedKeysを更新
        const key = this.generateSubscriptionKey(address, chain, network, asset, type);
        subscribedKeys.add(key);
        console.log(`✅ subscribedKeys更新: ${key}`);
      } else if (type === 'ADDRESS_EVENT') {
        // アドレスイベント用 (共有リソース・重複回避)
        await this.tatumClient.createAddressEventSubscription(address, chain, network);
        // 作成成功後にsubscribedKeysを更新（ADDRESS_EVENTはアセット非依存）
        const key = this.generateSubscriptionKey(address, chain, network, asset, type);
        subscribedKeys.add(key);
        console.log(`✅ subscribedKeys更新: ${key}`);
      } else {
        throw new Error(`サポートされていないサブスクリプションタイプ: ${type}`);
      }
    }
  }

  /**
   * サポートされているチェーンかチェック (実装と一致)
   */
  private isSupportedChain(chain: string, network: string): boolean {
    const supportedChains = {
      'evm': ['ethereum', 'sepolia', 'polygon', 'bsc'],
      'btc': ['mainnet', 'testnet'],
      'xrp': ['mainnet', 'testnet']
    };

    return supportedChains[chain as keyof typeof supportedChains]?.includes(network) || false;
  }

  /**
   * 現在のサブスクリプション一覧表示
   */
  async listSubscriptions(): Promise<void> {
    try {
      const subscriptions = await this.tatumClient.getAllSubscriptions();

      if (subscriptions.length === 0) {
        console.log('📋 アクティブなサブスクリプションはありません');
        return;
      }

      console.log(`\n📋 アクティブなサブスクリプション (${subscriptions.length} 件):`);
      console.log('═══════════════════════════════════════════════════');

      subscriptions.forEach((sub, index) => {
        console.log(`${index + 1}. ID: ${sub.id}`);
        console.log(`   アドレス: ${sub.address || 'N/A'}`);
        console.log(`   タイプ: ${sub.type}`);
        console.log(`   ネットワーク: ${sub.network}`);
        console.log(`   URL: ${sub.url}`);
        console.log('───────────────────────────────────────────────────');
      });
    } catch (error) {
      const sanitizedMessage = this.sanitizeErrorMessage(error);
      console.error('❌ サブスクリプション一覧取得失敗:', sanitizedMessage);
      throw new Error(`サブスクリプション一覧取得に失敗しました: ${sanitizedMessage}`);
    }
  }

  /**
   * 単一アドレスのサブスクリプション確実作成 (Phase 0: アドレス生成統合用)
   * アドレス生成時に呼び出してサブスクリプションを自動作成
   */
  async ensureSubscriptionForAddress(
    address: string,
    chain: string,
    network: string,
    asset: string
  ): Promise<{
    success: boolean;
    created: number;
    skipped: number;
    error?: string;
  }> {
    const operationId = logger.startOperation('ensureSubscriptionForAddress');
    const startTime = Date.now();

    try {
      logger.log('info', `アドレス ${address} のサブスクリプション確認開始`, {
        operationId,
        address,
        chain,
        network,
        asset
      });

      // 1. チェーン・ネットワーク・アセットの正規化
      const normalizedNetwork = network.toLowerCase();
      const normalizedAsset = asset.toUpperCase();

      // 2. サポートチェーンの確認
      if (!this.isSupportedChain(chain, normalizedNetwork)) {
        const error = `サポートされていないチェーン/ネットワーク: ${chain}/${normalizedNetwork}`;
        logger.warn('ensureSubscriptionForAddress', error, undefined, undefined, { operationId });
        return { success: false, created: 0, skipped: 0, error };
      }

      // 3. 既存のサブスクリプション確認
      const existingSubscriptions = await this.tatumClient.getAllSubscriptions();
      const subscribedKeys = new Set<string>();

      existingSubscriptions.forEach(sub => {
        const key = this.generateSubscriptionKey(sub.address || '', chain, normalizedNetwork, normalizedAsset, sub.type);
        subscribedKeys.add(key);
      });

      // 4. 必要なサブスクリプションタイプ確認
      const expectedTypes = this.getExpectedSubscriptionTypes(normalizedAsset, chain);
      const missingTypes: string[] = [];

      for (const expectedType of expectedTypes) {
        const subscriptionKey = this.generateSubscriptionKey(address, chain, normalizedNetwork, normalizedAsset, expectedType);
        if (!subscribedKeys.has(subscriptionKey)) {
          missingTypes.push(expectedType);
        }
      }

      // 5. 既に全て作成済みの場合
      if (missingTypes.length === 0) {
        logger.log('info', `アドレス ${address} のサブスクリプションは既に存在`, { operationId });
        const duration = Date.now() - startTime;
        logger.success('ensureSubscriptionForAddress', operationId, duration, undefined, undefined, { skipped: expectedTypes.length });
        return { success: true, created: 0, skipped: expectedTypes.length };
      }

      // 6. 不足しているサブスクリプションを作成
      logger.log('info', `不足サブスクリプション ${missingTypes.length} 件を作成`, {
        operationId,
        missingTypes
      });

      await this.createSubscriptionForAddress(
        address,
        chain,
        normalizedNetwork,
        normalizedAsset,
        missingTypes,
        subscribedKeys
      );

      const duration = Date.now() - startTime;
      logger.success('ensureSubscriptionForAddress', operationId, duration, undefined, undefined, {
        created: missingTypes.length,
        skipped: expectedTypes.length - missingTypes.length
      });

      return {
        success: true,
        created: missingTypes.length,
        skipped: expectedTypes.length - missingTypes.length
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const sanitizedMessage = this.sanitizeErrorMessage(error);
      logger.error('ensureSubscriptionForAddress', error, operationId, chain, network);

      return {
        success: false,
        created: 0,
        skipped: 0,
        error: sanitizedMessage
      };
    }
  }

  /**
   * ユーザー確認プロンプト（非対話環境対応）
   * @private
   */
  private async promptUserConfirmation(message: string): Promise<boolean> {
    // 非対話環境の検出
    const isNonInteractive =
      !process.stdin.isTTY ||           // TTYでない（パイプやリダイレクト）
      process.env.CI === 'true' ||      // CI環境
      process.env.BATCH_MODE === 'true' || // バッチモード
      process.env.NON_INTERACTIVE === 'true'; // 明示的な非対話指定

    if (isNonInteractive) {
      // 自動承認フラグのチェック
      const autoConfirm = process.env.AUTO_CONFIRM === 'true';

      console.log(`${message} [非対話環境: ${autoConfirm ? 'AUTO_CONFIRM=true により自動承認' : '安全のため拒否'}]`);

      return autoConfirm;
    }

    // 対話環境では従来通りの処理
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      // タイムアウト設定（30秒）
      const timeout = setTimeout(() => {
        rl.close();
        console.log('\n⏰ タイムアウトしました。安全のため操作をキャンセルします。');
        resolve(false);
      }, 30000);

      rl.question(`${message} `, (answer) => {
        clearTimeout(timeout);
        rl.close();
        const response = answer.toLowerCase().trim();
        resolve(response === 'y' || response === 'yes');
      });
    });
  }

  /**
   * チェーンごとのデフォルトネットワークを取得 (サポート対象のみ)
   * @private
   */
  private getDefaultNetwork(chain: string): string {
    const defaults = {
      'evm': 'ethereum',
      'btc': 'mainnet',
      'xrp': 'mainnet'
    };
    return defaults[chain as keyof typeof defaults] || 'mainnet';
  }

  /**
   * チェーンごとのデフォルトアセットを取得 (サポート対象のみ)
   * @private
   */
  private getDefaultAsset(chain: string): string {
    const defaults = {
      'evm': 'ETH',
      'btc': 'BTC',
      'xrp': 'XRP'
    };
    return defaults[chain as keyof typeof defaults] || 'NATIVE';
  }

  /**
   * バッチ処理でサブスクリプション作成
   * @private
   */
  private async processBatch(items: SyncItem[], result: SyncResult, subscribedKeys: Set<string>): Promise<void> {
    // 並行処理での競合回避用の予約キーセット
    const reservedKeys = new Set<string>();
    // アイテムをバッチに分割
    for (let i = 0; i < items.length; i += this.maxConcurrentOperations) {
      const batch = items.slice(i, i + this.maxConcurrentOperations);

      // バッチ内の操作を並列実行（予約システム付き・正確な統計管理）
      const promises = batch.map(item =>
        this.processItemWithRetry(item, subscribedKeys, reservedKeys)
          .then((wasActuallyCreated) => {
            if (wasActuallyCreated) {
              // 実際に作成が実行された場合のみカウントアップ
              result.created++;
              console.log(`✅ サブスクリプション作成成功: ${item.address} [${item.chain}/${item.network}/${item.asset}]`);
            } else {
              // スキップされた場合の統計処理
              result.skipped++;
              console.log(`ℹ️ サブスクリプション既存のためスキップ: ${item.address} [${item.chain}/${item.network}/${item.asset}]`);
            }
          })
          .catch(error => {
            const sanitizedMessage = this.sanitizeErrorMessage(error);
            const errorMsg = `${item.address} [${item.chain}/${item.network}/${item.asset}]: ${sanitizedMessage}`;
            result.errors.push(errorMsg);
            console.error(`❌ サブスクリプション作成失敗: ${errorMsg}`);
          })
      );

      await Promise.allSettled(promises);

      // バッチ間の小休止（APIレート制限対策）
      if (i + this.maxConcurrentOperations < items.length) {
        await this.sleep(1000); // 1秒待機
      }
    }
  }

  /**
   * 不足しているサブスクリプションタイプのみを特定
   * @private
   */
  private async getMissingSubscriptionTypes(
    address: string,
    chain: string,
    network: string,
    asset: string,
    subscribedKeys: Set<string>
  ): Promise<string[]> {
    const expectedTypes = this.getExpectedSubscriptionTypes(asset, chain);
    const missingTypes: string[] = [];

    for (const expectedType of expectedTypes) {
      const subscriptionKey = this.generateSubscriptionKey(address, chain, network, asset, expectedType);
      if (!subscribedKeys.has(subscriptionKey)) {
        missingTypes.push(expectedType);
      }
    }

    return missingTypes;
  }

  /**
   * 不足しているサブスクリプションタイプを特定（reservedKeys考慮・読み取り専用）
   * リトライ処理用：新しい予約は行わず、既存の予約状況のみを参照
   * @private
   */
  private async getMissingSubscriptionTypesReservationAware(
    address: string,
    chain: string,
    network: string,
    asset: string,
    subscribedKeys: Set<string>,
    reservedKeys: Set<string>,
    ownReservedKeys: string[] = []
  ): Promise<string[]> {
    const expectedTypes = this.getExpectedSubscriptionTypes(asset, chain);
    const missingTypes: string[] = [];

    for (const expectedType of expectedTypes) {
      const subscriptionKey = this.generateSubscriptionKey(address, chain, network, asset, expectedType);

      // 既存作成済みでない場合は候補とする
      if (!subscribedKeys.has(subscriptionKey)) {
        // 他アイテムによる予約済みでない、または自分が予約したキーの場合は不足として判定
        if (!reservedKeys.has(subscriptionKey) || ownReservedKeys.includes(subscriptionKey)) {
          missingTypes.push(expectedType);
        }
      }
    }

    return missingTypes;
  }

  /**
   * 不足しているサブスクリプションタイプを特定し、先行予約で競合を回避
   * @private
   */
  private async getMissingSubscriptionTypesWithReservation(
    address: string,
    chain: string,
    network: string,
    asset: string,
    subscribedKeys: Set<string>,
    reservedKeys: Set<string>
  ): Promise<{ missingTypes: string[], reservedKeys: string[] }> {
    const expectedTypes = this.getExpectedSubscriptionTypes(asset, chain);
    const missingTypes: string[] = [];
    const reservedKeysForThisItem: string[] = [];

    for (const expectedType of expectedTypes) {
      const subscriptionKey = this.generateSubscriptionKey(address, chain, network, asset, expectedType);

      // 既存または予約済みでない場合のみ不足として判定
      if (!subscribedKeys.has(subscriptionKey) && !reservedKeys.has(subscriptionKey)) {
        missingTypes.push(expectedType);
        // 即座に予約してレースコンディションを回避
        reservedKeys.add(subscriptionKey);
        reservedKeysForThisItem.push(subscriptionKey);
        console.log(`🔒 先行予約: ${subscriptionKey}`);
      }
    }

    return { missingTypes, reservedKeys: reservedKeysForThisItem };
  }

  /**
   * 予約済みキーを解除（作成失敗時のロールバック用）
   * @private
   */
  private releaseReservedKeys(reservedKeys: Set<string>, keysToRelease: string[]): void {
    for (const key of keysToRelease) {
      reservedKeys.delete(key);
      console.log(`🔓 予約解除: ${key}`);
    }
  }

  /**
   * アイテムのリトライ処理
   * @private
   */
  private async processItemWithRetry(item: SyncItem, subscribedKeys: Set<string>, reservedKeys: Set<string>): Promise<boolean> {
    // 不足サブスクリプションタイプを特定し、先行予約で競合回避
    const analysis = await this.getMissingSubscriptionTypesWithReservation(
      item.address,
      item.chain,
      item.network,
      item.asset,
      subscribedKeys,
      reservedKeys
    );

    const { missingTypes, reservedKeys: itemReservedKeys } = analysis;

    // 不足がない場合は処理をスキップ
    if (missingTypes.length === 0) {
      console.log(`ℹ️ サブスクリプション作成スキップ: ${item.address} [${item.chain}/${item.network}/${item.asset}] - 全て存在済み`);
      return false; // 実際には作成していない
    }

    const retryableOperation: RetryableOperation = {
      maxRetries: this.defaultRetryConfig.maxRetries,
      baseDelay: this.defaultRetryConfig.baseDelay,
      operation: async () => {
        // リトライ時に毎回missingTypesを再計算（部分成功要素を自動除外・自分の予約は保持）
        const currentMissingTypes = await this.getMissingSubscriptionTypesReservationAware(
          item.address,
          item.chain,
          item.network,
          item.asset,
          subscribedKeys,
          reservedKeys,
          itemReservedKeys
        );

        // 再計算後に不足がない場合は処理完了
        if (currentMissingTypes.length === 0) {
          console.log(`✅ リトライ時確認: ${item.address} [${item.chain}/${item.network}/${item.asset}] - 全て作成済み`);
          return;
        }

        console.log(`🔄 リトライ実行: ${item.address} 残り [${currentMissingTypes.join(', ')}]`);
        await this.createSubscriptionForAddress(item.address, item.chain, item.network, item.asset, currentMissingTypes, subscribedKeys);
      },
      operationName: `サブスクリプション作成 (${item.address})`,
      context: {
        operation: `サブスクリプション作成`,
        address: item.address,
        chain: item.chain,
        network: item.network
      }
    };

    try {
      await this.executeWithRetry(retryableOperation);
      // 成功時は予約が自動確定（createSubscriptionForAddressでsubscribedKeysに追加済み）
      console.log(`✅ 予約確定: ${itemReservedKeys.join(', ')}`);
      return true; // 実際に作成が実行された
    } catch (error) {
      // 失敗時は予約解除（ロールバック）
      this.releaseReservedKeys(reservedKeys, itemReservedKeys);
      throw error; // エラーを再スロー
    }
  }

  /**
   * リトライ機能付き実行
   * @private
   */
  private async executeWithRetry(config: RetryableOperation): Promise<void> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        await config.operation();
        return; // 成功時は終了
      } catch (error) {
        lastError = error;

        // 最後の試行の場合
        if (attempt === config.maxRetries) {
          throw error;
        }

        // エラータイプとコンテキストによってリトライを判定
        const errorContext: ErrorContext = {
          operation: config.context?.operation || config.operationName,
          address: config.context?.address,
          chain: config.context?.chain,
          network: config.context?.network,
          attempt: attempt,
          maxRetries: config.maxRetries
        };
        if (!this.shouldRetry(error, errorContext)) {
          throw error;
        }

        const delay = config.baseDelay * Math.pow(2, attempt);
        console.warn(
          `⚠️ ${config.operationName}でエラー (試行 ${attempt + 1}/${config.maxRetries + 1}): ` +
          `${this.sanitizeErrorMessage(error)}. ${delay}ms後にリトライします...`
        );

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * エラーオブジェクトの型ガード（型安全性強化）
   * @private
   */
  private isErrorWithStatus(error: unknown): error is Error & { status?: number | string; code?: number | string; statusCode?: number | string } {
    return error != null && typeof error === 'object';
  }

  /**
   * ステータスコードを数値に正規化（文字列/数値両対応）
   * @private
   */
  private normalizeStatusCode(status: unknown): number | null {
    if (status == null) return null;

    const numStatus = typeof status === 'string' ? parseInt(status, 10) : Number(status);
    return isNaN(numStatus) ? null : numStatus;
  }

  /**
   * リトライすべきエラーかどうかの判定（型安全性強化版）
   * @private
   */
  private shouldRetry(error: unknown, context: ErrorContext): boolean {
    if (!error) return false;

    const message = String(this.isErrorWithStatus(error) && error.message ? error.message : error).toLowerCase();

    let status: number | null = null;
    if (this.isErrorWithStatus(error)) {
      status = this.normalizeStatusCode(error.status || error.code || error.statusCode);
    }

    // Tatum SDK特有のエラー処理（型安全性強化）
    const errorObj = error as Record<string, unknown>;
    if (this.isErrorWithStatus(error) &&
        (error.constructor?.name === 'TatumError' ||
         errorObj?.name === 'TatumError')) {
      // APIレート制限エラーは必ずリトライ
      if (status === 429 || errorObj?.code === 'RATE_LIMIT') {
        return true;
      }
      // 認証エラーはリトライしない
      if (status === 401 || status === 403) {
        return false;
      }
      // バリデーションエラーはリトライしない
      if (status === 400 || errorObj?.code === 'VALIDATION_ERROR') {
        return false;
      }
    }

    // ネットワーク関連エラーはリトライ
    if (/network|connection|timeout|econnreset|socket|dns/.test(message)) {
      return true;
    }

    // APIレート制限エラーはリトライ（数値正規化対応）
    if (status === 429 || /rate.?limit|too.many.requests/.test(message)) {
      return true;
    }

    // サーバー側エラー（5xx）はリトライ
    if (status !== null && status >= 500 && status < 600) {
      return true;
    }

    // 一時的サービス不可はリトライ
    if (status === 502 || status === 503 || status === 504) {
      return true;
    }

    // その他はリトライしない
    return false;
  }

  /**
   * スリープ関数
   * @private
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 入力値のバリデーション (サポート対象チェーンのみ)
   * @private
   */
  private validateInput(address: string, chain: string, network?: string): void {
    // アドレスの基本検証
    if (!address || typeof address !== 'string' || address.trim().length === 0) {
      throw new Error('無効なアドレスが指定されました');
    }

    // チェーンの検証 (実装でサポートされているもののみ)
    const validChains = ['evm', 'btc', 'xrp'];
    if (!chain || !validChains.includes(chain.toLowerCase())) {
      throw new Error(`サポートされていないチェーンです: ${chain}. サポート対象: ${validChains.join(', ')}`);
    }

    // アドレス長の基本チェック
    const trimmedAddress = address.trim();
    if (trimmedAddress.length < 10 || trimmedAddress.length > 100) {
      throw new Error('アドレスの長さが無効です');
    }

    // 危険な文字の検証
    if (/[<>"';&|`]/.test(address) || /[<>"';&|`]/.test(chain)) {
      throw new Error('無効な文字が含まれています');
    }
  }

  /**
   * アセット、チェーン、ネットワークに基づいてcontractAddressを取得（マルチアセット対応）
   * @private
   */
  private getContractAddressForAsset(asset: string, chain: string, network: string): string {
    if (chain !== 'evm') {
      throw new Error(`Token subscriptions are only supported for EVM chains, got: ${chain}`);
    }

    // アセット別コントラクトアドレスマッピング
    const contractMapping: { [key: string]: { [key: string]: string } } = {
      'USDT': {
        'ethereum': process.env.VITE_USDT_CONTRACT_ADDRESS_ETH_MAINNET || '',
        'sepolia': process.env.VITE_USDT_CONTRACT_ADDRESS_ETH_SEPOLIA || '',
        'polygon': process.env.VITE_USDT_CONTRACT_ADDRESS_POLYGON || '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
        'bsc': process.env.VITE_USDT_CONTRACT_ADDRESS_BSC || '0x55d398326f99059fF775485246999027B3197955'
      },
      'USDC': {
        'ethereum': process.env.VITE_USDC_CONTRACT_ADDRESS_ETH_MAINNET || '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        'sepolia': process.env.VITE_USDC_CONTRACT_ADDRESS_ETH_SEPOLIA || '',
        'polygon': process.env.VITE_USDC_CONTRACT_ADDRESS_POLYGON || '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        'bsc': process.env.VITE_USDC_CONTRACT_ADDRESS_BSC || '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'
      },
      'DAI': {
        'ethereum': process.env.VITE_DAI_CONTRACT_ADDRESS_ETH_MAINNET || '0x6B175474E89094C44Da98b954EedeAC495271d0F',
        'sepolia': process.env.VITE_DAI_CONTRACT_ADDRESS_ETH_SEPOLIA || '',
        'polygon': process.env.VITE_DAI_CONTRACT_ADDRESS_POLYGON || '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063'
      }
    };

    const assetContracts = contractMapping[asset.toUpperCase()];
    if (!assetContracts) {
      throw new Error(
        `Unsupported asset: ${asset}. ` +
        `Supported assets: ${Object.keys(contractMapping).join(', ')}`
      );
    }

    const contractAddress = assetContracts[network];
    if (!contractAddress || contractAddress.trim() === '') {
      throw new Error(
        `Contract address not configured for asset ${asset} on network ${network}. ` +
        `Please set the appropriate environment variable (VITE_${asset}_CONTRACT_ADDRESS_${network.toUpperCase()}). ` +
        `Supported networks for ${asset}: ${Object.keys(assetContracts).join(', ')}`
      );
    }

    return contractAddress;
  }

  /**
   * エラーメッセージのサニタイゼーション
   * @private
   */
  private sanitizeErrorMessage(error: unknown): string {
    if (!error) return 'Unknown error';

    // 型安全なメッセージ取得
    let message: string;
    if (this.isErrorWithStatus(error) && error.message) {
      message = error.message;
    } else {
      message = error.toString();
    }

    // 内部パスの除去
    message = message.replace(/\/Users\/[^\s]*/g, '[PATH_REDACTED]');

    // 潜在的な機密情報の除去
    message = message.replace(/([?&])(api[kK]ey|token|secret|password)=[^&\s]*/g, '$1$2=[REDACTED]');

    // データベース接続情報の除去
    message = message.replace(/postgres:\/\/[^\s]*/g, 'postgres://[REDACTED]');

    return message;
  }

  /**
   * チェーンとネットワークに基づいてネイティブ資産名を取得
   * @private
   */
  private getNativeAssetName(chain: string, network: string): string {
    if (chain === 'evm') {
      if (network === 'polygon') {
        return 'MATIC';
      } else if (network === 'bsc') {
        return 'BNB';
      } else {
        // ethereum, sepolia 等
        return 'ETH';
      }
    } else if (chain === 'btc') {
      return 'BTC';
    } else if (chain === 'xrp') {
      return 'XRP';
    }

    // 未知のチェーンの場合はチェーン名をアッパーケースで返す
    return chain.toUpperCase();
  }

  /**
   * 既存のサブスクリプションからアセット情報を推定（マルチアセット対応）
   * @private
   */
  private inferAssetFromSubscription(sub: SubscriptionSummary, targetAddress: string, targetChain: string, targetNetwork: string, allSubscriptions: SubscriptionSummary[]): string | null {
    // 同一アドレス・チェーン・ネットワークのサブスクリプションのみ対象
    // 正規化してから比較を行う（Tatum APIは大文字のネットワーク名を返すことがあるため）
    const normalizedSubChain = sub.chain || 'unknown';
    const normalizedSubNetwork = (sub.network || 'unknown').toLowerCase();

    if ((sub.address || '').toLowerCase() !== targetAddress.toLowerCase() || normalizedSubChain !== targetChain || normalizedSubNetwork !== targetNetwork) {
      return null;
    }

    // サブスクリプションにcontractAddress情報がある場合（ERC-20トークン）
    if (sub.contractAddress) {
      // 包括的なコントラクトアドレス逆引きマッピング（キャッシュ機能付き）
      const knownContracts = this.getReverseContractMapping();

      const contractAddress = sub.contractAddress.toLowerCase();
      const knownAsset = knownContracts[contractAddress];

      if (knownAsset) {
        return knownAsset;
      }

      // 逆引きできない場合のフォールバック：chain_configから推定
      const fallbackAsset = this.inferAssetFromChainConfig(targetAddress, targetChain, targetNetwork, contractAddress);
      if (fallbackAsset) {
        return fallbackAsset;
      }

      // すべて失敗した場合は nullを返して新規サブスクリプション作成を回避
      logger.warn('アセット推定失敗', `コントラクトアドレス${contractAddress}のアセット推定不可`, targetChain, targetNetwork, {
        address: targetAddress,
        contractAddress: sub.contractAddress
      });
      return null;
    }

    // ネイティブトークンの場合
    if (sub.type === 'INCOMING_NATIVE_TX') {
      return this.getNativeAssetName(targetChain, targetNetwork);
    }

    // アドレスイベントの場合は契約アドレスの有無でアセットを推定
    if (sub.type === 'ADDRESS_EVENT') {
      if (sub.contractAddress) {
        // ERC-20トークンのADDRESS_EVENT（キャッシュ機能付き）
        const knownContracts = this.getReverseContractMapping();
        const contractAddress = sub.contractAddress.toLowerCase();
        const knownAsset = knownContracts[contractAddress];

        if (knownAsset) {
          return knownAsset;
        }

        // 逆引きできない場合のフォールバック：chain_configから推定
        const fallbackAsset = this.inferAssetFromChainConfig(targetAddress, targetChain, targetNetwork, contractAddress);
        if (fallbackAsset) {
          return fallbackAsset;
        }

        // すべて失敗した場合は null を返して新規サブスクリプション作成を回避
        logger.warn('ADDRESS_EVENTアセット推定失敗', `コントラクトアドレス${contractAddress}のアセット推定不可`, targetChain, targetNetwork, {
          address: targetAddress,
          contractAddress: sub.contractAddress
        });
        return null;
      } else {
        // contractAddressが無いADDRESS_EVENT - アセット非依存として扱う
        // 複数トークン対応：特定のトークンに紐付けず、共有リソースとして管理
        return 'SHARED_ADDRESS_EVENT';
      }
    }

    return null;
  }

  /**
   * 逆引きマッピングを取得（キャッシュ機能付き）
   * @private
   */
  private getReverseContractMapping(): { [address: string]: string } {
    if (!this.reverseContractMappingCache) {
      this.reverseContractMappingCache = this.buildReverseContractMapping();
    }
    return this.reverseContractMappingCache;
  }

  /**
   * 包括的なコントラクトアドレス逆引きマッピングを構築（最適化版）
   * @private
   */
  private buildReverseContractMapping(): { [address: string]: string } {
    const mapping: { [address: string]: string } = {};
    const assets = ['USDT', 'USDC', 'DAI'];
    const networks = ['ethereum', 'sepolia', 'polygon', 'bsc'];

    assets.forEach(asset => {
      networks.forEach(network => {
        try {
          // 環境変数未設定でもデフォルト値が利用できるように実際のアドレス値で判定
          const address = this.getContractAddressForAsset(asset, 'evm', network);
          if (address && address.trim() && address !== 'your_contract_address_here') {
            mapping[address.toLowerCase()] = asset;
          }
        } catch (error) {
          // サポートされていないアセット・ネットワーク組み合わせの場合はスキップ
          // 最適化: 例外処理でログ出力を控えめに
        }
      });
    });

    return mapping;
  }

  /**
   * 一般的なERC-20トークンアセット名を推定（フォールバック機能）
   * @private
   */
  private inferAssetFromChainConfig(address: string, chain: string, network: string, contractAddress: string): string | null {
    // ⚠️ 重大修正: 未知トークンはUSDTと区別して処理
    // 判定不能なコントラクトはnullを返し、実際のUSDTとキー衝突を回避

    logger.warn('アセット推定失敗', `コントラクトアドレス ${contractAddress} のアセット判定不能`, chain, network, {
      address,
      contractAddress,
      reason: 'unknown_contract_address',
      recommendation: '環境変数での明示的なコントラクト設定を検討してください'
    });

    // nullを返すことで、呼び出し側で「判定不能」として適切に処理される
    // これにより実際のUSDTサブスクリプションとキー衝突することがない
    return null;
  }

  /**
   * アセットとチェーンから期待されるサブスクリプションタイプのリストを取得
   * @private
   */
  private getExpectedSubscriptionTypes(asset: string, chain: string): string[] {
    if (chain === 'evm') {
      if (asset === 'ETH' || asset === 'MATIC' || asset === 'BNB') {
        // ネイティブトークンの場合は2つのサブスクリプション
        return ['INCOMING_NATIVE_TX', 'ADDRESS_EVENT'];
      } else {
        // ERC-20トークンの場合も2つのサブスクリプション
        return ['INCOMING_FUNGIBLE_TX', 'ADDRESS_EVENT'];
      }
    } else if (chain === 'btc' || chain === 'xrp') {
      // BTC, XRPの場合はアドレスイベントのみ
      return ['ADDRESS_EVENT'];
    }

    // 未知のチェーンの場合はアドレスイベントをデフォルト
    return ['ADDRESS_EVENT'];
  }

  /**
   * サブスクリプションタイプから推定されるアセットを取得
   * @private
   */
  private getAssetFromType(type: string, chain?: string): string {
    if (type === 'INCOMING_NATIVE_TX') {
      // チェーン別のネイティブアセット
      if (chain === 'evm') {
        return 'ETH'; // デフォルトはETH（ネットワーク別の詳細判定は別途必要に応じて）
      }
      return 'NATIVE';
    } else if (type === 'INCOMING_FUNGIBLE_TX') {
      // ERC-20等のトークン（具体的なアセット名は文脈から判定困難）
      return 'TOKEN';
    } else if (type === 'ADDRESS_EVENT') {
      // アドレスイベントは全アセット共通
      return 'ALL';
    }

    return 'UNKNOWN';
  }

  /**
   * サブスクリプションキー形式を生成（ADDRESS_EVENTアセット非依存対応）
   * @private
   */
  private generateSubscriptionKey(
    address: string,
    chain: string,
    network: string,
    asset: string,
    type: string
  ): string {
    const normalizedAddress = address.toLowerCase();
    const normalizedChain = chain.toLowerCase();

    if (type === 'ADDRESS_EVENT') {
      // ADDRESS_EVENTはアセット非依存として管理（複数トークン対応）
      return `${normalizedAddress}-${normalizedChain}-${network}-ADDRESS_EVENT`;
    } else {
      // その他のサブスクリプションはアセット固有として管理
      return `${normalizedAddress}-${normalizedChain}-${network}-${asset}-${type}`;
    }
  }

  /**
   * 手動サブスクリプション作成 (強化ログ付き)
   */
  async createSubscription(
    address: string,
    chain: string,
    network?: string,
    asset?: string
  ): Promise<void> {
    const operationId = logger.startOperation('createSubscription', chain, network, {
      address,
      chain,
      network,
      asset
    });
    const startTime = Date.now();

    try {
      // 入力値の検証
      this.validateInput(address, chain, network);

      // デフォルト値の計算と正規化（同期処理と統一）
      const resolvedChain = chain.toLowerCase();
      const resolvedNetwork = (network || this.getDefaultNetwork(resolvedChain)).toLowerCase();
      const resolvedAsset = (asset || this.getDefaultAsset(resolvedChain)).toUpperCase();

      logger.log('info', `使用するパラメータ`, {
        operationId,
        address,
        chain: resolvedChain,
        resolvedNetwork,
        resolvedAsset
      });

      // アドレスの存在確認
      const addressExists = await this.supabaseClient.checkAddressExists(address, resolvedChain, resolvedNetwork);

      if (!addressExists) {
        logger.warn('createSubscription', `アドレス ${address} はdeposit_addressesに存在しません`, resolvedChain, resolvedNetwork, {
          operationId,
          address,
          requiresConfirmation: true
        });

        // 非対話環境、バッチモード、または厳格モードでは即座にエラーで終了
        const isStrictMode = process.env.STRICT_MODE === 'true';
        const isBatchMode = process.env.BATCH_MODE === 'true';
        const isNonInteractive =
          !process.stdin.isTTY ||
          process.env.CI === 'true' ||
          process.env.NON_INTERACTIVE === 'true';

        if (isStrictMode || isNonInteractive || isBatchMode) {
          const modeReason = isStrictMode
            ? 'STRICT_MODE'
            : isNonInteractive
              ? '非対話環境'
              : 'バッチモード';
          const errorMessage = `アドレス ${address} がdeposit_addressesに存在しないため、${modeReason}により処理を中止します`;
          logger.error('createSubscription', errorMessage, operationId, resolvedChain, resolvedNetwork);
          throw new Error(errorMessage);
        }

        const shouldContinue = await this.promptUserConfirmation('続行しますか? (y/N)');
        if (!shouldContinue) {
          logger.log('info', 'ユーザーによってキャンセルされました', {
            operationId,
            reason: 'user_cancelled'
          });
          return;
        }
      }

      // サブスクリプション作成
      // 既存のサブスクリプションを取得して不足タイプのみを特定
      const existingSubscriptions = await this.tatumClient.getAllSubscriptions();
      const subscribedKeys = new Set(
        existingSubscriptions
          .filter(sub => sub.address)
          .map(sub => {
            const chain = sub.chain || 'unknown';
            const network = (sub.network || 'unknown').toLowerCase();
            const inferredAsset = this.inferAssetFromSubscription(sub, sub.address!, chain, network, existingSubscriptions) || 'UNKNOWN';
            return this.generateSubscriptionKey(sub.address!, chain, network, inferredAsset, sub.type);
          })
      );

      const missingTypes = await this.getMissingSubscriptionTypes(
        address,
        resolvedChain,
        resolvedNetwork,
        resolvedAsset,
        subscribedKeys
      );

      // 不足がない場合は処理をスキップ
      if (missingTypes.length === 0) {
        console.log(`ℹ️ サブスクリプション作成スキップ: ${address} [${resolvedChain}/${resolvedNetwork}/${resolvedAsset}] - 全て存在済み`);
        logger.success('createSubscription', operationId, Date.now() - startTime, resolvedChain, resolvedNetwork, {
          address,
          asset: resolvedAsset,
          skipped: true,
          reason: 'already_exists'
        });
        return;
      }

      await this.createSubscriptionForAddress(address, resolvedChain, resolvedNetwork, resolvedAsset, missingTypes, subscribedKeys);

      const duration = Date.now() - startTime;
      logger.success('createSubscription', operationId, duration, resolvedChain, resolvedNetwork, {
        address,
        asset: resolvedAsset,
        addressExisted: addressExists
      });
    } catch (error) {
      logger.error('createSubscription', error, operationId, chain, network);
      throw new Error(`サブスクリプション作成に失敗しました: ${this.sanitizeErrorMessage(error)}`);
    }
  }

  /**
   * サブスクリプション削除 (強化ログ付き)
   */
  async deleteSubscription(subscriptionId: string): Promise<void> {
    const operationId = logger.startOperation('deleteSubscription', undefined, undefined, {
      subscriptionId
    });
    const startTime = Date.now();

    const retryableOperation: RetryableOperation = {
      maxRetries: this.defaultRetryConfig.maxRetries,
      baseDelay: this.defaultRetryConfig.baseDelay,
      operation: () => this.tatumClient.unsubscribe(subscriptionId),
      operationName: `サブスクリプション削除 (${subscriptionId})`
    };

    try {
      await this.executeWithRetry(retryableOperation);
      const duration = Date.now() - startTime;
      logger.success('deleteSubscription', operationId, duration, undefined, undefined, {
        subscriptionId
      });
    } catch (error) {
      logger.error('deleteSubscription', error, operationId, undefined, undefined);
      throw error;
    }
  }

  /**
   * サブスクリプション状態とWebhook履歴の確認 (強化ログ付き)
   */
  async checkStatus(): Promise<void> {
    const operationId = logger.startOperation('checkStatus');
    const startTime = Date.now();

    try {
      logger.log('info', 'サブスクリプション状態を確認中...', { operationId });

      // 1. Supabase統計
      const stats = await this.supabaseClient.getDepositAddressStats();
      logger.log('info', 'Supabase deposit_addresses 統計', {
        operationId,
        stats: {
          total: stats.total,
          active: stats.active,
          byChain: stats.byChain,
          byNetwork: stats.byNetwork
        }
      });

      // 2. Tatumサブスクリプション統計
      const subscriptions = await this.tatumClient.getAllSubscriptions();
      const byType: { [key: string]: number } = {};
      subscriptions.forEach(sub => {
        byType[sub.type] = (byType[sub.type] || 0) + 1;
      });

      logger.log('info', 'Tatum サブスクリプション統計', {
        operationId,
        subscriptions: {
          total: subscriptions.length,
          byType
        }
      });

      // 3. Webhook履歴 (最新10件)
      interface WebhookRecord {
        timestamp?: number;
        type?: string;
        failed?: boolean;
        response?: unknown;
      }

      const webhooks = await this.tatumClient.getExecutedWebhooks();
      const recentWebhooks = webhooks.slice(0, 10);
      const failedWebhooks = recentWebhooks.filter((w: WebhookRecord) => w?.failed);

      logger.log('info', '最新のWebhook実行履歴', {
        operationId,
        webhooks: {
          total: webhooks.length,
          recent: recentWebhooks.length,
          failed: failedWebhooks.length,
          recentWebhooks: recentWebhooks.map((w: WebhookRecord) => ({
            timestamp: w?.timestamp ? new Date(w.timestamp * 1000).toISOString() : 'N/A',
            type: w?.type || 'unknown',
            failed: Boolean(w?.failed),
            error: w?.failed ? w.response : undefined
          }))
        }
      });

      // 4. 同期状態分析（修正版: 実際のdeposit_addressesレコードとの1対1突合）
      // 実際のアクティブなdeposit_addressesレコードを取得
      const activeDepositAddresses = await this.supabaseClient.getActiveDepositAddresses();

      // 各deposit_addressレコードに対してサブスクリプションの有無を確認
      const expectedSubscriptionKeys = new Set<string>();
      const missingSubscriptionItems: Array<{address: string, chain: string, network: string, asset: string}> = [];

      for (const addr of activeDepositAddresses) {
        // asset正規化（syncSubscriptionsと同じロジック）
        // ネイティブ資産（null）の場合はgetNativeAssetNameで補完
        const normalizedNetwork = addr.network.toLowerCase();
        const normalizedAsset = (addr.asset || this.getNativeAssetName(addr.chain, normalizedNetwork)).toUpperCase();

        // アセットごとの期待サブスクリプションタイプを取得
        const expectedTypes = this.getExpectedSubscriptionTypes(normalizedAsset, addr.chain);

        for (const expectedType of expectedTypes) {
          const subscriptionKey = this.generateSubscriptionKey(addr.address, addr.chain, normalizedNetwork, normalizedAsset, expectedType);
          expectedSubscriptionKeys.add(subscriptionKey);

          // サブスクリプションが存在しない場合は不足リストに追加
          const hasSubscription = subscriptions.some(sub => {
            // 基本条件チェック（ネットワーク比較も正規化）
            const basicMatch = sub.address?.toLowerCase() === addr.address.toLowerCase() &&
              sub.chain === addr.chain &&
              (sub.network || 'unknown').toLowerCase() === normalizedNetwork &&
              sub.type === expectedType;

            if (!basicMatch) return false;

            // サブスクリプションタイプ別のコントラクトアドレス判定
            if (expectedType === 'ADDRESS_EVENT' || expectedType === 'INCOMING_NATIVE_TX') {
              // ネイティブ系はコントラクトアドレス比較不要
              return true;
            } else if (expectedType === 'INCOMING_FUNGIBLE_TX') {
              // トークン系は大文字小文字統一してコントラクトアドレス比較
              try {
                const expectedContract = this.getContractAddressForAsset(normalizedAsset, addr.chain, normalizedNetwork);
                return sub.contractAddress?.toLowerCase() === expectedContract.toLowerCase();
              } catch (error) {
                // getContractAddressForAsset失敗時はfalse（サポートされていないアセット）
                return false;
              }
            }

            return false;
          });

          if (!hasSubscription) {
            missingSubscriptionItems.push({
              address: addr.address,
              chain: addr.chain,
              network: normalizedNetwork,
              asset: normalizedAsset
            });
          }
        }
      }

      // 正確な同期状況計算
      const totalExpectedSubscriptions = expectedSubscriptionKeys.size;
      const actualSubscriptions = subscriptions.length;
      const missingCount = missingSubscriptionItems.length;
      const syncStatus = {
        activeAddresses: activeDepositAddresses.length,  // 実際のアクティブアドレス数
        expectedSubscriptions: totalExpectedSubscriptions,  // 期待サブスクリプション数（アセット考慮）
        actualSubscriptions: actualSubscriptions,  // 実際のサブスクリプション数
        missingSubscriptions: missingCount,  // 不足サブスクリプション数
        unsubscribedItems: missingSubscriptionItems.length,  // 未同期アイテム数
        isFullySynced: missingCount === 0,  // 完全同期判定
        syncPercentage: totalExpectedSubscriptions > 0 ? Math.round((actualSubscriptions / totalExpectedSubscriptions) * 100) : 100
      };

      if (missingCount > 0) {
        logger.warn('checkStatus', `${missingCount} 件のサブスクリプションが不足しています（アセット別集計）`, undefined, undefined, {
          operationId,
          syncStatus,
          missingItems: missingSubscriptionItems.slice(0, 5),  // 最初の5件を表示
          recommendation: 'syncコマンドで同期することをお勧めします'
        });
      } else {
        logger.log('info', '全てのアクティブアドレスがサブスクリプションされています', {
          operationId,
          syncStatus
        });
      }

      const duration = Date.now() - startTime;
      logger.success('checkStatus', operationId, duration, undefined, undefined, {
        supabaseStats: stats,
        tatumStats: { total: subscriptions.length, byType },
        webhookStats: { total: webhooks.length, failed: failedWebhooks.length },
        syncStatus
      });

    } catch (error) {
      logger.error('checkStatus', error, operationId);
      throw new Error(`状態確認に失敗しました: ${this.sanitizeErrorMessage(error)}`);
    }
  }

  /**
   * システムヘルスチェック実行
   */
  async performHealthCheck(): Promise<{status: 'healthy' | 'degraded' | 'unhealthy', details: Record<string, unknown>}> {
    const operationId = logger.startOperation('performHealthCheck');
    const startTime = Date.now();

    try {
      const healthResult = await logger.performHealthCheck(this.tatumClient, this.supabaseClient);

      const duration = Date.now() - startTime;
      logger.success('performHealthCheck', operationId, duration, undefined, undefined, {
        status: healthResult.status,
        summary: healthResult.details.summary
      });

      return healthResult;
    } catch (error) {
      logger.error('performHealthCheck', error, operationId);
      return {
        status: 'unhealthy',
        details: {
          timestamp: new Date().toISOString(),
          error: this.sanitizeErrorMessage(error)
        }
      };
    }
  }

  /**
   * システムメトリクス取得
   */
  getSystemMetrics() {
    return logger.getSystemMetrics();
  }

  /**
   * メトリクス履歴取得
   */
  getMetricsHistory(operation?: string, chain?: string, network?: string, hours?: number) {
    return logger.getMetricsHistory(operation, chain, network, hours);
  }

}