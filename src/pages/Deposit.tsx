import { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
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
import { DemoRestrictionNotice } from "@/components/DemoRestrictionNotice";
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
  const { t } = useTranslation('wallet');
  const [selectedChain, setSelectedChain] = useState<SupportedChain>("eth");
  const [selectedAsset, setSelectedAsset] = useState<SupportedAsset>("ETH");
  const [selectedNetwork, setSelectedNetwork] = useState<SupportedNetwork>("mainnet");
  const toast = useEnhancedToast();
  const networkStatus = useNetworkStatus();
  const navigate = useNavigate();
  const { user, isDemoMode } = useAuth();
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
        toast.showWarning(t('deposit.toast.realtimeMonitoring'), {
          description: t('deposit.toast.connectionLost'),
          context: { operation: t('deposit.toast.realtimeMonitoring'), connectivity: 'disconnected' },
          actions: [{
            label: t('deposit.actions.reconnect'),
            onClick: () => realtimeDeposits.retryConnection()
          }]
        });
      } else if (connected && quality === 'good') {
        toast.dismissAll(); // 再接続成功時は関連する警告を消去
        toast.showSuccess(t('deposit.toast.connectionRestored'), {
          description: t('deposit.toast.connectionRestoredDesc'),
          context: { operation: t('deposit.toast.realtimeMonitoring'), connectivity: 'restored' },
          duration: 3000
        });
      }
    },
    onError: (error) => {
      const enhancedError = analyzeError(error, {
        operation: t('deposit.toast.realtimeMonitoring')
      });
      toast.showError(t('deposit.toast.monitoringError'), {
        description: enhancedError.userMessage,
        context: { operation: t('deposit.toast.realtimeMonitoring'), error: error.message },
        actions: [{
          label: t('deposit.actions.retry'),
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
      const error = new Error(t('deposit.toast.authRequired'));
      const enhancedError = analyzeError(error, { chain, network, asset, operation: t('deposit.toast.addressGeneration') });
      toast.showError(t('deposit.toast.authError'), {
        description: enhancedError.userMessage,
        context: { chain, network, asset, operation: t('deposit.toast.addressGeneration') },
        actions: [{
          label: t('deposit.toast.goToLogin'),
          onClick: () => navigate('/auth')
        }]
      });
      throw error;
    }

    // プログレス通知開始
    const progressToastId = toast.showLoading(t('deposit.toast.addressGeneration'), {
      description: t('deposit.toast.generatingWallet'),
      context: { chain, network, asset, operation: t('deposit.toast.addressGeneration') },
      category: t('deposit.toast.addressGeneration')
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
          throw new Error(t('deposit.errors.xrpNetworkOnly'));
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
        throw new Error(data?.error || t('deposit.errors.subscriptionFailed'));
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

    if (!user?.id || !selectedChain || !selectedAsset || !selectedNetwork) {
      return () => {
        abortController.abort();
      };
    }

    // 銘柄変更時に古い状態をクリア
    currentAddressState.reset();
    chainConfigState.reset();

    // 非同期処理を管理する関数
    const executeAfterReset = async () => {
      try {
        // キャンセル確認
        if (signal.aborted) {
          return;
        }

        // setState()の非同期更新完了を待つ
        await new Promise(resolve => setTimeout(resolve, 10));

        // 再度キャンセル確認
        if (signal.aborted) {
          return;
        }

        // アドレス生成実行（AbortSignal付き）
        currentAddressState.execute(
          () => getOrCreateDepositAddress(selectedChain, selectedNetwork, selectedAsset),
          {
            context: 'ウォレットアドレスの生成',
            showErrorToast: true,
            abortSignal: signal
          }
        );

        // チェーン設定取得（AbortSignal付き）
        chainConfigState.execute(
          () => getMultichainConfig(selectedChain, selectedNetwork, selectedAsset),
          {
            context: 'チェーン設定の取得',
            showErrorToast: true,
            abortSignal: signal
          }
        );

      } catch (error) {
        if (!signal.aborted) {
          console.error('Execution failed:', error);
        }
      }
    };

    executeAfterReset();

    // クリーンアップ関数
    return () => {
      abortController.abort();
    };
  }, [user?.id, selectedChain, selectedAsset, selectedNetwork]);

  const handleCopyAddress = async () => {
    if (!currentAddressState.data) {
      toast.showWarning(t('deposit.toast.copyError'), {
        description: t('deposit.toast.noAddressToCopy'),
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
        throw new Error(t('deposit.errors.invalidAddressFormat'));
      }

      await navigator.clipboard.writeText(copyText);

      // 成功通知（拡張版）
      toast.showSuccess(t('deposit.toast.addressCopied'), {
        description: selectedChain === 'xrp'
          ? t('deposit.toast.xrpAddressCopied')
          : t('deposit.toast.walletAddressCopied'),
        context: {
          chain: selectedChain,
          network: selectedNetwork,
          asset: selectedAsset,
          address: copyText,
          operation: t('deposit.actions.copy')
        },
        actions: [{
          label: t('deposit.actions.showGuide'),
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

      toast.showError(t('deposit.toast.copyFailed'), {
        description: enhancedError.details || t('deposit.toast.clipboardError'),
        context: {
          chain: selectedChain,
          network: selectedNetwork,
          asset: selectedAsset,
          operation: t('deposit.actions.copy')
        },
        actions: [{
          label: t('deposit.actions.retry'),
          onClick: handleCopyAddress
        }]
      });
    }
  };

  const handleDownloadQR = async () => {
    try {
      // QRコード要素を取得してダウンロード処理（簡易版）
      toast.showInfo(t('deposit.toast.qrDownload'), {
        description: t('deposit.toast.qrDownloadStarted'),
        context: {
          chain: selectedChain,
          network: selectedNetwork,
          asset: selectedAsset,
          operation: t('deposit.toast.qrDownload')
        }
      });

      // 実際のダウンロード処理はここに実装
      // 現時点では通知のみ

    } catch (error) {
      const enhancedError = analyzeError(error, {
        chain: selectedChain,
        network: selectedNetwork,
        asset: selectedAsset,
        operation: t('deposit.toast.qrDownload')
      });

      toast.showError(t('deposit.toast.downloadFailed'), {
        description: enhancedError.details || t('deposit.toast.qrDownloadError'),
        context: {
          chain: selectedChain,
          network: selectedNetwork,
          asset: selectedAsset,
          operation: t('deposit.toast.qrDownload')
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
          toast.showSuccess(t('deposit.toast.depositDetected'), {
            description: t('deposit.toast.depositDetectedDesc', { amount: deposit.amount, asset: deposit.asset }),
            context: {
              operation: t('deposit.toast.depositDetected'),
              amount: deposit.amount.toString(),
              asset: deposit.asset,
              txHash: deposit.transaction_hash
            },
            actions: deposit.transaction_hash ? [{
              label: t('deposit.toast.viewTransaction'),
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
              toast.showSuccess(t('deposit.toast.depositComplete'), {
                description: t('deposit.toast.depositCompleteDesc', { amount: newDeposit.amount, asset: newDeposit.asset }),
                context: {
                  operation: t('deposit.toast.depositComplete'),
                  amount: newDeposit.amount.toString(),
                  asset: newDeposit.asset,
                  confirmations: confirmations
                },
                duration: 10000
              });
            } else {
              setDepositStep('confirming');
              toast.showInfo(t('deposit.toast.confirming'), {
                description: t('deposit.toast.confirmingDesc', { current: confirmations, required: required }),
                context: {
                  operation: t('deposit.toast.confirming'),
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
              toast.showError(t('deposit.toast.depositError'), {
                description: t('deposit.toast.depositErrorDesc'),
                context: {
                  operation: t('deposit.toast.depositError'),
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
    const common = [
      {
        question: t('deposit.faq.howToDeposit', { asset: selectedAsset }),
        answer: t('deposit.faq.howToDepositAnswer', { asset: selectedAsset, network: selectedNetwork, minDeposit: minDep, minConf: minConf })
      },
      {
        question: t('deposit.faq.whenReflected'),
        answer: t('deposit.faq.whenReflectedAnswer', { minConf: minConf })
      },
      {
        question: t('deposit.faq.wrongNetwork'),
        answer: t('deposit.faq.wrongNetworkAnswer')
      }
    ];
    const extras: { question: string; answer: string }[] = [];
    if (selectedChain === 'xrp') {
      extras.push({
        question: t('deposit.faq.xrpTagRequired'),
        answer: t('deposit.faq.xrpTagRequiredAnswer')
      });
    }
    if (selectedChain === 'trc') {
      extras.push({
        question: t('deposit.faq.tronConfirmation'),
        answer: t('deposit.faq.tronConfirmationAnswer')
      });
    }
    if (selectedChain === 'ada') {
      extras.push({
        question: t('deposit.faq.adaUtxo'),
        answer: t('deposit.faq.adaUtxoAnswer')
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
            <h1 className="text-2xl font-bold text-foreground">{t('deposit.title')}</h1>
            <Badge variant="outline" className="text-blue-600">
              {t('deposit.phase2Badge')}
            </Badge>
            {!networkStatus.isOnline && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <WifiOff className="h-3 w-3" />
                {t('deposit.status.offline')}
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
                {realtimeDeposits.state.connectionState.isConnected ? t('deposit.status.monitoring') : t('deposit.status.waiting')}
              </Badge>
            )}
          </div>
        </div>

        {/* デモモード制限通知 */}
        {isDemoMode && <DemoRestrictionNotice feature="deposit" className="mb-6" />}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Deposit Form */}
          <div className="lg:col-span-2 space-y-6">
            {!SERVICE_RESTRICTIONS.isDepositEnabled() ? (
              <Card className="bg-white border border-yellow-300 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-xl font-semibold flex items-center gap-2 text-gray-900">
                    <AlertCircle className="h-6 w-6 text-yellow-600" />
                    {t('deposit.serviceSuspended.title')}
                  </CardTitle>
                  <CardDescription className="text-gray-600">
                    {t('deposit.serviceSuspended.description')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <h4 className="font-semibold text-gray-900 mb-2">{t('deposit.serviceSuspended.notice')}</h4>
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
                    <label className="text-sm font-medium">{t('deposit.form.asset')}</label>
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
                    <label className="text-sm font-medium">{t('deposit.form.chain')}</label>
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
                          {t('deposit.erc20Notice')}
                        </p>
                      )}
                      {selectedAsset === 'USDT' && selectedChain === 'trc' && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {t('deposit.trc20Notice')}
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
                      <label className="text-sm font-medium">{t('deposit.form.network')}</label>
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
                      loadingComponent={<div className="text-xs text-muted-foreground">{t('deposit.loadingConfig')}</div>}
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
                              {chainConfigState.data.deposit_enabled ? t('deposit.status.accepting') : t('deposit.status.suspended')}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground space-y-1">
                            <p>{t('deposit.notices.minDepositAmount', { amount: chainConfigState.data.min_deposit, asset: selectedAsset })}</p>
                            <p>{t('deposit.notices.confirmationsRequired', { count: chainConfigState.data.min_confirmations })}</p>
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
                      {selectedChain === 'xrp' ? t('deposit.depositInfo') : t('deposit.walletAddress')}
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
                              placeholder={t('deposit.generatingXrpAddress')}
                            />
                            <Button
                              variant="outline"
                              onClick={handleCopyAddress}
                              disabled={!currentAddressState.data}
                            >
                              <Copy className="h-4 w-4 mr-1" />
                              {t('deposit.actions.copy')}
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
                                    <span className="font-medium text-amber-800">{t('deposit.xrp.destinationTagRequired')}</span>
                                  </div>
                                  <div className="flex gap-2">
                                    <Input
                                      value={xrpData.destinationTag || ''}
                                      readOnly
                                      className="flex-1 font-mono text-sm bg-white"
                                    />
                                  </div>
                                  <p className="text-xs text-amber-700 mt-2">
                                    {t('deposit.xrp.destinationTagWarning')}
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
                            placeholder={t('deposit.generatingAddress')}
                          />
                          <Button
                            variant="outline"
                            onClick={handleCopyAddress}
                            disabled={!currentAddressState.data}
                          >
                            <Copy className="h-4 w-4 mr-1" />
                            {t('deposit.actions.copy')}
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
                            {t('deposit.actions.download')}
                          </Button>
                        </div>
                      )}
                    </div>
                  </SmartLoadingState>


                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                      <div className="text-sm text-amber-800">
                        <p className="font-medium">{t('deposit.notices.important')}</p>
                        <ul className="mt-1 space-y-1 text-xs">
                          <li>• {t('deposit.notices.networkOnly', { network: chainConfig?.name || selectedChain })}</li>
                          <li>• {t('deposit.notices.minDepositAmount', { amount: chainConfigState.data?.min_deposit || '—', asset: selectedAsset })}</li>
                          <li>• {t('deposit.notices.confirmationsRequired', { count: chainConfigState.data?.min_confirmations || '—' })}</li>
                          {selectedChain === 'xrp' && (
                            <li>• <strong>{t('deposit.notices.destinationTagMandatory')}</strong></li>
                          )}
                          <li>• {t('deposit.notices.wrongNetworkWarning')}</li>
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
                <CardTitle>{t('deposit.historyTable.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-3">{t('deposit.historyTable.datetime')}</th>
                        <th className="text-left p-3">{t('deposit.historyTable.asset')}</th>
                        <th className="text-left p-3">{t('deposit.historyTable.network')}</th>
                        <th className="text-left p-3">{t('deposit.historyTable.transaction')}</th>
                        <th className="text-left p-3">{t('deposit.historyTable.amount')}</th>
                        <th className="text-left p-3">{t('deposit.historyTable.confirmations')}</th>
                        <th className="text-left p-3">{t('deposit.historyTable.status')}</th>
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
                                    label: t('deposit.actions.retry'),
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
                                {t('deposit.historyTable.noHistory')}
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
              estimatedTime={chainConfigState.data ? t('deposit.estimatedTimeSeconds', { count: chainConfigState.data.min_confirmations * (selectedChain === 'eth' ? 15 : selectedChain === 'btc' ? 10 : 3) }) : undefined}
              lastUpdated={new Date()}
              networkStatus={networkStatus.isOnline ? 'normal' as const : 'slow' as const}
              onRefresh={() => {
                // リアルタイム監視システムとの連携による手動更新
                toast.showInfo(t('deposit.toast.refreshing'), {
                  description: t('deposit.toast.refreshingDesc'),
                  context: {
                    chain: selectedChain,
                    network: selectedNetwork,
                    asset: selectedAsset,
                    operation: 'deposit status refresh'
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
                    {t('deposit.notifications.title')}
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowNotificationSettings(!showNotificationSettings)}
                  >
                    {showNotificationSettings ? t('deposit.actions.closeSettings') : t('deposit.actions.openSettings')}
                  </Button>
                </div>
              </CardHeader>
              {showNotificationSettings && (
                <CardContent>
                  <NotificationSettings
                    onSettingsChange={(settings) => {
                      toast.showSuccess(t('deposit.notifications.settingsUpdated'), {
                        description: t('deposit.notifications.settingsSaved'),
                        context: { operation: 'notification settings' },
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
                <CardTitle>{t('deposit.faq.title')}</CardTitle>
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
