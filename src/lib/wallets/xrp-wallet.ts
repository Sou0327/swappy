import { 
  Client, 
  Wallet as XRPLWallet, 
  dropsToXrp, 
  xrpToDrops, 
  Payment,
  TxResponse,
  AccountInfoResponse,
  AccountLinesResponse,
  SubmitResponse,
  isValidAddress
} from 'xrpl';
import { AuditLogger, AuditAction } from '../security/audit-logger';
import { FinancialEncryption } from '../security/encryption';

/**
 * XRPアカウント情報
 */
export interface XRPAccountInfo {
  address: string;
  balance: string; // XRP単位
  sequence: number;
  ownerCount: number;
  reserve: string; // 準備金（XRP単位）
  flags: number;
  previousTxnID?: string;
  previousTxnLgrSeq?: number;
}

/**
 * XRP送金パラメータ
 */
export interface XRPPaymentParams {
  fromAddress: string;
  toAddress: string;
  amount: string; // XRP単位
  destinationTag?: number;
  memos?: string[];
  fee?: string; // XRP単位（指定しない場合は自動計算）
}

/**
 * XRPトランザクション結果
 */
export interface XRPTransactionResult {
  hash: string;
  result: string;
  ledgerIndex: number;
  fee: string; // drops単位
  validated: boolean;
  timestamp?: string;
  meta?: Record<string, unknown>;
}

/**
 * XRPトークン（IOU）情報
 */
export interface XRPToken {
  currency: string;
  issuer: string;
  balance: string;
  limit?: string;
  quality_in?: number;
  quality_out?: number;
}

/**
 * XRPネットワーク設定
 */
export interface XRPNetworkConfig {
  name: string;
  server: string;
  isTestnet: boolean;
  nativeCurrency: string;
  explorerUrl: string;
}

/**
 * XRPネットワーク定義
 */
export const XRP_NETWORKS: Record<string, XRPNetworkConfig> = {
  mainnet: {
    name: 'XRP Ledger Mainnet',
    server: 'wss://xrplcluster.com',
    isTestnet: false,
    nativeCurrency: 'XRP',
    explorerUrl: 'https://xrpscan.com'
  },
  testnet: {
    name: 'XRP Ledger Testnet',
    server: 'wss://s.altnet.rippletest.net:51233',
    isTestnet: true,
    nativeCurrency: 'XRP',
    explorerUrl: 'https://testnet.xrpl.org'
  },
  devnet: {
    name: 'XRP Ledger Devnet',
    server: 'wss://s.devnet.rippletest.net:51233',
    isTestnet: true,
    nativeCurrency: 'XRP',
    explorerUrl: 'https://devnet.xrpl.org'
  }
};

/**
 * 金融グレードXRP Walletマネージャー
 */
export class XRPWalletManager {
  private client: Client;
  private network: string;
  private networkConfig: XRPNetworkConfig;
  private isConnected: boolean = false;

  constructor(network: string = 'mainnet') {
    this.network = network;
    this.networkConfig = XRP_NETWORKS[network];
    
    if (!this.networkConfig) {
      throw new Error(`サポートされていないネットワーク: ${network}`);
    }

    this.client = new Client(this.networkConfig.server);
  }

  /**
   * XRPLクライアントに接続
   */
  async connect(): Promise<void> {
    try {
      if (!this.isConnected) {
        await this.client.connect();
        this.isConnected = true;
      }
    } catch (error) {
      throw new Error(`XRPL接続に失敗: ${error.message}`);
    }
  }

  /**
   * XRPLクライアントから切断
   */
  async disconnect(): Promise<void> {
    try {
      if (this.isConnected) {
        await this.client.disconnect();
        this.isConnected = false;
      }
    } catch (error) {
      console.warn('XRPL切断エラー:', error);
    }
  }

  /**
   * セキュアなXRPウォレット生成
   */
  static async generateSecureWallet(
    userId: string,
    network: string = 'mainnet'
  ): Promise<{
    address: string;
    publicKey: string;
    privateKey: string; // 暗号化された状態
    seed: string; // 暗号化された状態
  }> {
    try {
      // セキュアなウォレット生成
      const wallet = XRPLWallet.generate();

      // 監査ログ記録
      await AuditLogger.log(
        AuditAction.WALLET_CREATE,
        'xrp_wallet',
        {
          address: wallet.address,
          network,
          publicKey: wallet.publicKey
        },
        { userId, riskLevel: 'high' }
      );

      // 秘密情報を暗号化
      const masterPassword = process.env.WALLET_MASTER_PASSWORD;
      if (!masterPassword) {
        throw new Error('WALLET_MASTER_PASSWORD environment variable is required');
      }

      const encryptedPrivateKey = await FinancialEncryption.encrypt(
        wallet.privateKey,
        masterPassword
      );

      const encryptedSeed = await FinancialEncryption.encrypt(
        wallet.seed!,
        masterPassword
      );

      return {
        address: wallet.address,
        publicKey: wallet.publicKey,
        privateKey: JSON.stringify(encryptedPrivateKey),
        seed: JSON.stringify(encryptedSeed)
      };

    } catch (error) {
      throw new Error(`XRPウォレット生成に失敗: ${error.message}`);
    }
  }

  /**
   * 暗号化されたシードからウォレットを復元
   */
  static async restoreWalletFromSeed(
    encryptedSeed: string,
    userId: string
  ): Promise<XRPLWallet> {
    try {
      // シードを復号化
      const masterPassword = process.env.WALLET_MASTER_PASSWORD;
      if (!masterPassword) {
        throw new Error('WALLET_MASTER_PASSWORD environment variable is required');
      }

      const encryptedData = JSON.parse(encryptedSeed);
      const seed = await FinancialEncryption.decrypt(
        encryptedData,
        masterPassword
      );

      // ウォレットを復元
      const wallet = XRPLWallet.fromSeed(seed);

      // 監査ログ記録
      await AuditLogger.log(
        AuditAction.WALLET_CREATE, // WALLET_RESTORE が存在しないため WALLET_CREATE を使用
        'xrp_wallet',
        {
          address: wallet.address,
          publicKey: wallet.publicKey
        },
        { userId, riskLevel: 'high' }
      );

      return wallet;

    } catch (error) {
      throw new Error(`XRPウォレット復元に失敗: ${error.message}`);
    }
  }

  /**
   * アカウント情報を取得
   */
  async getAccountInfo(address: string): Promise<XRPAccountInfo> {
    await this.connect();

    try {
      const response: AccountInfoResponse = await this.client.request({
        command: 'account_info',
        account: address,
        ledger_index: 'validated'
      });

      const accountData = response.result.account_data;

      return {
        address: accountData.Account,
        balance: String(dropsToXrp(String(accountData.Balance))),
        sequence: accountData.Sequence,
        ownerCount: accountData.OwnerCount,
        reserve: String(dropsToXrp(String(accountData.OwnerCount * 2000000 + 10000000))), // 基本準備金計算
        flags: accountData.Flags,
        previousTxnID: accountData.PreviousTxnID,
        previousTxnLgrSeq: accountData.PreviousTxnLgrSeq
      };

    } catch (error) {
      if (error.data?.error === 'actNotFound') {
        throw new Error('アカウントが見つかりません（未アクティベート）');
      }
      throw new Error(`アカウント情報取得に失敗: ${error.message}`);
    }
  }

  /**
   * アカウントの残高を取得
   */
  async getBalance(address: string): Promise<string> {
    const accountInfo = await this.getAccountInfo(address);
    return accountInfo.balance;
  }

  /**
   * トークン残高を取得
   */
  async getTokenBalances(address: string): Promise<XRPToken[]> {
    await this.connect();

    try {
      const response: AccountLinesResponse = await this.client.request({
        command: 'account_lines',
        account: address,
        ledger_index: 'validated'
      });

      return response.result.lines.map(line => ({
        currency: line.currency,
        issuer: line.account,
        balance: line.balance,
        limit: line.limit,
        quality_in: line.quality_in,
        quality_out: line.quality_out
      }));

    } catch (error) {
      throw new Error(`トークン残高取得に失敗: ${error.message}`);
    }
  }

  /**
   * XRP送金
   */
  async sendXRP(
    wallet: XRPLWallet,
    params: XRPPaymentParams,
    userId?: string
  ): Promise<XRPTransactionResult> {
    await this.connect();

    try {
      // アドレス妥当性チェック
      if (!isValidAddress(params.toAddress)) {
        throw new Error('無効な送金先アドレス');
      }

      // 金額妥当性チェック
      const amountDrops = xrpToDrops(params.amount);
      if (parseInt(amountDrops) <= 0) {
        throw new Error('送金額は正の値である必要があります');
      }

      // 最小送金額チェック（1 drop = 0.000001 XRP）
      if (parseInt(amountDrops) < 1) {
        throw new Error('送金額が最小値を下回っています');
      }

      // 送金者の残高チェック
      const senderBalance = await this.getBalance(params.fromAddress);
      const requiredAmount = parseFloat(params.amount) + 0.000012; // 手数料込み
      
      if (parseFloat(senderBalance) < requiredAmount) {
        throw new Error('残高が不足しています');
      }

      // Payment トランザクション作成
      const payment: Payment = {
        TransactionType: 'Payment',
        Account: params.fromAddress,
        Destination: params.toAddress,
        Amount: amountDrops,
        Fee: params.fee ? xrpToDrops(params.fee) : undefined,
        DestinationTag: params.destinationTag,
        Memos: params.memos ? params.memos.map(memo => ({
          Memo: {
            MemoData: Buffer.from(memo, 'utf8').toString('hex').toUpperCase()
          }
        })) : undefined
      };

      // トランザクション準備（手数料自動計算・シーケンス番号設定）
      const prepared = await this.client.autofill(payment);

      // トランザクション署名
      const signed = wallet.sign(prepared);

      // 監査ログ記録（送信前）
      if (userId) {
        await AuditLogger.log(
          AuditAction.WALLET_CREATE, // TRANSACTION_SIGN が存在しないため WALLET_CREATE を使用
          'xrp_wallet',
          {
            fromAddress: params.fromAddress,
            toAddress: params.toAddress,
            amount: params.amount,
            fee: dropsToXrp(prepared.Fee || '0'),
            hash: signed.hash
          },
          { userId, riskLevel: 'high' }
        );
      }

      // トランザクション送信
      const response: SubmitResponse = await this.client.submit(signed.tx_blob);

      // 結果検証
      if (response.result.engine_result !== 'tesSUCCESS') {
        throw new Error(`トランザクション失敗: ${response.result.engine_result_message}`);
      }

      // 監査ログ記録（送信後）
      if (userId) {
        await AuditLogger.log(
          AuditAction.WALLET_CREATE, // TRANSACTION_SUBMIT が存在しないため WALLET_CREATE を使用
          'xrp_wallet',
          {
            hash: signed.hash,
            result: response.result.engine_result,
            ledgerIndex: response.result.tx_json.inLedger
          },
          { userId, riskLevel: 'high' }
        );
      }

      return {
        hash: signed.hash,
        result: response.result.engine_result,
        ledgerIndex: Number(response.result.tx_json.inLedger) || 0,
        fee: prepared.Fee || '0',
        validated: false, // 最初はfalse、後で検証
        meta: undefined // meta プロパティが存在しないため undefined を設定
      };

    } catch (error) {
      throw new Error(`XRP送金に失敗: ${error.message}`);
    }
  }

  /**
   * トランザクション状態を確認
   */
  async getTransactionStatus(txHash: string): Promise<{
    validated: boolean;
    ledgerIndex?: number;
    result?: string;
    meta?: Record<string, unknown>;
  }> {
    await this.connect();

    try {
      const response: TxResponse = await this.client.request({
        command: 'tx',
        transaction: txHash
      });

      return {
        validated: response.result.validated || false,
        ledgerIndex: response.result.ledger_index,
        result: typeof response.result.meta === 'object' && response.result.meta && 'TransactionResult' in response.result.meta ? String(response.result.meta.TransactionResult) : undefined,
        meta: typeof response.result.meta === 'object' ? response.result.meta as unknown as Record<string, unknown> : undefined
      };

    } catch (error) {
      if (error.data?.error === 'txnNotFound') {
        return { validated: false };
      }
      throw new Error(`トランザクション状態確認に失敗: ${error.message}`);
    }
  }

  /**
   * アカウントのトランザクション履歴を取得
   */
  async getTransactionHistory(
    address: string,
    limit: number = 20,
    marker?: unknown
  ): Promise<{
    transactions: Array<Record<string, unknown>>;
    marker?: unknown;
  }> {
    await this.connect();

    try {
      const response = await this.client.request({
        command: 'account_tx',
        account: address,
        limit,
        marker,
        ledger_index_min: -1,
        ledger_index_max: -1,
        binary: false,
        forward: false
      });

      return {
        transactions: response.result.transactions as unknown as Array<Record<string, unknown>>,
        marker: response.result.marker
      };

    } catch (error) {
      throw new Error(`トランザクション履歴取得に失敗: ${error.message}`);
    }
  }

  /**
   * XRPアドレス妥当性チェック
   */
  static validateXRPAddress(address: string): boolean {
    try {
      return isValidAddress(address);
    } catch {
      return false;
    }
  }

  /**
   * XRP金額フォーマット
   */
  static formatXRPAmount(amount: string | number): string {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return numAmount.toFixed(6); // XRPは6桁小数点
  }

  /**
   * Drops（最小単位）をXRPに変換
   */
  static dropsToXRP(drops: string | number): string {
    return String(dropsToXrp(String(drops)));
  }

  /**
   * XRPをDrops（最小単位）に変換
   */
  static xrpToDrops(xrp: string | number): string {
    return xrpToDrops(String(xrp));
  }

  /**
   * アカウントのアクティベーション状態チェック
   */
  async isAccountActivated(address: string): Promise<boolean> {
    try {
      await this.getAccountInfo(address);
      return true;
    } catch (error) {
      if (error.message.includes('未アクティベート')) {
        return false;
      }
      throw error;
    }
  }

  /**
   * テストネット用XRP取得（Testnetのみ）
   */
  async fundTestnetAccount(address: string): Promise<void> {
    if (!this.networkConfig.isTestnet) {
      throw new Error('この機能はTestnetでのみ利用可能です');
    }

    await this.connect();

    try {
      // TestnetのFaucetを使用してXRPを取得
      await this.client.fundWallet(null, { faucetHost: 'faucet.altnet.rippletest.net' });
    } catch (error) {
      throw new Error(`テストネットXRP取得に失敗: ${error.message}`);
    }
  }

  /**
   * ネットワーク情報を取得
   */
  getNetworkInfo(): XRPNetworkConfig {
    return { ...this.networkConfig };
  }

  /**
   * 手数料推定
   */
  async estimateFee(): Promise<string> {
    await this.connect();

    try {
      const response = await this.client.request({
        command: 'server_info'
      });

      // 基本手数料を取得（通常は12 drops）
      const baseFee = response.result.info.validated_ledger?.base_fee_xrp || '0.000012';
      return String(baseFee);

    } catch (error) {
      // デフォルト手数料を返す
      return '0.000012';
    }
  }

  /**
   * レジャー情報を取得
   */
  async getLedgerInfo(): Promise<{
    ledgerIndex: number;
    ledgerHash: string;
    closeTime: number;
    totalCoins: string;
  }> {
    await this.connect();

    try {
      const response = await this.client.request({
        command: 'ledger',
        ledger_index: 'validated',
        full: false
      });

      const ledger = response.result.ledger;

      return {
        ledgerIndex: ledger.ledger_index,
        ledgerHash: ledger.ledger_hash,
        closeTime: ledger.close_time,
        totalCoins: String(dropsToXrp(ledger.total_coins))
      };

    } catch (error) {
      throw new Error(`レジャー情報取得に失敗: ${error.message}`);
    }
  }

  /**
   * 接続状態を確認
   */
  isClientConnected(): boolean {
    return this.isConnected && this.client.isConnected();
  }

  /**
   * クライアントの健康状態チェック
   */
  async healthCheck(): Promise<{
    connected: boolean;
    network: string;
    ledgerIndex?: number;
    serverVersion?: string;
  }> {
    try {
      await this.connect();
      
      const serverInfo = await this.client.request({
        command: 'server_info'
      });

      return {
        connected: this.isClientConnected(),
        network: this.network,
        ledgerIndex: serverInfo.result.info.validated_ledger?.seq,
        serverVersion: serverInfo.result.info.build_version
      };

    } catch (error) {
      return {
        connected: false,
        network: this.network
      };
    }
  }
}