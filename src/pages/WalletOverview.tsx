import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Eye, Search } from "lucide-react";
import { getPriceSnapshot } from "@/lib/price-service";
import { getAllDepositableAssets } from "@/lib/multichain-wallet-utils";


interface AssetBalance {
  user_id: string;
  currency: string;
  total: number;
  locked: number;
  available: number;
}

interface UserBalanceViewRow {
  currency: string;
  total: string | number;
  locked: string | number;
  available: string | number;
}

interface UserAssetsRow {
  currency: string;
  balance: string | number;
  locked_balance: string | number;
}

const WalletOverview = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [hideSmallAssets, setHideSmallAssets] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [balances, setBalances] = useState<AssetBalance[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  // 価格スナップショット（USD換算）
  const [usdPrices, setUsdPrices] = useState<Record<string, number>>({ USDT: 1, USDC: 1 });

  // 入金可能な銘柄のリスト
  const depositableAssets = getAllDepositableAssets();

  const fetchBalances = useCallback(async () => {
    if (!user?.id) return;

    try {
      // user_assetsから直接取得（本番環境の表示問題を解決するため）
      // 注: 将来的にledger_entriesとの整合性が取れたらuser_balances_viewに戻す可能性あり
      const { data: assets } = await supabase
        .from('user_assets')
        .select('currency, balance, locked_balance')
        .eq('user_id', user.id);

      const rows: AssetBalance[] = (assets || []).map((a: UserAssetsRow) => ({
        user_id: user.id,
        currency: a.currency,
        total: Number(a.balance),
        locked: Number(a.locked_balance),
        available: Number(a.balance) - Number(a.locked_balance)
      }));

      setBalances(rows);
      // 価格取得（BTC換算表示のため、BTCを常に含める）
      const uniqSymbols = Array.from(new Set([...rows.map(r => r.currency), 'BTC']));
      const price = await getPriceSnapshot(uniqSymbols);
      setUsdPrices(price.usd);
      const totalUsd = rows.reduce((sum, r) => sum + r.total * (price.usd[r.currency] || 1), 0);
      setTotalBalance(totalUsd);
    } catch (e) {
      console.error('Error fetching balances:', e);
      setBalances([]);
      setTotalBalance(0);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) { fetchBalances(); }
  }, [user?.id, fetchBalances]);

  // Create a combined list of all depositable assets with user balances
  const allAssets = depositableAssets.map((asset) => {
    // 既存の残高データがあるかチェック
    const existingBalance = balances.find(b => b.currency === asset);
    
    const totalBalance = Number(existingBalance?.total || 0);
    const availableBalance = Number(existingBalance?.available || 0);
    const inOrder = Number(existingBalance?.locked || 0);
    const rate = usdPrices[asset] || 1;
    
    return {
      symbol: asset,
      name: asset,
      totalBalance,
      availableBalance,
      inOrder,
      usdValue: totalBalance * rate,
      availableUsdValue: availableBalance * rate,
      inOrderUsdValue: inOrder * rate,
    };
  });

  // アイコンパス（public/icons/ 配下）。存在しない場合は略称バッジを表示
  const iconSrc = (symbol: string): string => {
    const map: Record<string, string> = {
      BTC: '/icons/bitcoin.png',
      ETH: '/icons/ethereum.png',
      USDT: '/icons/tether.png',
      TRX: '/icons/tron.png',
      XRP: '/icons/xrp.png',
      ADA: '/icons/cardano.png',
    };
    return map[symbol] || '';
  };

  return (
    <DashboardLayout>
      <div className="space-y-1">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
          <h1 className="text-2xl sm:text-2xl font-bold text-gray-900">ウォレット概要</h1>
        </div>

        {/* Total Asset Valuation */}
        <Card>
          <CardContent className="p-2 sm:p-2">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-1.5 mb-1">
              <div className="flex-1">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-sm text-gray-600">合計資産評価額</span>
                  <Eye className="h-4 w-4 text-gray-600" />
                </div>
                <div className="text-2xl sm:text-2xl font-bold">
                  {loading ? 'Loading...' : `$ ${totalBalance.toFixed(2)}`}
                  <span className="text-xs sm:text-sm font-normal text-gray-600">≈ {(totalBalance / (usdPrices['BTC'] || 97000)).toFixed(8)} BTC</span>
                </div>
              </div>
              <div className="flex gap-1.5 justify-start lg:justify-end">
                <Button size="sm" onClick={() => navigate("/deposit")}>
                  <span className="hidden sm:inline">入金</span>
                  <span className="sm:hidden">入</span>
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigate("/withdraw")}>
                  <span className="hidden sm:inline">出金</span>
                  <span className="sm:hidden">出</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
          <div className="relative flex-1 max-w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-600" />
            <Input
              placeholder="検索"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-full"
            />
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <Checkbox 
              id="hideSmallAssets"
              checked={hideSmallAssets}
              onCheckedChange={(checked) => setHideSmallAssets(checked === true)}
            />
            <label
              htmlFor="hideSmallAssets"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 whitespace-nowrap"
            >
              <span className="hidden sm:inline">小額資産を非表示</span>
              <span className="sm:hidden">小額非表示</span>
            </label>
          </div>
        </div>

        {/* Assets Table - Desktop */}
        <Card className="hidden md:block">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4 font-medium text-sm text-gray-900">コイン</th>
                    <th className="text-left p-4 font-medium text-sm text-gray-900">残高</th>
                    <th className="text-left p-4 font-medium text-sm text-gray-900">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {allAssets
                    .filter((asset) => {
                      // 検索クエリでのフィルタリング
                      const matchesSearch = !searchQuery || 
                        asset.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        asset.name.toLowerCase().includes(searchQuery.toLowerCase());
                      
                      // 小額資産の非表示フィルタリング
                      const matchesHideSmall = !hideSmallAssets || asset.usdValue >= 1;
                      
                      return matchesSearch && matchesHideSmall;
                    })
                    .map((asset) => (
                    <tr key={asset.symbol} className="border-b hover:bg-accent/50">
                      <td className="p-2">
                        <div className="flex items-center gap-1.5">
                          {iconSrc(asset.symbol) ? (
                            <img src={iconSrc(asset.symbol)} alt={asset.symbol} className="w-8 h-8 rounded" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-sm font-medium text-primary">{asset.symbol.slice(0, 2)}</span>
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-base text-gray-900">{asset.symbol}</div>
                            <div className="text-sm text-gray-600">{asset.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-2">
                        <div className="space-y-1">
                          <div className="text-sm font-mono">
                            利用可能: <span className={asset.availableBalance < 0 ? 'text-red-600' : ''}>{asset.availableBalance.toFixed(8)}</span>
                          </div>
                          {asset.inOrder > 0 && (
                            <div className="text-xs text-gray-600 font-mono">
                              ロック中: {asset.inOrder.toFixed(8)}
                            </div>
                          )}
                          <div className="text-xs text-gray-600 font-mono">
                            合計: <span className={asset.totalBalance < 0 ? 'text-red-600' : ''}>{asset.totalBalance.toFixed(8)}</span>
                          </div>
                          <div className="text-xs text-gray-600">$ {asset.availableUsdValue.toFixed(2)}</div>
                        </div>
                      </td>
                      <td className="p-2">
                        <div className="flex gap-1.5">
                          <Button variant="link" size="sm" className="text-primary p-0 h-auto text-xs" onClick={() => navigate("/deposit")}>
                            入金
                          </Button>
                          <Button variant="link" size="sm" className="text-primary p-0 h-auto text-xs" onClick={() => navigate("/withdraw")}>
                            出金
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Assets Cards - Mobile */}
        <div className="md:hidden space-y-1">
          {allAssets
            .filter((asset) => {
              // 検索クエリでのフィルタリング
              const matchesSearch = !searchQuery || 
                asset.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
                asset.name.toLowerCase().includes(searchQuery.toLowerCase());
              
              // 小額資産の非表示フィルタリング
              const matchesHideSmall = !hideSmallAssets || asset.usdValue >= 1;
              
              return matchesSearch && matchesHideSmall;
            })
            .map((asset) => (
            <Card key={asset.symbol} className="hover:bg-accent/30 active:bg-accent/50 transition-all duration-200 active:scale-[0.98]">
              <CardContent className="p-2">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    {iconSrc(asset.symbol) ? (
                      <img src={iconSrc(asset.symbol)} alt={asset.symbol} className="w-8 h-8 rounded" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-medium text-primary">{asset.symbol.slice(0, 2)}</span>
                      </div>
                    )}
                    <div>
                      <div className="font-semibold text-base text-gray-900">{asset.symbol}</div>
                      <div className="text-xs text-gray-600">$ {asset.availableUsdValue.toFixed(2)}</div>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" className="text-xs px-3 py-1 transition-all duration-200 active:scale-95" onClick={() => navigate("/deposit")}>
                      入金
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs px-3 py-1 transition-all duration-200 active:scale-95" onClick={() => navigate("/withdraw")}>
                      出金
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5 text-sm">
                  <div>
                    <div className="text-xs text-gray-600 mb-1">利用可能</div>
                    <div className="font-mono text-sm">
                      <span className={asset.availableBalance < 0 ? 'text-red-600' : ''}>{asset.availableBalance.toFixed(8)}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 mb-1">合計</div>
                    <div className="font-mono text-sm">
                      <span className={asset.totalBalance < 0 ? 'text-red-600' : ''}>{asset.totalBalance.toFixed(8)}</span>
                    </div>
                  </div>
                  {asset.inOrder > 0 && (
                    <div className="col-span-2">
                      <div className="text-xs text-gray-600 mb-1">ロック中</div>
                      <div className="font-mono text-sm text-gray-600">{asset.inOrder.toFixed(8)}</div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Show message only when no assets match the filter/search */}
        {allAssets.filter((asset) => {
          const matchesSearch = !searchQuery || 
            asset.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
            asset.name.toLowerCase().includes(searchQuery.toLowerCase());
          const matchesHideSmall = !hideSmallAssets || asset.usdValue >= 1;
          return matchesSearch && matchesHideSmall;
        }).length === 0 && !loading && (
          <Card>
            <CardContent className="p-8">
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                  <Search className="h-5 w-5 text-gray-600" />
                </div>
                <p className="text-gray-600 text-sm">
                  {searchQuery ? '検索条件に一致する銘柄がありません' : 
                   hideSmallAssets ? '表示条件に一致する銘柄がありません' : 
                   '入金可能な銘柄がありません'}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

      </div>
    </DashboardLayout>
  );
};

export default WalletOverview;
