/**
 * Binance WebSocketクライアント（Deno/Edge Function用）
 *
 * リアルタイムで価格情報を監視するためのWebSocketクライアント。
 * 自動再接続、指数バックオフ、エラーハンドリングを実装。
 *
 * 注意: このファイルはDeno/Edge Function環境用です。
 * ブラウザ環境用は src/lib/binance-ws.ts を使用してください。
 */

/**
 * WebSocket接続設定
 */
export interface WebSocketConfig {
  /** 最大再接続試行回数 */
  maxReconnectAttempts: number;
  /** 初回再接続遅延（ミリ秒） */
  initialReconnectDelayMs: number;
  /** 最大再接続遅延（ミリ秒） */
  maxReconnectDelayMs: number;
  /** WebSocket接続タイムアウト（ミリ秒） */
  connectionTimeoutMs: number;
  /** Ping/Pongタイムアウト（ミリ秒） */
  pingTimeoutMs: number;
}

/**
 * デフォルトのWebSocket設定
 */
export const DEFAULT_WEBSOCKET_CONFIG: WebSocketConfig = {
  maxReconnectAttempts: 5,
  initialReconnectDelayMs: 1000,
  maxReconnectDelayMs: 30000,
  connectionTimeoutMs: 10000,
  pingTimeoutMs: 60000,
};

/**
 * 価格更新イベント
 */
export interface PriceUpdateEvent {
  symbol: string;
  price: number;
  timestamp: number;
}

/**
 * WebSocketから単一の価格を取得（短期接続・Edge Function用）
 *
 * Edge Function用の短期接続WebSocket。価格を取得したら即座に接続を閉じます。
 * タイムアウトやエラーの場合はrejectされるため、呼び出し側でRESTフォールバックを実装してください。
 *
 * 利用シーン：
 * - Edge Functionの25秒実行制限内での価格取得
 * - 一度だけ価格を取得したい場合
 * - WebSocket優先、REST APIフォールバックのハイブリッド監視
 *
 * @param symbol - Binanceシンボル（例: BTCUSDT）
 * @param timeoutMs - タイムアウト時間（ミリ秒、デフォルト: 5000ms）
 * @returns 現在価格
 *
 * @example
 * // WebSocket優先、失敗時はRESTフォールバック
 * let price: number;
 * try {
 *   price = await fetchPriceViaWebSocket('BTCUSDT', 5000);
 *   console.log('✅ Price from WebSocket:', price);
 * } catch (error) {
 *   console.warn('⚠️ WebSocket failed, fallback to REST:', error);
 *   price = await fetchTickerPrice('BTCUSDT');
 * }
 */
export async function fetchPriceViaWebSocket(
  symbol: string,
  timeoutMs: number = 5000
): Promise<number> {
  return new Promise((resolve, reject) => {
    const wsUrl = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@miniTicker`;
    let ws: WebSocket | null = null;
    let timeoutId: number | null = null;
    let resolved = false;

    // クリーンアップヘルパー
    const cleanup = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (ws) {
        try {
          ws.close();
        } catch (e) {
          // close中のエラーは無視
        }
        ws = null;
      }
    };

    try {
      // WebSocket接続
      ws = new WebSocket(wsUrl);

      // タイムアウト設定
      timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(new Error(`WebSocket timeout after ${timeoutMs}ms for ${symbol}`));
        }
      }, timeoutMs) as unknown as number;

      // 接続成功
      ws.onopen = () => {
        console.log(`[WS Short] Connected to ${symbol}`);
      };

      // メッセージ受信
      ws.onmessage = (event: MessageEvent) => {
        if (resolved) return;

        try {
          const data = JSON.parse(event.data as string);

          // miniTickerイベントから価格を取得
          if (data.e === '24hrMiniTicker' && data.c) {
            const price = parseFloat(data.c);

            if (!Number.isFinite(price) || price <= 0) {
              resolved = true;
              cleanup();
              reject(new Error(`Invalid price received: ${data.c} for ${symbol}`));
              return;
            }

            // 価格取得成功
            console.log(`[WS Short] Price received for ${symbol}: ${price}`);
            resolved = true;
            cleanup();
            resolve(price);
          }
        } catch (error) {
          if (!resolved) {
            resolved = true;
            cleanup();
            reject(
              error instanceof Error
                ? error
                : new Error(`Failed to parse WebSocket message for ${symbol}`)
            );
          }
        }
      };

      // エラー処理
      ws.onerror = (error: Event) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(new Error(`WebSocket error for ${symbol}: ${error}`));
        }
      };

      // 接続クローズ（エラー以外）
      ws.onclose = (event: CloseEvent) => {
        if (!resolved) {
          // 正常終了以外はエラー扱い
          if (!event.wasClean && event.code !== 1000) {
            resolved = true;
            cleanup();
            reject(
              new Error(
                `WebSocket closed unexpectedly for ${symbol}: ${event.code} ${event.reason}`
              )
            );
          }
        }
      };
    } catch (error) {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(
          error instanceof Error
            ? error
            : new Error(`Failed to create WebSocket for ${symbol}`)
        );
      }
    }
  });
}

/**
 * WebSocket状態
 */
export type WebSocketState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'failed';

/**
 * WebSocketイベントハンドラー
 */
export interface WebSocketHandlers {
  onPriceUpdate?: (event: PriceUpdateEvent) => void;
  onStateChange?: (state: WebSocketState) => void;
  onError?: (error: Error) => void;
}

/**
 * Binance miniTicker ストリームのレスポンス型
 */
interface MiniTickerData {
  e: string; // イベントタイプ
  E: number; // イベント時刻
  s: string; // シンボル
  c: string; // 現在価格
  o: string; // 始値
  h: string; // 高値
  l: string; // 安値
  v: string; // 取引量
  q: string; // クォート取引量
}

/**
 * 指数バックオフ遅延を計算
 */
function calculateBackoffDelay(
  attempt: number,
  config: WebSocketConfig
): number {
  const delay = config.initialReconnectDelayMs * Math.pow(2, attempt);
  return Math.min(delay, config.maxReconnectDelayMs);
}

/**
 * 単一シンボル用のBinance WebSocketクライアント
 */
export class BinanceWebSocketClient {
  private ws: WebSocket | null = null;
  private symbol: string;
  private handlers: WebSocketHandlers;
  private config: WebSocketConfig;
  private reconnectAttempt = 0;
  private reconnectTimer: number | null = null;
  private state: WebSocketState = 'disconnected';
  private manualClose = false;
  private pingTimer: number | null = null;
  private lastPongTime = 0;

  constructor(
    symbol: string,
    handlers: WebSocketHandlers,
    config: WebSocketConfig = DEFAULT_WEBSOCKET_CONFIG
  ) {
    this.symbol = symbol.toLowerCase();
    this.handlers = handlers;
    this.config = config;
  }

  /**
   * WebSocket接続を開始
   */
  async connect(): Promise<void> {
    if (this.ws && this.state === 'connected') {
      return; // 既に接続済み
    }

    this.manualClose = false;
    this.updateState('connecting');

    try {
      const url = this.buildWebSocketUrl();
      this.ws = new WebSocket(url);

      // 接続タイムアウトの設定
      const connectionTimeout = setTimeout(() => {
        if (this.state === 'connecting') {
          this.handleError(new Error('Connection timeout'));
          this.ws?.close();
        }
      }, this.config.connectionTimeoutMs);

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout);
        this.reconnectAttempt = 0;
        this.updateState('connected');
        this.startPingTimer();
        console.log(`[Binance WS] Connected to ${this.symbol}`);
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event);
      };

      this.ws.onerror = (error) => {
        clearTimeout(connectionTimeout);
        this.handleError(
          error instanceof Error ? error : new Error('WebSocket error')
        );
      };

      this.ws.onclose = () => {
        clearTimeout(connectionTimeout);
        this.stopPingTimer();
        console.log(`[Binance WS] Disconnected from ${this.symbol}`);

        if (!this.manualClose) {
          this.scheduleReconnect();
        } else {
          this.updateState('disconnected');
        }
      };
    } catch (error) {
      this.handleError(
        error instanceof Error ? error : new Error('Failed to create WebSocket')
      );
      this.scheduleReconnect();
    }
  }

  /**
   * WebSocket URLを構築
   */
  private buildWebSocketUrl(): string {
    // miniTicker ストリームを使用（最も軽量）
    const stream = `${this.symbol}@miniTicker`;
    return `wss://stream.binance.com:9443/ws/${stream}`;
  }

  /**
   * メッセージを処理
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const data: MiniTickerData = JSON.parse(event.data);

      if (data.e === '24hrMiniTicker') {
        const price = parseFloat(data.c);

        if (!Number.isFinite(price) || price <= 0) {
          console.warn(`[Binance WS] Invalid price received: ${data.c}`);
          return;
        }

        this.handlers.onPriceUpdate?.({
          symbol: data.s,
          price,
          timestamp: data.E,
        });

        // Pongタイムスタンプを更新
        this.lastPongTime = Date.now();
      }
    } catch (error) {
      this.handleError(
        error instanceof Error ? error : new Error('Failed to parse message')
      );
    }
  }

  /**
   * Pingタイマーを開始（接続監視）
   */
  private startPingTimer(): void {
    this.lastPongTime = Date.now();

    this.pingTimer = setInterval(() => {
      const now = Date.now();
      const timeSinceLastPong = now - this.lastPongTime;

      if (timeSinceLastPong > this.config.pingTimeoutMs) {
        console.warn(
          `[Binance WS] No data received for ${timeSinceLastPong}ms. Reconnecting...`
        );
        this.reconnect();
      }
    }, this.config.pingTimeoutMs / 2) as unknown as number;
  }

  /**
   * Pingタイマーを停止
   */
  private stopPingTimer(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * 再接続をスケジュール
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.manualClose) {
      return;
    }

    if (this.reconnectAttempt >= this.config.maxReconnectAttempts) {
      console.error(
        `[Binance WS] Max reconnect attempts (${this.config.maxReconnectAttempts}) reached for ${this.symbol}`
      );
      this.updateState('failed');
      return;
    }

    this.updateState('reconnecting');
    const delay = calculateBackoffDelay(this.reconnectAttempt, this.config);

    console.log(
      `[Binance WS] Reconnecting ${this.symbol} in ${delay}ms (attempt ${
        this.reconnectAttempt + 1
      }/${this.config.maxReconnectAttempts})`
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempt++;
      this.connect();
    }, delay) as unknown as number;
  }

  /**
   * 手動で再接続
   */
  reconnect(): void {
    this.close();
    this.reconnectAttempt = 0;
    this.manualClose = false;
    this.connect();
  }

  /**
   * WebSocket接続を閉じる
   */
  close(): void {
    this.manualClose = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopPingTimer();

    if (this.ws) {
      try {
        this.ws.close();
      } catch (error) {
        console.warn('[Binance WS] Error during close:', error);
      }
      this.ws = null;
    }

    this.updateState('disconnected');
  }

  /**
   * 状態を更新
   */
  private updateState(state: WebSocketState): void {
    this.state = state;
    this.handlers.onStateChange?.(state);
  }

  /**
   * エラーを処理
   */
  private handleError(error: Error): void {
    console.error(`[Binance WS] Error for ${this.symbol}:`, error.message);
    this.handlers.onError?.(error);
  }

  /**
   * 現在の状態を取得
   */
  getState(): WebSocketState {
    return this.state;
  }

  /**
   * シンボルを取得
   */
  getSymbol(): string {
    return this.symbol;
  }
}

/**
 * 複数シンボルを並列監視するマネージャー
 */
export class MultiSymbolWebSocketMonitor {
  private clients = new Map<string, BinanceWebSocketClient>();
  private handlers: WebSocketHandlers;
  private config: WebSocketConfig;

  constructor(
    handlers: WebSocketHandlers,
    config: WebSocketConfig = DEFAULT_WEBSOCKET_CONFIG
  ) {
    this.handlers = handlers;
    this.config = config;
  }

  /**
   * シンボルの監視を開始
   */
  async addSymbol(symbol: string): Promise<void> {
    const normalizedSymbol = symbol.toLowerCase();

    if (this.clients.has(normalizedSymbol)) {
      console.warn(`[Multi WS] Symbol ${symbol} is already being monitored`);
      return;
    }

    const client = new BinanceWebSocketClient(
      normalizedSymbol,
      this.handlers,
      this.config
    );

    this.clients.set(normalizedSymbol, client);
    await client.connect();
  }

  /**
   * 複数シンボルの監視を開始
   */
  async addSymbols(symbols: string[]): Promise<void> {
    await Promise.allSettled(symbols.map((symbol) => this.addSymbol(symbol)));
  }

  /**
   * シンボルの監視を停止
   */
  removeSymbol(symbol: string): void {
    const normalizedSymbol = symbol.toLowerCase();
    const client = this.clients.get(normalizedSymbol);

    if (client) {
      client.close();
      this.clients.delete(normalizedSymbol);
      console.log(`[Multi WS] Stopped monitoring ${symbol}`);
    }
  }

  /**
   * すべてのシンボルの監視を停止
   */
  removeAllSymbols(): void {
    for (const [symbol, client] of this.clients.entries()) {
      client.close();
      console.log(`[Multi WS] Stopped monitoring ${symbol}`);
    }
    this.clients.clear();
  }

  /**
   * 監視中のシンボル一覧を取得
   */
  getMonitoredSymbols(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * 特定シンボルの状態を取得
   */
  getSymbolState(symbol: string): WebSocketState | null {
    const client = this.clients.get(symbol.toLowerCase());
    return client ? client.getState() : null;
  }

  /**
   * すべてのクライアントの状態を取得
   */
  getAllStates(): Map<string, WebSocketState> {
    const states = new Map<string, WebSocketState>();
    for (const [symbol, client] of this.clients.entries()) {
      states.set(symbol, client.getState());
    }
    return states;
  }

  /**
   * すべての接続を閉じる
   */
  closeAll(): void {
    this.removeAllSymbols();
  }
}
