/**
 * 取引UIシミュレーション機能
 * P2優先度: 板/注文/履歴の擬似生成・保存
 */

export interface OrderBookLevel {
  price: number;
  amount: number;
  total: number;
}

export interface TradeRecord {
  time: string;
  price: number;
  volume: number;
  side: 'buy' | 'sell';
}

export interface SimulatedOrder {
  id: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'market';
  price: number;
  qty: number;
  filled_qty: number;
  status: 'pending' | 'partial' | 'filled' | 'cancelled';
  created_at: string;
  market: string;
  user_id?: string;
}

/**
 * 価格変動シミュレーション
 */
export class PriceSimulator {
  private currentPrice: number;
  private volatility: number;
  private trend: number;
  private lastUpdate: number;

  constructor(basePrice: number = 50000, volatility: number = 0.02, trend: number = 0) {
    this.currentPrice = basePrice;
    this.volatility = volatility;
    this.trend = trend;
    this.lastUpdate = Date.now();
  }

  /**
   * 次の価格を生成（ランダムウォーク）
   */
  getNextPrice(): number {
    const now = Date.now();
    const deltaTime = (now - this.lastUpdate) / 1000; // 秒
    this.lastUpdate = now;

    // ランダムウォーク + トレンド
    const random = (Math.random() - 0.5) * 2; // -1 to 1
    const change = this.trend * deltaTime + this.volatility * random * Math.sqrt(deltaTime);
    
    this.currentPrice *= (1 + change);
    
    // 価格の下限を設定
    this.currentPrice = Math.max(this.currentPrice, 1);
    
    return this.currentPrice;
  }

  getCurrentPrice(): number {
    return this.currentPrice;
  }

  setTrend(trend: number) {
    this.trend = trend;
  }
}

/**
 * 板情報シミュレーション
 */
export class OrderBookSimulator {
  private simulator: PriceSimulator;
  private spreadPercent: number;

  constructor(priceSimulator: PriceSimulator, spreadPercent: number = 0.001) {
    this.simulator = priceSimulator;
    this.spreadPercent = spreadPercent;
  }

  /**
   * 買い板と売り板を生成
   */
  generateOrderBook(levels: number = 10): { bids: OrderBookLevel[]; asks: OrderBookLevel[] } {
    const currentPrice = this.simulator.getCurrentPrice();
    const spread = currentPrice * this.spreadPercent;
    
    const bids: OrderBookLevel[] = [];
    const asks: OrderBookLevel[] = [];

    let runningBidTotal = 0;
    let runningAskTotal = 0;

    // 買い板生成（現在価格より下）
    for (let i = 0; i < levels; i++) {
      const priceOffset = spread * (i + 1) + (Math.random() * spread * 0.5);
      const price = currentPrice - priceOffset;
      const amount = Math.random() * 10 + 0.1; // 0.1 ~ 10.1
      runningBidTotal += amount;
      
      bids.push({
        price: Number(price.toFixed(2)),
        amount: Number(amount.toFixed(4)),
        total: Number(runningBidTotal.toFixed(4))
      });
    }

    // 売り板生成（現在価格より上）
    for (let i = 0; i < levels; i++) {
      const priceOffset = spread * (i + 1) + (Math.random() * spread * 0.5);
      const price = currentPrice + priceOffset;
      const amount = Math.random() * 10 + 0.1; // 0.1 ~ 10.1
      runningAskTotal += amount;
      
      asks.push({
        price: Number(price.toFixed(2)),
        amount: Number(amount.toFixed(4)),
        total: Number(runningAskTotal.toFixed(4))
      });
    }

    // 買い板は価格の高い順にソート
    bids.sort((a, b) => b.price - a.price);
    // 売り板は価格の安い順にソート
    asks.sort((a, b) => a.price - b.price);

    return { bids, asks };
  }
}

/**
 * 取引履歴シミュレーション
 */
export class TradeHistorySimulator {
  private simulator: PriceSimulator;
  private trades: TradeRecord[] = [];

  constructor(priceSimulator: PriceSimulator) {
    this.simulator = priceSimulator;
  }

  /**
   * 新しい取引を生成
   */
  generateTrade(): TradeRecord {
    const price = this.simulator.getNextPrice();
    const volume = Math.random() * 5 + 0.01; // 0.01 ~ 5.01
    const side = Math.random() > 0.5 ? 'buy' : 'sell';
    
    const trade: TradeRecord = {
      time: new Date().toLocaleTimeString(),
      price: Number(price.toFixed(2)),
      volume: Number(volume.toFixed(4)),
      side
    };

    this.trades.unshift(trade); // 新しい取引を先頭に追加
    
    // 履歴を200件に制限
    if (this.trades.length > 200) {
      this.trades = this.trades.slice(0, 200);
    }

    return trade;
  }

  /**
   * チャート用データを生成
   */
  generateChartData(points: number = 50): Array<{ time: string; price: number; volume: number }> {
    const chartData = [];
    const now = new Date();

    for (let i = points - 1; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 60000); // 1分間隔
      const price = this.simulator.getNextPrice();
      const volume = Math.random() * 100 + 10;
      
      chartData.push({
        time: time.toLocaleTimeString(),
        price: Number(price.toFixed(2)),
        volume: Number(volume.toFixed(2))
      });
    }

    return chartData;
  }

  getTrades(): TradeRecord[] {
    return [...this.trades];
  }
}

/**
 * 注文シミュレーション
 */
export class OrderSimulator {
  private orders: SimulatedOrder[] = [];
  private priceSimulator: PriceSimulator;

  constructor(priceSimulator: PriceSimulator) {
    this.priceSimulator = priceSimulator;
  }

  /**
   * 注文を作成
   */
  createOrder(
    side: 'buy' | 'sell',
    type: 'limit' | 'market',
    price: number,
    qty: number,
    market: string,
    userId?: string
  ): SimulatedOrder {
    const order: SimulatedOrder = {
      id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      side,
      type,
      price: type === 'market' ? this.priceSimulator.getCurrentPrice() : price,
      qty,
      filled_qty: 0,
      status: 'pending',
      created_at: new Date().toISOString(),
      market,
      user_id: userId
    };

    this.orders.unshift(order);
    
    // 成行注文は即座に約定
    if (type === 'market') {
      this.fillOrder(order.id, qty);
    } else {
      // 指値注文は一定確率で部分約定をシミュレート
      setTimeout(() => {
        if (Math.random() > 0.7) { // 30%の確率で約定
          const fillQty = Math.random() * qty;
          this.fillOrder(order.id, fillQty);
        }
      }, Math.random() * 5000 + 1000); // 1-6秒後
    }

    return order;
  }

  /**
   * 注文の約定処理
   */
  fillOrder(orderId: string, fillQty: number): boolean {
    const order = this.orders.find(o => o.id === orderId);
    if (!order || order.status === 'filled' || order.status === 'cancelled') {
      return false;
    }

    order.filled_qty = Math.min(order.filled_qty + fillQty, order.qty);
    
    if (order.filled_qty >= order.qty) {
      order.status = 'filled';
    } else if (order.filled_qty > 0) {
      order.status = 'partial';
    }

    return true;
  }

  /**
   * 注文をキャンセル
   */
  cancelOrder(orderId: string): boolean {
    const order = this.orders.find(o => o.id === orderId);
    if (!order || order.status === 'filled') {
      return false;
    }

    order.status = 'cancelled';
    return true;
  }

  /**
   * ユーザーの注文一覧を取得
   */
  getOrdersByUser(userId: string, market?: string): SimulatedOrder[] {
    return this.orders.filter(o => 
      o.user_id === userId && 
      (market ? o.market === market : true)
    );
  }

  /**
   * 全注文を取得
   */
  getAllOrders(): SimulatedOrder[] {
    return [...this.orders];
  }
}

/**
 * 統合取引シミュレーター
 */
export class TradingSimulator {
  public priceSimulator: PriceSimulator;
  public orderBookSimulator: OrderBookSimulator;
  public tradeHistorySimulator: TradeHistorySimulator;
  public orderSimulator: OrderSimulator;
  private intervals: NodeJS.Timeout[] = [];

  constructor(basePrice: number = 50000) {
    this.priceSimulator = new PriceSimulator(basePrice);
    this.orderBookSimulator = new OrderBookSimulator(this.priceSimulator);
    this.tradeHistorySimulator = new TradeHistorySimulator(this.priceSimulator);
    this.orderSimulator = new OrderSimulator(this.priceSimulator);
  }

  /**
   * シミュレーションを開始
   */
  start(callbacks: {
    onPriceUpdate?: (price: number) => void;
    onOrderBookUpdate?: (orderBook: { bids: OrderBookLevel[]; asks: OrderBookLevel[] }) => void;
    onNewTrade?: (trade: TradeRecord) => void;
    onOrderUpdate?: (orders: SimulatedOrder[]) => void;
  } = {}) {
    // 価格更新（1秒間隔）
    const priceInterval = setInterval(() => {
      const price = this.priceSimulator.getNextPrice();
      callbacks.onPriceUpdate?.(price);
    }, 1000);

    // 板情報更新（2秒間隔）
    const orderBookInterval = setInterval(() => {
      const orderBook = this.orderBookSimulator.generateOrderBook();
      callbacks.onOrderBookUpdate?.(orderBook);
    }, 2000);

    // 取引履歴更新（3-8秒間隔でランダム）
    const scheduleNextTrade = () => {
      const delay = Math.random() * 5000 + 3000; // 3-8秒
      setTimeout(() => {
        const trade = this.tradeHistorySimulator.generateTrade();
        callbacks.onNewTrade?.(trade);
        scheduleNextTrade();
      }, delay);
    };
    scheduleNextTrade();

    this.intervals.push(priceInterval, orderBookInterval);
  }

  /**
   * シミュレーションを停止
   */
  stop() {
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
  }

  /**
   * シミュレーションが実行中かどうかを確認
   */
  isRunning(): boolean {
    return this.intervals.length > 0;
  }
}