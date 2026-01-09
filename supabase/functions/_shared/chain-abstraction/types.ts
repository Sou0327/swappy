/**
 * Chain Abstraction Layer - Common Type Definitions
 *
 * このファイルは全ブロックチェーンチェーンに共通する型定義を提供します。
 */

/**
 * サポートされているブロックチェーンチェーン
 */
export type ChainType = 'evm' | 'btc' | 'ada' | 'trc' | 'xrp';

/**
 * ネットワークタイプ
 */
export type NetworkType =
  | 'ethereum'     // EVMメインネット
  | 'sepolia'      // EVMテストネット
  | 'polygon'      // Polygon
  | 'arbitrum'     // Arbitrum
  | 'mainnet'      // Bitcoin/Cardano/Tron/Rippleメインネット
  | 'testnet';     // テストネット

/**
 * トランザクション構築パラメータ
 */
export interface BuildTxParams {
  /** チェーンタイプ */
  chain: ChainType;

  /** ネットワーク */
  network: NetworkType;

  /** アセット（ETH, BTC, ADA, TRX, XRP等） */
  asset: string;

  /** 送信元アドレス */
  fromAddress: string;

  /** 送信先アドレス */
  toAddress: string;

  /** 残高（最小単位: wei, satoshi, lovelace等） */
  balance: bigint;

  /** デポジットインデックス（オプション） */
  depositIndex?: number;

  /** チェーン固有の追加パラメータ */
  chainSpecific?: Record<string, unknown>;
}

/**
 * Unsigned Transaction型
 * 各チェーンで異なるフォーマットを持つため、anyを使用
 */
export interface UnsignedTx {
  /** チェーンタイプ */
  chain: ChainType;

  /** トランザクションデータ（チェーン固有） */
  data: unknown;

  /** 推定手数料（最小単位） */
  estimatedFee: string;

  /** メタデータ（オプション） */
  metadata?: {
    /** 送信予定金額（手数料差引前） */
    amount: string;

    /** 送信予定金額（手数料差引後） */
    amountAfterFee: string;

    /** 追加情報 */
    [key: string]: unknown;
  };
}

/**
 * チェーン別トランザクションビルダーインターフェース
 *
 * 全てのチェーン実装がこのインターフェースを実装する必要があります。
 */
export interface ChainTxBuilder {
  /**
   * Unsigned Transactionを構築
   *
   * @param params トランザクション構築パラメータ
   * @returns Unsigned Transaction
   * @throws {InsufficientBalanceError} 残高不足の場合
   * @throws {InvalidAddressError} アドレスが無効の場合
   * @throws {RpcError} RPC呼び出しエラーの場合
   */
  buildUnsignedTx(params: BuildTxParams): Promise<UnsignedTx>;

  /**
   * トランザクション手数料を推定
   *
   * @param params トランザクション構築パラメータ
   * @returns 推定手数料（最小単位）
   * @throws {RpcError} RPC呼び出しエラーの場合
   */
  estimateFee(params: BuildTxParams): Promise<bigint>;

  /**
   * アドレスの妥当性を検証
   *
   * @param address 検証するアドレス
   * @returns 有効な場合true
   */
  validateAddress(address: string): boolean;

  /**
   * 署名済みトランザクションをブロックチェーンにブロードキャスト
   *
   * @param params ブロードキャストパラメータ
   * @returns ブロードキャスト結果（トランザクションハッシュ等）
   * @throws {RpcError} ブロードキャストエラーの場合
   */
  broadcastTx(params: BroadcastParams): Promise<BroadcastResult>;
}

/**
 * ブロードキャストパラメータ
 */
export interface BroadcastParams {
  /** チェーンタイプ */
  chain: ChainType;

  /** ネットワーク */
  network: NetworkType;

  /** 署名済みトランザクション */
  signedTx: string;
}

/**
 * ブロードキャスト結果
 */
export interface BroadcastResult {
  /** トランザクションハッシュ */
  transactionHash: string;

  /** チェーンタイプ */
  chain: ChainType;

  /** ネットワーク */
  network: NetworkType;

  /** 追加情報（オプション） */
  metadata?: Record<string, unknown>;
}
