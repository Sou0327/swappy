// ブラウザ対応のcryptoユーティリティ
import CryptoJS from 'crypto-js';

/**
 * SHA256ハッシュを生成
 */
export function sha256(data: string): string {
  return CryptoJS.SHA256(data).toString();
}

/**
 * 32bit整数ハッシュを生成
 */
export function hashTo32BitInt(data: string): number {
  const hash = CryptoJS.SHA256(data);
  return Math.abs(hash.words[0]);
}

/**
 * ランダムな16進文字列を生成
 */
export function randomHex(length: number): string {
  const randomWords = CryptoJS.lib.WordArray.random(Math.ceil(length / 2));
  return randomWords.toString().slice(0, length);
}