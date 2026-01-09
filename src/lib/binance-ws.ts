type DepthLevel = { price: number; amount: number };

export interface BinanceWSHandlers {
  onDepth?: (bids: DepthLevel[], asks: DepthLevel[]) => void;
  onTrade?: (trade: { time: string; price: number; volume: number }) => void;
  onError?: (e: unknown) => void;
  onStatus?: (s: 'connecting' | 'open' | 'closed' | 'reconnecting') => void;
}

export class BinanceWSClient {
  private ws: WebSocket | null = null;
  private symbol: string;
  private handlers: BinanceWSHandlers;
  private reconnectTimer: number | null = null;
  private closedByUser = false;

  constructor(symbol: string, handlers: BinanceWSHandlers) {
    this.symbol = symbol.toLowerCase();
    this.handlers = handlers;
  }

  private buildUrl(): string {
    const streams = [
      `${this.symbol}@depth20@100ms`,
      `${this.symbol}@trade`
    ].join('/');
    return `wss://stream.binance.com:9443/stream?streams=${streams}`;
  }

  connect() {
    try {
      this.handlers.onStatus?.('connecting');
      const url = this.buildUrl();
      this.ws = new WebSocket(url);
      this.ws.onopen = () => this.handlers.onStatus?.('open');
      this.ws.onmessage = (ev) => this.handleMessage(ev);
      this.ws.onerror = (ev) => this.handlers.onError?.(ev);
      this.ws.onclose = () => {
        this.handlers.onStatus?.('closed');
        if (!this.closedByUser) this.scheduleReconnect();
      };
    } catch (e) {
      this.handlers.onError?.(e);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.handlers.onStatus?.('reconnecting');
    const delay = 3000;
    this.reconnectTimer = window.setTimeout(() => {
      if (this.reconnectTimer) {
        window.clearTimeout(this.reconnectTimer);
      }
      this.reconnectTimer = null;
      if (!this.closedByUser) this.connect();
    }, delay) as unknown as number;
  }

  private handleMessage(ev: MessageEvent) {
    try {
      const msg = JSON.parse(ev.data);
      const stream: string | undefined = msg.stream;
      const data = msg.data;
      if (!stream || !data) return;

      if (stream.endsWith('@depth20@100ms')) {
        // Partial depth snapshot
        const bids: DepthLevel[] = (data.bids || []).map((r: [string, string]) => ({ price: Number(r[0]), amount: Number(r[1]) }));
        const asks: DepthLevel[] = (data.asks || []).map((r: [string, string]) => ({ price: Number(r[0]), amount: Number(r[1]) }));
        this.handlers.onDepth?.(bids, asks);
        return;
      }
      if (stream.endsWith('@trade')) {
        // Trade tick
        const price = Number(data.p);
        const volume = Number(data.q);
        const time = new Date(data.T).toLocaleTimeString();
        if (Number.isFinite(price) && Number.isFinite(volume)) {
          this.handlers.onTrade?.({ time, price, volume });
        }
        return;
      }
    } catch (e) {
      this.handlers.onError?.(e);
    }
  }

  updateSymbol(symbol: string) {
    this.symbol = symbol.toLowerCase();
    this.reconnect();
  }

  reconnect() {
    this.close();
    this.closedByUser = false;
    this.connect();
  }

  close() {
    this.closedByUser = true;
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch { /* noop */ }
      this.ws = null;
    }
  }
}

