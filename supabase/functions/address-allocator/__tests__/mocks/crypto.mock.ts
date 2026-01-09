/**
 * 暗号化関数のモック
 * 決定論的な出力を返すことでテストの再現性を確保
 */

/**
 * モックSHA-256ハッシュ関数
 * 実際の暗号化ではなく、決定論的な結果を返す
 */
export async function mockSha256(data: Uint8Array): Promise<Uint8Array> {
  const result = new Uint8Array(32);
  result.fill(0xAA);

  // 入力データの特徴を反映して決定論的に
  if (data.length > 0) {
    result[0] = data[0];
    result[31] = data[data.length - 1];
  }

  return result;
}

/**
 * モックRIPEMD-160ハッシュ関数
 */
export async function mockRipemd160(data: Uint8Array): Promise<Uint8Array> {
  const result = new Uint8Array(20);
  result.fill(0xBB);

  if (data.length > 0) {
    result[0] = data[0];
    result[19] = data[data.length - 1];
  }

  return result;
}

/**
 * モックBlake2bハッシュ関数
 */
export async function mockBlake2b(data: Uint8Array, outputLen: number): Promise<Uint8Array> {
  const result = new Uint8Array(outputLen);
  result.fill(0xCC);

  if (data.length > 0) {
    result[0] = data[0];
    if (outputLen > 1) {
      result[outputLen - 1] = data[data.length - 1];
    }
  }

  return result;
}

/**
 * モックKeccak256ハッシュ関数
 */
export function mockKeccak256(data: Uint8Array): Uint8Array {
  const result = new Uint8Array(32);
  result.fill(0xDD);

  if (data.length > 0) {
    result[0] = data[0];
    result[31] = data[data.length - 1];
  }

  return result;
}

/**
 * モックBase58エンコード関数
 * 簡易的な16進数表現を返す
 */
export function mockBase58Encode(data: Uint8Array): string {
  return 'mock_' + Array.from(data)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * モックBase58デコード関数
 */
export function mockBase58Decode(str: string): Uint8Array {
  // 'mock_'プレフィックスを削除
  if (str.startsWith('mock_')) {
    const hex = str.substring(5);
    const result = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      result[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return result;
  }

  // デフォルト値
  return new Uint8Array(25).fill(0xEE);
}

/**
 * モックBase58Checkエンコード関数
 * チェックサムを含むBase58エンコード
 */
export async function mockBase58CheckEncode(payload: Uint8Array): Promise<string> {
  // 簡易的なチェックサム計算（実際のSHA-256 x2ではない）
  const checksum = new Uint8Array(4);
  checksum[0] = payload[0] ^ 0xFF;
  checksum[1] = payload.length & 0xFF;
  checksum[2] = 0xAB;
  checksum[3] = 0xCD;

  // payload + checksumを結合
  const combined = new Uint8Array(payload.length + 4);
  combined.set(payload, 0);
  combined.set(checksum, payload.length);

  return mockBase58Encode(combined);
}

/**
 * 統合されたCryptoProviderモック
 */
export const mockCryptoProvider = {
  sha256: mockSha256,
  ripemd160: mockRipemd160,
  blake2b: mockBlake2b,
  keccak256: mockKeccak256,
  base58Encode: mockBase58Encode,
  base58Decode: mockBase58Decode,
  base58CheckEncode: mockBase58CheckEncode,
};

/**
 * Bech32エンコード用のモック（簡易版）
 */
export function mockBech32Encode(hrp: string, data: Uint8Array): string {
  // 実際のBech32エンコードではなく、テスト用の簡易版
  const dataHex = Array.from(data)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `${hrp}1mock${dataHex}`;
}

/**
 * Bech32デコード用のモック（簡易版）
 */
export function mockBech32Decode(str: string): { hrp: string; data: Uint8Array } {
  const parts = str.split('1mock');
  if (parts.length !== 2) {
    throw new Error('Invalid bech32 string');
  }

  const hrp = parts[0];
  const dataHex = parts[1];
  const data = new Uint8Array(dataHex.length / 2);

  for (let i = 0; i < dataHex.length; i += 2) {
    data[i / 2] = parseInt(dataHex.substring(i, i + 2), 16);
  }

  return { hrp, data };
}
