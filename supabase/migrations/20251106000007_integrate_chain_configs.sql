-- Phase 1: supported_tokensスキーマ拡張
-- chain_configsとの統合のため、4つのカラムを追加

-- Step 1a: カラム追加
ALTER TABLE public.supported_tokens
ADD COLUMN IF NOT EXISTS min_confirmations INTEGER,
ADD COLUMN IF NOT EXISTS explorer_url TEXT,
ADD COLUMN IF NOT EXISTS destination_tag_required BOOLEAN,
ADD COLUMN IF NOT EXISTS chain_specific_config JSONB DEFAULT '{}'::jsonb;

-- カラムコメント追加
COMMENT ON COLUMN public.supported_tokens.min_confirmations IS 'ブロック確認必要数（入金検知用）';
COMMENT ON COLUMN public.supported_tokens.explorer_url IS 'ブロックエクスプローラーURL';
COMMENT ON COLUMN public.supported_tokens.destination_tag_required IS '宛先タグ必須フラグ（XRP, XLM等）';
COMMENT ON COLUMN public.supported_tokens.chain_specific_config IS 'チェーン固有の設定情報（JSON）';

-- Step 1b: デフォルト値設定トリガー
CREATE OR REPLACE FUNCTION public.set_default_confirmations()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.min_confirmations IS NULL THEN
    NEW.min_confirmations := CASE NEW.chain
      WHEN 'evm' THEN 12
      WHEN 'btc' THEN 6
      WHEN 'trc' THEN 19
      WHEN 'xrp' THEN 1
      WHEN 'ada' THEN 15
      ELSE 6
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_token_defaults
  BEFORE INSERT ON public.supported_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.set_default_confirmations();

-- Step 1c: 既存レコードのバックフィル

-- min_confirmations のバックフィル
UPDATE public.supported_tokens
SET min_confirmations = CASE chain
  WHEN 'evm' THEN 12
  WHEN 'btc' THEN 6
  WHEN 'trc' THEN 19
  WHEN 'xrp' THEN 1
  WHEN 'ada' THEN 15
  ELSE 6
END
WHERE min_confirmations IS NULL;

-- explorer_url のバックフィル（chain/network別）
UPDATE public.supported_tokens
SET explorer_url = CASE
  WHEN chain = 'evm' AND network = 'ethereum' THEN 'https://etherscan.io'
  WHEN chain = 'evm' AND network = 'sepolia' THEN 'https://sepolia.etherscan.io'
  WHEN chain = 'btc' AND network = 'mainnet' THEN 'https://blockstream.info'
  WHEN chain = 'btc' AND network = 'testnet' THEN 'https://blockstream.info/testnet'
  WHEN chain = 'trc' AND network = 'mainnet' THEN 'https://tronscan.org'
  WHEN chain = 'trc' AND network = 'shasta' THEN 'https://shasta.tronscan.org'
  WHEN chain = 'xrp' AND network = 'mainnet' THEN 'https://xrpscan.com'
  WHEN chain = 'xrp' AND network = 'testnet' THEN 'https://testnet.xrpscan.com'
  WHEN chain = 'ada' AND network = 'mainnet' THEN 'https://cardanoscan.io'
  WHEN chain = 'ada' AND network = 'preprod' THEN 'https://preprod.cardanoscan.io'
  ELSE NULL
END
WHERE explorer_url IS NULL;

-- destination_tag_required のバックフィル
UPDATE public.supported_tokens
SET destination_tag_required = CASE
  WHEN chain IN ('xrp', 'xlm') THEN true
  ELSE false
END
WHERE destination_tag_required IS NULL;

-- NOT NULL制約とDEFAULT設定
ALTER TABLE public.supported_tokens
ALTER COLUMN destination_tag_required SET DEFAULT false,
ALTER COLUMN destination_tag_required SET NOT NULL;

-- chain_specific_config のデフォルト値設定（既に DEFAULT '{}'::jsonb 設定済み）

-- Step 1d: 検証クエリ（コメントのみ、実行不要）
-- SELECT chain, network, asset, min_confirmations, explorer_url, destination_tag_required, chain_specific_config
-- FROM public.supported_tokens
-- WHERE min_confirmations IS NULL OR destination_tag_required IS NULL;
-- 結果が0件であることを確認

-- ============================================================================
-- Phase 2: chain_configsからsupported_tokensへのデータ移行
-- ============================================================================

-- Step 2a: ネットワーク名マッピング関数
CREATE OR REPLACE FUNCTION public.map_network_name(
  p_chain TEXT,
  p_network TEXT
) RETURNS TEXT AS $$
BEGIN
  RETURN CASE
    -- EVM chains: mainnet→ethereum, testnet→sepolia
    WHEN p_chain = 'eth' AND p_network = 'mainnet' THEN 'ethereum'
    WHEN p_chain = 'eth' AND p_network = 'testnet' THEN 'sepolia'
    -- Tron: testnet→shasta
    WHEN p_chain = 'trc' AND p_network = 'testnet' THEN 'shasta'
    -- Cardano: testnet→preprod
    WHEN p_chain = 'ada' AND p_network = 'testnet' THEN 'preprod'
    -- その他はそのまま
    ELSE p_network
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.map_network_name IS 'chain_configs と supported_tokens のネットワーク名を変換';

-- Step 2b: 移行前の競合チェック（ログ出力）
DO $$
DECLARE
  v_missing_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_missing_count
  FROM chain_configs cc
  LEFT JOIN supported_tokens st
    ON st.chain = CASE WHEN cc.chain = 'eth' THEN 'evm' ELSE cc.chain END
    AND st.network = public.map_network_name(cc.chain, cc.network)
    AND st.asset = cc.asset
  WHERE st.id IS NULL;

  IF v_missing_count > 0 THEN
    RAISE WARNING 'chain_configsに存在してsupported_tokensに存在しないレコードが%件あります', v_missing_count;
  ELSE
    RAISE NOTICE '全chain_configsレコードがsupported_tokensに存在します';
  END IF;
END $$;

-- Step 2c: トランザクション内でのデータ移行
DO $$
DECLARE
  v_updated_count INTEGER := 0;
BEGIN
  -- ロールバックポイント作成
  -- （外側のトランザクションで管理されるため、ここでは不要）

  -- chain_configsからsupported_tokensへデータマージ
  UPDATE supported_tokens st
  SET
    min_confirmations = COALESCE(cc.min_confirmations, st.min_confirmations),
    explorer_url = COALESCE(cc.config->>'explorer', st.explorer_url),
    destination_tag_required = COALESCE(
      (cc.config->>'destination_tag_required')::boolean,
      st.destination_tag_required
    ),
    min_deposit = COALESCE(cc.min_deposit, st.min_deposit),
    deposit_enabled = COALESCE(cc.deposit_enabled, st.deposit_enabled),
    -- chain_specific_configへ残りのconfig要素を保存
    -- 標準キー（name, symbol, decimals, contract_address, explorer, destination_tag_required, token_type）を除外
    chain_specific_config = COALESCE(
      (cc.config - 'name' - 'symbol' - 'decimals' - 'contract_address' - 'explorer' - 'destination_tag_required' - 'token_type'),
      st.chain_specific_config
    ),
    updated_at = now()
  FROM chain_configs cc
  WHERE st.chain = CASE
      WHEN cc.chain = 'eth' THEN 'evm'
      ELSE cc.chain
    END
    AND st.network = public.map_network_name(cc.chain, cc.network)
    AND st.asset = cc.asset;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RAISE NOTICE 'chain_configsから%レコードを移行しました', v_updated_count;

  IF v_updated_count = 0 THEN
    RAISE WARNING 'データ移行で更新されたレコードが0件です';
  END IF;
END $$;

-- Step 2d: 移行後の整合性検証
DO $$
DECLARE
  v_inconsistent_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_inconsistent_count
  FROM supported_tokens st
  JOIN chain_configs cc
    ON st.chain = CASE WHEN cc.chain = 'eth' THEN 'evm' ELSE cc.chain END
    AND st.network = public.map_network_name(cc.chain, cc.network)
    AND st.asset = cc.asset
  WHERE (st.min_confirmations IS DISTINCT FROM cc.min_confirmations)
     OR (st.min_deposit IS DISTINCT FROM cc.min_deposit)
     OR (st.deposit_enabled IS DISTINCT FROM cc.deposit_enabled);

  IF v_inconsistent_count > 0 THEN
    RAISE WARNING '移行後に不一致のあるレコードが%件あります', v_inconsistent_count;
  ELSE
    RAISE NOTICE '移行後の整合性チェック: すべて一致';
  END IF;
END $$;

-- ============================================================================
-- Phase 3: VIEW化とINSTEAD OF TRIGGER完全実装
-- ============================================================================

-- Step 3a: 除外キーリスト定義関数（VIEW + TRIGGERで共有）
CREATE OR REPLACE FUNCTION public.get_standard_config_keys()
RETURNS TEXT[] AS $$
BEGIN
  RETURN ARRAY[
    'name',
    'symbol',
    'decimals',
    'contract_address',
    'explorer',
    'destination_tag_required',
    'token_type'
  ];
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.get_standard_config_keys IS 'supported_tokensの個別カラムから再構築されるconfig JSONキーのリスト';

-- Step 3b: 既存chain_configsテーブルのバックアップ
ALTER TABLE IF EXISTS public.chain_configs RENAME TO chain_configs_backup_20250107;

COMMENT ON TABLE public.chain_configs_backup_20250107 IS '統合前のchain_configsバックアップ。2025-04-07以降に削除予定';

-- Step 3c: chain_configs VIEW作成（WHERE active=true なし）
CREATE OR REPLACE VIEW public.chain_configs AS
SELECT
  id,
  chain,
  network,
  asset,
  deposit_enabled,
  min_confirmations,
  min_deposit,
  active,
  -- config JSONの完全再構築：標準フィールド + chain_specific_config
  jsonb_build_object(
    'name', name,
    'symbol', symbol,
    'decimals', decimals,
    'contract_address', contract_address,
    'explorer', explorer_url,
    'destination_tag_required', destination_tag_required,
    'token_type', CASE
      WHEN contract_address IS NOT NULL AND chain = 'evm' THEN 'ERC-20'
      WHEN contract_address IS NOT NULL AND chain = 'trc' THEN 'TRC-20'
      WHEN asset IN ('ETH','TRX','BTC','XRP','ADA') THEN 'native'
      ELSE 'unknown'
    END
  ) || COALESCE(chain_specific_config, '{}'::jsonb) as config,
  created_at,
  updated_at
FROM public.supported_tokens;
-- WHERE句なし：非アクティブ行も含む

COMMENT ON VIEW public.chain_configs IS '後方互換性のためのVIEW。supported_tokensテーブルへマッピング。廃止予定：AdminTokensを直接使用してください';

-- Step 3d: UPDATE TRIGGER（config→カラム書き戻し含む）
CREATE OR REPLACE FUNCTION public.update_chain_configs_view()
RETURNS TRIGGER AS $$
DECLARE
  v_standard_keys TEXT[];
BEGIN
  v_standard_keys := public.get_standard_config_keys();

  UPDATE public.supported_tokens SET
    -- chain_configs VIEWで編集される既存カラム（重要！）
    deposit_enabled = COALESCE(NEW.deposit_enabled, deposit_enabled),
    min_deposit = COALESCE(NEW.min_deposit,
                           (NEW.config->>'min_deposit')::numeric,
                           min_deposit),
    active = COALESCE(NEW.active, active),

    -- 新規追加カラム
    min_confirmations = COALESCE(NEW.min_confirmations,
                                  (NEW.config->>'min_confirmations')::integer,
                                  min_confirmations),

    -- config→カラム書き戻し（標準フィールド）
    name = COALESCE((NEW.config->>'name'), name),
    symbol = COALESCE((NEW.config->>'symbol'), symbol),
    decimals = COALESCE((NEW.config->>'decimals')::integer, decimals),
    contract_address = COALESCE((NEW.config->>'contract_address'), contract_address),
    explorer_url = COALESCE((NEW.config->>'explorer'), explorer_url),
    destination_tag_required = COALESCE(
      (NEW.config->>'destination_tag_required')::boolean,
      destination_tag_required
    ),

    -- 標準キー除外してchain_specific_configへ
    chain_specific_config = CASE
      WHEN NEW.config IS NOT NULL THEN
        NEW.config - v_standard_keys
      ELSE chain_specific_config
    END,

    updated_at = COALESCE(NEW.updated_at, now())
  WHERE id = NEW.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Record with id % not found in supported_tokens', NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chain_configs_instead_of_update
  INSTEAD OF UPDATE ON public.chain_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_chain_configs_view();

-- Step 3e: INSERT TRIGGER（全必須カラム充填）
CREATE OR REPLACE FUNCTION public.insert_chain_configs_view()
RETURNS TRIGGER AS $$
DECLARE
  v_id UUID;
  v_standard_keys TEXT[];
  v_name TEXT;
  v_symbol TEXT;
  v_decimals INTEGER;
  v_min_confirmations INTEGER;
  v_destination_tag_required BOOLEAN;
  v_deposit_enabled BOOLEAN;
  v_withdraw_enabled BOOLEAN;
  v_convert_enabled BOOLEAN;
  v_display_order INTEGER;
  v_active BOOLEAN;
BEGIN
  v_standard_keys := public.get_standard_config_keys();

  -- 必須フィールド抽出+デフォルト値
  v_name := COALESCE(NEW.config->>'name', NEW.asset);
  v_symbol := COALESCE(NEW.config->>'symbol', NEW.asset);
  v_decimals := COALESCE((NEW.config->>'decimals')::integer, 18);

  -- min_confirmationsのデフォルト値（chain別）
  v_min_confirmations := COALESCE(
    (NEW.config->>'min_confirmations')::integer,
    NEW.min_confirmations,
    CASE NEW.chain
      WHEN 'evm' THEN 12
      WHEN 'btc' THEN 6
      WHEN 'trc' THEN 19
      WHEN 'xrp' THEN 1
      WHEN 'ada' THEN 15
      ELSE 6
    END
  );

  -- destination_tag_requiredのデフォルト値
  v_destination_tag_required := COALESCE(
    (NEW.config->>'destination_tag_required')::boolean,
    NEW.chain IN ('xrp', 'xlm')
  );

  -- その他の必須フィールドのデフォルト値
  v_deposit_enabled := COALESCE(NEW.deposit_enabled, true);
  v_withdraw_enabled := COALESCE(
    (NEW.config->>'withdraw_enabled')::boolean,
    true
  );
  v_convert_enabled := COALESCE(
    (NEW.config->>'convert_enabled')::boolean,
    true
  );
  v_display_order := COALESCE(
    (NEW.config->>'display_order')::integer,
    0
  );
  v_active := COALESCE(NEW.active, true);

  -- supported_tokensへINSERT（全必須カラム明示）
  INSERT INTO public.supported_tokens (
    chain, network, asset,
    name, symbol, decimals,
    contract_address,
    deposit_enabled,
    withdraw_enabled,
    convert_enabled,
    min_confirmations,
    min_deposit,
    min_withdraw,
    withdraw_fee,
    display_order,
    active,
    explorer_url,
    destination_tag_required,
    chain_specific_config,
    created_at,
    updated_at
  ) VALUES (
    NEW.chain,
    NEW.network,
    NEW.asset,
    v_name,
    v_symbol,
    v_decimals,
    NEW.config->>'contract_address',
    v_deposit_enabled,
    v_withdraw_enabled,
    v_convert_enabled,
    v_min_confirmations,
    NEW.min_deposit,
    (NEW.config->>'min_withdraw')::numeric,
    (NEW.config->>'withdraw_fee')::numeric,
    v_display_order,
    v_active,
    NEW.config->>'explorer',
    v_destination_tag_required,
    COALESCE(NEW.config - v_standard_keys, '{}'::jsonb),
    COALESCE(NEW.created_at, now()),
    COALESCE(NEW.updated_at, now())
  )
  RETURNING id INTO v_id;

  NEW.id := v_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chain_configs_instead_of_insert
  INSTEAD OF INSERT ON public.chain_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.insert_chain_configs_view();

-- Step 3f: DELETE TRIGGER（論理削除）
CREATE OR REPLACE FUNCTION public.delete_chain_configs_view()
RETURNS TRIGGER AS $$
BEGIN
  -- 物理削除ではなく論理削除（active=falseに設定）
  UPDATE public.supported_tokens
  SET active = false, updated_at = now()
  WHERE id = OLD.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Record with id % not found in supported_tokens', OLD.id;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chain_configs_instead_of_delete
  INSTEAD OF DELETE ON public.chain_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_chain_configs_view();

-- Step 3g: VIEW動作検証（コメントのみ、実行不要）
-- SELECT chain, network, asset, config->>'symbol', config->>'decimals', config->>'explorer'
-- FROM public.chain_configs
-- WHERE asset = 'USDT'
-- LIMIT 3;
-- config JSONが正しく再構築されていることを確認
