/**
 * テストデータのフィクスチャ
 * 既知の公開鍵とそれから生成されるアドレスのペアを定義
 */

// テスト用の既知の公開鍵（圧縮形式）
export const TEST_PUBKEYS = {
  // Ethereum用（実際の圧縮公開鍵）
  evm: new Uint8Array([
    0x02, 0x9c, 0x7c, 0x87, 0x4a, 0x94, 0xb5, 0xe7,
    0x2b, 0x08, 0xab, 0x4f, 0xf8, 0x5b, 0x87, 0x2f,
    0x73, 0x45, 0xc2, 0xdc, 0x8a, 0x9c, 0x8b, 0x85,
    0x4f, 0x2d, 0x9b, 0x83, 0x74, 0x29, 0xd0, 0x1e,
    0xf3
  ]),

  // Bitcoin用（同じ公開鍵を使用可能）
  btc: new Uint8Array([
    0x02, 0x9c, 0x7c, 0x87, 0x4a, 0x94, 0xb5, 0xe7,
    0x2b, 0x08, 0xab, 0x4f, 0xf8, 0x5b, 0x87, 0x2f,
    0x73, 0x45, 0xc2, 0xdc, 0x8a, 0x9c, 0x8b, 0x85,
    0x4f, 0x2d, 0x9b, 0x83, 0x74, 0x29, 0xd0, 0x1e,
    0xf3
  ]),

  // Tron用
  trc: new Uint8Array([
    0x03, 0x5a, 0x78, 0x4b, 0x2e, 0x7f, 0x9c, 0x3d,
    0x8e, 0x1a, 0x4b, 0x6c, 0x9f, 0x2d, 0x8a, 0x5e,
    0x7b, 0x4c, 0x9d, 0x2f, 0x8a, 0x3e, 0x7c, 0x1d,
    0x9f, 0x4e, 0x8b, 0x2c, 0x7a, 0x5d, 0x9e, 0x3f,
    0x8c
  ]),

  // XRP用
  xrp: new Uint8Array([
    0x02, 0x1a, 0x2b, 0x3c, 0x4d, 0x5e, 0x6f, 0x7a,
    0x8b, 0x9c, 0xad, 0xbe, 0xcf, 0xd0, 0xe1, 0xf2,
    0x03, 0x14, 0x25, 0x36, 0x47, 0x58, 0x69, 0x7a,
    0x8b, 0x9c, 0xad, 0xbe, 0xcf, 0xd0, 0xe1, 0xf2,
    0x03
  ]),

  // Cardano用（payment）
  ada_payment: new Uint8Array([
    0x02, 0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0xf6, 0x07,
    0x18, 0x29, 0x3a, 0x4b, 0x5c, 0x6d, 0x7e, 0x8f,
    0x90, 0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0xf6, 0x07,
    0x18, 0x29, 0x3a, 0x4b, 0x5c, 0x6d, 0x7e, 0x8f,
    0x90
  ]),

  // Cardano用（stake）
  ada_stake: new Uint8Array([
    0x03, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77,
    0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
    0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77,
    0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
    0x00
  ]),
};

// テスト用の拡張公開鍵（xpub）
export const TEST_XPUBS = {
  // Ethereum mainnet用（実際のxpub形式）
  evm_mainnet: 'xpub6D4BDPcP2GT577Vvch3R8wDkScZWzQzMMUm3PWbmWvVJrZwQY4VUNgqFJPMM3No2dFDFGTsxxpG5uJh7n7epu4trkrX7x7DogT5Uv6fcLW5',

  // Ethereum testnet用
  evm_testnet: 'tpubDC5FSnBiZDMmhiuCmWAYsLwgLYrrT9rAqvTySfuCCrgsWz8wxMXUS9Tb9iVMvcRbvFcAHGkMD5Kx8koh4GquNGNTfohfk7pgjhaPCdXpoba',

  // Bitcoin mainnet用
  btc_mainnet: 'xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKrhko4egpiMZbpiaQL2jkwSB1icqYh2cfDfVxdx4df189oLKnC5fSwqPfgyP3hooxujYzAu3fDVmz',

  // Bitcoin testnet用
  btc_testnet: 'tpubDDGqmGqPvG4eKwjKYvvF6BmBRBqHqFvGT6hVqJ9v1bFAL3PYgWJbNVL6N8JvPfh9xGUjf8fXXC2Kv8zPM5FNBVqEJKkqJGF2dKhHYrJXJXK',

  // Tron mainnet用
  trc_mainnet: 'xpub6BosfCnifzxcFwrSzQiqu2DBVTshkCXacvNsWGYJVVhhawA7d4R5WSWGFNbi8Aw6ZRc1brxMyWMzG3DSSSSoekkudhUd9yLb6qx39T9nMdj',

  // XRP mainnet用（destination tagルーティングなので使用しない）
  xrp_mainnet: '',

  // Cardano external chain用
  ada_external: 'xpub6ERApfZwUNrhLCkDtcHTcxd75RbzS1ed54G1LkBUHQVHQKqhMkhgbmJbZRkrgZw4koxb5JaHWkY4ALHY2grBGRjaDMzQLcgJvLJuZZvRcEL',

  // Cardano stake chain用
  ada_stake: 'xpub6FHUhLbYYkgFQiFrDiXRfQFXBB2msCxKTsNyAExi6keFxQ8sHfwpogY3p3s1ePSpUqLNYks5T6a3JqpCGszt4kxbyq7tUoFP5c8KWyiDtPD',
};

// 期待されるアドレス（モック関数が返すべき値）
export const EXPECTED_ADDRESSES = {
  // EVM: keccak256ベースで生成されるアドレス
  evm: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',

  // Bitcoin: Bech32形式（bc1...）
  btc_mainnet: 'bc1q9c7c874a94b5e72b08ab4ff85b872f7345c2dc',
  btc_testnet: 'tb1q9c7c874a94b5e72b08ab4ff85b872f7345c2dc',

  // Tron: Base58Check形式（T...）
  trc_mainnet: 'TJRyWwFs9wTFGZg3JbrVriFbNfCug5tDeC',
  trc_nile: 'TJRyWwFs9wTFGZg3JbrVriFbNfCug5tDeC',

  // XRP: Base58形式（r...）+ destination tag
  xrp: 'rN7n7otQDd6FczFgLdlqtyMVrn3NnrcVcM',

  // Cardano: Bech32形式（addr1...）
  ada_mainnet: 'addr1q8a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3h4i5j6k7l8m9n0o1p2q3r4s5t6',
  ada_testnet: 'addr_test1q8a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3h4i5j6k7l8m9n0o1p2q3r4s5t6',
};

// テスト用のユーザーID
export const TEST_USER_ID = '12345678-1234-1234-1234-123456789012';

// テスト用のidempotency_key
export const TEST_IDEMPOTENCY_KEY = 'test-idempotency-key-12345';

// テスト用のアドレスインデックス
export const TEST_ADDRESS_INDEX = 42;

// テスト用のdestination tag
export const TEST_DESTINATION_TAG = 12345;
