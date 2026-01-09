# 単一マーケット運用ガイド（未上場トークン・参考）

本書は未上場トークン1銘柄のみを取引対象にする最小構成のセットアップ手順です。現フェーズ（取引所風ウォレット）では実取引を行わないため、本書の内容は参考情報として扱ってください。バックエンドはSupabase(RLS)上のテーブル/関数を利用し、フロントは `markets` の `active` のみを表示します。

## 手順

1) マーケット作成（管理画面またはSQL）
- 管理画面 `/admin` → 「マーケット管理」で `ID=TOKENX-USDT` のように追加
- 推奨初期値: `price_tick=0.01`, `qty_step=0.000001`, `min_notional=1`, `maker_fee_rate=0.0`, `taker_fee_rate=0.0015`

2) 既存マーケットの停止
- `BTC-USDT` を `status='disabled'` に変更
- フロントは `status='active'` のみ取得し表示

3) 残高準備
- 試験ユーザーへ `USDT`/`TOKENX` の残高を付与（`user_assets` で可）。
- 実運用では `ledger_entries` 起点に一本化していく想定。

4) 動作確認
- `/trade` にて `TOKENX/USDT` のみが選択可能に。
- 指値(GTC/IOC)の発注/取消/約定/手数料が反映。
- `/history` のマイトレード/オープンオーダー/マイオーダーが閲覧可能。

## 備考
- 手数料は `markets` に保存。将来ロール別/レベル別へ拡張可能。
- 成行/高度な注文タイプは将来拡張。MVPは指値のみ。
- Realtime は `orders/trades/ledger_entries` を公開に追加済み。
