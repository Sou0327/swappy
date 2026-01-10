import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';

// 入金関連の型定義
type DepositRow = Database['public']['Tables']['deposits']['Row'];
type DepositPayload = RealtimePostgresChangesPayload<DepositRow>;

// イベントタイプ定義
export type DepositEvent = 'INSERT' | 'UPDATE' | 'DELETE';
export type DepositEventData = {
  event: DepositEvent;
  old_record?: DepositRow;
  new_record?: DepositRow;
  timestamp: Date;
  userId: string;
};

// イベントコールバック定義
export interface DepositEventCallbacks {
  onNewDeposit?: (data: DepositEventData) => void;
  onDepositUpdate?: (data: DepositEventData) => void;
  onStatusChange?: (data: DepositEventData & { oldStatus?: string; newStatus: string }) => void;
  onConfirmationUpdate?: (data: DepositEventData & { oldConfirmations?: number; newConfirmations: number }) => void;
  onError?: (error: Error) => void;
  onConnectionChange?: (connected: boolean, quality: 'good' | 'poor' | 'disconnected') => void;
}

// 接続状態管理
export interface ConnectionState {
  isConnected: boolean;
  quality: 'good' | 'poor' | 'disconnected';
  lastUpdate: Date | null;
  reconnectionAttempts: number;
  maxReconnectionAttempts: number;
}

// Real-time入金監視クライアント
// イベントハンドラー型定義
type EventHandler = (...args: unknown[]) => void;

export class RealtimeDepositClient {
  private subscription: RealtimeChannel | null = null;
  private eventHandlers: Map<string, EventHandler[]> = new Map();
  private connectionState: ConnectionState;
  private userId: string;
  private reconnectionTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isDestroyed: boolean = false;

  constructor(userId: string) {
    this.userId = userId;
    this.connectionState = {
      isConnected: false,
      quality: 'disconnected',
      lastUpdate: null,
      reconnectionAttempts: 0,
      maxReconnectionAttempts: 5
    };

    // イベントハンドラーマップ初期化
    this.eventHandlers.set('newDeposit', []);
    this.eventHandlers.set('depositUpdate', []);
    this.eventHandlers.set('statusChange', []);
    this.eventHandlers.set('confirmationUpdate', []);
    this.eventHandlers.set('error', []);
    this.eventHandlers.set('connectionChange', []);
  }

  /**
   * Real-time監視を開始
   */
  async subscribe(callbacks: DepositEventCallbacks): Promise<void> {
    if (this.isDestroyed) {
      throw new Error('RealtimeDepositClient has been destroyed');
    }

    try {
      // コールバック登録
      this.registerCallbacks(callbacks);

      // 既存のサブスクリプション解除
      if (this.subscription) {
        await this.unsubscribe();
      }

      // 新しいチャンネル作成
      this.subscription = supabase
        .channel(`deposits:user_id=eq.${this.userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'deposits',
            filter: `user_id=eq.${this.userId}`
          },
          (payload: DepositPayload) => this.handleDepositEvent(payload)
        )
        .subscribe((status) => {
          this.handleSubscriptionStatus(status);
        });

      // ハートビート開始
      this.startHeartbeat();

    } catch (error) {
      console.error('Failed to subscribe to real-time deposits:', error);
      this.emitError(new Error(`Subscription failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }

  /**
   * Real-time監視を停止
   */
  async unsubscribe(): Promise<void> {
    try {
      if (this.subscription) {
        await supabase.removeChannel(this.subscription);
        this.subscription = null;
      }

      this.stopHeartbeat();
      this.clearReconnectionTimeout();

      this.connectionState.isConnected = false;
      this.connectionState.quality = 'disconnected';
      this.emitConnectionChange();

    } catch (error) {
      console.error('Failed to unsubscribe from real-time deposits:', error);
      this.emitError(new Error(`Unsubscription failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }

  /**
   * クライアントを破棄（メモリリーク防止）
   */
  async destroy(): Promise<void> {
    this.isDestroyed = true;
    await this.unsubscribe();
    this.eventHandlers.clear();
  }

  /**
   * 手動再接続
   */
  async retryConnection(): Promise<void> {
    if (this.isDestroyed) return;

    this.connectionState.reconnectionAttempts = 0; // リセット
    await this.attemptReconnection();
  }

  /**
   * 接続状態取得
   */
  getConnectionState(): ConnectionState {
    return { ...this.connectionState };
  }

  /**
   * コールバック登録
   */
  private registerCallbacks(callbacks: DepositEventCallbacks): void {
    if (callbacks.onNewDeposit) {
      this.eventHandlers.get('newDeposit')?.push(callbacks.onNewDeposit);
    }
    if (callbacks.onDepositUpdate) {
      this.eventHandlers.get('depositUpdate')?.push(callbacks.onDepositUpdate);
    }
    if (callbacks.onStatusChange) {
      this.eventHandlers.get('statusChange')?.push(callbacks.onStatusChange);
    }
    if (callbacks.onConfirmationUpdate) {
      this.eventHandlers.get('confirmationUpdate')?.push(callbacks.onConfirmationUpdate);
    }
    if (callbacks.onError) {
      this.eventHandlers.get('error')?.push(callbacks.onError);
    }
    if (callbacks.onConnectionChange) {
      this.eventHandlers.get('connectionChange')?.push(callbacks.onConnectionChange);
    }
  }

  /**
   * 入金イベント処理
   */
  private handleDepositEvent(payload: DepositPayload): void {
    try {
      const eventData: DepositEventData = {
        event: payload.eventType as DepositEvent,
        old_record: payload.old as DepositRow | undefined,
        new_record: payload.new as DepositRow | undefined,
        timestamp: new Date(),
        userId: this.userId
      };

      // 接続品質更新
      this.updateConnectionQuality('good');

      // イベント種別に応じた処理
      switch (payload.eventType) {
        case 'INSERT':
          this.handleNewDeposit(eventData);
          break;
        case 'UPDATE':
          this.handleDepositUpdate(eventData);
          break;
        case 'DELETE':
          // DELETE処理（必要に応じて実装）
          break;
      }

    } catch (error) {
      console.error('Failed to handle deposit event:', error);
      this.emitError(new Error(`Event handling failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }

  /**
   * 新規入金処理
   */
  private handleNewDeposit(eventData: DepositEventData): void {
    this.emitEvent('newDeposit', eventData);
    this.emitEvent('depositUpdate', eventData);
  }

  /**
   * 入金更新処理
   */
  private handleDepositUpdate(eventData: DepositEventData): void {
    const oldRecord = eventData.old_record;
    const newRecord = eventData.new_record;

    if (!oldRecord || !newRecord) {
      console.warn('Invalid deposit update: missing old or new record');
      return;
    }

    // ステータス変更検知
    if (oldRecord.status !== newRecord.status) {
      const statusChangeData = {
        ...eventData,
        oldStatus: oldRecord.status,
        newStatus: newRecord.status
      };
      this.emitEvent('statusChange', statusChangeData);
    }

    // 確認数変更検知
    if (oldRecord.confirmations_observed !== newRecord.confirmations_observed) {
      const confirmationData = {
        ...eventData,
        oldConfirmations: oldRecord.confirmations_observed || 0,
        newConfirmations: newRecord.confirmations_observed || 0
      };
      this.emitEvent('confirmationUpdate', confirmationData);
    }

    // 汎用更新イベント
    this.emitEvent('depositUpdate', eventData);
  }

  /**
   * サブスクリプション状態処理
   */
  private handleSubscriptionStatus(status: string): void {
    switch (status) {
      case 'SUBSCRIBED':
        this.connectionState.isConnected = true;
        this.connectionState.quality = 'good';
        this.connectionState.reconnectionAttempts = 0;
        this.connectionState.lastUpdate = new Date();
        this.emitConnectionChange();
        break;

      case 'CHANNEL_ERROR':
      case 'TIMED_OUT':
      case 'CLOSED':
        this.connectionState.isConnected = false;
        this.connectionState.quality = 'disconnected';
        this.emitConnectionChange();
        this.scheduleReconnection();
        break;

      default:
        console.warn(`Unknown subscription status: ${status}`);
    }
  }

  /**
   * 再接続スケジュール
   */
  private scheduleReconnection(): void {
    if (this.isDestroyed || this.connectionState.reconnectionAttempts >= this.connectionState.maxReconnectionAttempts) {
      console.warn('🚫 Max reconnection attempts reached or client destroyed');
      return;
    }

    this.clearReconnectionTimeout();

    // 指数バックオフ（1秒、2秒、4秒、8秒、16秒）
    const delay = Math.min(1000 * Math.pow(2, this.connectionState.reconnectionAttempts), 16000);

    this.reconnectionTimeout = setTimeout(() => {
      this.attemptReconnection();
    }, delay);
  }

  /**
   * 再接続試行
   */
  private async attemptReconnection(): Promise<void> {
    if (this.isDestroyed) return;

    this.connectionState.reconnectionAttempts++;

    try {
      // 現在のサブスクリプションを再初期化
      if (this.subscription) {
        await supabase.removeChannel(this.subscription);
      }

      // 新しいサブスクリプション作成（コールバックは既に登録済み）
      await this.subscribe({});

    } catch (error) {
      console.error('Reconnection failed:', error);
      this.emitError(new Error(`Reconnection failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      this.scheduleReconnection();
    }
  }

  /**
   * 接続品質更新
   */
  private updateConnectionQuality(quality: 'good' | 'poor' | 'disconnected'): void {
    if (this.connectionState.quality !== quality) {
      this.connectionState.quality = quality;
      this.connectionState.lastUpdate = new Date();
      this.emitConnectionChange();
    }
  }

  /**
   * ハートビート開始
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      if (!this.connectionState.isConnected) return;

      const now = new Date();
      const lastUpdate = this.connectionState.lastUpdate;

      if (lastUpdate && (now.getTime() - lastUpdate.getTime()) > 30000) {
        // 30秒間更新がない場合は接続品質を下げる
        this.updateConnectionQuality('poor');
      }
    }, 10000); // 10秒間隔でチェック
  }

  /**
   * ハートビート停止
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * 再接続タイムアウト解除
   */
  private clearReconnectionTimeout(): void {
    if (this.reconnectionTimeout) {
      clearTimeout(this.reconnectionTimeout);
      this.reconnectionTimeout = null;
    }
  }

  /**
   * イベント発火
   */
  private emitEvent(eventType: string, ...args: unknown[]): void {
    const handlers = this.eventHandlers.get(eventType) || [];
    handlers.forEach(handler => {
      try {
        handler(...args);
      } catch (error) {
        console.error(`Error in ${eventType} handler:`, error);
      }
    });
  }

  /**
   * エラー発火
   */
  private emitError(error: Error): void {
    this.emitEvent('error', error);
  }

  /**
   * 接続変更発火
   */
  private emitConnectionChange(): void {
    this.emitEvent('connectionChange', this.connectionState.isConnected, this.connectionState.quality);
  }
}

// シングルトンインスタンス管理
const clientInstances = new Map<string, RealtimeDepositClient>();

/**
 * ユーザーごとのRealtimeDepositClientインスタンス取得
 */
export function getRealtimeDepositClient(userId: string): RealtimeDepositClient {
  if (!clientInstances.has(userId)) {
    clientInstances.set(userId, new RealtimeDepositClient(userId));
  }
  return clientInstances.get(userId)!;
}

/**
 * クライアントインスタンス破棄
 */
export async function destroyRealtimeDepositClient(userId: string): Promise<void> {
  const client = clientInstances.get(userId);
  if (client) {
    await client.destroy();
    clientInstances.delete(userId);
  }
}

/**
 * 全クライアント破棄（アプリ終了時等）
 */
export async function destroyAllRealtimeDepositClients(): Promise<void> {
  const destroyPromises = Array.from(clientInstances.entries()).map(async ([userId, client]) => {
    await client.destroy();
  });
  await Promise.all(destroyPromises);
  clientInstances.clear();
}