# マルチチェーン入金仕様（段階導入・手動運用）

本書は「取引所の見え方をしたウォレット（少人数・手動運用）」前提での入金仕様を定義します。サーバは秘密鍵を保持せず、運用側ウォレット（例: SafePal/ハードウォレット/Gnosis Safe）で手動署名します。

## フェーズと対象チェーン

- フェーズ1（公開最短）: 主要チェーンの入金検知（BTC / ETH / XRP / TRON / ADA / USDT各ネットワーク）
- フェーズ2: BTC（ビットコイン）
- フェーズ3: XRP（リップル）
- 以降: TRON/ADA 等は需要を見て追加

チェーンごとの「入金受付スイッチ」を用意し、未対応チェーンは UI 上で「準備中（入金不可）」を明示します。

---

## EVM（Ethereum/Arbitrum/Polygon 等）

方式: ユーザー毎の EOA を払い出し（HDウォレット由来）。最短実装で入金「検知のみ」を提供。ERC-20 のスイープや残高移送は運用時間帯に手動対応。必要に応じてアドレスへ少量のガス(ETH)を手動で補充。

### アドレス払い出し（HD）

- BIP‑44 準拠の派生パス例: `m/44'/60'/0'/0/{index}`
- `deposit_addresses` で `user_id/chain/network/asset` ごとに一意に管理し、`address_index` と `derivation_path` を保存。
- サーバは秘密鍵/シードを保持しない。アドレス/パス情報のみ保存。

### 入金検知/確定

- イベント購読: ETH はネイティブ転送、USDT(ERC‑20) は `Transfer(address from, address to, uint256 value)` を購読。
- 検知時: `deposits` に `pending` で挿入し、`confirmations_observed` を更新。
- 確定: 所定のブロック確認数（例: 12）に到達したら `confirmed` に更新し、`user_assets` を反映。

### 集約/スイープ（運用）

- 本フェーズは「未実装（手動）」とする。必要に応じて運用者が送金実施。
- 将来案: Deposit Contract（EIP‑1167）によるガス最適化スイープを検討（別フェーズ）。

### 監査ログ

- 受取検知/確定/手動送金の操作を `audit_logs`（提案）に記録（TxHash, 操作主体, 時刻）。

---

## BTC（ビットコイン）

方式: HDウォレット（xpub）で受取アドレス払い出し → PSBT をサーバで生成し、運用ウォレットで手動署名。

### フロー

1) 受取アドレス: クライアント側管理の `xpub` から `m/84'/0'/0'/0/n` などのパスで払い出し（サーバは `xpub` のみ保持可）
2) 入金検知: 確認数（例: 1/3/6）に応じて `deposits(pending→confirmed)`
3) スイープ: UTXOを集約する PSBT をサーバで作成 → 運用ウォレットで署名 → ブロードキャスト
4) 手数料: 手数料最適化は単純化（一定手数料 or 推定API）。将来改善

注意: サーバは秘密鍵/シードを保持しない。`xpub` のアクセス制御に注意。

---

## XRP（リップル）

方式: 単一アドレス＋Destination Tag（ユーザー毎のタグ）。新規アドレスのリザーブ負担を回避。

### フロー

1) 受取先表示: 固定アドレス＋ユーザー固有の `Destination Tag`
2) 入金検知: `payments` を購読し、Tag でユーザーにマッピング → `deposits`
3) 集約: 必要に応じて運用時間帯に手動送金

注意: Tag 未設定/誤送金のサポートフローを FAQ/UI に明記。

---

## TRON（TRX / USDT-TRC20）

方式: ユーザー毎のアドレス（HD: `m/44'/195'/0'/0/{index}`）。入金は TRX のネイティブ転送または TRC‑20 `Transfer` イベントを監視。

### フロー

1) 受取アドレス: HD 由来の各ユーザー用アドレスを払い出し、`deposit_addresses` に保存。
2) 入金検知: TronGrid などの API で対象アドレスへの転送/イベントを購読し `deposits(pending)` に記録。
3) 確定: 目安 19 ブロックで `confirmed` に更新し、`user_assets` に反映。

推奨: TronGrid API（要APIキー）または自前ノード。将来のスイープ時に Bandwidth/Energy が必要（本フェーズは検知のみ）。

---

## ADA（Cardano）

方式: CIP‑1852 の HD アドレス（`m/1852'/1815'/0'/0/{index}`）。UTXO 集計で入金検知。署名は運用ウォレット（鍵非保持）。

### フロー

1) 受取アドレス: HD 由来の各ユーザー用アドレスを払い出し、`deposit_addresses` に保存。
2) 入金検知: Blockfrost API 等で UTXO を監視し `deposits(pending)` に記録。
3) 確定: 目安 15 確認で `confirmed` に更新し、`user_assets` に反映。

推奨: Blockfrost API（要APIキー）。

---

## データモデル（拡張）

`deposits`/`withdrawals` にチェーン/ネットワーク/識別子を追加（DDLは参考例。実装時に調整）。

```sql
-- deposits 拡張例
ALTER TABLE deposits
  ADD COLUMN chain text,              -- 'evm' | 'btc' | 'xrp' ...
  ADD COLUMN network text,            -- 'ethereum' | 'arbitrum' | 'mainnet' | 'testnet' ...
  ADD COLUMN asset text,              -- 'ETH' | 'USDT' | 'BTC' | 'XRP' | 'TRX' | 'ADA' ...
  ADD COLUMN wallet_address text,     -- 受取アドレス（EOA/HD, BTC, XRP）
  ADD COLUMN memo_tag text,           -- XRP: Destination Tag 等
  ADD COLUMN confirmations_required integer DEFAULT 0,
  ADD COLUMN confirmations_observed integer DEFAULT 0;
```

---

## 運用ポリシー（最小）

- 鍵: サーバは鍵を保持しない。署名は運用ウォレットで手動。可能なら EVM の集約先は Gnosis Safe（2‑of‑3）。
- 受付スイッチ: チェーン毎に ON/OFF（UI/バックエンド両方で強制）。未対応は「準備中」を明示。
- 緊急停止: 入金取り込み/受付の停止ボタンを用意。
- 監査ログ: 受取・確定・集約・管理操作を全て記録。

---

## 受入基準（チェーン別）

- EVM: 少額入金が UI/履歴に反映（所定の確認数に到達）。
- BTC: xpub 由来アドレスで入金を受け、PSBT 生成→手動署名で集約できる。
- XRP: Tag 付き入金が UI/履歴に反映。誤送金時の運用手順が用意されている。
- TRON: TRX/TRC‑20 `Transfer` を検知し、所定ブロック数で反映。
- ADA: UTXO 検知で所定確認数に到達後に反映。

---

## 既知の制限

- 自動化は限定的（手動署名前提）。大量同時入金時は遅延が発生しうる。
- トランザクション手数料最適化は簡易実装。将来改善の余地あり。
- 外部監査/ペンテは後段。
