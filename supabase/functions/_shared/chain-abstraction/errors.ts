/**
 * Chain Abstraction Layer - Common Error Classes
 *
 * このファイルはチェーン抽象化レイヤーで使用される共通エラークラスを定義します。
 */

import type { ChainType } from './types.ts';

/**
 * チェーン抽象化レイヤーのベースエラー
 */
export class ChainAbstractionError extends Error {
  constructor(
    message: string,
    public chain?: ChainType,
    public code?: string,
  ) {
    super(message);
    this.name = 'ChainAbstractionError';
  }
}

/**
 * 残高不足エラー
 */
export class InsufficientBalanceError extends ChainAbstractionError {
  constructor(
    chain: ChainType,
    public required: bigint,
    public available: bigint,
  ) {
    super(
      `Insufficient balance on ${chain}: required ${required}, available ${available}`,
      chain,
      'INSUFFICIENT_BALANCE',
    );
    this.name = 'InsufficientBalanceError';
  }
}

/**
 * 無効なアドレスエラー
 */
export class InvalidAddressError extends ChainAbstractionError {
  constructor(
    chain: ChainType,
    public address: string,
  ) {
    super(
      `Invalid address for ${chain}: ${address}`,
      chain,
      'INVALID_ADDRESS',
    );
    this.name = 'InvalidAddressError';
  }
}

/**
 * RPC/API呼び出しエラー
 */
export class RpcError extends ChainAbstractionError {
  constructor(
    chain: ChainType,
    public endpoint: string,
    public originalError: Error,
  ) {
    super(
      `RPC error for ${chain} at ${endpoint}: ${originalError.message}`,
      chain,
      'RPC_ERROR',
    );
    this.name = 'RpcError';
  }
}

/**
 * サポートされていないチェーンエラー
 */
export class UnsupportedChainError extends ChainAbstractionError {
  constructor(chain: string) {
    super(
      `Unsupported chain: ${chain}`,
      undefined,
      'UNSUPPORTED_CHAIN',
    );
    this.name = 'UnsupportedChainError';
  }
}

/**
 * トランザクション構築エラー
 */
export class TxBuildError extends ChainAbstractionError {
  constructor(
    chain: ChainType,
    message: string,
    public originalError?: Error,
  ) {
    super(
      `Transaction build error for ${chain}: ${message}`,
      chain,
      'TX_BUILD_ERROR',
    );
    this.name = 'TxBuildError';
  }
}

/**
 * ブロードキャストエラー
 */
export class BroadcastError extends ChainAbstractionError {
  constructor(
    chain: ChainType,
    message: string,
    public originalError?: Error,
  ) {
    super(
      `Broadcast error for ${chain}: ${message}`,
      chain,
      'BROADCAST_ERROR',
    );
    this.name = 'BroadcastError';
  }
}

/**
 * 手数料推定エラー
 */
export class FeeEstimationError extends ChainAbstractionError {
  constructor(
    chain: ChainType,
    message: string,
  ) {
    super(
      `Fee estimation error for ${chain}: ${message}`,
      chain,
      'FEE_ESTIMATION_ERROR',
    );
    this.name = 'FeeEstimationError';
  }
}

/**
 * UTXO選択エラー（Bitcoin, Cardano用）
 */
export class UtxoSelectionError extends ChainAbstractionError {
  constructor(
    chain: ChainType,
    message: string,
  ) {
    super(
      `UTXO selection error for ${chain}: ${message}`,
      chain,
      'UTXO_SELECTION_ERROR',
    );
    this.name = 'UtxoSelectionError';
  }
}

/**
 * 設定エラー（環境変数未設定等）
 */
export class ConfigurationError extends ChainAbstractionError {
  constructor(
    chain: ChainType | undefined,
    public configKey: string,
  ) {
    super(
      `Configuration error${chain ? ` for ${chain}` : ''}: ${configKey} is not set`,
      chain,
      'CONFIGURATION_ERROR',
    );
    this.name = 'ConfigurationError';
  }
}
