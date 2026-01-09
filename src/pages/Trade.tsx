import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import DashboardLayout from "@/components/DashboardLayout";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import TradingViewWidget from "@/components/TradingViewWidget";
import { fetchBinanceOrderBook, fetchBinanceRecentTrades, toBinanceSymbol } from "@/lib/exchange-feed";
import { BinanceWSClient } from "@/lib/binance-ws";
import { Volume2, Activity, TrendingUp, TrendingDown, Play, Pause, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { TradingSimulator, OrderBookLevel, TradeRecord, SimulatedOrder } from "@/lib/trading-simulation";
import { formatPrice as formatPriceUtil } from "@/lib/format";

const Trade = () => {
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const [markets, setMarkets] = useState<Array<{ id: string; base: string; quote: string; maker_fee_rate?: number; taker_fee_rate?: number; price_tick?: number; qty_step?: number }>>([]);
  const [selectedMarket, setSelectedMarket] = useState<string>("BTC-USDT");
  const singleMarketId = import.meta.env.VITE_SINGLE_MARKET_ID;
  const [trades, setTrades] = useState<Array<{ time: string; price: number; volume: number }>>([]);
  const [bids, setBids] = useState<Array<{ price: number; amount: number }>>([]);
  const [asks, setAsks] = useState<Array<{ price: number; amount: number }>>([]);
  const [baseAvail, setBaseAvail] = useState<string>('—');
  const [quoteAvail, setQuoteAvail] = useState<string>('—');
  const [buyPrice, setBuyPrice] = useState("");
  const [buyQty, setBuyQty] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [sellQty, setSellQty] = useState("");
  const [buyOrderType, setBuyOrderType] = useState<'limit' | 'market'>("limit");
  const [sellOrderType, setSellOrderType] = useState<'limit' | 'market'>("limit");
  const [buyPercent, setBuyPercent] = useState<number>(0);
  const [sellPercent, setSellPercent] = useState<number>(0);
  const tradesChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const ordersChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [myOrders, setMyOrders] = useState<Array<{ id: string; side: string; price: number; qty: number; filled_qty: number; status: string; created_at: string }>>([]);
  const myOrdersChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [cancelingAll, setCancelingAll] = useState(false);
  const [orderHistory, setOrderHistory] = useState<Array<{ id: string; side: string; price: number; qty: number; filled_qty: number; status: string; created_at: string; updated_at: string }>>([]);
  const [historyTab, setHistoryTab] = useState<'active' | 'history'>('active');

  // シミュレーション機能の状態
  const [simulationEnabled, setSimulationEnabled] = useState(false);
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [currentPrice, setCurrentPrice] = useState(50000);
  const [priceChange, setPriceChange] = useState(0);
  const [simulatedTrades, setSimulatedTrades] = useState<TradeRecord[]>([]);
  const [simulatedOrders, setSimulatedOrders] = useState<SimulatedOrder[]>([]);
  const tradingSimulatorRef = useRef<TradingSimulator | null>(null);
  const [useTradingView] = useState(true); // 簡易チャートは不要のため常時TradingView
  const useBinanceFeed = String(import.meta.env.VITE_USE_BINANCE_FEED || '').toLowerCase() === 'true';
  const useBinanceWs = String(import.meta.env.VITE_USE_BINANCE_WS || '').toLowerCase() === 'true';
  // 環境変数でpaperTradingを制御（デフォルトtrue）
  const paperTrading = String(import.meta.env.VITE_PAPER_TRADING || 'true').toLowerCase() !== 'false';

  // TradingView用のシンボル変換（例: BTC-USDT -> BINANCE:BTCUSDT）
  const tvSymbol = (marketId: string) => {
    const [base, quote] = marketId.split('-');
    // 代表例としてBINANCEを既定。USDの場合はCOINBASEに寄せる。
    if (quote === 'USD') return `COINBASE:${base}${quote}`;
    return `BINANCE:${base}${quote}`;
  };

  // 現在のマーケット設定（数量ステップ/価格ティック）
  const marketCfg = useMemo(() => markets.find(m => m.id === selectedMarket), [markets, selectedMarket]);
  const qtyStep = useMemo(() => {
    const s = Number(marketCfg?.qty_step);
    return Number.isFinite(s) && s > 0 ? s : 0.000001;
  }, [marketCfg]);
  const priceTick = useMemo(() => {
    const t = Number(marketCfg?.price_tick);
    return Number.isFinite(t) && t > 0 ? t : 0.01;
  }, [marketCfg]);

  const stepDecimals = (step: number) => {
    const txt = step.toString();
    const idx = txt.indexOf('.');
    return idx >= 0 ? (txt.length - idx - 1) : 0;
  };
  const roundDownToStep = (value: number, step: number) => {
    if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return 0;
    return Math.floor(value / step) * step;
  };

  // ベスト気配価格とミッド価格の計算（メモ化）
  const bestBid = useMemo(() => {
    return bids.length ? Math.max(...bids.map(b => b.price)) : undefined;
  }, [bids]);

  const bestAsk = useMemo(() => {
    return asks.length ? Math.min(...asks.map(a => a.price)) : undefined;
  }, [asks]);

  const midPrice = useMemo(() => {
    return (bestBid && bestAsk) ? (bestBid + bestAsk) / 2 : (bestBid || bestAsk || currentPrice || 0);
  }, [bestBid, bestAsk, currentPrice]);

  // URLパラメータからpairを読み取ってselectedMarketを設定
  useEffect(() => {
    const pairFromUrl = searchParams.get('pair');
    if (pairFromUrl) {
      // "BTC/USDT" -> "BTC-USDT" に変換
      const marketId = pairFromUrl.replace('/', '-');
      // 既に同じ値の場合は更新しない（無限ループ防止）
      setSelectedMarket(prev => prev === marketId ? prev : marketId);
    }
  }, [searchParams]);

  // 初期ロード: markets, recent trades, orderbook
  useEffect(() => {
    const load = async () => {
      let query = supabase.from('markets').select('id, base, quote, maker_fee_rate, taker_fee_rate, price_tick, qty_step').eq('status', 'active');
      if (singleMarketId) {
        query = query.eq('id', singleMarketId);
      }
      const { data: mkts } = await query;
      if (mkts && mkts.length > 0) {
        setMarkets(mkts);
        const desired = singleMarketId || selectedMarket;
        const found = mkts.find(m => m.id === desired)?.id || mkts[0].id;
        // 既に同じ値の場合は更新しない（無限ループ防止）
        if (found !== selectedMarket) {
          setSelectedMarket(found);
        }
      }
    };
    load();
  }, [selectedMarket, singleMarketId]);

  // シミュレーター初期化
  useEffect(() => {
    if (simulationEnabled) {
      // BTCの場合は50000、その他は適当な価格を設定
      const basePrice = selectedMarket.includes('BTC') ? 50000 :
        selectedMarket.includes('ETH') ? 3000 :
          selectedMarket.includes('USDT') ? 1 : 100;

      tradingSimulatorRef.current = new TradingSimulator(basePrice);
      setCurrentPrice(basePrice);

      // 初期チャートデータを生成
      const chartData = tradingSimulatorRef.current.tradeHistorySimulator.generateChartData(50);
      setTrades(chartData);

      // 初期板データを生成
      const orderBook = tradingSimulatorRef.current.orderBookSimulator.generateOrderBook();
      setBids(orderBook.bids);
      setAsks(orderBook.asks);
    }

    return () => {
      if (tradingSimulatorRef.current) {
        tradingSimulatorRef.current.stop();
      }
    };
  }, [simulationEnabled, selectedMarket]);

  // シミュレーション開始/停止
  const toggleSimulation = () => {
    if (!tradingSimulatorRef.current) return;

    if (simulationRunning) {
      tradingSimulatorRef.current.stop();
      setSimulationRunning(false);
    } else {
      let lastPrice = currentPrice;

      tradingSimulatorRef.current.start({
        onPriceUpdate: (price) => {
          const change = ((price - lastPrice) / lastPrice) * 100;
          setCurrentPrice(price);
          setPriceChange(change);
          lastPrice = price;
        },
        onOrderBookUpdate: (orderBook) => {
          setBids(orderBook.bids);
          setAsks(orderBook.asks);
        },
        onNewTrade: (trade) => {
          setSimulatedTrades(prev => [trade, ...prev.slice(0, 99)]); // 最新100件を保持

          // チャートデータも更新
          setTrades(prev => {
            const newTrades = [...prev];
            newTrades.push({
              time: trade.time,
              price: trade.price,
              volume: trade.volume
            });
            // 最新50件を保持
            return newTrades.slice(-50);
          });
        },
        onOrderUpdate: (orders) => {
          if (user) {
            const userOrders = orders.filter(o => o.user_id === user.id);
            setSimulatedOrders(userOrders);
          }
        }
      });
      setSimulationRunning(true);
    }
  };

  // シミュレーションリセット
  const resetSimulation = () => {
    if (tradingSimulatorRef.current) {
      tradingSimulatorRef.current.stop();
      setSimulationRunning(false);

      // 再初期化
      const basePrice = selectedMarket.includes('BTC') ? 50000 :
        selectedMarket.includes('ETH') ? 3000 :
          selectedMarket.includes('USDT') ? 1 : 100;

      tradingSimulatorRef.current = new TradingSimulator(basePrice);
      setCurrentPrice(basePrice);
      setPriceChange(0);
      setSimulatedTrades([]);
      setSimulatedOrders([]);

      // 初期データを再生成
      const chartData = tradingSimulatorRef.current.tradeHistorySimulator.generateChartData(50);
      setTrades(chartData);

      const orderBook = tradingSimulatorRef.current.orderBookSimulator.generateOrderBook();
      setBids(orderBook.bids);
      setAsks(orderBook.asks);
    }
  };

  const refreshTrades = useCallback(async (market: string) => {
    if (simulationEnabled) return;
    if (useBinanceFeed) {
      const sym = toBinanceSymbol(market);
      if (!sym) return;
      try {
        const t = await fetchBinanceRecentTrades(sym, 200);
        setTrades(t);
        if (t.length) setCurrentPrice(t[t.length - 1].price);
        return;
      } catch (e) {
        console.warn('Binance trades fallback to DB:', e);
      }
    }
    // Fallback: DB（自前マーケット）
    const { data } = await supabase.from('trades').select('created_at, price, qty').eq('market', market).order('created_at', { ascending: true }).limit(200);
    const t = (data || []).map(r => ({ time: new Date(r.created_at).toLocaleTimeString(), price: r.price as number, volume: Number(r.qty) }));
    setTrades(t);
    if (t.length) setCurrentPrice(t[t.length - 1].price);
  }, [simulationEnabled, useBinanceFeed]);

  const refreshOrderbook = useCallback(async (market: string) => {
    if (simulationEnabled) return;
    if (useBinanceFeed) {
      const sym = toBinanceSymbol(market);
      if (!sym) return;
      try {
        const { bids, asks } = await fetchBinanceOrderBook(sym, 10);
        setBids(bids);
        setAsks(asks);
        if (bids.length || asks.length) {
          const binanceBestBid = bids.length ? Math.max(...bids.map(b => b.price)) : undefined;
          const binanceBestAsk = asks.length ? Math.min(...asks.map(a => a.price)) : undefined;
          const binanceMid = (binanceBestBid && binanceBestAsk) ? (binanceBestBid + binanceBestAsk) / 2 : (binanceBestBid || binanceBestAsk);
          if (binanceMid) setCurrentPrice(binanceMid);
        }
        return;
      } catch (e) {
        console.warn('Binance orderbook fallback to DB:', e);
      }
    }
    // Fallback: DB（自前マーケット）
    const { data: bidsData } = await supabase.rpc('get_orderbook_levels', { p_market: market, p_side: 'buy', p_limit: 10 });
    const { data: asksData } = await supabase.rpc('get_orderbook_levels', { p_market: market, p_side: 'sell', p_limit: 10 });
    const nbids = (bidsData || []).map((r: OrderBookLevel) => ({ price: Number(r.price), amount: Number(r.amount) }));
    const nasks = (asksData || []).map((r: OrderBookLevel) => ({ price: Number(r.price), amount: Number(r.amount) }));
    setBids(nbids);
    setAsks(nasks);
    if (nbids.length || nasks.length) {
      const dbBestBid = nbids.length ? Math.max(...nbids.map(b => b.price)) : undefined;
      const dbBestAsk = nasks.length ? Math.min(...nasks.map(a => a.price)) : undefined;
      const dbMid = (dbBestBid && dbBestAsk) ? (dbBestBid + dbBestAsk) / 2 : (dbBestBid || dbBestAsk);
      if (dbMid) setCurrentPrice(dbMid);
    }
  }, [simulationEnabled, useBinanceFeed]);

  const refreshMyOrders = useCallback(async (market: string) => {
    if (!user) { setMyOrders([]); return; }
    if (paperTrading) {
      // 紙取引: シミュレータの注文を常に表示
      if (!tradingSimulatorRef.current) {
        const basePrice = midPrice || (market.includes('BTC') ? 50000 : market.includes('ETH') ? 3000 : market.includes('USDT') ? 1 : 100);
        tradingSimulatorRef.current = new TradingSimulator(basePrice);
      }
      const userOrders = tradingSimulatorRef.current.orderSimulator.getOrdersByUser(user.id!, market);
      setSimulatedOrders(userOrders);
      setMyOrders(userOrders.map(o => ({ id: o.id, side: o.side, price: o.price, qty: o.qty, filled_qty: o.filled_qty, status: o.status, created_at: o.created_at })));
      return;
    }

    const { data, error } = await supabase
      .from('orders')
      .select('id, side, price, qty, filled_qty, status, created_at')
      .eq('user_id', user.id)
      .eq('market', market)
      .in('status', ['open', 'partially_filled', 'new'])
      .order('created_at', { ascending: false })
      .limit(50);

    console.log('📋 Fetched orders:', data);
    if (!error) setMyOrders(data || []);
  }, [user, paperTrading, midPrice]);

  const refreshOrderHistory = useCallback(async (market: string) => {
    if (!user || paperTrading) { setOrderHistory([]); return; }

    const { data, error } = await supabase
      .from('orders')
      .select('id, side, price, qty, filled_qty, status, created_at, updated_at')
      .eq('user_id', user.id)
      .eq('market', market)
      .in('status', ['filled', 'canceled', 'rejected'])
      .order('updated_at', { ascending: false })
      .limit(100);
    if (!error) setOrderHistory(data || []);
  }, [user, paperTrading]);

  const refreshBalances = useCallback(async (market: string) => {
    if (!user) { setBaseAvail('—'); setQuoteAvail('—'); return; }
    const [base, quote] = market.split('-');

    // user_assetsから直接取得（本番環境の表示問題を解決するため）
    // available = balance - locked_balance
    const { data: assets } = await supabase
      .from('user_assets')
      .select('currency, balance, locked_balance')
      .eq('user_id', user.id)
      .in('currency', [base, quote]);

    let baseVal: number | null = null;
    let quoteVal: number | null = null;

    for (const asset of (assets || [])) {
      const available = Number(asset.balance) - Number(asset.locked_balance);
      if (asset.currency === base) baseVal = available;
      if (asset.currency === quote) quoteVal = available;
    }

    setBaseAvail(baseVal !== null ? String(baseVal) : '0');
    setQuoteAvail(quoteVal !== null ? String(quoteVal) : '0');
  }, [user]);

  useEffect(() => {
    if (!selectedMarket) return;
    // ポーリングID（クリーンアップで参照できるよう外側で宣言）
    let pollId: number | undefined;
    let wsClient: BinanceWSClient | null = null;
    if (!simulationEnabled) {
      refreshTrades(selectedMarket);
      refreshOrderbook(selectedMarket);
      refreshMyOrders(selectedMarket);
      refreshOrderHistory(selectedMarket);
      refreshBalances(selectedMarket);

      // Realtime: trades/orders
      tradesChannelRef.current?.unsubscribe();
      ordersChannelRef.current?.unsubscribe();

      tradesChannelRef.current = supabase
        .channel(`trades:${selectedMarket}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trades', filter: `market=eq.${selectedMarket}` }, () => {
          refreshTrades(selectedMarket);
        })
        .subscribe();

      ordersChannelRef.current = supabase
        .channel(`orders:${selectedMarket}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `market=eq.${selectedMarket}` }, () => {
          refreshOrderbook(selectedMarket);
        })
        .subscribe();

      // Subscribe to own order changes
      if (user) {
        myOrdersChannelRef.current?.unsubscribe();
        myOrdersChannelRef.current = supabase
          .channel(`my-orders:${user.id}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${user.id}` }, () => {
            refreshMyOrders(selectedMarket);
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'ledger_entries', filter: `user_id=eq.${user.id}` }, () => {
            refreshBalances(selectedMarket);
          })
          .subscribe();
      }
      // Binance WebSocket
      if (useBinanceWs) {
        const sym = toBinanceSymbol(selectedMarket);
        if (sym) {
          wsClient = new BinanceWSClient(sym, {
            onDepth: (nbids, nasks) => {
              setBids(nbids);
              setAsks(nasks);
              if (nbids.length || nasks.length) {
                const wsBestBid = nbids.length ? Math.max(...nbids.map(b => b.price)) : undefined;
                const wsBestAsk = nasks.length ? Math.min(...nasks.map(a => a.price)) : undefined;
                const wsMid = (wsBestBid && wsBestAsk) ? (wsBestBid + wsBestAsk) / 2 : (wsBestBid || wsBestAsk);
                if (wsMid) setCurrentPrice(wsMid);
              }
            },
            onTrade: (t) => {
              setTrades(prev => {
                const list = [...prev, t];
                return list.slice(-200);
              });
              setCurrentPrice(t.price);
            },
            onError: (e) => console.warn('Binance WS error', e),
          });
          wsClient.connect();
        }
      } else if (useBinanceFeed) {
        // Binance フィードのポーリングで最新化（可変間隔 + タブ非アクティブ抑制）
        const baseInterval = Number((import.meta as { env?: { VITE_BINANCE_POLL_INTERVAL_MS?: string } }).env?.VITE_BINANCE_POLL_INTERVAL_MS || 15000);
        const hiddenInterval = 60000;
        let currentInterval = baseInterval;
        let stopped = false;
        const poll = async () => {
          if (stopped) return;
          const isHidden = typeof document !== 'undefined' && document.hidden;
          try {
            await Promise.all([
              refreshTrades(selectedMarket),
              refreshOrderbook(selectedMarket),
            ]);
            currentInterval = isHidden ? hiddenInterval : baseInterval;
          } catch (_) {
            currentInterval = Math.min((currentInterval || baseInterval) * 2, 60000);
          } finally {
            if (!stopped) pollId = window.setTimeout(poll, currentInterval) as unknown as number;
          }
        };
        poll();
        const onVis = () => { currentInterval = document.hidden ? hiddenInterval : baseInterval; };
        document.addEventListener('visibilitychange', onVis);
        // cleanup hook
        const stop = () => { stopped = true; if (pollId) window.clearTimeout(pollId); document.removeEventListener('visibilitychange', onVis); };
        (window as { __binance_poll_stop__?: () => void }).__binance_poll_stop__ = stop;
      }
    } else {
      refreshBalances(selectedMarket); // 残高は実データを表示
    }

    return () => {
      tradesChannelRef.current?.unsubscribe();
      ordersChannelRef.current?.unsubscribe();
      myOrdersChannelRef.current?.unsubscribe();
      if (pollId) window.clearTimeout(pollId);
      if ((window as { __binance_poll_stop__?: () => void }).__binance_poll_stop__) {
        (window as { __binance_poll_stop__?: () => void }).__binance_poll_stop__!();
        (window as { __binance_poll_stop__?: () => void }).__binance_poll_stop__ = undefined;
      }
      if (wsClient) wsClient.close();
    };
  }, [selectedMarket, user?.id, simulationEnabled, refreshBalances, refreshMyOrders, refreshOrderbook, refreshTrades, user, useBinanceFeed, useBinanceWs]);

  const placeOrder = async (side: 'buy' | 'sell') => {
    try {
      if (!user) { toast({ title: '要ログイン', description: 'ログインすると発注できます', variant: 'destructive' }); return; }
      const orderType = side === 'buy' ? buyOrderType : sellOrderType;
      const qty = Number(side === 'buy' ? buyQty : sellQty);
      if (!selectedMarket || !qty || qty <= 0) return;

      // 価格（成行は板の最良気配から）
      const inputPrice = Number(side === 'buy' ? buyPrice : sellPrice);
      const price = orderType === 'limit' ? inputPrice : (side === 'buy' ? (bestAsk || midPrice) : (bestBid || midPrice));

      // 価格のバリデーション
      if (!price || price <= 0 || !Number.isFinite(price)) {
        toast({
          title: 'エラー',
          description: `価格を取得できません。${orderType === 'limit' ? '価格を入力してください' : '板情報を読み込み中です'}`,
          variant: 'destructive'
        });
        return;
      }

      if (paperTrading) {
        // 紙取引シミュレーターで処理
        if (!tradingSimulatorRef.current) {
          const basePrice = midPrice || (selectedMarket.includes('BTC') ? 50000 : selectedMarket.includes('ETH') ? 3000 : selectedMarket.includes('USDT') ? 1 : 100);
          tradingSimulatorRef.current = new TradingSimulator(basePrice);
        }
        const order = tradingSimulatorRef.current.orderSimulator.createOrder(
          side,
          orderType,
          price,
          qty,
          selectedMarket,
          user.id
        );

        toast({ title: '注文送信（シミュレーション）', description: `${orderType === 'market' ? '成行' : '指値'}で${side === 'buy' ? '買い' : '売り'}注文を送信しました` });

        const userOrders = tradingSimulatorRef.current.orderSimulator.getOrdersByUser(user.id!, selectedMarket);
        setSimulatedOrders(userOrders);
        setMyOrders(userOrders.map(o => ({ id: o.id, side: o.side, price: o.price, qty: o.qty, filled_qty: o.filled_qty, status: o.status, created_at: o.created_at })));
      } else {
        // 実取引: RPCを呼び出し
        console.log('📤 Sending order:', {
          orderType,
          p_market: selectedMarket,
          p_side: side,
          p_price: price,
          p_qty: qty,
          types: {
            price: typeof price,
            qty: typeof qty
          }
        });

        let orderId: string | null = null;
        let error: { message: string; code?: string; details?: unknown } | null = null;

        if (orderType === 'market') {
          // 成行注文: 外部価格で即座に約定
          const result = await supabase.rpc('execute_market_order', {
            p_market: selectedMarket,
            p_side: side,
            p_qty: qty,
            p_price: price
          });
          orderId = result.data;
          error = result.error;
        } else {
          // 指値注文: 板にマッチング
          const result = await supabase.rpc('place_limit_order', {
            p_market: selectedMarket,
            p_side: side,
            p_price: price,
            p_qty: qty,
            p_time_in_force: 'GTC'
          });
          orderId = result.data;
          error = result.error;
        }

        console.log('📥 RPC Response:', { data: orderId, error });

        if (error) {
          console.error('❌ RPC Error:', error);
          throw new Error(`注文エラー: ${error.message} (code: ${error.code}, details: ${JSON.stringify(error.details)})`);
        }

        console.log('✅ Order placed successfully, orderId:', orderId);

        // リフレッシュ
        await refreshMyOrders(selectedMarket);
        await refreshBalances(selectedMarket);

        // 通知表示
        if (orderType === 'market') {
          toast({
            title: '注文約定',
            description: `成行${side === 'buy' ? '買い' : '売り'}注文が約定しました（価格: ${price.toFixed(2)} USDT）`
          });
        } else {
          toast({
            title: '注文送信成功',
            description: `指値${side === 'buy' ? '買い' : '売り'}注文を送信しました（注文ID: ${orderId}）`
          });
        }
      }

      // フォームリセット
      if (side === 'buy') { setBuyQty(""); if (orderType === 'limit') setBuyPrice(""); }
      else { setSellQty(""); if (orderType === 'limit') setSellPrice(""); }
    } catch (e: unknown) {
      const error = e as Error;
      toast({ title: 'エラー', description: error.message || '注文に失敗しました', variant: 'destructive' });
    }
  };

  const cancelOrder = async (id: string) => {
    try {
      if (!user) return;

      if (paperTrading) {
        // シミュレーション注文キャンセル
        if (tradingSimulatorRef.current) {
          const success = tradingSimulatorRef.current.orderSimulator.cancelOrder(id);
          if (success) {
            toast({ title: '注文取消（シミュレーション）', description: `注文を取消しました` });
            const userOrders = tradingSimulatorRef.current.orderSimulator.getOrdersByUser(user.id!, selectedMarket);
            setSimulatedOrders(userOrders);
            await refreshMyOrders(selectedMarket);
          }
        }
      } else {
        // 実取引: cancel_order RPC呼び出し
        const { error } = await supabase.rpc('cancel_order', {
          p_order_id: id
        });

        if (error) throw error;

        toast({ title: '注文取消成功', description: '注文を取消しました' });

        // リフレッシュ
        await refreshMyOrders(selectedMarket);
        await refreshBalances(selectedMarket);
      }
    } catch (e: unknown) {
      const error = e as Error;
      toast({ title: 'エラー', description: error.message || '取消に失敗しました', variant: 'destructive' });
    }
  };

  const cancelAllOpen = async () => {
    try {
      if (!user) return;
      setCancelingAll(true);

      if (paperTrading) {
        // シミュレーション注文を全てキャンセル
        if (tradingSimulatorRef.current) {
          const userOrders = tradingSimulatorRef.current.orderSimulator.getOrdersByUser(user.id!, selectedMarket);
          let canceledCount = 0;
          for (const order of userOrders) {
            if (order.status === 'pending' || order.status === 'partial') {
              if (tradingSimulatorRef.current.orderSimulator.cancelOrder(order.id)) {
                canceledCount++;
              }
            }
          }

          toast({ title: '一括取消（シミュレーション）', description: `${canceledCount}件の注文を取消しました` });
          const updatedOrders = tradingSimulatorRef.current.orderSimulator.getOrdersByUser(user.id!, selectedMarket);
          setSimulatedOrders(updatedOrders);
          await refreshMyOrders(selectedMarket);
        }
      } else {
        // 実取引: 各注文に対してcancel_order RPCを呼び出し
        const openOrders = myOrders.filter(o => o.status === 'open' || o.status === 'partially_filled');
        let canceledCount = 0;
        let failedCount = 0;

        for (const order of openOrders) {
          try {
            const { error } = await supabase.rpc('cancel_order', {
              p_order_id: order.id
            });
            if (!error) {
              canceledCount++;
            } else {
              failedCount++;
            }
          } catch {
            failedCount++;
          }
        }

        if (failedCount > 0) {
          toast({
            title: '一括取消完了（一部失敗）',
            description: `${canceledCount}件を取消、${failedCount}件失敗しました`,
            variant: 'destructive'
          });
        } else {
          toast({ title: '一括取消成功', description: `${canceledCount}件の注文を取消しました` });
        }

        // リフレッシュ
        await refreshMyOrders(selectedMarket);
        await refreshBalances(selectedMarket);
      }
    } catch (e: unknown) {
      const error = e as Error;
      toast({ title: 'エラー', description: error.message || '一括取消に失敗しました', variant: 'destructive' });
    } finally {
      setCancelingAll(false);
    }
  };

  // 価格クリックで注文価格に設定（メモ化）
  const handlePriceClick = useCallback((price: number, side: 'buy' | 'sell') => {
    if (side === 'buy') {
      setBuyPrice(price.toString());
    } else {
      setSellPrice(price.toString());
    }
  }, []);

  // 現在価格の表示用フォーマット（共通ユーティリティを使用）
  const formatPrice = useCallback((price: number | null) => {
    if (price === null || price === undefined) return '成行';
    return formatPriceUtil(price, 2);
  }, []);

  // チャートデータの処理
  const chartData = useMemo(() => {
    return trades.map(trade => ({
      ...trade,
      displayTime: trade.time,
      priceFormatted: formatPrice(trade.price)
    }));
  }, [trades, formatPrice]);

  return (
    <DashboardLayout>
      <div className="space-y-6 overflow-hidden">
        {/* Header with Market Selection */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-6 border border-gray-100 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <h1 className="text-2xl md:text-2xl font-bold text-gray-900">取引</h1>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Activity className="h-4 w-4 text-blue-600" />
                </div>
                <Select value={selectedMarket} onValueChange={setSelectedMarket} disabled={!markets.length}>
                  <SelectTrigger className="w-full sm:w-48 border-gray-200 bg-white/80">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {markets.map(market => (
                      <SelectItem key={market.id} value={market.id}>
                        {market.base}/{market.quote}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 現在価格表示 */}
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm text-gray-500">現在価格</div>
                <div className="text-base font-bold text-gray-900">¥{formatPrice(currentPrice)}</div>
              </div>
              {simulationEnabled && (
                <Badge variant={priceChange >= 0 ? "default" : "destructive"} className="flex items-center gap-1">
                  {priceChange >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {priceChange.toFixed(2)}%
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Current Price Display */}
        {simulationEnabled && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="text-2xl font-bold text-gray-900">
                    ¥{formatPrice(currentPrice)}
                  </div>
                  <Badge variant={priceChange >= 0 ? "default" : "destructive"} className="flex items-center gap-1">
                    {priceChange >= 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {priceChange.toFixed(2)}%
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Activity className="h-4 w-4" />
                  {simulationRunning ? (
                    <Badge variant="outline" className="text-green-600">
                      ライブ シミュレーション
                    </Badge>
                  ) : (
                    <Badge variant="outline">
                      シミュレーション停止中
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-4 lg:space-y-6 2xl:grid 2xl:grid-cols-5 2xl:gap-6">
          {/* Chart */}
          <div className="2xl:col-span-4 space-y-4 lg:space-y-6">
            <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-100/50">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                      <Volume2 className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">価格チャート</h3>
                      <p className="text-sm text-gray-500">TradingView ライブチャート</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 border-blue-200">Live Data</Badge>
                </div>
              </div>
              <div className="p-0">
                <div className="w-full h-[500px] sm:h-[600px] lg:h-[700px] xl:h-[800px] 2xl:h-[900px] overflow-hidden">
                  <TradingViewWidget
                    symbol={tvSymbol(selectedMarket)}
                    interval="60"
                    theme="light"
                    autosize={false}
                    height={700}
                  />
                </div>
              </div>
            </div>

            {/* Trade History */}
            <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-100/50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-green-50 rounded-xl flex items-center justify-center">
                    <Activity className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">取引履歴</h3>
                    <p className="text-sm text-gray-500">最近20件の取引記録</p>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <div className="max-h-64 overflow-y-auto">
                  {/* Desktop Table View */}
                  <div className="hidden sm:block">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-background">
                        <tr className="border-b">
                          <th className="text-left p-2">時刻</th>
                          <th className="text-right p-2">価格</th>
                          <th className="text-right p-2">数量</th>
                          {simulationEnabled && <th className="text-center p-2">売買</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {(simulationEnabled ? simulatedTrades : trades.slice().reverse()).slice(0, 20).map((trade, index) => (
                          <tr key={index} className="border-b hover:bg-gray-100/50">
                            <td className="p-2">{trade.time}</td>
                            <td className="p-2 text-right font-mono">¥{formatPrice(trade.price)}</td>
                            <td className="p-2 text-right font-mono">{trade.volume.toFixed(4)}</td>
                            {simulationEnabled && 'side' in trade && (
                              <td className="p-2 text-center">
                                <Badge variant={trade.side === 'buy' ? 'default' : 'destructive'} className="text-xs">
                                  {trade.side === 'buy' ? '買い' : '売り'}
                                </Badge>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Card View */}
                  <div className="sm:hidden space-y-2">
                    {(simulationEnabled ? simulatedTrades : trades.slice().reverse()).slice(0, 10).map((trade, index) => (
                      <div key={index} className="border rounded-lg p-3 bg-white">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs text-gray-600">{trade.time}</span>
                          {simulationEnabled && 'side' in trade && (
                            <Badge variant={trade.side === 'buy' ? 'default' : 'destructive'} className="text-xs">
                              {trade.side === 'buy' ? '買い' : '売り'}
                            </Badge>
                          )}
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="font-mono text-sm font-medium">¥{formatPrice(trade.price)}</span>
                          <span className="font-mono text-sm text-gray-600">{trade.volume.toFixed(4)}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {trades.length === 0 && (
                    <div className="text-center py-8 text-gray-600 text-sm">
                      取引履歴がありません
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Orderbook & Trading */}
          <div className="w-full space-y-4 lg:space-y-6 overflow-hidden">
            {/* Order Book */}
            <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-100/50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-orange-50 rounded-xl flex items-center justify-center">
                    <Activity className="h-4 w-4 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">板情報</h3>
                    <p className="text-sm text-gray-500">買い・売り注文一覧</p>
                  </div>
                </div>
              </div>
              <div className="p-0">
                <div className="space-y-2">
                  {/* Asks (売り板) */}
                  <div className="px-3 md:px-4 py-2">
                    <div className="text-xs text-gray-600 mb-2">売り</div>
                    {asks.slice(0, 5).reverse().map((ask, index) => (
                      <div
                        key={index}
                        className="flex justify-between text-sm py-1 hover:bg-gray-100 active:bg-gray-200 cursor-pointer transition-colors duration-200 rounded px-1"
                        onClick={() => handlePriceClick(ask.price, 'buy')}
                      >
                        <span className="text-red-500 font-mono text-xs md:text-sm">¥{formatPrice(ask.price)}</span>
                        <span className="font-mono text-xs md:text-sm">{ask.amount.toFixed(4)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-b py-2 px-3 md:px-4 bg-gray-100/20">
                    <div className="text-center font-semibold text-gray-900 text-sm md:text-sm">
                      ¥{formatPrice(currentPrice)}
                    </div>
                  </div>

                  {/* Bids (買い板) */}
                  <div className="px-3 md:px-4 py-2">
                    <div className="text-xs text-gray-600 mb-2">買い</div>
                    {bids.slice(0, 5).map((bid, index) => (
                      <div
                        key={index}
                        className="flex justify-between text-sm py-1 hover:bg-gray-100 active:bg-gray-200 cursor-pointer transition-colors duration-200 rounded px-1"
                        onClick={() => handlePriceClick(bid.price, 'sell')}
                      >
                        <span className="text-green-500 font-mono text-xs md:text-sm">¥{formatPrice(bid.price)}</span>
                        <span className="font-mono text-xs md:text-sm">{bid.amount.toFixed(4)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Trading Form */}
            <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-100/50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-purple-50 rounded-xl flex items-center justify-center">
                    <Activity className="h-4 w-4 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">注文</h3>
                    <p className="text-sm text-gray-500">売買注文を発行</p>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <Tabs defaultValue="buy" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="buy">買い</TabsTrigger>
                    <TabsTrigger value="sell">売り</TabsTrigger>
                  </TabsList>

                  <TabsContent value="buy" className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm">注文タイプ</label>
                      <Select value={buyOrderType} onValueChange={(v) => setBuyOrderType(v as 'limit' | 'market')}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="limit">指値</SelectItem>
                          <SelectItem value="market">成行</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm">価格</label>
                      <Input
                        placeholder="0.00"
                        value={buyPrice}
                        onChange={(e) => setBuyPrice(e.target.value)}
                        type="number"
                        step="0.01"
                        disabled={buyOrderType === 'market'}
                      />
                      {buyOrderType === 'market' && (
                        <div className="text-xs text-gray-600">成行: 最良売気配で即時約定します</div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm">数量</label>
                      <Input
                        placeholder="0.00"
                        value={buyQty}
                        onChange={(e) => setBuyQty(e.target.value)}
                        type="number"
                        step="0.0001"
                      />
                      <div className="space-y-2">
                        <Slider value={[buyPercent]} onValueChange={(v) => {
                          const p = Math.max(0, Math.min(100, Number(v[0] || 0)));
                          setBuyPercent(p);
                          // 指値の場合はユーザー入力価格、成行の場合は最良気配
                          const price = buyOrderType === 'limit'
                            ? (Number(buyPrice) || midPrice || 0)
                            : (bestAsk || midPrice || 0);
                          const avail = Number(quoteAvail) || 0;
                          // 手数料を考慮した利用可能額を計算
                          const feeRate = marketCfg?.taker_fee_rate || 0.0015;
                          const availableForOrder = avail / (1 + feeRate);
                          const spend = availableForOrder * (p / 100);
                          const rawQty = price > 0 ? spend / price : 0;
                          const qty = roundDownToStep(rawQty, qtyStep);
                          const dec = stepDecimals(qtyStep);
                          setBuyQty(qty > 0 ? qty.toFixed(dec) : "");
                        }} min={0} max={100} step={1} />
                        <div className="flex justify-between text-xs text-gray-600">
                          {[25, 50, 75, 100].map(x => (
                            <button key={x} className="underline" onClick={() => {
                              const p = x; setBuyPercent(p);
                              // 指値の場合はユーザー入力価格、成行の場合は最良気配
                              const price = buyOrderType === 'limit'
                                ? (Number(buyPrice) || midPrice || 0)
                                : (bestAsk || midPrice || 0);
                              const avail = Number(quoteAvail) || 0;
                              // 手数料を考慮した利用可能額を計算
                              const feeRate = marketCfg?.taker_fee_rate || 0.0015;
                              const availableForOrder = avail / (1 + feeRate);
                              const spend = availableForOrder * (p / 100);
                              const rawQty = price > 0 ? spend / price : 0;
                              const qty = roundDownToStep(rawQty, qtyStep);
                              const dec = stepDecimals(qtyStep);
                              setBuyQty(qty > 0 ? qty.toFixed(dec) : "");
                            }}>{x}%</button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-600">
                      利用可能: {quoteAvail} USDT
                    </div>
                    <Button
                      className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 transition-all duration-200 active:scale-95"
                      onClick={() => placeOrder('buy')}
                      disabled={(!buyQty) || (buyOrderType === 'limit' && !buyPrice)}
                    >
                      買い注文
                    </Button>
                  </TabsContent>

                  <TabsContent value="sell" className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm">注文タイプ</label>
                      <Select value={sellOrderType} onValueChange={(v) => setSellOrderType(v as 'limit' | 'market')}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="limit">指値</SelectItem>
                          <SelectItem value="market">成行</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm">価格</label>
                      <Input
                        placeholder="0.00"
                        value={sellPrice}
                        onChange={(e) => setSellPrice(e.target.value)}
                        type="number"
                        step="0.01"
                        disabled={sellOrderType === 'market'}
                      />
                      {sellOrderType === 'market' && (
                        <div className="text-xs text-gray-600">成行: 最良買気配で即時約定します</div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm">数量</label>
                      <Input
                        placeholder="0.00"
                        value={sellQty}
                        onChange={(e) => setSellQty(e.target.value)}
                        type="number"
                        step="0.0001"
                      />
                      <div className="space-y-2">
                        <Slider value={[sellPercent]} onValueChange={(v) => {
                          const p = Math.max(0, Math.min(100, Number(v[0] || 0)));
                          setSellPercent(p);
                          const avail = Number(baseAvail) || 0;
                          const rawQty = avail * (p / 100);
                          const qty = roundDownToStep(rawQty, qtyStep);
                          const dec = stepDecimals(qtyStep);
                          setSellQty(qty > 0 ? qty.toFixed(dec) : "");
                        }} min={0} max={100} step={1} />
                        <div className="flex justify-between text-xs text-gray-600">
                          {[25, 50, 75, 100].map(x => (
                            <button key={x} className="underline" onClick={() => {
                              const p = x; setSellPercent(p);
                              const avail = Number(baseAvail) || 0;
                              const rawQty = avail * (p / 100);
                              const qty = roundDownToStep(rawQty, qtyStep);
                              const dec = stepDecimals(qtyStep);
                              setSellQty(qty > 0 ? qty.toFixed(dec) : "");
                            }}>{x}%</button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-600">
                      利用可能: {baseAvail} BTC
                    </div>
                    <Button
                      className="w-full bg-red-600 hover:bg-red-700 active:bg-red-800 transition-all duration-200 active:scale-95"
                      onClick={() => placeOrder('sell')}
                      disabled={(!sellQty) || (sellOrderType === 'limit' && !sellPrice)}
                    >
                      売り注文
                    </Button>
                  </TabsContent>
                </Tabs>
              </div>
            </div>

            {/* My Orders */}
            <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 p-6 border-b border-gray-100/50">
                <div className="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center">
                  <Activity className="h-4 w-4 text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">注文管理</h3>
                  <p className="text-sm text-gray-500">未約定注文と履歴</p>
                </div>
              </div>
              <div className="p-6">
                <Tabs value={historyTab} onValueChange={(v) => setHistoryTab(v as 'active' | 'history')}>
                  <TabsList className="grid w-full grid-cols-2 mb-4">
                    <TabsTrigger value="active">未約定注文</TabsTrigger>
                    <TabsTrigger value="history">注文履歴</TabsTrigger>
                  </TabsList>

                  <TabsContent value="active" className="space-y-4">
                    {myOrders.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={cancelAllOpen}
                        disabled={cancelingAll}
                        className="w-full transition-all duration-200 active:scale-95"
                      >
                        {cancelingAll ? "取消中..." : "全て取消"}
                      </Button>
                    )}
                    <div className="max-h-64 overflow-y-auto">
                      {myOrders.length === 0 ? (
                        <div className="text-center py-8 text-gray-600">
                          アクティブな注文がありません
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {myOrders.map((order) => (
                            <div key={order.id} className="bg-gray-50/50 rounded-xl p-4 space-y-3">
                              <div className="flex justify-between items-center">
                                <Badge variant={order.side === 'buy' ? 'default' : 'destructive'} className="rounded-full">
                                  {order.side === 'buy' ? '買い' : '売り'}
                                </Badge>
                                <Badge variant="outline" className="rounded-full">
                                  {order.status}
                                </Badge>
                              </div>
                              <div className="text-sm space-y-1">
                                <div className="flex justify-between">
                                  <span className="text-gray-600">価格:</span>
                                  <span className="font-mono">¥{formatPrice(order.price)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600">数量:</span>
                                  <span className="font-mono">{order.qty.toFixed(4)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600">約定:</span>
                                  <span className="font-mono">{order.filled_qty.toFixed(4)}</span>
                                </div>
                              </div>
                              {(order.status === 'pending' || order.status === 'partial') && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full rounded-xl transition-all duration-200 active:scale-95 hover:bg-red-50 hover:border-red-200 hover:text-red-600"
                                  onClick={() => cancelOrder(order.id)}
                                >
                                  取消
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="history">
                    <div className="max-h-64 overflow-y-auto">
                      {orderHistory.length === 0 ? (
                        <div className="text-center py-8 text-gray-600">
                          注文履歴がありません
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {orderHistory.map((order) => {
                            const fillPercent = order.qty > 0 ? (order.filled_qty / order.qty * 100) : 0;
                            const statusText = order.status === 'filled' ? '約定' : order.status === 'canceled' ? '取消' : '拒否';
                            const statusVariant = order.status === 'filled' ? 'default' : order.status === 'canceled' ? 'secondary' : 'destructive';

                            return (
                              <div key={order.id} className="bg-gray-50/50 rounded-xl p-4 space-y-3">
                                <div className="flex justify-between items-center">
                                  <Badge variant={order.side === 'buy' ? 'default' : 'destructive'} className="rounded-full">
                                    {order.side === 'buy' ? '買い' : '売り'}
                                  </Badge>
                                  <Badge variant={statusVariant} className="rounded-full">
                                    {statusText}
                                  </Badge>
                                </div>
                                <div className="text-sm space-y-1">
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">価格:</span>
                                    <span className="font-mono">¥{formatPrice(order.price)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">数量:</span>
                                    <span className="font-mono">{order.qty.toFixed(4)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">約定:</span>
                                    <span className="font-mono">{order.filled_qty.toFixed(4)} ({fillPercent.toFixed(1)}%)</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">完了日時:</span>
                                    <span className="text-xs">{new Date(order.updated_at).toLocaleString('ja-JP')}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Trade;
