import React, { useState, useCallback } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertTriangle,
  RefreshCw,
  MessageCircle,
  ChevronDown,
  CheckCircle,
  Wifi,
  WifiOff,
  Clock,
  ShieldAlert,
  HelpCircle,
  ExternalLink,
  Copy
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { type SupportedChain, type SupportedNetwork, type SupportedAsset } from '@/lib/multichain-wallet-utils';

// エラーカテゴリの定義
export type ErrorCategory =
  | 'network'
  | 'address_generation'
  | 'subscription'
  | 'tatum_api'
  | 'database'
  | 'validation'
  | 'auth'
  | 'chain_config'
  | 'unknown';

// エラー重要度レベル
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

// エラー回復アクション
export interface RecoveryAction {
  label: string;
  action: () => void | Promise<void>;
  isPrimary?: boolean;
  isDestructive?: boolean;
}

// 拡張エラー情報
export interface EnhancedError {
  message: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  userMessage: string;
  details?: string;
  technicalInfo?: unknown;
  recoveryActions?: RecoveryAction[];
  helpUrl?: string;
  estimatedFixTime?: string;
  affectedFeatures?: string[];
  context?: {
    chain?: SupportedChain;
    network?: SupportedNetwork;
    asset?: SupportedAsset;
    operation?: string;
  };
}

// ネットワーク状態
interface NetworkStatus {
  isOnline: boolean;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'offline';
  lastChecked: Date;
}

// エラー分析・分類ヘルパー
export const analyzeError = (
  error: unknown,
  context?: Partial<EnhancedError['context']>
): EnhancedError => {
  const errorMessage = error?.message || error?.toString() || '不明なエラーが発生しました';
  const errorCode = error?.code || error?.status;

  // ネットワークエラーの判定
  if (error?.name === 'NetworkError' || errorMessage.includes('fetch') || errorMessage.includes('network')) {
    return {
      message: errorMessage,
      category: 'network',
      severity: 'high',
      userMessage: 'ネットワーク接続に問題があります',
      details: 'インターネット接続を確認してください。',
      estimatedFixTime: '1-3分',
      affectedFeatures: ['アドレス生成', '入金監視', '残高更新'],
      context
    };
  }

  // Supabaseエラーの判定
  if (error?.message?.includes('Failed to fetch') || errorCode >= 500) {
    return {
      message: errorMessage,
      category: 'database',
      severity: 'high',
      userMessage: 'サーバーとの通信に失敗しました',
      details: 'サービスが一時的に利用できない状態です。しばらく待ってから再試行してください。',
      estimatedFixTime: '5-10分',
      affectedFeatures: ['データベース操作', 'アカウント情報'],
      context
    };
  }

  // 認証エラーの判定
  if (errorCode === 401 || errorMessage.includes('auth') || errorMessage.includes('unauthorized')) {
    return {
      message: errorMessage,
      category: 'auth',
      severity: 'critical',
      userMessage: '認証エラーが発生しました',
      details: 'セッションが無効になった可能性があります。再ログインしてください。',
      estimatedFixTime: '即座',
      affectedFeatures: ['全機能'],
      context
    };
  }

  // Tatum APIエラーの判定
  if (errorMessage.includes('tatum') || errorMessage.includes('subscription') || errorMessage.includes('webhook')) {
    return {
      message: errorMessage,
      category: 'tatum_api',
      severity: 'medium',
      userMessage: 'ブロックチェーン監視システムとの通信エラー',
      details: 'Tatum APIサービスに一時的な問題が発生している可能性があります。',
      estimatedFixTime: '10-30分',
      affectedFeatures: ['入金監視', '自動アドレス生成'],
      context
    };
  }

  // アドレス生成エラーの判定
  if (errorMessage.includes('address') || errorMessage.includes('generate') || errorMessage.includes('allocation')) {
    return {
      message: errorMessage,
      category: 'address_generation',
      severity: 'high',
      userMessage: 'アドレス生成に失敗しました',
      details: 'ウォレットアドレスの生成処理でエラーが発生しました。',
      estimatedFixTime: '1-5分',
      affectedFeatures: ['新規入金アドレス生成'],
      context
    };
  }

  // バリデーションエラーの判定
  if (errorMessage.includes('validation') || errorMessage.includes('invalid') || errorCode === 400) {
    return {
      message: errorMessage,
      category: 'validation',
      severity: 'low',
      userMessage: '入力内容に問題があります',
      details: '送信されたデータの形式または内容が正しくありません。',
      estimatedFixTime: '即座',
      affectedFeatures: ['データ送信'],
      context
    };
  }

  // デフォルト（不明なエラー）
  return {
    message: errorMessage,
    category: 'unknown',
    severity: 'medium',
    userMessage: '予期しないエラーが発生しました',
    details: '詳細なエラー情報を確認して、サポートにお問い合わせください。',
    estimatedFixTime: '不明',
    affectedFeatures: ['不明'],
    context
  };
};

// エラー回復アクション生成
export const generateRecoveryActions = (
  enhancedError: EnhancedError,
  callbacks: {
    retry?: () => void | Promise<void>;
    refresh?: () => void | Promise<void>;
    logout?: () => void | Promise<void>;
    support?: () => void | Promise<void>;
  }
): RecoveryAction[] => {
  const actions: RecoveryAction[] = [];

  switch (enhancedError.category) {
    case 'network':
      actions.push(
        { label: '接続確認', action: () => window.location.reload(), isPrimary: true },
        { label: '再試行', action: callbacks.retry || (() => {}) }
      );
      break;

    case 'database':
      actions.push(
        { label: '再試行', action: callbacks.retry || (() => {}), isPrimary: true },
        { label: 'ページ更新', action: callbacks.refresh || (() => window.location.reload()) }
      );
      break;

    case 'auth':
      actions.push(
        { label: '再ログイン', action: callbacks.logout || (() => {}), isPrimary: true, isDestructive: true }
      );
      break;

    case 'tatum_api':
    case 'address_generation':
      actions.push(
        { label: '再試行', action: callbacks.retry || (() => {}), isPrimary: true },
        { label: 'サポートに連絡', action: callbacks.support || (() => {}) }
      );
      break;

    case 'validation':
      actions.push(
        { label: '入力内容を確認', action: () => {}, isPrimary: true }
      );
      break;

    default:
      actions.push(
        { label: '再試行', action: callbacks.retry || (() => {}), isPrimary: true },
        { label: 'サポートに連絡', action: callbacks.support || (() => {}) }
      );
  }

  return actions;
};

// ネットワーク監視フック
export const useNetworkStatus = (): NetworkStatus => {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: navigator.onLine,
    connectionQuality: navigator.onLine ? 'good' : 'offline',
    lastChecked: new Date()
  });

  React.useEffect(() => {
    const updateNetworkStatus = () => {
      setStatus(prev => ({
        ...prev,
        isOnline: navigator.onLine,
        connectionQuality: navigator.onLine ? 'good' : 'offline',
        lastChecked: new Date()
      }));
    };

    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);

    return () => {
      window.removeEventListener('online', updateNetworkStatus);
      window.removeEventListener('offline', updateNetworkStatus);
    };
  }, []);

  return status;
};

// エラー表示コンポーネント
interface EnhancedErrorDisplayProps {
  error: EnhancedError;
  recoveryActions?: RecoveryAction[];
  onDismiss?: () => void;
  showTechnicalDetails?: boolean;
  className?: string;
}

export const EnhancedErrorDisplay: React.FC<EnhancedErrorDisplayProps> = ({
  error,
  recoveryActions = [],
  onDismiss,
  showTechnicalDetails = false,
  className = ''
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isExecuting, setIsExecuting] = useState<string | null>(null);
  const { toast } = useToast();

  const getSeverityColor = (severity: ErrorSeverity) => {
    switch (severity) {
      case 'low': return 'border-blue-200 bg-blue-50';
      case 'medium': return 'border-amber-200 bg-amber-50';
      case 'high': return 'border-orange-200 bg-orange-50';
      case 'critical': return 'border-red-200 bg-red-50';
      default: return 'border-gray-200 bg-gray-50';
    }
  };

  const getSeverityIcon = (severity: ErrorSeverity) => {
    switch (severity) {
      case 'low': return <HelpCircle className="h-4 w-4 text-blue-600" />;
      case 'medium': return <AlertTriangle className="h-4 w-4 text-amber-600" />;
      case 'high': return <AlertTriangle className="h-4 w-4 text-orange-600" />;
      case 'critical': return <ShieldAlert className="h-4 w-4 text-red-600" />;
      default: return <AlertTriangle className="h-4 w-4 text-gray-600" />;
    }
  };

  const handleActionExecute = async (action: RecoveryAction, index: number) => {
    const actionKey = `action-${index}`;
    setIsExecuting(actionKey);

    try {
      await action.action();
      toast({
        title: "操作完了",
        description: `「${action.label}」を実行しました。`,
        duration: 3000,
      });
    } catch (actionError) {
      toast({
        title: "操作失敗",
        description: `「${action.label}」の実行に失敗しました。`,
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setIsExecuting(null);
    }
  };

  const copyErrorDetails = () => {
    const details = JSON.stringify({
      message: error.message,
      category: error.category,
      severity: error.severity,
      userMessage: error.userMessage,
      details: error.details,
      context: error.context,
      timestamp: new Date().toISOString()
    }, null, 2);

    navigator.clipboard.writeText(details);
    toast({
      title: "エラー詳細をコピー",
      description: "エラー情報がクリップボードにコピーされました。",
      duration: 3000,
    });
  };

  return (
    <Alert className={`${getSeverityColor(error.severity)} ${className}`}>
      <div className="flex items-start gap-3">
        {getSeverityIcon(error.severity)}
        <div className="flex-1 space-y-3">
          {/* エラーヘッダー */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-foreground">{error.userMessage}</h4>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {error.category === 'network' ? 'ネットワーク' :
                   error.category === 'address_generation' ? 'アドレス生成' :
                   error.category === 'subscription' ? 'サブスクリプション' :
                   error.category === 'tatum_api' ? 'Tatum API' :
                   error.category === 'database' ? 'データベース' :
                   error.category === 'validation' ? 'バリデーション' :
                   error.category === 'auth' ? '認証' :
                   error.category === 'chain_config' ? 'チェーン設定' :
                   '不明'}
                </Badge>
                {error.estimatedFixTime && (
                  <Badge variant="secondary" className="text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    {error.estimatedFixTime}
                  </Badge>
                )}
              </div>
            </div>
            <AlertDescription>
              {error.details}
            </AlertDescription>
          </div>

          {/* 影響を受ける機能 */}
          {error.affectedFeatures && error.affectedFeatures.length > 0 && (
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">影響を受ける機能:</span>
              <div className="flex flex-wrap gap-1">
                {error.affectedFeatures.map((feature, index) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    {feature}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* 回復アクション */}
          {recoveryActions.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground">推奨アクション:</span>
              <div className="flex flex-wrap gap-2">
                {recoveryActions.map((action, index) => (
                  <Button
                    key={index}
                    size="sm"
                    variant={action.isPrimary ? "default" : action.isDestructive ? "destructive" : "outline"}
                    onClick={() => handleActionExecute(action, index)}
                    disabled={isExecuting === `action-${index}`}
                    className="text-xs"
                  >
                    {isExecuting === `action-${index}` && (
                      <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                    )}
                    {action.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* 詳細情報（展開可能） */}
          {(showTechnicalDetails || error.technicalInfo) && (
            <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="text-xs p-0 h-auto">
                  <span>技術的詳細</span>
                  <ChevronDown className={`h-3 w-3 ml-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 pt-2">
                <div className="bg-muted/50 p-3 rounded-lg text-xs font-mono">
                  <div className="space-y-1">
                    <div><span className="font-semibold">エラーメッセージ:</span> {error.message}</div>
                    <div><span className="font-semibold">カテゴリ:</span> {error.category}</div>
                    <div><span className="font-semibold">重要度:</span> {error.severity}</div>
                    {error.context && (
                      <div><span className="font-semibold">コンテキスト:</span> {JSON.stringify(error.context)}</div>
                    )}
                    {error.technicalInfo && (
                      <div><span className="font-semibold">技術情報:</span> {JSON.stringify(error.technicalInfo, null, 2)}</div>
                    )}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={copyErrorDetails} className="text-xs">
                  <Copy className="h-3 w-3 mr-1" />
                  エラー詳細をコピー
                </Button>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* ヘルプリンク */}
          {error.helpUrl && (
            <div>
              <Button variant="link" size="sm" asChild className="text-xs p-0 h-auto">
                <a href={error.helpUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3 mr-1" />
                  詳細なヘルプを見る
                </a>
              </Button>
            </div>
          )}

          {/* 閉じるボタン */}
          {onDismiss && (
            <div className="pt-2">
              <Button variant="ghost" size="sm" onClick={onDismiss} className="text-xs">
                閉じる
              </Button>
            </div>
          )}
        </div>
      </div>
    </Alert>
  );
};

// ネットワークステータス表示コンポーネント
export const NetworkStatusIndicator: React.FC = () => {
  const networkStatus = useNetworkStatus();

  const getStatusColor = (quality: NetworkStatus['connectionQuality']) => {
    switch (quality) {
      case 'excellent': return 'text-green-600 bg-green-50';
      case 'good': return 'text-blue-600 bg-blue-50';
      case 'poor': return 'text-amber-600 bg-amber-50';
      case 'offline': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusIcon = (isOnline: boolean) => {
    return isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />;
  };

  const getStatusText = (quality: NetworkStatus['connectionQuality']) => {
    switch (quality) {
      case 'excellent': return '接続良好';
      case 'good': return '接続中';
      case 'poor': return '接続不安定';
      case 'offline': return 'オフライン';
      default: return '不明';
    }
  };

  if (networkStatus.isOnline && networkStatus.connectionQuality === 'good') {
    return null; // 正常時は表示しない
  }

  return (
    <Alert className={`border-l-4 ${getStatusColor(networkStatus.connectionQuality)}`}>
      <div className="flex items-center gap-2">
        {getStatusIcon(networkStatus.isOnline)}
        <div className="flex-1">
          <div className="font-medium text-sm">
            ネットワーク状態: {getStatusText(networkStatus.connectionQuality)}
          </div>
          <div className="text-xs text-muted-foreground">
            最終確認: {networkStatus.lastChecked.toLocaleTimeString()}
          </div>
        </div>
      </div>
    </Alert>
  );
};

// 成功フィードバックコンポーネント
interface SuccessFeedbackProps {
  title: string;
  description?: string;
  actions?: RecoveryAction[];
  className?: string;
  onDismiss?: () => void;
}

export const SuccessFeedback: React.FC<SuccessFeedbackProps> = ({
  title,
  description,
  actions = [],
  className = '',
  onDismiss
}) => {
  return (
    <Alert className={`border-green-200 bg-green-50 ${className}`}>
      <CheckCircle className="h-4 w-4 text-green-600" />
      <div className="flex-1 space-y-2">
        <div className="font-medium text-green-800">{title}</div>
        {description && (
          <AlertDescription className="text-green-700 text-sm">
            {description}
          </AlertDescription>
        )}
        {actions.length > 0 && (
          <div className="flex gap-2 pt-1">
            {actions.map((action, index) => (
              <Button
                key={index}
                size="sm"
                variant="outline"
                onClick={action.action}
                className="text-xs border-green-300 text-green-700 hover:bg-green-100"
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
        {onDismiss && (
          <Button variant="ghost" size="sm" onClick={onDismiss} className="text-xs text-green-700">
            閉じる
          </Button>
        )}
      </div>
    </Alert>
  );
};

export default {
  EnhancedErrorDisplay,
  NetworkStatusIndicator,
  SuccessFeedback,
  analyzeError,
  generateRecoveryActions,
  useNetworkStatus
};