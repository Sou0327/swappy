import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
// 単一銘柄表示に合わせてタブは撤去
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { formatPrice, formatVolume, getCryptoIcon } from "@/lib/format";
import { fetchBinance24hrTicker, toBinanceSymbol } from "@/lib/exchange-feed";
import { useToast } from "@/hooks/use-toast";

interface MarketData {
  symbol: string;
  icon: string;
  price: number | null;
  volume: number | null;
  changeData: { value: string; trend: 'up' | 'down' | 'neutral' };
  quoteCurrency: string;
}

const Markets = () => {
  const { t } = useTranslation('markets');
  const [marketData, setMarketData] = useState<MarketData[]>([]);
  const navigate = useNavigate();
  const { toast } = useToast();

  const singleMarketId = import.meta.env.VITE_SINGLE_MARKET_ID;

  useEffect(() => {
    const load = async () => {
      // 開発環境ではモックデータを使用
      if (import.meta.env.DEV) {
        const mockResults: MarketData[] = [
          {
            symbol: 'BTC/USDT',
            icon: getCryptoIcon('BTC/USDT'),
            price: 98500.00,
            volume: 25000000000,
            changeData: { value: '+2.45%', trend: 'up' },
            quoteCurrency: 'USDT'
          },
          {
            symbol: 'ETH/USDT',
            icon: getCryptoIcon('ETH/USDT'),
            price: 3820.50,
            volume: 12000000000,
            changeData: { value: '-0.85%', trend: 'down' },
            quoteCurrency: 'USDT'
          },
          {
            symbol: 'BTC/ETH',
            icon: getCryptoIcon('BTC/ETH'),
            price: 25.78,
            volume: 5000000000,
            changeData: { value: '+3.12%', trend: 'up' },
            quoteCurrency: 'ETH'
          }
        ];
        setMarketData(mockResults);
        return;
      }

      let query = supabase.from('markets').select('id').eq('status','active');
      if (singleMarketId) query = query.eq('id', singleMarketId);
      const { data: mkts, error } = await query;

      if (error) {
        console.error('Failed to fetch markets:', error);
        toast({
          title: t('error.title'),
          description: t('error.fetchFailed'),
          variant: "destructive",
        });
        return;
      }

      const markets = mkts || [];

      const results: MarketData[] = [];

      for (const m of markets) {
        const binanceSymbol = toBinanceSymbol(m.id);
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

          const symbol = m.id.replace('-', '/');
          const iconPath = getCryptoIcon(symbol);
          const quoteCurrency = m.id.split('-')[1]; // 例: "BTC-USDT" -> "USDT"

          results.push({
            symbol,
            icon: iconPath,
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
    };
    load();
  }, [singleMarketId]);

  const MarketCard = ({ market }: { market: MarketData }) => {
    return (
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-2">
          <div className="space-y-1">
            {/* ヘッダー部分 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
                  {market.icon ? (
                    <img
                      src={market.icon}
                      alt={market.symbol.split('/')[0]}
                      className="w-8 h-8 object-contain"
                      onError={(e) => {
                        // アイコン読み込み失敗時のフォールバック
                        (e.target as HTMLImageElement).style.display = 'none';
                        (e.target as HTMLImageElement).nextElementSibling!.style.display = 'flex';
                      }}
                    />
                  ) : (
                    <div className="w-8 h-8 flex items-center justify-center font-bold text-primary text-base">
                      {market.symbol.split('/')[0].charAt(0)}
                    </div>
                  )}
                  <div className="w-8 h-8 hidden items-center justify-center font-bold text-primary text-base">
                    {market.symbol.split('/')[0].charAt(0)}
                  </div>
                </div>
                <div>
                  <div className="font-bold text-base">{market.symbol}</div>
                  <div className="text-xs text-muted-foreground">{t('card.pair')}</div>
                </div>
              </div>
              <Badge
                variant={market.changeData.trend === 'up' ? 'default' : market.changeData.trend === 'down' ? 'destructive' : 'secondary'}
                className="flex items-center gap-1"
              >
                {market.changeData.trend === 'up' && <TrendingUp className="h-3 w-3" />}
                {market.changeData.trend === 'down' && <TrendingDown className="h-3 w-3" />}
                {market.changeData.trend === 'neutral' && <Minus className="h-3 w-3" />}
                {market.changeData.value}
              </Badge>
            </div>

            {/* 価格情報 */}
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <div className="text-xs text-muted-foreground mb-1">{t('card.lastPrice')}</div>
                <div className="font-bold text-base">{formatPrice(market.price)} {market.quoteCurrency}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">{t('card.volume24h')}</div>
                <div className="font-medium">{formatVolume(market.volume)}</div>
              </div>
            </div>

            {/* アクションボタン */}
            <Button
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={() => navigate(`/trade?pair=${market.symbol}`)}
            >
              {t('card.startTrading')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  // デスクトップ用テーブル行
  const MarketRow = ({ market }: { market: MarketData }) => {
    return (
      <div className="grid grid-cols-5 gap-1.5 p-2 hover:bg-muted/30 transition-colors border-b border-border/20 items-center">
        <div className="flex items-center gap-1.5">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
            {market.icon ? (
              <img
                src={market.icon}
                alt={market.symbol.split('/')[0]}
                className="w-6 h-6 object-contain"
                onError={(e) => {
                  // アイコン読み込み失敗時のフォールバック
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).nextElementSibling!.style.display = 'flex';
                }}
              />
            ) : (
              <div className="w-6 h-6 flex items-center justify-center font-bold text-primary text-sm">
                {market.symbol.split('/')[0].charAt(0)}
              </div>
            )}
            <div className="w-6 h-6 hidden items-center justify-center font-bold text-primary text-sm">
              {market.symbol.split('/')[0].charAt(0)}
            </div>
          </div>
          <div className="font-medium text-foreground">{market.symbol}</div>
        </div>
        <div className="text-right text-foreground font-medium">
          {formatPrice(market.price)} {market.quoteCurrency}
        </div>
        <div className="text-right">
          <Badge
            variant={market.changeData.trend === 'up' ? 'default' : market.changeData.trend === 'down' ? 'destructive' : 'secondary'}
            className="flex items-center gap-1 justify-center"
          >
            {market.changeData.trend === 'up' && <TrendingUp className="h-3 w-3" />}
            {market.changeData.trend === 'down' && <TrendingDown className="h-3 w-3" />}
            {market.changeData.trend === 'neutral' && <Minus className="h-3 w-3" />}
            {market.changeData.value}
          </Badge>
        </div>
        <div className="text-right text-muted-foreground">{formatVolume(market.volume)}</div>
        <div className="text-right">
          <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={() => navigate(`/trade?pair=${market.symbol}`)}>
            {t('table.trade')}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-1">
        <div>
          <h1 className="text-2xl md:text-2xl font-bold text-foreground mb-1">{t('pageTitle')}</h1>
          <p className="text-muted-foreground">{t('pageSubtitle')}</p>
        </div>

        {marketData.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <div className="text-4xl mb-4">📊</div>
                <div className="text-base font-medium mb-2">{t('empty.title')}</div>
                <div className="text-sm">{t('empty.subtitle')}</div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* モバイルカード表示 */}
            <div className="lg:hidden grid gap-1.5">
              {marketData.map((market) => (
                <MarketCard key={market.symbol} market={market} />
              ))}
            </div>

            {/* デスクトップテーブル表示 */}
            <div className="hidden lg:block">
              <Card>
                <CardHeader>
                  <CardTitle>{t('table.title')}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="space-y-0">
                    <div className="grid grid-cols-5 gap-1.5 p-2 text-sm font-medium text-muted-foreground border-b border-border bg-muted/30">
                      <div>{t('table.pair')}</div>
                      <div className="text-right">{t('table.lastPrice')}</div>
                      <div className="text-right">{t('table.change24h')}</div>
                      <div className="text-right">{t('table.volume24h')}</div>
                      <div className="text-right">{t('table.action')}</div>
                    </div>
                    {marketData.map((market) => (
                      <MarketRow key={market.symbol} market={market} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Markets;
