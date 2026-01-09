-- スイープジョブテーブル拡張: リアルタイム署名対応
-- 「準備+即時生成」方式のための追加カラム

-- 署名関連のカラム追加
ALTER TABLE sweep_jobs
ADD COLUMN IF NOT EXISTS signed_by TEXT,              -- 署名者のアドレス
ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ,       -- 署名時刻
ADD COLUMN IF NOT EXISTS broadcasted_at TIMESTAMPTZ,  -- ブロードキャスト時刻
ADD COLUMN IF NOT EXISTS tx_generated_at TIMESTAMPTZ, -- unsigned_tx生成時刻
ADD COLUMN IF NOT EXISTS deposit_index INTEGER;       -- HD Wallet index番号

-- インデックス作成（パフォーマンス最適化）
CREATE INDEX IF NOT EXISTS idx_sweep_jobs_tx_generated_at
  ON sweep_jobs(tx_generated_at);

CREATE INDEX IF NOT EXISTS idx_sweep_jobs_signed_at
  ON sweep_jobs(signed_at);

CREATE INDEX IF NOT EXISTS idx_sweep_jobs_broadcasted_at
  ON sweep_jobs(broadcasted_at);

CREATE INDEX IF NOT EXISTS idx_sweep_jobs_deposit_index
  ON sweep_jobs(deposit_index);

-- コメント追加
COMMENT ON COLUMN sweep_jobs.signed_by IS '署名者のアドレス（MetaMaskなど）';
COMMENT ON COLUMN sweep_jobs.signed_at IS '署名が完了した時刻';
COMMENT ON COLUMN sweep_jobs.broadcasted_at IS 'ブロードキャストが完了した時刻';
COMMENT ON COLUMN sweep_jobs.tx_generated_at IS 'unsigned_txが生成された時刻（鮮度管理用）';
COMMENT ON COLUMN sweep_jobs.deposit_index IS 'HD Walletのindex番号（入金アドレス識別用）';
