/**
 * Chain Transaction Builder Factory
 *
 * チェーンタイプに応じて適切なChainTxBuilderインスタンスを返すFactoryパターン実装
 */

import type { ChainType, ChainTxBuilder } from './types.ts';
import { UnsupportedChainError } from './errors.ts';
import { EvmChainBuilder } from '../builders/evm-chain-builder.ts';
import { TronChainBuilder } from '../builders/tron-tx-builder.ts';
import { BitcoinChainBuilder } from '../builders/bitcoin-tx-builder.ts';
import { CardanoChainBuilder } from '../builders/cardano-tx-builder.ts';
import { RippleChainBuilder } from '../builders/ripple-tx-builder.ts';

/**
 * ChainTxBuilderFactory
 *
 * 各チェーンに対応するビルダーインスタンスを生成・管理するFactory
 *
 * @example
 * ```typescript
 * const builder = ChainTxBuilderFactory.create('evm');
 * const unsignedTx = await builder.buildUnsignedTx(params);
 * ```
 */
export class ChainTxBuilderFactory {
  /**
   * ビルダーインスタンスキャッシュ（シングルトンパターン）
   */
  private static builders: Map<ChainType, ChainTxBuilder> = new Map();

  /**
   * 指定されたチェーンタイプに対応するビルダーを取得
   *
   * @param chain チェーンタイプ
   * @returns ChainTxBuilderインスタンス
   * @throws {UnsupportedChainError} サポートされていないチェーンの場合
   */
  static create(chain: ChainType): ChainTxBuilder {
    // キャッシュから取得
    if (this.builders.has(chain)) {
      return this.builders.get(chain)!;
    }

    // チェーンタイプに応じてビルダーを生成
    let builder: ChainTxBuilder;

    switch (chain) {
      case 'evm':
        builder = new EvmChainBuilder();
        break;

      case 'trc':
        builder = new TronChainBuilder();
        break;

      case 'btc':
        builder = new BitcoinChainBuilder();
        break;

      case 'ada':
        builder = new CardanoChainBuilder();
        break;

      case 'xrp':
        builder = new RippleChainBuilder();
        break;

      default:
        // 未知のチェーンタイプ
        throw new UnsupportedChainError(chain);
    }

    // キャッシュに保存
    this.builders.set(chain, builder);

    return builder;
  }

  /**
   * 指定されたチェーンがサポートされているか確認
   *
   * @param chain チェーンタイプ
   * @returns サポートされている場合true
   */
  static isSupported(chain: string): chain is ChainType {
    const supportedChains: ChainType[] = ['evm', 'btc', 'ada', 'trc', 'xrp'];
    return supportedChains.includes(chain as ChainType);
  }

  /**
   * サポートされている全チェーンのリストを取得
   *
   * @returns サポートされているチェーンタイプの配列
   */
  static getSupportedChains(): ChainType[] {
    return ['evm', 'btc', 'ada', 'trc', 'xrp'];
  }

  /**
   * 実装済みチェーンのリストを取得
   *
   * @returns 実装済みチェーンタイプの配列
   */
  static getImplementedChains(): ChainType[] {
    // Phase 2完了: 全チェーン実装済み
    // - EVM (Ethereum, Sepolia, Polygon, Arbitrum)
    // - Tron (TRC)
    // - Bitcoin (BTC)
    // - Cardano (ADA)
    // - Ripple (XRP)
    return ['evm', 'trc', 'btc', 'ada', 'xrp'];
  }

  /**
   * キャッシュをクリア（テスト用）
   */
  static clearCache(): void {
    this.builders.clear();
  }
}
