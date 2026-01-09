/**
 * EVM Unsigned Transaction Builder
 *
 * EVMチェーン（Ethereum, Sepolia等）のunsigned transactionを生成する共通ライブラリ
 *
 * TDDフロー:
 * 1. テスト作成（Red）✅
 * 2. 実装作成（Green）← 現在ここ
 * 3. リファクタリング（Refactor）
 */

export interface EvmUnsignedTx {
  from: string;
  to: string;
  value: string;      // hex wei
  gas: string;        // hex
  gasPrice: string;   // hex
  nonce: string;      // hex
  chainId: number;
  type: number;       // 0 = legacy, 2 = EIP-1559
}

export interface BuildEvmTxParams {
  from: string;
  to: string;
  balance: bigint;    // wei
  gasPrice: bigint;   // wei
  nonce: number;
  chainId: number;
  gasLimit?: bigint;
}

/**
 * EVM unsigned transactionを構築
 *
 * @param params - トランザクションパラメータ
 * @returns unsigned transaction object
 * @throws Error if balance is insufficient
 */
export function buildEvmUnsignedTx(params: BuildEvmTxParams): EvmUnsignedTx {
  const {
    from,
    to,
    balance,
    gasPrice,
    nonce,
    chainId,
    gasLimit = BigInt(21000),  // デフォルト: 標準送金のgas limit
  } = params;

  // Gas cost計算
  const gasCost = gasPrice * gasLimit;

  // 残高チェック
  if (balance < gasCost) {
    throw new Error('Insufficient balance for gas cost');
  }

  // 送金額計算（全残高 - Gas代）
  const value = balance - gasCost;

  // BigIntをhex文字列に変換
  const toHex = (n: bigint | number): string => {
    const num = typeof n === 'bigint' ? n : BigInt(n);
    return '0x' + num.toString(16);
  };

  // unsigned transaction構築
  return {
    from,
    to,
    value: toHex(value),
    gas: toHex(gasLimit),
    gasPrice: toHex(gasPrice),
    nonce: toHex(nonce),
    chainId,
    type: 0,  // legacy transaction
  };
}

/**
 * Wei単位からEther単位への変換
 */
export function weiToEther(wei: bigint): string {
  return (Number(wei) / 1e18).toFixed(18);
}

/**
 * Ether単位からWei単位への変換
 */
export function etherToWei(ether: string | number): bigint {
  const etherNum = typeof ether === 'string' ? parseFloat(ether) : ether;
  return BigInt(Math.floor(etherNum * 1e18));
}
