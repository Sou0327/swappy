import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { LoadingState, DataLoading, LoadingButton } from "@/components/ui/loading";
import DashboardLayout from "@/components/DashboardLayout";
import DepositProgressTracker, { type DepositStep } from "@/components/DepositProgressTracker";
import { EnhancedErrorDisplay, NetworkStatusIndicator, SuccessFeedback, analyzeError, generateRecoveryActions, useNetworkStatus } from "@/components/ErrorHandling";
import { useEnhancedToast, createAddressCopyAction, createRetryAction } from "@/components/EnhancedToast";
import { SmartLoadingState, RichLoadingDisplay, LOADING_STAGES } from "@/components/LoadingStates";
import NotificationSettings from "@/components/NotificationSettings";
import { ArrowLeft, Copy, Download, ChevronDown, AlertTriangle, AlertCircle, CheckCircle, Clock, Wifi, WifiOff, Zap, Activity, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAsyncState } from "@/hooks/use-async-state";
import { generateMultichainAddress, validateMultichainAddress, getChainConfig, getSupportedAssets, getMinimumDepositAmount, getExplorerUrl, SUPPORTED_ASSETS, type SupportedChain, type SupportedNetwork, type SupportedAsset } from "@/lib/multichain-wallet-utils";
import { formatXRPDepositInfo, generateXRPDepositInfo } from "@/lib/xrp-wallet-utils";
import { supabase } from "@/integrations/supabase/client";
import useRealtimeDeposits from "@/hooks/useRealtimeDeposits";
import QRCode from "react-qr-code";
import { SERVICE_RESTRICTIONS } from "@/lib/service-restrictions";
import { CardDescription } from "@/components/ui/card";

interface DepositAddress {
  address: string;
  destination_tag?: string;
  destinationTag?: string; // XRPの場合
  derivationPath?: string; // その他のチェーンの場合
  type?: string;
  addressIndex?: number;
  xpub?: string; // 拡張公開鍵
}

interface XRPDepositData extends DepositAddress {
  destination_tag: string;
  destinationTag: string;
}

interface DepositHistory {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  asset?: string;
  chain: string;
  network: string;
  status: string;
  transaction_hash?: string;
  wallet_address?: string;
  confirmations_observed?: number;
  confirmations_required?: number;
  confirmed_at?: string;
  confirmed_by?: string;
  notes?: string;
  created_at: string;
  updated_at?: string;
}

const Deposit = () => {
  const [selectedChain, setSelectedChain] = useState<SupportedChain>("eth");
  const [selectedAsset, setSelectedAsset] = useState<SupportedAsset>("ETH");
  const [selectedNetwork, setSelectedNetwork] = useState<SupportedNetwork>("mainnet");
  const toast = useEnhancedToast();
  const networkStatus = useNetworkStatus();
  const navigate = useNavigate();
  const { user } = useAuth();
  const enableTestnets = import.meta.env.VITE_ENABLE_TEST_NETWORKS === 'true';

  // Phase 2: リアルタイム入金監視（プッシュ通知対応）
  const realtimeDeposits = useRealtimeDeposits({
    userId: user?.id || '',
    autoSubscribe: !!user?.id,
    maxEvents: 50,
    eventRetention: 24 * 60 * 60 * 1000, // 24時間
    enableNotifications: true, // プッシュ通知を有効化
    onConnectionChange: (connected, quality) => {
      if (!connected && quality === 'disconnected') {
        toast.showWarning('リアルタイム監視', {
          description: 'リアルタイム入金監視との接続が切断されました。手動更新をお試しください。',
          context: { operation: 'リアルタイム監視', connectivity: 'disconnected' },
          actions: [{
            label: '再接続',
            onClick: () => realtimeDeposits.retryConnection()
          }]
        });
      } else if (connected && quality === 'good') {
        toast.dismissAll(); // 再接続成功時は関連する警告を消去
        toast.showSuccess('リアルタイム監視復旧', {
          description: 'リアルタイム入金監視が復旧しました。',
          context: { operation: 'リアルタイム監視', connectivity: 'restored' },
          duration: 3000
        });
      }
    },
    onError: (error) => {
      const enhancedError = analyzeError(error, {
        operation: 'リアルタイム監視'
      });
      toast.showError('監視エラー', {
        description: enhancedError.userMessage,
        context: { operation: 'リアルタイム監視', error: error.message },
        actions: [{
          label: '再試行',
          onClick: () => realtimeDeposits.retryConnection()
        }],
        persistent: enhancedError.severity === 'critical'
      });
    }
  });

  // アドレス生成・取得の状態管理
  const currentAddressState = useAsyncState<DepositAddress>();

  // 入金プログレス追跡状態
  const [depositStep, setDepositStep] = useState<DepositStep>('awaiting_payment');
  const [currentTxHash, setCurrentTxHash] = useState<string | undefined>();
  const [currentConfirmations, setCurrentConfirmations] = useState<number>(0);
  const [requiredConfirmations, setRequiredConfirmations] = useState<number>(12);
  const [expectedAmount, setExpectedAmount] = useState<string | undefined>();
  const [showNotificationSettings, setShowNotificationSettings] = useState<boolean>(false);

  // フェーズ2: マルチチェーン対応（UI順序を 資産 → チェーン に変更）
  const chainConfig = getChainConfig(selectedChain, selectedNetwork);

  // 選択可能な資産一覧（入金・両替で共通の銘柄）
  const availableAssets: SupportedAsset[] = useMemo(
    () => SUPPORTED_ASSETS,
    []
  );

  // 資産に対応するチェーン一覧を算出
  const getSupportedChainsForAsset = useCallback((asset: SupportedAsset): SupportedChain[] => {
    const allChains: SupportedChain[] = ['eth', 'btc', 'trc', 'xrp', 'ada'];
    return allChains.filter((chain) => getSupportedAssets(chain, 'mainnet').includes(asset));
  }, []);

  // 資産変更時に、非対応のチェーンが選択されていれば補正
  useEffect(() => {
    const chains = getSupportedChainsForAsset(selectedAsset);
    if (!chains.includes(selectedChain)) {
      const nextChain = chains[0];
      setSelectedChain(nextChain);
      // ネットワークも初期化
      setSelectedNetwork('mainnet');
    }
  }, [selectedAsset, getSupportedChainsForAsset, selectedChain]);

  // 銘柄アイコン（public/icons 配下に公式SVGを配置想定）
  const assetIconSrc = (asset: SupportedAsset): string => {
    const map: Record<SupportedAsset, string> = {
      ETH: '/icons/ethereum.png',
      BTC: '/icons/bitcoin.png',
      USDT: '/icons/tether.png',
      TRX: '/icons/tron.png',
      XRP: '/icons/xrp.png',
      ADA: '/icons/cardano.png',
    };
    return map[asset] || '';
  };

  // チェーン表示名（資産に応じて一般名称を返す）
  const chainLabel = (chain: SupportedChain, asset: SupportedAsset): string => {
    if (asset === 'USDT') {
      if (chain === 'eth') return 'ERC-20';
      if (chain === 'trc') return 'TRC-20';
    }
    switch (chain) {
      case 'eth': return 'Ethereum';
      case 'btc': return 'Bitcoin';
      case 'trc': return 'Tron';
      case 'xrp': return 'XRP Ledger';
      case 'ada': return 'Cardano';
      default: return chain;
    }
  };

  // チェーン設定取得の状態管理
  const chainConfigState = useAsyncState<{
    deposit_enabled: boolean;
    min_confirmations: number;
    min_deposit: number;
  }>();

  // マルチチェーンアドレス取得・生成（拡張エラー処理付き）
  const getOrCreateDepositAddress = useCallback(async (chain: SupportedChain, network: SupportedNetwork, asset: SupportedAsset): Promise<DepositAddress> => {
    if (!user?.id) {
      const error = new Error('ユーザー認証が必要です');
      const enhancedError = analyzeError(error, { chain, network, asset, operation: 'アドレス生成' });
      toast.showError('認証エラー', {
        description: enhancedError.userMessage,
        context: { chain, network, asset, operation: 'アドレス生成' },
        actions: [{
          label: 'ログイン画面へ',
          onClick: () => navigate('/auth')
        }]
      });
      throw error;
    }

    // プログレス通知開始
    const progressToastId = toast.showLoading('アドレス生成中', {
      description: 'ウォレットアドレスを生成しています...',
      context: { chain, network, asset, operation: 'アドレス生成' },
      category: 'アドレス生成'
    });

    try {
      // DB保存・参照用にチェーン/ネットワークを正規化
      const normalize = (c: SupportedChain, n: SupportedNetwork): { chain: string; network: string } => {
        if (c === 'eth') {
          return { chain: 'evm', network: n === 'mainnet' ? 'ethereum' : n };
        }
        return { chain: c, network: n };
      };
      const { chain: chainKey, network: networkKey } = normalize(chain, network);

      // XRPの場合は特別処理
      if (chain === 'xrp') {
        // 最優先: 管理画面で上書きされたXRPカスタムアドレスを確認
        const { data: customXRP, error: customXRPError } = await supabase
          .from('user_deposit_addresses')
          .select('address, currency, network, is_active')
          .eq('user_id', user.id)
          .eq('currency', 'XRP')
          .eq('network', networkKey)
          .eq('is_active', true)
          .maybeSingle();

        if (customXRP && !customXRPError) {
          // 管理画面で設定されたXRPカスタムアドレスがある場合はそれを優先使用
          console.log(`Using custom XRP address from admin panel for ${networkKey}:`, customXRP.address);
          return {
            address: customXRP.address,
            type: 'custom'
          };
        }

        // 次に既存の自動生成XRPアドレスを確認
        const { data: existingXRP, error: xrpError } = await supabase
          .from('deposit_addresses')
          .select('address, destination_tag')
          .eq('user_id', user.id)
          .eq('chain', 'xrp')
          .eq('network', networkKey)
          .eq('active', true)
          .single();

        if (existingXRP && !xrpError) {
          // 既存XRPアドレスの場合もサブスクリプション確保
          await ensureTatumSubscription(existingXRP.address, 'xrp', networkKey, 'XRP');
          return {
            address: existingXRP.address,
            destinationTag: existingXRP.destination_tag,
            type: 'xrp'
          };
        }

        // 新しいXRP入金情報を生成
        // XRP は mainnet/testnet のみサポート（型絞り込み）
        if (network !== 'mainnet' && network !== 'testnet') {
          throw new Error('XRP は mainnet/testnet のみサポートしています');
        }
        const xrpInfo = await generateXRPDepositInfo(supabase, user.id, network);

        // データベースに保存
        const { data: newXRP, error: insertXRPError } = await supabase
          .from('deposit_addresses')
          .upsert({
            user_id: user.id,
            chain: 'xrp',
            network: networkKey,
            asset: 'XRP',
            address: xrpInfo.address,
            destination_tag: xrpInfo.destinationTag.toString(),
            active: true
          }, { onConflict: 'user_id,chain,network,asset' })
          .select('address, destination_tag')
          .maybeSingle();

        if (insertXRPError) {
          // 競合時は既存を取り直す
          if ((insertXRPError as { code?: string; message?: string }).code === '23505' || (insertXRPError as { code?: string; message?: string }).message?.includes('duplicate key value')) {
            const { data: after, error: afterErr } = await supabase
              .from('deposit_addresses')
              .select('address, destination_tag')
              .eq('user_id', user.id)
              .eq('chain', 'xrp')
              .eq('network', networkKey)
              .eq('asset', 'XRP')
              .eq('active', true)
              .maybeSingle();
            if (!afterErr && after) {
              return {
                address: after.address,
                destinationTag: after.destination_tag,
                type: 'xrp'
              };
            }
          }
          throw insertXRPError;
        }

        // 新しいXRPアドレスのサブスクリプション確保
        await ensureTatumSubscription(newXRP.address, 'xrp', networkKey, 'XRP');

        return {
          address: newXRP.address,
          destinationTag: newXRP.destination_tag,
          type: 'xrp'
        };
      }

      // 最優先: 管理画面で上書きされたカスタムアドレスを確認
      const { data: customAddress, error: customError } = await supabase
        .from('user_deposit_addresses')
        .select('address, currency, network, is_active')
        .eq('user_id', user.id)
        .eq('currency', asset)
        .eq('network', networkKey)
        .eq('is_active', true)
        .maybeSingle();

      if (customAddress && !customError) {
        // 管理画面で設定されたカスタムアドレスがある場合はそれを優先使用
        console.log(`Using custom address from admin panel for ${asset}/${networkKey}:`, customAddress.address);
        return {
          address: customAddress.address,
          type: 'custom'
        };
      }

      // 次に既存の自動生成アドレスを確認
      const { data: existingAddress, error: fetchError } = await supabase
        .from('deposit_addresses')
        .select('address, derivation_path, address_index, xpub, destination_tag')
        .eq('user_id', user.id)
        .eq('chain', chainKey)
        .eq('network', networkKey)
        .eq('asset', asset)
        .eq('active', true)
        .maybeSingle();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      if (existingAddress) {
        // 既存アドレスの場合もサブスクリプション確保
        await ensureTatumSubscription(existingAddress.address, chainKey, networkKey, asset);
        return {
          address: existingAddress.address,
          derivationPath: existingAddress.derivation_path,
          addressIndex: existingAddress.address_index,
          xpub: existingAddress.xpub,
          destinationTag: existingAddress.destination_tag,
          type: 'standard'
        };
      }

      // アドレス割当Edge Functionを優先（EVM/BTC/TRON/ADA対応）
      const allocatorSupportedChains: SupportedChain[] = ['eth', 'btc', 'trc', 'ada'];
      if (allocatorSupportedChains.includes(chain)) {
        // address-allocatorはチェーンに応じた正規化パラメータを期待する
        const allocatorChain = chain === 'eth' ? 'evm' : chain === 'btc' ? 'btc' : chainKey;

        // Tronテストネットの命名揺れに対応（Shasta -> Nile）
        let allocatorNetwork = networkKey;
        if (chain === 'trc' && (allocatorNetwork === 'shasta' || allocatorNetwork === 'testnet')) {
          allocatorNetwork = 'nile';
        }

        // BTCは強制的にBTC資産で呼び出す（UI資産は常にBTC想定）
        const allocatorAsset = chain === 'btc' ? 'BTC' : asset;

        const { data, error } = await supabase.functions.invoke('address-allocator', {
          body: { chain: allocatorChain, network: allocatorNetwork, asset: allocatorAsset }
        });

        if (!error) {
          const allocatorResult = (data as { data?: DepositAddress })?.data;

          if (allocatorResult?.address) {
            await ensureTatumSubscription(allocatorResult.address, chainKey, networkKey, asset);

            return {
              address: allocatorResult.address,
              derivationPath: allocatorResult.derivationPath,
              addressIndex: allocatorResult.addressIndex,
              xpub: allocatorResult.xpub,
              destinationTag: allocatorResult.destinationTag,
              type: 'standard'
            };
          }
        } else {
          console.error('address-allocator invocation failed, falling back to local generation:', error);
        }
      }

      // 既存の擬似生成にフォールバック（allocator未対応時の保険）
      const walletInfo = generateMultichainAddress(user.id, chain, network, asset);
      const { data: newAddress, error: insertError } = await supabase
        .from('deposit_addresses')
        .upsert({
          user_id: user.id,
          chain: chainKey,
          network: networkKey,
          asset,
          address: walletInfo.address,
          derivation_path: walletInfo.derivationPath,
          address_index: walletInfo.addressIndex,
          destination_tag: walletInfo.destinationTag?.toString(),
          xpub: walletInfo.xpub,
          active: true
        }, { onConflict: 'user_id,chain,network,asset' })
        .select('address, derivation_path, address_index, xpub, destination_tag')
        .maybeSingle();

      if (insertError) {
        if ((insertError as { code?: string; message?: string }).code === '23505' || (insertError as { code?: string; message?: string }).message?.includes('duplicate key value')) {
          const { data: after, error: afterErr } = await supabase
            .from('deposit_addresses')
            .select('address, derivation_path, address_index, xpub, destination_tag')
            .eq('user_id', user.id)
            .eq('chain', chainKey)
            .eq('network', networkKey)
            .eq('asset', asset)
            .eq('active', true)
            .maybeSingle();
          if (!afterErr && after) {
            // 競合回避後のアドレスのサブスクリプション確保
            await ensureTatumSubscription(after.address, chainKey, networkKey, asset);
            return {
              address: after.address,
              derivationPath: after.derivation_path,
              addressIndex: after.address_index,
              xpub: after.xpub,
              destinationTag: after.destination_tag,
              type: 'standard'
            };
          }
        }
        throw insertError;
      }

      // 新規作成成功時のサブスクリプション確保
      await ensureTatumSubscription(newAddress.address, chainKey, networkKey, asset);

      return {
        address: newAddress.address,
        derivationPath: newAddress.derivation_path,
        addressIndex: newAddress.address_index,
        xpub: newAddress.xpub,
        destinationTag: newAddress.destination_tag,
        type: 'standard'
      };
    } catch (error) {
      console.error('Failed to get or create deposit address:', error);

      // 詳細エラー分析とユーザーフィードバック
      const enhancedError = analyzeError(error, { chain, network, asset, operation: 'アドレス生成' });
      const recoveryActions = generateRecoveryActions(enhancedError, {
        retry: () => {
          currentAddressState.execute(
            () => getOrCreateDepositAddress(chain, network, asset),
            { context: 'ウォレットアドレスの生成', showErrorToast: false }
          );
        },
        refresh: () => window.location.reload(),
        support: () => {
          window.open('mailto:support@example.com', '_blank', 'noopener,noreferrer');
        }
      });

      // 進行中の通知を削除
      toast.dismissToast(progressToastId);

      // エラー通知表示
      toast.showError(enhancedError.userMessage, {
        description: enhancedError.details,
        context: { chain, network, asset, operation: 'アドレス生成' },
        actions: recoveryActions.map(action => ({
          label: action.label,
          onClick: action.action,
          variant: action.isPrimary ? 'default' : action.isDestructive ? 'destructive' : 'outline'
        })),
        priority: enhancedError.severity === 'critical' ? 'critical' : 'high',
        persistent: enhancedError.severity === 'critical'
      });

      throw enhancedError;
    } finally {
      // 成功時にプログレス通知を成功通知に変更
      toast.dismissToast(progressToastId);
    }
  }, [user]);

  // Tatumサブスクリプション確保ヘルパー
  const ensureTatumSubscription = useCallback(async (
    address: string,
    chain: string,
    network: string,
    asset: string
  ): Promise<void> => {
    try {
      console.log(`🔔 Tatumサブスクリプション確保開始: ${address} (${chain}/${network}/${asset})`);

      // tatum-subscription-ensure Edge Functionを呼び出し
      const { data, error } = await supabase.functions.invoke('tatum-subscription-ensure', {
        body: { address, chain, network, asset }
      });

      if (error) {
        console.error('Edge Function呼び出しエラー:', error);
        throw error;
      }

      if (!data?.success) {
        console.error('サブスクリプション作成失敗:', data?.error);
        throw new Error(data?.error || 'サブスクリプション作成に失敗しました');
      }

      const result = data.data;
      console.log(`✅ Tatumサブスクリプション確保完了: ${address}`, {
        created: result?.created || [],
        skipped: result?.skipped || [],
        errors: result?.errors || []
      });

      // 作成されたサブスクリプション種別をログ出力（型安全チェック付き）
      if (result?.created) {
        if (Array.isArray(result.created) && result.created.length > 0) {
          console.log(`📝 作成されたサブスクリプション: ${result.created.join(', ')}`);
        } else if (typeof result.created === 'string') {
          console.log(`📝 作成されたサブスクリプション: ${result.created}`);
        } else {
          console.log(`📝 作成されたサブスクリプション (非標準形式):`, result.created);
        }
      }
      if (result?.skipped) {
        if (Array.isArray(result.skipped) && result.skipped.length > 0) {
          console.log(`⏭️ スキップされたサブスクリプション: ${result.skipped.join(', ')}`);
        } else if (typeof result.skipped === 'string') {
          console.log(`⏭️ スキップされたサブスクリプション: ${result.skipped}`);
        } else {
          console.log(`⏭️ スキップされたサブスクリプション (非標準形式):`, result.skipped);
        }
      }

    } catch (error) {
      console.error('Tatumサブスクリプション確保失敗:', error);
      // サブスクリプション作成に失敗してもアドレス生成は成功とする
      // ユーザーには警告として通知（UI改善時に実装）

      // 開発環境では詳細エラーをコンソールに出力
      if (import.meta.env.DEV) {
        console.warn('⚠️ サブスクリプション作成は失敗しましたが、アドレス生成は継続します');
        console.warn('詳細エラー:', error);
      }
    }
  }, []);

  // チェーン/ネットワーク名称のDB用正規化
  const normalizeForConfig = (
    chain: SupportedChain,
    network: SupportedNetwork
  ): { chain: string; network: string } => {
    if (chain === 'eth') {
      return { chain: 'evm', network: network === 'mainnet' ? 'ethereum' : network };
    }
    return { chain, network };
  };

  // マルチチェーン設定を取得
  const getMultichainConfig = async (chain: SupportedChain, network: SupportedNetwork, asset: SupportedAsset) => {
    try {
      const { chain: chainKey, network: networkKey } = normalizeForConfig(chain, network);
      const { data, error } = await supabase
        .from('chain_configs')
        .select('deposit_enabled, min_confirmations, min_deposit')
        .eq('chain', chainKey)
        .eq('network', networkKey)
        .eq('asset', asset)
        .maybeSingle();

      if (error || !data) {
        // デフォルト設定を返す
        const chainInfo = getChainConfig(chain, network);
        const minDeposit = getMinimumDepositAmount(chain, network, asset);
        return {
          deposit_enabled: true,
          min_confirmations: chainInfo?.minConfirmations || 1,
          min_deposit: minDeposit
        };
      }

      return {
        deposit_enabled: (data as { deposit_enabled?: boolean }).deposit_enabled !== false,
        min_confirmations: (data as { min_confirmations?: number }).min_confirmations || 1,
        min_deposit: (data as { min_deposit?: number }).min_deposit || getMinimumDepositAmount(chain, network, asset)
      };
    } catch (error) {
      console.error('Failed to get multichain config:', error);
      throw error;
    }
  };

  // プログレスステップの更新ロジック
  useEffect(() => {
    if (currentAddressState.loading) {
      setDepositStep('awaiting_payment');
    } else if (currentAddressState.data) {
      setDepositStep('awaiting_payment');
    } else if (currentAddressState.error) {
      setDepositStep('awaiting_payment');
    }
  }, [currentAddressState.loading, currentAddressState.data, currentAddressState.error]);

  // チェーン設定取得時に必要確認数を更新
  useEffect(() => {
    if (chainConfigState.data?.min_confirmations) {
      setRequiredConfirmations(chainConfigState.data.min_confirmations);
    }
  }, [chainConfigState.data]);

  // 通貨・ネットワーク選択時にアドレスとチェーン設定を取得
  useEffect(() => {
    const abortController = new AbortController();
    const signal = abortController.signal;

    console.log('🔄 Currency change detected:', {
      selectedChain,
      selectedAsset,
      selectedNetwork,
      userId: user?.id,
      abortSignal: signal.aborted ? 'ABORTED' : 'ACTIVE'
    });

    if (!user?.id || !selectedChain || !selectedAsset || !selectedNetwork) {
      console.log('⏹️ Early return - missing required values');
      return () => {
        console.log('🧹 Cleanup: Aborting controller (early return)');
        abortController.abort();
      };
    }

    // reset()実行前の状態をログ
    console.log('📊 Current state before reset:', {
      currentAddressData: currentAddressState.data,
      currentAddressLoading: currentAddressState.loading,
      currentAddressError: currentAddressState.error,
      chainConfigData: chainConfigState.data,
      chainConfigLoading: chainConfigState.loading,
      chainConfigError: chainConfigState.error
    });

    // 銘柄変更時に古い状態をクリア
    console.log('🧹 Executing reset() calls...');
    currentAddressState.reset();
    chainConfigState.reset();

    console.log('✅ Reset completed. State after reset:', {
      currentAddressData: currentAddressState.data,
      currentAddressLoading: currentAddressState.loading,
      currentAddressError: currentAddressState.error,
      chainConfigData: chainConfigState.data,
      chainConfigLoading: chainConfigState.loading,
      chainConfigError: chainConfigState.error
    });

    // 非同期処理を管理する関数
    const executeAfterReset = async () => {
      try {
        // キャンセル確認
        if (signal.aborted) {
          console.log('❌ Execution cancelled - signal aborted');
          return;
        }

        // setState()の非同期更新完了を待つ
        await new Promise(resolve => setTimeout(resolve, 10));

        // 再度キャンセル確認
        if (signal.aborted) {
          console.log('❌ Execution cancelled after delay - signal aborted');
          return;
        }

        console.log('🕐 After 10ms delay. Current state:', {
          currentAddressData: currentAddressState.data,
          currentAddressLoading: currentAddressState.loading,
          currentAddressError: currentAddressState.error,
          signalAborted: signal.aborted
        });

        console.log('🚀 Starting address generation...');
        // アドレス生成実行（AbortSignal付き）
        currentAddressState.execute(
          () => getOrCreateDepositAddress(selectedChain, selectedNetwork, selectedAsset),
          {
            context: 'ウォレットアドレスの生成',
            showErrorToast: true,
            abortSignal: signal
          }
        );

        console.log('⚙️ Starting chain config retrieval...');
        // チェーン設定取得（AbortSignal付き）
        chainConfigState.execute(
          () => getMultichainConfig(selectedChain, selectedNetwork, selectedAsset),
          {
            context: 'チェーン設定の取得',
            showErrorToast: true,
            abortSignal: signal
          }
        );

        console.log('🏁 Delayed execution completed');
      } catch (error) {
        if (signal.aborted) {
          console.log('❌ Execution cancelled due to abort signal');
        } else {
          console.error('💥 Execution failed:', error);
        }
      }
    };

    executeAfterReset();

    // クリーンアップ関数
    return () => {
      console.log('🧹 Cleanup: Aborting current operations for:', {
        selectedChain,
        selectedAsset,
        selectedNetwork
      });
      abortController.abort();
    };
  }, [user?.id, selectedChain, selectedAsset, selectedNetwork]);

  const handleCopyAddress = async () => {
    if (!currentAddressState.data) {
      toast.showWarning('コピーエラー', {
        description: 'コピーするアドレスが見つかりません。',
        context: { chain: selectedChain, network: selectedNetwork, asset: selectedAsset }
      });
      return;
    }

    const addressData = currentAddressState.data;
    let copyText: string;
    let addressFormatted: string;

    try {
      // XRPチェーンかつ有効なデータの場合
      if (selectedChain === 'xrp' && typeof addressData === 'object' && addressData && 'address' in addressData && (addressData as DepositAddress).address) {
        const xrpData = addressData as XRPDepositData;
        copyText = `Address: ${xrpData.address}\nDestination Tag: ${xrpData.destinationTag || ''}`;
        addressFormatted = `${xrpData.address.slice(0, 10)}...${xrpData.address.slice(-6)}`;
      }
      // その他のオブジェクト型の場合
      else if (typeof addressData === 'object' && addressData && 'address' in addressData) {
        const objectData = addressData as DepositAddress;
        copyText = objectData.address || '';
        addressFormatted = `${copyText.slice(0, 10)}...${copyText.slice(-6)}`;
      }
      // 文字列の場合
      else if (typeof addressData === 'string') {
        copyText = addressData;
        addressFormatted = `${copyText.slice(0, 10)}...${copyText.slice(-6)}`;
      } else {
        throw new Error('アドレス形式が無効です');
      }

      await navigator.clipboard.writeText(copyText);

      // 成功通知（拡張版）
      toast.showSuccess('アドレス情報をコピーしました', {
        description: selectedChain === 'xrp'
          ? 'XRPアドレスとDestination Tagがコピーされました。'
          : 'ウォレットアドレスがクリップボードにコピーされました。',
        context: {
          chain: selectedChain,
          network: selectedNetwork,
          asset: selectedAsset,
          address: copyText,
          operation: 'アドレスコピー'
        },
        actions: [{
          label: '送金ガイドを表示',
          onClick: () => {
            // 送金ガイドセクションにスクロール（後で実装）
            document.getElementById('sending-guidance')?.scrollIntoView({ behavior: 'smooth' });
          }
        }],
        duration: 4000
      });

    } catch (error) {
      const enhancedError = analyzeError(error, {
        chain: selectedChain,
        network: selectedNetwork,
        asset: selectedAsset,
        operation: 'アドレスコピー'
      });

      toast.showError('コピー失敗', {
        description: enhancedError.details || 'クリップボードへのコピーに失敗しました。',
        context: {
          chain: selectedChain,
          network: selectedNetwork,
          asset: selectedAsset,
          operation: 'アドレスコピー'
        },
        actions: [{
          label: '再試行',
          onClick: handleCopyAddress
        }]
      });
    }
  };

  const handleDownloadQR = async () => {
    try {
      // QRコード要素を取得してダウンロード処理（簡易版）
      toast.showInfo('QRコードダウンロード', {
        description: 'QRコードのダウンロードを開始します。',
        context: {
          chain: selectedChain,
          network: selectedNetwork,
          asset: selectedAsset,
          operation: 'QRダウンロード'
        }
      });

      // 実際のダウンロード処理はここに実装
      // 現時点では通知のみ

    } catch (error) {
      const enhancedError = analyzeError(error, {
        chain: selectedChain,
        network: selectedNetwork,
        asset: selectedAsset,
        operation: 'QRダウンロード'
      });

      toast.showError('ダウンロード失敗', {
        description: enhancedError.details || 'QRコードのダウンロードに失敗しました。',
        context: {
          chain: selectedChain,
          network: selectedNetwork,
          asset: selectedAsset,
          operation: 'QRダウンロード'
        }
      });
    }
  };

  // 表示用QR値を生成（XRPはDestination Tag含む）
  const qrValue = useMemo(() => {
    const data = currentAddressState.data;
    // ローディング中やエラー時は空文字を返す
    if (currentAddressState.loading || currentAddressState.error || !data) return "";
    const address = typeof data === 'object' ? (data as DepositAddress).address : (data as string);
    if (!address) return "";
    if (selectedChain === 'xrp') {
      // XRPの場合はdestinationTagも考慮
      const dt = typeof data === 'object' ? ((data as { destinationTag?: string; destination_tag?: string }).destinationTag || (data as { destinationTag?: string; destination_tag?: string }).destination_tag) : undefined;
      return dt ? `xrpl:${address}?dt=${dt}` : `xrpl:${address}`;
    }
    if (selectedChain === 'btc') return `bitcoin:${address}`;
    if (selectedChain === 'eth') return `ethereum:${address}`;
    // 他チェーンはシンプルにアドレスのみ
    return address;
  }, [currentAddressState.data, currentAddressState.loading, currentAddressState.error, selectedChain]);

  const depositHistoryState = useAsyncState<DepositHistory[]>();

  // 入金履歴を読み込み
  useEffect(() => {
    if (user?.id) {
      depositHistoryState.execute(
        async () => {
          const { data, error } = await supabase
            .from('deposits')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(100);
          if (error) throw error;
          return data || [];
        },
        {
          context: '入金履歴の読み込み',
          showErrorToast: true
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // リアルタイム入金イベント処理
  useEffect(() => {
    const recentDeposits = realtimeDeposits.getRecentDeposits(10);

    // 新規入金検知時にプログレス状態を更新
    recentDeposits.forEach(depositEvent => {
      if (depositEvent.event === 'INSERT' && depositEvent.new_record) {
        const deposit = depositEvent.new_record;

        // 現在選択中のチェーン/アセットと一致する入金があれば状態更新
        if (deposit.chain === selectedChain && deposit.asset === selectedAsset) {
          setDepositStep('payment_detected');
          if (deposit.transaction_hash) {
            setCurrentTxHash(deposit.transaction_hash);
          }
          if (typeof deposit.confirmations_observed === 'number') {
            setCurrentConfirmations(deposit.confirmations_observed);
          }
          if (typeof deposit.amount === 'number') {
            setExpectedAmount(deposit.amount.toString());
          }

          // 入金検知の通知
          toast.showSuccess('入金を検知しました', {
            description: `${deposit.amount} ${deposit.asset} の入金が検知されました。確認をお待ちください。`,
            context: {
              operation: '入金検知',
              amount: deposit.amount.toString(),
              asset: deposit.asset,
              txHash: deposit.transaction_hash
            },
            actions: deposit.transaction_hash ? [{
              label: 'トランザクション確認',
              onClick: () => {
                const explorerUrl = txLink(selectedChain, selectedNetwork, deposit.transaction_hash!);
                if (explorerUrl) {
                  window.open(explorerUrl, '_blank', 'noopener,noreferrer');
                }
              }
            }] : undefined,
            duration: 8000
          });
        }
      }

      // 確認数更新イベント処理
      if (depositEvent.event === 'UPDATE' && depositEvent.new_record && depositEvent.old_record) {
        const newDeposit = depositEvent.new_record;
        const oldDeposit = depositEvent.old_record;

        // 確認数が増加した場合
        if ((newDeposit.confirmations_observed || 0) > (oldDeposit.confirmations_observed || 0)) {
          if (newDeposit.chain === selectedChain && newDeposit.asset === selectedAsset) {
            setCurrentConfirmations(newDeposit.confirmations_observed || 0);

            // 確認数更新の通知
            const confirmations = newDeposit.confirmations_observed || 0;
            const required = newDeposit.confirmations_required || requiredConfirmations;

            if (confirmations >= required) {
              setDepositStep('completed');
              toast.showSuccess('入金が完了しました', {
                description: `${newDeposit.amount} ${newDeposit.asset} の入金が完了し、残高に反映されました。`,
                context: {
                  operation: '入金完了',
                  amount: newDeposit.amount.toString(),
                  asset: newDeposit.asset,
                  confirmations: confirmations
                },
                duration: 10000
              });
            } else {
              setDepositStep('confirming');
              toast.showInfo('確認進行中', {
                description: `確認数: ${confirmations}/${required} - 入金確認が進行中です。`,
                context: {
                  operation: '入金確認',
                  confirmations: confirmations,
                  required: required
                },
                duration: 5000
              });
            }
          }
        }

        // ステータス変更時の処理
        if (oldDeposit.status !== newDeposit.status) {
          if (newDeposit.chain === selectedChain && newDeposit.asset === selectedAsset) {
            if (newDeposit.status === 'confirmed') {
              setDepositStep('completed');
            } else if (newDeposit.status === 'failed') {
              setDepositStep('failed');
              toast.showError('入金処理エラー', {
                description: '入金処理中にエラーが発生しました。サポートにお問い合わせください。',
                context: {
                  operation: '入金処理',
                  status: newDeposit.status,
                  txHash: newDeposit.transaction_hash
                },
                persistent: true
              });
            }
          }
        }
      }
    });

    // 入金履歴の自動更新（リアルタイムイベント発生時）
    if (recentDeposits.length > 0 && realtimeDeposits.state.lastEventTimestamp) {
      // 最後の履歴読み込みから新しいイベントがあった場合のみ更新
      const shouldRefresh = !depositHistoryState.lastFetch ||
        (realtimeDeposits.state.lastEventTimestamp?.getTime() || 0) > (depositHistoryState.lastFetch || 0);

      if (shouldRefresh && !depositHistoryState.loading) {
        depositHistoryState.execute(
          async () => {
            const { data, error } = await supabase
              .from('deposits')
              .select('*')
              .eq('user_id', user!.id)
              .order('created_at', { ascending: false })
              .limit(100);
            if (error) throw error;
            return data || [];
          },
          {
            context: '入金履歴の自動更新',
            showErrorToast: false // 自動更新時はエラー通知を抑制
          }
        );
      }
    }
  }, [realtimeDeposits.state.deposits, realtimeDeposits.state.lastEventTimestamp, selectedChain, selectedAsset, requiredConfirmations, toast]);

  const txLink = (chain: SupportedChain, network: SupportedNetwork, tx?: string | null) => {
    if (!tx) return null;
    return getExplorerUrl(chain, network, 'tx', tx);
  };

  const buildFaqItems = () => {
    const minConf = chainConfigState.data?.min_confirmations || 1;
    const minDep = chainConfigState.data?.min_deposit || getMinimumDepositAmount(selectedChain, selectedNetwork, selectedAsset);
    const rangeHints: Partial<Record<SupportedChain, string>> = {
      btc: '推奨範囲: 0.0001〜0.001 BTC',
      eth: '推奨範囲: 0.01〜0.05 ETH',
      xrp: '推奨範囲: 20〜50 XRP',
      trc: selectedAsset === 'TRX' ? '推奨範囲: 10〜100 TRX' : undefined,
      ada: '推奨範囲: 1〜10 ADA'
    };
    const common = [
      {
        question: `${selectedAsset}の入金方法は？`,
        answer: `${selectedAsset} を選択したネットワーク（${selectedNetwork}）で送金してください。最小入金額は ${minDep} ${selectedAsset}、必要確認数は ${minConf} です。${rangeHints[selectedChain] ? `（${rangeHints[selectedChain]}）` : ''}`
      },
      {
        question: '入金はいつ反映されますか？',
        answer: `ブロックチェーン上で ${minConf} 回の確認が取れた後に残高へ反映します。ネットワーク状況により時間は前後します。`
      },
      {
        question: '間違ったネットワークで送金した場合',
        answer: `選択したチェーン/ネットワーク以外に送金された資金は回復できない場合があります。送金前に必ずネットワークを確認してください。`
      }
    ];
    const extras: { question: string; answer: string }[] = [];
    if (selectedChain === 'xrp') {
      extras.push({
        question: 'XRPのDestination Tagは必須ですか？',
        answer: 'はい。必ず指定のDestination Tagを入力してください。未入力・誤入力の場合、資金が失われる可能性があります。'
      });
    }
    if (selectedChain === 'trc') {
      extras.push({
        question: 'TRONの確定目安は？',
        answer: '目安として19ブロックで確定とみなします（ネットワーク状況に依存）。TRC-20(USDT)も同様にTransferイベントの確定待ちが必要です。'
      });
    }
    if (selectedChain === 'ada') {
      extras.push({
        question: 'ADAはUTXOで何か注意点はありますか？',
        answer: 'CardanoはUTXOモデルのため、複数の入出力に分割されることがあります。履歴の反映に差が出る場合があります。'
      });
    }
    return [...common, ...extras];
  };
  const faqItems = buildFaqItems();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* ネットワーク状態インジケーター */}
        <NetworkStatusIndicator />

        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">入金</h1>
            <Badge variant="outline" className="text-blue-600">
              フェーズ2: リアルタイム監視対応
            </Badge>
            {!networkStatus.isOnline && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <WifiOff className="h-3 w-3" />
                オフライン
              </Badge>
            )}
            {/* リアルタイム監視状態インジケーター */}
            {user?.id && (
              <Badge
                variant={realtimeDeposits.state.connectionState.isConnected ? "default" : "secondary"}
                className={`flex items-center gap-1 ${realtimeDeposits.state.connectionState.quality === 'good' ? 'text-green-600' :
                    realtimeDeposits.state.connectionState.quality === 'poor' ? 'text-amber-600' :
                      'text-gray-600'
                  }`}
              >
                {realtimeDeposits.state.connectionState.isConnected ? (
                  <Activity className="h-3 w-3" />
                ) : (
                  <Clock className="h-3 w-3" />
                )}
                {realtimeDeposits.state.connectionState.isConnected ? 'リアルタイム監視中' : '監視待機中'}
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Deposit Form */}
          <div className="lg:col-span-2 space-y-6">
            {!SERVICE_RESTRICTIONS.isDepositEnabled() ? (
              <Card className="bg-white border border-yellow-300 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-xl font-semibold flex items-center gap-2 text-gray-900">
                    <AlertCircle className="h-6 w-6 text-yellow-600" />
                    入金機能の一時停止
                  </CardTitle>
                  <CardDescription className="text-gray-600">
                    現在、新規入金の受付を一時的に停止しております
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <h4 className="font-semibold text-gray-900 mb-2">お知らせ</h4>
                      <div className="text-sm text-gray-700 space-y-2 whitespace-pre-line">
                        {SERVICE_RESTRICTIONS.getRestrictionMessage()}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-6 space-y-6">
                {/* Step 1: Asset Selection */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">
                      1
                    </div>
                    <label className="text-sm font-medium">資産</label>
                  </div>
                  <Select value={selectedAsset} onValueChange={(value) => setSelectedAsset(value as SupportedAsset)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableAssets.map((asset) => (
                        <SelectItem key={asset} value={asset}>
                          <div className="flex items-center gap-2">
                            {assetIconSrc(asset) ? (
                              <img src={assetIconSrc(asset)} alt={asset} className="w-4 h-4" />
                            ) : (
                              <div className="w-4 h-4 bg-primary/20 rounded" />
                            )}
                            {asset === 'ETH' ? 'Ethereum' :
                              asset === 'BTC' ? 'Bitcoin' :
                                asset === 'USDT' ? 'Tether USD' :
                                  asset === 'TRX' ? 'Tron (TRX)' :
                                    asset === 'XRP' ? 'XRP' :
                                      asset === 'ADA' ? 'Cardano (ADA)' : asset}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Step 2: Chain Selection（資産に対応するチェーンのみ表示） */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">
                      2
                    </div>
                    <label className="text-sm font-medium">チェーン</label>
                  </div>
                  <Select value={selectedChain} onValueChange={(value) => setSelectedChain(value as SupportedChain)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getSupportedChainsForAsset(selectedAsset).map((chain) => (
                        <SelectItem key={chain} value={chain}>
                          {chainLabel(chain, selectedAsset)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {selectedAsset && (
                    <div className="bg-primary/10 p-3 rounded-lg">
                      <Badge variant="outline" className="bg-primary text-primary-foreground">
                        {selectedAsset}
                      </Badge>
                      {selectedAsset === 'USDT' && selectedChain === 'eth' && (
                        <p className="text-xs text-muted-foreground mt-1">
                          ERC-20トークンとして送金してください
                        </p>
                      )}
                      {selectedAsset === 'USDT' && selectedChain === 'trc' && (
                        <p className="text-xs text-muted-foreground mt-1">
                          TRC-20トークンとして送金してください
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Step 3: Network Selection (通常は非表示/本番はMainnet固定) */}
                {enableTestnets && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">
                        3
                      </div>
                      <label className="text-sm font-medium">ネットワーク</label>
                    </div>
                    <Select value={selectedNetwork} onValueChange={(value) => setSelectedNetwork(value as SupportedNetwork)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedChain === 'eth' && (
                          <>
                            <SelectItem value="mainnet">
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 bg-blue-600 rounded-full"></div>
                                Ethereum Mainnet
                              </div>
                            </SelectItem>
                            <SelectItem value="sepolia">
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 bg-purple-600 rounded-full"></div>
                                Sepolia Testnet
                              </div>
                            </SelectItem>
                          </>
                        )}
                        {selectedChain === 'btc' && (
                          <>
                            <SelectItem value="mainnet">
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 bg-orange-500 rounded-full"></div>
                                Bitcoin Mainnet
                              </div>
                            </SelectItem>
                            <SelectItem value="testnet">
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 bg-orange-300 rounded-full"></div>
                                Bitcoin Testnet
                              </div>
                            </SelectItem>
                          </>
                        )}
                        {selectedChain === 'trc' && (
                          <>
                            <SelectItem value="mainnet">
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 bg-red-500 rounded-full"></div>
                                Tron Mainnet
                              </div>
                            </SelectItem>
                            <SelectItem value="shasta">
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 bg-red-300 rounded-full"></div>
                                Shasta Testnet
                              </div>
                            </SelectItem>
                          </>
                        )}
                        {selectedChain === 'xrp' && (
                          <>
                            <SelectItem value="mainnet">
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 bg-gray-600 rounded-full"></div>
                                XRP Mainnet
                              </div>
                            </SelectItem>
                            <SelectItem value="testnet">
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 bg-gray-300 rounded-full"></div>
                                XRP Testnet
                              </div>
                            </SelectItem>
                          </>
                        )}
                        {selectedChain === 'ada' && (
                          <>
                            <SelectItem value="mainnet">
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
                                Cardano Mainnet
                              </div>
                            </SelectItem>
                            <SelectItem value="testnet">
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 bg-blue-300 rounded-full"></div>
                                Cardano Testnet
                              </div>
                            </SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>

                    <SmartLoadingState
                      loading={chainConfigState.loading}
                      error={chainConfigState.error}
                      context={{
                        operation: 'チェーン設定読み込み',
                        chain: selectedChain,
                        network: selectedNetwork,
                        asset: selectedAsset
                      }}
                      onRetry={() => {
                        chainConfigState.execute(
                          () => getMultichainConfig(selectedChain, selectedNetwork, selectedAsset),
                          { context: 'チェーン設定の取得', showErrorToast: false }
                        );
                      }}
                      loadingComponent={<div className="text-xs text-muted-foreground">設定を読み込み中...</div>}
                    >
                      {chainConfigState.data && (
                        <div className="bg-muted/50 p-3 rounded-lg space-y-1">
                          <div className="flex items-center gap-2">
                            {chainConfigState.data.deposit_enabled ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-red-600" />
                            )}
                            <span className="text-sm font-medium">
                              {chainConfigState.data.deposit_enabled ? '入金受付中' : '入金停止中'}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground space-y-1">
                            <p>最小入金額: {chainConfigState.data.min_deposit} {selectedAsset}</p>
                            <p>必要確認数: {chainConfigState.data.min_confirmations} ブロック</p>
                          </div>
                        </div>
                      )}
                    </SmartLoadingState>
                  </div>
                )}

                {/* Step 4: Wallet Address */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">
                      4
                    </div>
                    <label className="text-sm font-medium">
                      {selectedChain === 'xrp' ? '入金情報' : 'ウォレットアドレス'}
                    </label>
                  </div>

                  <SmartLoadingState
                    loading={currentAddressState.loading}
                    error={currentAddressState.error}
                    context={{
                      operation: 'ウォレットアドレス生成',
                      chain: selectedChain,
                      network: selectedNetwork,
                      asset: selectedAsset
                    }}
                    onRetry={() => {
                      currentAddressState.execute(
                        () => getOrCreateDepositAddress(selectedChain, selectedNetwork, selectedAsset),
                        { context: 'ウォレットアドレスの生成', showErrorToast: false }
                      );
                    }}
                    loadingComponent={<DataLoading rows={1} />}
                    errorComponent={
                      currentAddressState.error ? (
                        <EnhancedErrorDisplay
                          error={analyzeError(currentAddressState.error, {
                            chain: selectedChain,
                            network: selectedNetwork,
                            asset: selectedAsset,
                            operation: 'アドレス生成'
                          })}
                          recoveryActions={generateRecoveryActions(
                            analyzeError(currentAddressState.error),
                            {
                              retry: () => {
                                currentAddressState.execute(
                                  () => getOrCreateDepositAddress(selectedChain, selectedNetwork, selectedAsset),
                                  { context: 'ウォレットアドレスの生成', showErrorToast: false }
                                );
                              }
                            }
                          )}
                          className="my-4"
                        />
                      ) : null
                    }
                  >
                    <div className="space-y-4">
                      {selectedChain === 'xrp' ? (
                        // XRP用の特別表示
                        <div className="space-y-3">
                          <div className="flex gap-2">
                            <Input
                              value={(() => {
                                // ローディング中やエラー時は空文字を表示
                                if (currentAddressState.loading || currentAddressState.error) return '';
                                const data = currentAddressState.data;
                                if (data && typeof data === 'object' && 'address' in (data as object)) {
                                  const objData = data as DepositAddress;
                                  return objData.address || '';
                                }
                                return '';
                              })()}
                              readOnly
                              className="flex-1 font-mono text-sm"
                              placeholder="XRPアドレスを生成中..."
                            />
                            <Button
                              variant="outline"
                              onClick={handleCopyAddress}
                              disabled={!currentAddressState.data}
                            >
                              <Copy className="h-4 w-4 mr-1" />
                              コピー
                            </Button>
                          </div>
                          {(() => {
                            // XRPチェーンかつデータ存在かつローディング/エラーでない場合のみ表示
                            if (selectedChain !== 'xrp' || currentAddressState.loading || currentAddressState.error) return null;
                            const data = currentAddressState.data;
                            if (data && typeof data === 'object' && 'destinationTag' in (data as object)) {
                              const xrpData = data as XRPDepositData;
                              return xrpData.destinationTag ? (
                                <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
                                  <div className="flex items-center gap-2 mb-2">
                                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                                    <span className="font-medium text-amber-800">Destination Tag (必須)</span>
                                  </div>
                                  <div className="flex gap-2">
                                    <Input
                                      value={xrpData.destinationTag || ''}
                                      readOnly
                                      className="flex-1 font-mono text-sm bg-white"
                                    />
                                  </div>
                                  <p className="text-xs text-amber-700 mt-2">
                                    XRP送金時は必ずこのDestination Tagを入力してください。
                                    入力を忘れると資金を失う可能性があります。
                                  </p>
                                </div>
                              ) : null;
                            }
                            return null;
                          })()}
                        </div>
                      ) : (
                        // 通常のアドレス表示
                        <div className="flex gap-2">
                          <Input
                            value={
                              // ローディング中やエラー時は空文字を表示
                              currentAddressState.loading || currentAddressState.error ? '' :
                              currentAddressState.data
                                ? typeof currentAddressState.data === 'object'
                                  ? currentAddressState.data?.address || ''
                                  : (currentAddressState.data as string) || ''
                                : ''
                            }
                            readOnly
                            className="flex-1 font-mono text-sm"
                            placeholder="アドレスを生成中..."
                          />
                          <Button
                            variant="outline"
                            onClick={handleCopyAddress}
                            disabled={!currentAddressState.data}
                          >
                            <Copy className="h-4 w-4 mr-1" />
                            コピー
                          </Button>
                        </div>
                      )}

                      {/* QR Code */}
                      {currentAddressState.data && !currentAddressState.loading && !currentAddressState.error && (
                        <div className="flex flex-col items-center space-y-4">
                          <div className="w-48 h-48 bg-white p-2 rounded-lg border flex items-center justify-center">
                            <QRCode value={qrValue || ''} size={176} level="H" />
                          </div>
                          <Button variant="outline" onClick={handleDownloadQR}>
                            <Download className="h-4 w-4 mr-1" />
                            ダウンロード
                          </Button>
                        </div>
                      )}
                    </div>
                  </SmartLoadingState>


                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                      <div className="text-sm text-amber-800">
                        <p className="font-medium">重要な注意事項</p>
                        <ul className="mt-1 space-y-1 text-xs">
                          <li>• {chainConfig?.name || selectedChain}ネットワークのみ対応</li>
                          <li>• 最小入金額: {chainConfigState.data?.min_deposit || '—'} {selectedAsset}</li>
                          <li>• 入金反映まで{chainConfigState.data?.min_confirmations || '—'}ブロック確認が必要</li>
                          {selectedChain === 'xrp' && (
                            <li>• <strong>Destination Tagの入力は必須です</strong></li>
                          )}
                          <li>• 他のネットワークからの送金は資産を失う可能性があります</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            )}

            {/* Recent Deposit History */}
            <Card>
              <CardHeader>
                <CardTitle>最近の入金履歴</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-3">日時</th>
                        <th className="text-left p-3">資産</th>
                        <th className="text-left p-3">ネットワーク</th>
                        <th className="text-left p-3">トランザクション</th>
                        <th className="text-left p-3">金額</th>
                        <th className="text-left p-3">確認数</th>
                        <th className="text-left p-3">ステータス</th>
                      </tr>
                    </thead>
                    <tbody>
                      <SmartLoadingState
                        loading={depositHistoryState.loading}
                        error={depositHistoryState.error}
                        context={{
                          operation: '入金履歴読み込み',
                          chain: selectedChain,
                          network: selectedNetwork,
                          asset: selectedAsset
                        }}
                        onRetry={() => {
                          depositHistoryState.execute(
                            async () => {
                              const { data, error } = await supabase
                                .from('deposits')
                                .select('*')
                                .eq('user_id', user!.id)
                                .order('created_at', { ascending: false })
                                .limit(100);
                              if (error) throw error;
                              return data || [];
                            },
                            {
                              context: '入金履歴の読み込み',
                              showErrorToast: false
                            }
                          );
                        }}
                        loadingComponent={
                          <tr>
                            <td colSpan={7} className="p-6">
                              <DataLoading rows={3} columns={7} />
                            </td>
                          </tr>
                        }
                        errorComponent={
                          depositHistoryState.error ? (
                            <tr>
                              <td colSpan={7} className="p-6">
                                <EnhancedErrorDisplay
                                  error={analyzeError(depositHistoryState.error, {
                                    operation: '入金履歴読み込み'
                                  })}
                                  recoveryActions={[{
                                    label: '再試行',
                                    action: () => {
                                      depositHistoryState.execute(
                                        async () => {
                                          const { data, error } = await supabase
                                            .from('deposits')
                                            .select('*')
                                            .eq('user_id', user!.id)
                                            .order('created_at', { ascending: false })
                                            .limit(100);
                                          if (error) throw error;
                                          return data || [];
                                        },
                                        { context: '入金履歴の読み込み', showErrorToast: false }
                                      );
                                    },
                                    isPrimary: true
                                  }]}
                                  className="text-center"
                                />
                              </td>
                            </tr>
                          ) : null
                        }
                      >
                        {(!depositHistoryState.data || depositHistoryState.data.length === 0) ? (
                          <tr>
                            <td colSpan={7} className="text-center py-12 text-muted-foreground">
                              <div className="flex flex-col items-center space-y-2">
                                <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center">
                                  <Clock className="w-6 h-6 bg-muted-foreground/20" />
                                </div>
                                入金履歴がありません
                              </div>
                            </td>
                          </tr>
                        ) : (
                          depositHistoryState.data.map((d, index) => (
                            <tr key={d.id || index} className="border-b hover:bg-muted/50">
                              <td className="p-3">{new Date(d.created_at).toLocaleString()}</td>
                              <td className="p-3">
                                <Badge variant="outline">{d.asset || d.currency}</Badge>
                              </td>
                              <td className="p-3">{d.network || '—'}</td>
                              <td className="p-3 font-mono text-xs">
                                {d.transaction_hash ? (
                                  <a
                                    href={txLink((d.chain || selectedChain) as SupportedChain, (d.network || selectedNetwork) as SupportedNetwork, d.transaction_hash)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary underline"
                                  >
                                    {d.transaction_hash.slice(0, 10)}…
                                  </a>
                                ) : '—'}
                              </td>
                              <td className="p-3">{Number(d.amount).toFixed(8)}</td>
                              <td className="p-3">
                                <span className={
                                  (d.confirmations_observed || 0) >= (d.confirmations_required || 0)
                                    ? "text-green-600"
                                    : "text-amber-600"
                                }>
                                  {d.confirmations_observed || 0}/{d.confirmations_required || 0}
                                </span>
                              </td>
                              <td className="p-3">
                                <Badge variant={
                                  d.status === 'confirmed' ? 'default' :
                                    d.status === 'pending' ? 'secondary' :
                                      'destructive'
                                }>
                                  {d.status}
                                </Badge>
                              </td>
                            </tr>
                          ))
                        )}
                      </SmartLoadingState>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Deposit Progress Tracker */}
          <div className="space-y-6">
            <DepositProgressTracker
              currentStep={depositStep}
              address={
                // ローディング中やエラー時はundefinedを渡す
                currentAddressState.loading || currentAddressState.error ? undefined :
                currentAddressState.data
                  ? typeof currentAddressState.data === 'object' && 'address' in currentAddressState.data
                    ? currentAddressState.data.address
                    : typeof currentAddressState.data === 'string'
                      ? currentAddressState.data
                      : undefined
                  : undefined
              }
              txHash={currentTxHash}
              confirmations={currentConfirmations}
              requiredConfirmations={requiredConfirmations}
              chain={selectedChain}
              asset={selectedAsset}
              expectedAmount={expectedAmount}
              estimatedTime={chainConfigState.data ? `${chainConfigState.data.min_confirmations * (selectedChain === 'eth' ? 15 : selectedChain === 'btc' ? 10 : 3)}秒` : undefined}
              lastUpdated={new Date()}
              networkStatus={networkStatus.isOnline ? 'normal' as const : 'slow' as const}
              onRefresh={() => {
                // リアルタイム監視システムとの連携による手動更新
                toast.showInfo('更新中', {
                  description: '最新の入金状況を確認しています...',
                  context: {
                    chain: selectedChain,
                    network: selectedNetwork,
                    asset: selectedAsset,
                    operation: '入金状況更新'
                  }
                });

                // リアルタイム接続の再試行
                if (!realtimeDeposits.state.connectionState.isConnected) {
                  realtimeDeposits.retryConnection();
                }

                // 入金履歴の手動更新
                depositHistoryState.execute(
                  async () => {
                    const { data, error } = await supabase
                      .from('deposits')
                      .select('*')
                      .eq('user_id', user!.id)
                      .order('created_at', { ascending: false })
                      .limit(100);
                    if (error) throw error;
                    return data || [];
                  },
                  {
                    context: '手動更新による入金履歴の読み込み',
                    showErrorToast: true
                  }
                );
              }}
              onViewTransaction={(txHash) => {
                if (txHash) {
                  const explorerUrl = txLink(selectedChain, selectedNetwork, txHash);
                  if (explorerUrl) {
                    window.open(explorerUrl, '_blank', 'noopener,noreferrer');
                  }
                }
              }}
              showDetails={true}
              className="mb-6"
            />

            {/* 通知設定 */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    通知設定
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowNotificationSettings(!showNotificationSettings)}
                  >
                    {showNotificationSettings ? '設定を閉じる' : '設定を開く'}
                  </Button>
                </div>
              </CardHeader>
              {showNotificationSettings && (
                <CardContent>
                  <NotificationSettings
                    onSettingsChange={(settings) => {
                      console.log('通知設定が更新されました:', settings);
                      toast.showSuccess('通知設定更新', {
                        description: '設定が正常に保存されました。',
                        context: { operation: '通知設定更新' },
                        duration: 3000
                      });
                    }}
                  />
                </CardContent>
              )}
            </Card>

            {/* FAQ Section */}
            <Card>
              <CardHeader>
                <CardTitle>よくある質問</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Accordion type="single" collapsible className="w-full">
                  {faqItems.map((item, index) => (
                    <AccordionItem key={index} value={`item-${index}`} className="px-6">
                      <AccordionTrigger className="text-sm hover:no-underline">
                        {item.question}
                      </AccordionTrigger>
                      <AccordionContent className="text-sm text-muted-foreground">
                        {item.answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Deposit;
