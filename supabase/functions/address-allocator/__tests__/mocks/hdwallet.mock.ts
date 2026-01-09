/**
 * HDWallet (Hierarchical Deterministic Wallet) のモック
 * BIP32/BIP44準拠のHD Walletライブラリをモック化
 */

import { TEST_PUBKEYS } from './fixtures.ts';

/**
 * HDKeyのモック実装
 * 実際のHDKeyライブラリの動作を模倣
 */
export class MockHDKey {
  private _publicKey: Uint8Array;
  private _index: number;

  constructor(publicKey?: Uint8Array, index = 0) {
    this._publicKey = publicKey || new Uint8Array(33);
    this._index = index;
  }

  /**
   * 拡張公開鍵(xpub)から派生
   */
  static fromExtendedKey(xpub: string): MockHDKey {
    // xpubの種類に応じて異なる公開鍵を返す
    if (xpub.includes('evm') || xpub.includes('6D4BDPc')) {
      return new MockHDKey(TEST_PUBKEYS.evm);
    } else if (xpub.includes('btc') || xpub.includes('CUGRUon')) {
      return new MockHDKey(TEST_PUBKEYS.btc);
    } else if (xpub.includes('trc') || xpub.includes('BosfCni')) {
      return new MockHDKey(TEST_PUBKEYS.trc);
    } else if (xpub.includes('ada') || xpub.includes('ERApfZw')) {
      return new MockHDKey(TEST_PUBKEYS.ada_payment);
    }

    // デフォルト
    return new MockHDKey(TEST_PUBKEYS.evm);
  }

  /**
   * 子鍵の派生
   */
  derive(path: string): MockHDKey {
    // パスの最後のインデックスを取得
    const parts = path.split('/');
    const lastPart = parts[parts.length - 1];
    const index = parseInt(lastPart.replace("'", ''), 10);

    // インデックスに応じて公開鍵を微調整（決定論的）
    const derivedPubkey = new Uint8Array(this._publicKey);
    if (!isNaN(index)) {
      derivedPubkey[32] = (derivedPubkey[32] + index) % 256;
      return new MockHDKey(derivedPubkey, index);
    }

    return new MockHDKey(this._publicKey, this._index);
  }

  /**
   * 子鍵の派生（非強化）
   */
  deriveChild(index: number): MockHDKey {
    // インデックスに応じて公開鍵を微調整
    const derivedPubkey = new Uint8Array(this._publicKey);
    derivedPubkey[32] = (derivedPubkey[32] + index) % 256;
    return new MockHDKey(derivedPubkey, index);
  }

  /**
   * 公開鍵を取得
   */
  get publicKey(): Uint8Array {
    return this._publicKey;
  }

  /**
   * インデックスを取得
   */
  get index(): number {
    return this._index;
  }
}

/**
 * モックHDKeyファクトリー
 */
export const mockHDKeyFactory = {
  /**
   * xpubから HDKeyインスタンスを作成
   */
  fromExtendedKey: (xpub: string): MockHDKey => {
    return MockHDKey.fromExtendedKey(xpub);
  },

  /**
   * 子鍵を派生
   */
  deriveChild: (parent: MockHDKey, index: number): MockHDKey => {
    return parent.deriveChild(index);
  },
};

/**
 * Cardano WASMのモック
 * Cardanoアドレス生成に必要なWASM関数をモック化
 */
export const mockCardanoWasm = {
  /**
   * BaseAddressを作成
   */
  BaseAddress: class MockBaseAddress {
    constructor(
      network: number,
      paymentCredential: any,
      stakeCredential: any
    ) {
      this.network = network;
      this.paymentCredential = paymentCredential;
      this.stakeCredential = stakeCredential;
    }

    network: number;
    paymentCredential: any;
    stakeCredential: any;

    /**
     * Bech32形式に変換
     */
    to_address() {
      return {
        to_bech32: (prefix?: string) => {
          const networkPrefix = this.network === 1 ? 'addr' : 'addr_test';
          const finalPrefix = prefix || networkPrefix;
          return `${finalPrefix}1mock_cardano_address_${this.network}`;
        },
      };
    }

    /**
     * メモリ解放（WASMメモリ管理）
     */
    free() {
      // モックなので何もしない
    }
  },

  /**
   * StakeCredentialを作成
   */
  StakeCredential: {
    from_keyhash: (keyHash: any) => {
      return { free: () => {} };
    },
  },

  /**
   * Ed25519KeyHashを作成
   */
  Ed25519KeyHash: {
    from_bytes: (bytes: Uint8Array) => {
      return {
        free: () => {},
        to_bytes: () => bytes,
      };
    },
  },

  /**
   * PublicKeyを作成
   */
  PublicKey: {
    from_bytes: (bytes: Uint8Array) => {
      return {
        hash: () => ({
          to_bytes: () => bytes.slice(0, 28),
          free: () => {},
        }),
        free: () => {},
      };
    },
  },
};
