import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { memo, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice, formatVolume, getCryptoIcon } from "@/lib/format";
import { fetchBinance24hrTicker, toBinanceSymbol } from "@/lib/exchange-feed";
import { useToast } from "@/hooks/use-toast";

interface MarketData {
  pair: string;
  icon: string;
  price: number | null;
  volume: number | null;
  changeData: { value: string; trend: 'up' | 'down' | 'neutral' };
  quoteCurrency: string;
}

export const MarketTable = memo(() => {
  const navigate = useNavigate();
  const [marketData, setMarketData] = useState<MarketData[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const loadMarketData = async () => {
      try {
        // アクティブなマーケットを取得（最大7件、ランディングページ用）
        const { data: markets, error } = await supabase
          .from('markets')
          .select('id')
          .eq('status', 'active')
          .limit(7);

        if (error) {
          console.error('Failed to fetch markets:', error);
          toast({
            title: "エラー",
            description: "マーケットデータの取得に失敗しました",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        if (!markets || markets.length === 0) {
          setMarketData([]);
          setLoading(false);
          return;
        }

        const results: MarketData[] = [];

        for (const market of markets) {
          const binanceSymbol = toBinanceSymbol(market.id);
          if (!binanceSymbol) continue;

          try {
            // Binanceから24時間統計を取得
            const ticker = await fetchBinance24hrTicker(binanceSymbol);

            // 現在価格
            const currentPrice = ticker.lastPrice;

            // 24時間出来高（USDT建て）
            const volume24h = ticker.quoteVolume;

            // 24時間変動率（Binanceが計算済み）
            const changePercent = ticker.priceChangePercent;
            const changeData = {
              value: changePercent > 0
                ? `+${changePercent.toFixed(2)}%`
                : changePercent < 0
                  ? `${changePercent.toFixed(2)}%`
                  : `${changePercent.toFixed(2)}%`,
              trend: (changePercent > 0 ? 'up' : changePercent < 0 ? 'down' : 'neutral') as 'up' | 'down' | 'neutral'
            };

            // マーケットIDからシンボルに変換（例: "BTC-USDT" -> "BTC/USDT"）
            const symbol = market.id.replace('-', '/');
            const quoteCurrency = market.id.split('-')[1]; // 例: "BTC-USDT" -> "USDT"

            results.push({
              pair: symbol,
              icon: getCryptoIcon(symbol),
              price: currentPrice,
              volume: volume24h,
              changeData,
              quoteCurrency
            });
          } catch (error) {
            console.error(`Failed to fetch data for ${binanceSymbol}:`, error);
            // エラー時はスキップして次のマーケットへ
            continue;
          }
        }

        setMarketData(results);
      } catch (error) {
        console.error('Market data load error:', error);
      } finally {
        setLoading(false);
      }
    };

    loadMarketData();
  }, [toast]);

  if (loading) {
    return (
      <section className="py-6 md:py-16">
        <div className="container mx-auto px-3 md:px-6">
          <div className="text-center mb-6 md:mb-12">
            <h2 className="text-2xl md:text-4xl font-bold text-foreground mb-2 md:mb-4">マーケットトレンド</h2>
          </div>
          <div className="text-center py-8 text-muted-foreground">
            読み込み中...
          </div>
        </div>
      </section>
    );
  }

  if (marketData.length === 0) {
    return (
      <section className="py-6 md:py-16">
        <div className="container mx-auto px-3 md:px-6">
          <div className="text-center mb-6 md:mb-12">
            <h2 className="text-2xl md:text-4xl font-bold text-foreground mb-2 md:mb-4">マーケットトレンド</h2>
          </div>
          <div className="text-center py-8 text-muted-foreground">
            マーケットデータがありません
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-6 md:py-16">
      <div className="container mx-auto px-3 md:px-6">
        <div className="text-center mb-6 md:mb-12">
          <h2 className="text-2xl md:text-4xl font-bold text-foreground mb-2 md:mb-4">マーケットトレンド</h2>
        </div>
        
        {/* Desktop Table View */}
        <div className="hidden md:block trading-card rounded-xl p-6 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-4 text-muted-foreground font-medium">ペア</th>
                <th className="text-right py-4 text-muted-foreground font-medium">最新価格</th>
                <th className="text-right py-4 text-muted-foreground font-medium">24時間変動</th>
                <th className="text-right py-4 text-muted-foreground font-medium">24時間出来高</th>
                <th className="text-right py-4 text-muted-foreground font-medium">アクション</th>
              </tr>
            </thead>
            <tbody>
              {marketData.map((market) => (
                <tr key={market.pair} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                  <td className="py-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{market.icon}</span>
                      <span className="font-medium text-foreground">{market.pair}</span>
                    </div>
                  </td>
                  <td className="text-right py-4 text-foreground">{formatPrice(market.price)} {market.quoteCurrency}</td>
                  <td className={`text-right py-4 ${market.changeData.trend === 'up' ? 'text-green-600' : market.changeData.trend === 'down' ? 'text-red-600' : 'text-muted-foreground'}`}>
                    {market.changeData.value}
                  </td>
                  <td className="text-right py-4 text-muted-foreground">{formatVolume(market.volume)}</td>
                  <td className="text-right py-4">
                    <Button 
                      variant="success" 
                      size="sm"
                      onClick={() => navigate(`/trade?pair=${market.pair}`)}
                    >
                      取引
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Mobile Card View */}
        <div className="md:hidden space-y-3">
          {marketData.map((market) => (
            <div key={market.pair} className="trading-card rounded-lg p-4 hover:bg-card/50 active:bg-card/70 transition-all duration-200 active:scale-[0.98]">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{market.icon}</span>
                  <span className="font-semibold text-foreground text-base">{market.pair}</span>
                </div>
                <Button 
                  variant="success" 
                  size="sm"
                  className="px-4 py-1.5 text-xs font-medium transition-all duration-200 active:scale-95"
                  onClick={() => navigate(`/trade?pair=${market.pair}`)}
                >
                  取引
                </Button>
              </div>
              
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <div className="text-muted-foreground text-xs mb-1">価格</div>
                  <div className="font-medium text-foreground">{formatPrice(market.price)} {market.quoteCurrency}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs mb-1">24h変動</div>
                  <div className={`font-medium ${market.changeData.trend === 'up' ? 'text-green-600' : market.changeData.trend === 'down' ? 'text-red-600' : 'text-muted-foreground'}`}>
                    {market.changeData.value}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs mb-1">出来高</div>
                  <div className="font-medium text-muted-foreground text-xs">{formatVolume(market.volume)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
});