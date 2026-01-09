import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DashboardLayout from "@/components/DashboardLayout";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowUpDown, RefreshCw, Search } from "lucide-react";
import { getPriceSnapshot, computePairRate } from "@/lib/price-service";
import { SUPPORTED_ASSETS } from "@/lib/multichain-wallet-utils";

interface UserAsset {
  id: string;
  user_id: string;
  currency: string;
  balance: number;
  locked_balance: number;
  created_at: string;
  updated_at: string;
}

interface ConvertHistory {
  id: string;
  user_id: string;
  from_currency: string;
  to_currency: string;
  from_amount: number;
  to_amount: number;
  exchange_rate: number;
  created_at: string;
  status: string;
  fee_amount?: number;
  fee_percentage?: number;
}

interface FeeInfo {
  fee_amount: number;
  fee_percentage: number;
  net_amount: number;
}

const Convert = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [fromCurrency, setFromCurrency] = useState("BTC");
  const [toCurrency, setToCurrency] = useState("USDT");
  const [userAssets, setUserAssets] = useState<UserAsset[]>([]);
  const [convertHistory, setConvertHistory] = useState<ConvertHistory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [feeInfo, setFeeInfo] = useState<FeeInfo | null>(null);

  const [priceSnapshot, setPriceSnapshot] = useState<{ usd: Record<string, number>; usd_jpy?: number }>({ usd: { USDT: 1, USDC: 1 } });

  const getCurrentRate = useCallback(() => computePairRate(fromCurrency, toCurrency, priceSnapshot), [fromCurrency, toCurrency, priceSnapshot]);

  // レートのフォーマット関数
  const formatExchangeRate = useCallback((rate: number) => {
    // 小さい値の場合は固定精度、大きい値はtoLocaleStringを使用
    return rate < 0.01
      ? rate.toFixed(10).replace(/\.?0+$/, '') // 末尾の0を削除
      : rate.toLocaleString();
  }, []);

  const exchangeRate = useMemo(() => {
    const rate = getCurrentRate();
    const formattedRate = formatExchangeRate(rate);
    return `1 ${fromCurrency} = ${formattedRate} ${toCurrency}`;
  }, [fromCurrency, toCurrency, getCurrentRate, formatExchangeRate]);

  // ユーザーの資産を取得
  const fetchUserAssets = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_assets')
        .select('*')
        .eq('user_id', user.id)
        .order('currency');

      if (error) throw error;
      setUserAssets(data || []);
    } catch (error) {
      console.error('Error fetching user assets:', error);
      toast({
        title: "エラー",
        description: "資産情報の取得に失敗しました。",
        variant: "destructive",
      });
    }
  }, [user, toast]);

  // 価格の定期更新（表示はレートのみ。"何秒前"は非表示）
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const syms = Array.from(new Set([fromCurrency, toCurrency, 'USDT', 'USDC', 'BTC', 'ETH', 'XRP', 'TRX', 'ADA']));
        const snap = await getPriceSnapshot(syms);
        if (alive) setPriceSnapshot(snap);
      } catch (_) {
        // noop（失敗時は前回値のまま）
      }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, [fromCurrency, toCurrency]);

  // 手数料計算
  const calculateFee = useCallback(async (amount: string) => {
    if (!amount || parseFloat(amount) <= 0) {
      setFeeInfo(null);
      return;
    }

    try {
      const { data, error } = await supabase.rpc('calculate_conversion_fee' as unknown as (params: { p_from_currency: string; p_to_currency: string; p_from_amount: number }) => Promise<unknown>, {
        p_from_currency: fromCurrency,
        p_to_currency: toCurrency,
        p_from_amount: parseFloat(amount)
      });

      if (error) throw error;
      if (data && Array.isArray(data) && data.length > 0) {
        const feeData = data[0] as unknown as FeeInfo;
        setFeeInfo(feeData);
      }
    } catch (error) {
      console.error('Error calculating fee:', error);
      setFeeInfo(null);
    }
  }, [fromCurrency, toCurrency]);

  // 金額変換の計算（手数料を考慮）
  const calculateConversion = useCallback((amount: string, isFromAmount: boolean) => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return "";
    }

    const rate = getCurrentRate();
    if (rate === 0) return "";

    if (isFromAmount) {
      // 手数料を差し引いた金額で計算
      const netAmount = feeInfo ? feeInfo.net_amount : numAmount;
      return (netAmount * rate).toFixed(8);
    } else {
      return (numAmount / rate).toFixed(8);
    }
  }, [getCurrentRate, feeInfo]);

  // 資産残高マップをメモ化（利用可能残高 = balance - locked_balance）
  const balanceMap = useMemo(() => {
    return userAssets.reduce((map, asset) => {
      map[asset.currency] = asset.balance - (asset.locked_balance || 0);
      return map;
    }, {} as Record<string, number>);
  }, [userAssets]);

  // 資産残高を取得するヘルパー関数
  const getAvailableBalance = useCallback((currency: string) => {
    return balanceMap[currency] || 0;
  }, [balanceMap]);

  // 入金対応のすべての銘柄を取得（残高0も含む）
  const getAllAvailableAssets = useCallback((userAssets: UserAsset[]): UserAsset[] => {
    return SUPPORTED_ASSETS.map(currency => {
      const existingAsset = userAssets.find(asset => asset.currency === currency);
      if (existingAsset) {
        return existingAsset;
      }
      // 未所有の銘柄は残高0として生成
      return {
        id: `synthetic-${currency}`,
        user_id: user?.id || '',
        currency,
        balance: 0,
        locked_balance: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      } as UserAsset;
    });
  }, [user?.id]);

  const selectableAssets = useMemo(() => getAllAvailableAssets(userAssets), [getAllAvailableAssets, userAssets]);

  const handleSwapCurrencies = () => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
    setFromAmount(toAmount);
    setToAmount(fromAmount);
  };

  // 両替処理
  const handleConvert = async () => {
    if (!user || !fromAmount || parseFloat(fromAmount) <= 0) {
      toast({
        title: "エラー",
        description: "有効な金額を入力してください。",
        variant: "destructive",
      });
      return;
    }

    const fromBalance = getAvailableBalance(fromCurrency);
    const convertAmount = parseFloat(fromAmount);

    if (convertAmount > fromBalance) {
      toast({
        title: "エラー",
        description: "残高が不足しています。",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const rate = getCurrentRate();
      const receiveAmount = convertAmount * rate;

      // 両替処理を実行（手数料を考慮した処理）
      const { data: conversionResult, error: updateError } = await supabase.rpc('execute_conversion_with_fee' as unknown as (params: { p_user_id: string; p_from_currency: string; p_to_currency: string; p_from_amount: number; p_to_amount: number; p_exchange_rate: number }) => Promise<unknown>, {
        p_user_id: user.id,
        p_from_currency: fromCurrency,
        p_to_currency: toCurrency,
        p_from_amount: convertAmount,
        p_to_amount: receiveAmount,
        p_exchange_rate: rate
      });

      if (updateError) throw updateError;

      const result = conversionResult as unknown as { to_amount: number; fee_amount: number };
      toast({
        title: "成功",
        description: `${convertAmount} ${fromCurrency} を ${result.to_amount.toFixed(8)} ${toCurrency} に両替しました。手数料: ${result.fee_amount.toFixed(8)} ${fromCurrency}`,
      });

      // フォームをリセットし、資産情報と履歴を更新
      setFromAmount("");
      setToAmount("");
      fetchUserAssets();
      fetchConvertHistory();

    } catch (error) {
      console.error('Error converting currencies:', error);
      toast({
        title: "エラー",
        description: "両替処理に失敗しました。",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 両替履歴を取得
  const fetchConvertHistory = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase.rpc('get_user_conversion_history' as unknown as (params: { p_user_id: string; p_limit: number }) => Promise<unknown>, {
        p_user_id: user.id,
        p_limit: 10
      });

      if (error) throw error;
      setConvertHistory((data as unknown as ConvertHistory[]) || []);
    } catch (error) {
      console.error('Error fetching conversion history:', error);
      toast({
        title: "エラー",
        description: "両替履歴の取得に失敗しました。",
        variant: "destructive",
      });
    }
  }, [user, toast]);

  // 初期データ読み込み
  useEffect(() => {
    fetchUserAssets();
    fetchConvertHistory();
  }, [fetchUserAssets, fetchConvertHistory]);

  // 金額入力時の自動計算と手数料計算
  useEffect(() => {
    if (fromAmount && !isNaN(parseFloat(fromAmount))) {
      calculateFee(fromAmount);
      const calculated = calculateConversion(fromAmount, true);
      setToAmount(calculated);
    } else {
      setFeeInfo(null);
    }
  }, [fromAmount, fromCurrency, toCurrency, calculateConversion, calculateFee]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl md:text-2xl font-bold text-gray-900">両替</h1>
        </div>

        {/* Convert Interface */}
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardContent className="p-4 md:p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                {/* From Section */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium">交換元</label>
                    <span className="text-sm text-muted-foreground">
                      利用可能: {getAvailableBalance(fromCurrency).toFixed(8)} {fromCurrency}
                    </span>
                  </div>
                  <div className="space-y-3">
                    <div className="relative">
                      <Input
                        placeholder="金額を入力"
                        value={fromAmount}
                        onChange={(e) => setFromAmount(e.target.value)}
                        className="pr-16 md:pr-20"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs px-2 md:px-3 transition-all duration-200 active:scale-95"
                        onClick={() => setFromAmount(getAvailableBalance(fromCurrency).toString())}
                      >
                        最大
                      </Button>
                    </div>
                    <Select value={fromCurrency} onValueChange={setFromCurrency}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {selectableAssets.map(asset => {
                          const availableBalance = asset.balance - (asset.locked_balance || 0);
                          return (
                            <SelectItem key={asset.currency} value={asset.currency}>
                              {asset.currency} (残高: {availableBalance.toFixed(8)})
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* To Section */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium">受取</label>
                    <span className="text-sm text-muted-foreground">
                      利用可能: {getAvailableBalance(toCurrency).toFixed(8)} {toCurrency}
                    </span>
                  </div>
                  <div className="space-y-3">
                    <Input
                      placeholder="金額を入力"
                      value={toAmount}
                      onChange={(e) => setToAmount(e.target.value)}
                      className="transition-all duration-200"
                    />
                    <Select value={toCurrency} onValueChange={setToCurrency}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {selectableAssets.map(asset => {
                          const availableBalance = asset.balance - (asset.locked_balance || 0);
                          return (
                            <SelectItem key={asset.currency} value={asset.currency}>
                              {asset.currency} (残高: {availableBalance.toFixed(8)})
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Swap Button */}
              <div className="flex justify-center my-4 md:my-6">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSwapCurrencies}
                  className="rounded-full border-2 border-border transition-all duration-200 active:scale-95 hover:bg-primary/10"
                >
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </div>

              {/* Exchange Rate */}
              <div className="flex items-center justify-center gap-2 mb-4 text-xs md:text-sm">
                <span className="text-center">為替レート: {exchangeRate}</span>
              </div>

              {/* Fee Information */}
              {feeInfo && (
                <div className="bg-muted/50 rounded-lg p-3 md:p-4 mb-4 md:mb-6 space-y-2">
                  <div className="text-sm font-medium text-center">手数料情報</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4 text-xs md:text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">手数料率:</span>
                      <span>{(feeInfo.fee_percentage * 100).toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">手数料:</span>
                      <span>{feeInfo.fee_amount.toFixed(8)} {fromCurrency}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">実際の交換額:</span>
                      <span>{feeInfo.net_amount.toFixed(8)} {fromCurrency}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">受取予定額:</span>
                      <span>{toAmount} {toCurrency}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Convert Button */}
              <Button
                className="w-full transition-all duration-200 active:scale-95"
                size="lg"
                onClick={handleConvert}
                disabled={isLoading || !fromAmount || parseFloat(fromAmount) <= 0 || fromCurrency === toCurrency}
              >
                {isLoading ? "処理中..." : "両替"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Recent Convert History */}
        <Card>
          <CardHeader className="p-4 md:p-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base md:text-base">最近の両替履歴</CardTitle>
              <Button variant="link" className="text-primary text-sm transition-all duration-200 active:scale-95">
                すべて表示
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4 font-medium text-sm">日付 & 時間</th>
                    <th className="text-left p-4 font-medium text-sm">ペア</th>
                    <th className="text-left p-4 font-medium text-sm">レート</th>
                    <th className="text-left p-4 font-medium text-sm">支払い金額</th>
                    <th className="text-left p-4 font-medium text-sm">手数料</th>
                    <th className="text-left p-4 font-medium text-sm">受け取り金額</th>
                    <th className="text-left p-4 font-medium text-sm">ステータス</th>
                  </tr>
                </thead>
                <tbody>
                  {convertHistory.map((history) => (
                    <tr key={history.id} className="border-b hover:bg-accent/50">
                      <td className="p-4 text-sm">
                        {new Date(history.created_at).toLocaleString('ja-JP')}
                      </td>
                      <td className="p-4 text-sm font-medium">
                        {history.from_currency}/{history.to_currency}
                      </td>
                      <td className="p-4 text-sm">
                        1 {history.from_currency} = {formatExchangeRate(history.exchange_rate)} {history.to_currency}
                      </td>
                      <td className="p-4 text-sm">
                        {history.from_amount.toFixed(8)} {history.from_currency}
                      </td>
                      <td className="p-4 text-sm">
                        {history.fee_amount ? (
                          <div>
                            <div>{history.fee_amount.toFixed(8)} {history.from_currency}</div>
                            <div className="text-xs text-muted-foreground">
                              ({((history.fee_percentage || 0) * 100).toFixed(2)}%)
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="p-4 text-sm">
                        {history.to_amount.toFixed(8)} {history.to_currency}
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${history.status === 'completed'
                          ? 'bg-green-100 text-green-800'
                          : history.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                          }`}>
                          {history.status === 'completed' ? '完了' :
                            history.status === 'pending' ? '処理中' : '失敗'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3 p-3">
              {convertHistory.map((history) => (
                <Card key={history.id} className="hover:bg-accent/30 active:bg-accent/50 transition-all duration-200 active:scale-[0.98]">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <RefreshCw className="h-4 w-4 text-primary" />
                        <span className="font-semibold text-sm">{history.from_currency}/{history.to_currency}</span>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${history.status === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : history.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                        }`}>
                        {history.status === 'completed' ? '完了' :
                          history.status === 'pending' ? '処理中' : '失敗'}
                      </span>
                    </div>
                    
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">日時:</span>
                        <span className="font-mono text-xs">
                          {new Date(history.created_at).toLocaleString('ja-JP', {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">レート:</span>
                        <span className="font-mono text-xs">
                          1 {history.from_currency} = {formatExchangeRate(history.exchange_rate)} {history.to_currency}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">支払い:</span>
                        <span className="font-mono text-xs">
                          {history.from_amount.toFixed(8)} {history.from_currency}
                        </span>
                      </div>
                      {history.fee_amount && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">手数料:</span>
                          <span className="font-mono text-xs">
                            {history.fee_amount.toFixed(8)} {history.from_currency}
                            <span className="text-muted-foreground ml-1">
                              ({((history.fee_percentage || 0) * 100).toFixed(2)}%)
                            </span>
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">受取:</span>
                        <span className="font-mono text-xs font-semibold">
                          {history.to_amount.toFixed(8)} {history.to_currency}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* No Records Message */}
            {convertHistory.length === 0 && (
              <div className="text-center py-12">
                <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
                  <Search className="h-5 w-5 sm:h-8 sm:w-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground text-sm">記録が見つかりません</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Convert;
