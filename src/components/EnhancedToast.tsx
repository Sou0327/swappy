import React, { createContext, useContext, useCallback, useState, useEffect } from 'react';
import { toast as sonnerToast, Toaster } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle,
  AlertTriangle,
  Info,
  X,
  RefreshCw,
  Copy,
  ExternalLink,
  Clock,
  Wifi,
  WifiOff,
  Download,
  Upload,
  Loader2
} from 'lucide-react';
import { type SupportedChain, type SupportedNetwork, type SupportedAsset } from '@/lib/multichain-wallet-utils';

// 拡張Toast通知の種類
export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading' | 'network' | 'transaction';

// Toast通知の優先度
export type ToastPriority = 'low' | 'normal' | 'high' | 'critical';

// アクション定義
export interface ToastAction {
  label: string;
  onClick: () => void | Promise<void>;
  variant?: 'default' | 'secondary' | 'outline' | 'destructive';
  icon?: React.ReactNode;
  loading?: boolean;
}

// 拡張Toast通知のオプション
export interface EnhancedToastOptions {
  title: string;
  description?: string;
  type?: ToastType;
  priority?: ToastPriority;
  duration?: number;
  persistent?: boolean;
  actions?: ToastAction[];
  context?: {
    chain?: SupportedChain;
    network?: SupportedNetwork;
    asset?: SupportedAsset;
    operation?: string;
    amount?: string;
    address?: string;
    txHash?: string;
    connectivity?: string;
    error?: string;
    confirmations?: number;
    required?: number;
    status?: string;
  };
  progress?: number;
  estimatedTime?: string;
  showTimestamp?: boolean;
  allowDismiss?: boolean;
  category?: string;
  metadata?: Record<string, unknown>;
}

// ネットワーク固有の通知オプション
export interface NetworkToastOptions extends Omit<EnhancedToastOptions, 'type'> {
  isOnline: boolean;
  connectionQuality?: 'excellent' | 'good' | 'poor';
  affectedFeatures?: string[];
}

// トランザクション固有の通知オプション
export interface TransactionToastOptions extends Omit<EnhancedToastOptions, 'type'> {
  status: 'pending' | 'confirmed' | 'failed';
  confirmations?: number;
  requiredConfirmations?: number;
  explorerUrl?: string;
}

// Toast管理のコンテキスト
interface EnhancedToastContextType {
  showToast: (options: EnhancedToastOptions) => string;
  showSuccess: (title: string, options?: Partial<EnhancedToastOptions>) => string;
  showError: (title: string, options?: Partial<EnhancedToastOptions>) => string;
  showWarning: (title: string, options?: Partial<EnhancedToastOptions>) => string;
  showInfo: (title: string, options?: Partial<EnhancedToastOptions>) => string;
  showLoading: (title: string, options?: Partial<EnhancedToastOptions>) => string;
  showNetworkStatus: (options: NetworkToastOptions) => string;
  showTransactionUpdate: (options: TransactionToastOptions) => string;
  updateToast: (id: string, options: Partial<EnhancedToastOptions>) => void;
  dismissToast: (id: string) => void;
  dismissAll: () => void;
  getActiveToasts: () => string[];
}

const EnhancedToastContext = createContext<EnhancedToastContextType | undefined>(undefined);

// プロバイダーコンポーネント
export const EnhancedToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeToasts, setActiveToasts] = useState<Set<string>>(new Set());

  const getToastIcon = (type: ToastType) => {
    switch (type) {
      case 'success': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'error': return <AlertTriangle className="h-4 w-4 text-red-600" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-amber-600" />;
      case 'info': return <Info className="h-4 w-4 text-blue-600" />;
      case 'loading': return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
      case 'network': return <Wifi className="h-4 w-4 text-gray-600" />;
      case 'transaction': return <Clock className="h-4 w-4 text-purple-600" />;
      default: return <Info className="h-4 w-4 text-gray-600" />;
    }
  };

  const getToastColor = (type: ToastType) => {
    switch (type) {
      case 'success': return 'border-l-green-500 bg-green-50';
      case 'error': return 'border-l-red-500 bg-red-50';
      case 'warning': return 'border-l-amber-500 bg-amber-50';
      case 'info': return 'border-l-blue-500 bg-blue-50';
      case 'loading': return 'border-l-blue-500 bg-blue-50';
      case 'network': return 'border-l-gray-500 bg-gray-50';
      case 'transaction': return 'border-l-purple-500 bg-purple-50';
      default: return 'border-l-gray-500 bg-gray-50';
    }
  };

  const getDurationByPriority = (priority: ToastPriority = 'normal'): number => {
    switch (priority) {
      case 'low': return 3000;
      case 'normal': return 5000;
      case 'high': return 8000;
      case 'critical': return 0; // 永続表示
      default: return 5000;
    }
  };

  const showToast = useCallback((options: EnhancedToastOptions): string => {
    const {
      title,
      description,
      type = 'info',
      priority = 'normal',
      duration,
      persistent = false,
      actions = [],
      context,
      progress,
      estimatedTime,
      showTimestamp = false,
      allowDismiss = true,
      category,
      metadata
    } = options;

    const toastDuration = persistent ? 0 : (duration ?? getDurationByPriority(priority));
    const toastId = Math.random().toString(36).substr(2, 9);

    // Toast内容をカスタムレンダリング
    const ToastContent = () => (
      <div className={`border-l-4 pl-4 py-2 ${getToastColor(type)}`}>
        <div className="flex items-start gap-3">
          {getToastIcon(type)}
          <div className="flex-1 space-y-2">
            {/* ヘッダー */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">{title}</h4>
                <div className="flex items-center gap-1">
                  {category && (
                    <Badge variant="outline" className="text-xs">
                      {category}
                    </Badge>
                  )}
                  {priority === 'critical' && (
                    <Badge variant="destructive" className="text-xs">
                      重要
                    </Badge>
                  )}
                  {estimatedTime && (
                    <Badge variant="secondary" className="text-xs">
                      <Clock className="h-3 w-3 mr-1" />
                      {estimatedTime}
                    </Badge>
                  )}
                </div>
              </div>
              {description && (
                <p className="text-sm text-muted-foreground">{description}</p>
              )}
            </div>

            {/* コンテキスト情報 */}
            {context && (
              <div className="space-y-1">
                {context.operation && (
                  <div className="text-xs text-muted-foreground">
                    操作: {context.operation}
                  </div>
                )}
                {context.chain && context.asset && (
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="text-xs">
                      {context.chain.toUpperCase()} {context.asset}
                    </Badge>
                    {context.network && context.network !== 'mainnet' && (
                      <Badge variant="secondary" className="text-xs">
                        {context.network}
                      </Badge>
                    )}
                  </div>
                )}
                {context.amount && (
                  <div className="text-xs text-muted-foreground">
                    金額: {context.amount} {context.asset || ''}
                  </div>
                )}
                {context.address && (
                  <div className="text-xs text-muted-foreground font-mono">
                    アドレス: {context.address.slice(0, 10)}...{context.address.slice(-6)}
                  </div>
                )}
                {context.txHash && (
                  <div className="text-xs text-muted-foreground font-mono">
                    TX: {context.txHash.slice(0, 10)}...{context.txHash.slice(-6)}
                  </div>
                )}
              </div>
            )}

            {/* プログレス表示 */}
            {progress !== undefined && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>進行度</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* アクションボタン */}
            {actions.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {actions.map((action, index) => (
                  <Button
                    key={index}
                    size="sm"
                    variant={action.variant || "outline"}
                    onClick={action.onClick}
                    disabled={action.loading}
                    className="text-xs h-7"
                  >
                    {action.loading && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    {action.icon && !action.loading && <span className="mr-1">{action.icon}</span>}
                    {action.label}
                  </Button>
                ))}
              </div>
            )}

            {/* タイムスタンプ */}
            {showTimestamp && (
              <div className="text-xs text-muted-foreground">
                {new Date().toLocaleTimeString()}
              </div>
            )}
          </div>

          {/* 閉じるボタン */}
          {allowDismiss && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => sonnerToast.dismiss(toastId)}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    );

    sonnerToast.custom(ToastContent, {
      id: toastId,
      duration: toastDuration,
      position: priority === 'critical' ? 'top-center' : 'bottom-right',
    });

    setActiveToasts(prev => new Set(prev).add(toastId));

    // Toast終了時にアクティブリストから削除
    if (toastDuration > 0) {
      setTimeout(() => {
        setActiveToasts(prev => {
          const next = new Set(prev);
          next.delete(toastId);
          return next;
        });
      }, toastDuration);
    }

    return toastId;
  }, []);

  const showSuccess = useCallback((title: string, options: Partial<EnhancedToastOptions> = {}) => {
    return showToast({ ...options, title, type: 'success' });
  }, [showToast]);

  const showError = useCallback((title: string, options: Partial<EnhancedToastOptions> = {}) => {
    return showToast({ ...options, title, type: 'error', priority: 'high' });
  }, [showToast]);

  const showWarning = useCallback((title: string, options: Partial<EnhancedToastOptions> = {}) => {
    return showToast({ ...options, title, type: 'warning', priority: 'normal' });
  }, [showToast]);

  const showInfo = useCallback((title: string, options: Partial<EnhancedToastOptions> = {}) => {
    return showToast({ ...options, title, type: 'info' });
  }, [showToast]);

  const showLoading = useCallback((title: string, options: Partial<EnhancedToastOptions> = {}) => {
    return showToast({ ...options, title, type: 'loading', persistent: true, allowDismiss: false });
  }, [showToast]);

  const showNetworkStatus = useCallback((options: NetworkToastOptions) => {
    const { isOnline, connectionQuality = 'good', affectedFeatures = [], ...restOptions } = options;

    const networkTitle = isOnline
      ? connectionQuality === 'poor'
        ? 'ネットワーク接続が不安定です'
        : 'ネットワーク接続が回復しました'
      : 'ネットワーク接続が失われました';

    const networkDescription = isOnline
      ? connectionQuality === 'poor'
        ? '接続が不安定です。一部機能が制限される場合があります。'
        : '正常に接続されました。'
      : 'オフライン状態です。接続を確認してください。';

    return showToast({
      ...restOptions,
      title: networkTitle,
      description: networkDescription,
      type: 'network',
      priority: isOnline ? 'normal' : 'high',
      context: {
        operation: 'ネットワーク監視',
        ...restOptions.context
      },
      actions: isOnline ? [] : [
        {
          label: '再接続',
          onClick: () => { window.location.reload(); },
          icon: <RefreshCw className="h-3 w-3" />
        }
      ]
    });
  }, [showToast]);

  const showTransactionUpdate = useCallback((options: TransactionToastOptions) => {
    const { status, confirmations = 0, requiredConfirmations = 1, explorerUrl, ...restOptions } = options;

    const statusTitle = {
      pending: 'トランザクション送信中',
      confirmed: 'トランザクション確認完了',
      failed: 'トランザクション失敗'
    }[status];

    const statusDescription = {
      pending: 'ブロックチェーンでの確認を待機中です',
      confirmed: '必要な確認数に達しました',
      failed: 'トランザクションが失敗しました'
    }[status];

    const actions: ToastAction[] = [];
    if (explorerUrl) {
      actions.push({
        label: 'エクスプローラーで確認',
        onClick: () => { window.open(explorerUrl, '_blank', 'noopener,noreferrer'); },
        icon: <ExternalLink className="h-3 w-3" />
      });
    }

    return showToast({
      ...restOptions,
      title: statusTitle,
      description: statusDescription,
      type: 'transaction',
      priority: status === 'failed' ? 'high' : 'normal',
      progress: status === 'pending' ? (confirmations / requiredConfirmations) * 100 : undefined,
      actions,
      context: {
        operation: 'トランザクション監視',
        ...restOptions.context
      }
    });
  }, [showToast]);

  const updateToast = useCallback((id: string, options: Partial<EnhancedToastOptions>) => {
    // Sonnerでの動的更新は制限されているため、新しいToastとして表示
    dismissToast(id);
    showToast(options as EnhancedToastOptions);
  }, [showToast]);

  const dismissToast = useCallback((id: string) => {
    sonnerToast.dismiss(id);
    setActiveToasts(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const dismissAll = useCallback(() => {
    sonnerToast.dismiss();
    setActiveToasts(new Set());
  }, []);

  const getActiveToasts = useCallback(() => {
    return Array.from(activeToasts);
  }, [activeToasts]);

  const value: EnhancedToastContextType = {
    showToast,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showLoading,
    showNetworkStatus,
    showTransactionUpdate,
    updateToast,
    dismissToast,
    dismissAll,
    getActiveToasts
  };

  return (
    <EnhancedToastContext.Provider value={value}>
      {children}
      <Toaster
        position="bottom-right"
        expand
        richColors={false}
        closeButton={false}
        toastOptions={{
          className: 'border-0 p-0 bg-transparent shadow-lg',
          style: {
            background: 'transparent',
            border: 'none',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
          }
        }}
      />
    </EnhancedToastContext.Provider>
  );
};

// フック
export const useEnhancedToast = (): EnhancedToastContextType => {
  const context = useContext(EnhancedToastContext);
  if (!context) {
    throw new Error('useEnhancedToast must be used within an EnhancedToastProvider');
  }
  return context;
};

// ユーティリティ関数
export const createAddressCopyAction = (address: string): ToastAction => ({
  label: 'アドレスをコピー',
  onClick: () => navigator.clipboard.writeText(address),
  icon: <Copy className="h-3 w-3" />
});

export const createRetryAction = (retryFn: () => void | Promise<void>): ToastAction => ({
  label: '再試行',
  onClick: retryFn,
  icon: <RefreshCw className="h-3 w-3" />
});

export const createSupportAction = (): ToastAction => ({
  label: 'サポートに連絡',
  onClick: () => {
    // サポートページまたはメール作成機能を実装
    window.open('mailto:support@example.com', '_blank', 'noopener,noreferrer');
  },
  icon: <ExternalLink className="h-3 w-3" />
});

export default {
  EnhancedToastProvider,
  useEnhancedToast,
  createAddressCopyAction,
  createRetryAction,
  createSupportAction
};