import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CheckCircle,
  Clock,
  ArrowRight,
  Wallet,
  Radar,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  ExternalLink,
  Timer
} from 'lucide-react';

export type DepositStep = 'awaiting_payment' | 'payment_detected' | 'confirming' | 'completed' | 'failed';

interface DepositProgressTrackerProps {
  currentStep: DepositStep;
  address?: string;
  txHash?: string;
  confirmations?: number;
  requiredConfirmations?: number;
  chain: string;
  asset: string;
  expectedAmount?: string;
  estimatedTime?: string;
  lastUpdated?: Date;
  networkStatus?: 'fast' | 'normal' | 'slow' | 'congested';
  onRefresh?: () => void;
  onViewTransaction?: (txHash: string) => void;
  showDetails?: boolean;
  className?: string;
}

interface StepInfo {
  id: DepositStep;
  title: string;
  description: string;
  detailedDescription: string;
  icon: React.ReactNode;
  estimatedTime: string;
  color: string;
  bgColor: string;
}

const STEPS: StepInfo[] = [
  {
    id: 'awaiting_payment',
    title: '送金待ち',
    description: '生成されたアドレスに暗号通貨を送金してください',
    detailedDescription: '指定のアドレスに暗号通貨を送金してください',
    icon: <Clock className="h-4 w-4" />,
    estimatedTime: 'ユーザー操作待ち',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50'
  },
  {
    id: 'payment_detected',
    title: '送金検知',
    description: 'ブロックチェーン上で送金が検知されました',
    detailedDescription: 'Tatumの監視システムが送金を検知しました。ネットワークでの確認を待機中です',
    icon: <Radar className="h-4 w-4" />,
    estimatedTime: '1-5分',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50'
  },
  {
    id: 'confirming',
    title: '確認中',
    description: 'ネットワーク確認を待機中です',
    detailedDescription: 'ブロックチェーンネットワークで必要な確認数を満たすまで待機中です。確認が進むにつれて安全性が向上します',
    icon: <Timer className="h-4 w-4" />,
    estimatedTime: '5-30分',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50'
  },
  {
    id: 'completed',
    title: '入金完了',
    description: '残高に反映されました',
    detailedDescription: '必要な確認数に達し、入金が正常に完了しました。残高が更新され、取引が利用可能になります',
    icon: <CheckCircle className="h-4 w-4" />,
    estimatedTime: '完了',
    color: 'text-green-600',
    bgColor: 'bg-green-50'
  },
  {
    id: 'failed',
    title: '入金エラー',
    description: '入金処理中にエラーが発生しました',
    detailedDescription: '技術的な問題により入金処理が失敗しました。サポートにお問い合わせください',
    icon: <AlertCircle className="h-4 w-4" />,
    estimatedTime: '-',
    color: 'text-red-600',
    bgColor: 'bg-red-50'
  }
];

const DepositProgressTracker: React.FC<DepositProgressTrackerProps> = ({
  currentStep,
  address,
  txHash,
  confirmations = 0,
  requiredConfirmations = 12,
  chain,
  asset,
  expectedAmount,
  estimatedTime,
  lastUpdated,
  networkStatus = 'normal',
  onRefresh,
  onViewTransaction,
  showDetails = false,
  className = ''
}) => {
  const [progress, setProgress] = useState(0);
  const [isExpanded, setIsExpanded] = useState(showDetails);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [stepTransition, setStepTransition] = useState(false);

  // 現在のステップのインデックスを取得
  const currentStepIndex = STEPS.findIndex(step => step.id === currentStep);

  // ステップ変更時のアニメーション効果
  useEffect(() => {
    setStepTransition(true);
    const timer = setTimeout(() => setStepTransition(false), 500);
    return () => clearTimeout(timer);
  }, [currentStep]);

  // プログレスバーの値を計算（拡張版）
  useEffect(() => {
    let calculatedProgress = 0;

    if (currentStepIndex >= 0) {
      // 基本的なステップ進行度
      const baseProgress = (currentStepIndex / (STEPS.length - 1)) * 100;

      switch (currentStep) {
        case 'awaiting_payment':
          calculatedProgress = 25; // 送金待ち状態
          break;
        case 'payment_detected':
          calculatedProgress = 50; // 送金検知時は50%
          break;
        case 'confirming':
          // 確認中は詳細な進行度計算
          if (requiredConfirmations > 0) {
            const confirmationProgress = (confirmations / requiredConfirmations) * 40; // 確認段階で40%の幅
            calculatedProgress = 50 + confirmationProgress;
          } else {
            calculatedProgress = 75;
          }
          break;
        case 'completed':
          calculatedProgress = 100;
          break;
        case 'failed':
          calculatedProgress = 0; // エラー時は0%
          break;
        default:
          calculatedProgress = baseProgress;
      }
    }

    // スムーズなアニメーションのため段階的に更新
    const targetProgress = calculatedProgress;
    const progressStep = Math.abs(targetProgress - progress) / 10;

    if (Math.abs(targetProgress - progress) > 1) {
      const timer = setInterval(() => {
        setProgress(prev => {
          const diff = targetProgress - prev;
          if (Math.abs(diff) <= progressStep) {
            clearInterval(timer);
            return targetProgress;
          }
          return prev + (diff > 0 ? progressStep : -progressStep);
        });
      }, 50);
      return () => clearInterval(timer);
    } else {
      setProgress(targetProgress);
    }
  }, [currentStep, currentStepIndex, confirmations, requiredConfirmations, progress]);

  const getStepStatus = (stepId: DepositStep): 'completed' | 'current' | 'pending' => {
    const stepIndex = STEPS.findIndex(step => step.id === stepId);

    if (stepIndex < currentStepIndex) return 'completed';
    if (stepIndex === currentStepIndex) return 'current';
    return 'pending';
  };

  const getStepVariant = (status: string) => {
    switch (status) {
      case 'completed': return 'default';
      case 'current': return 'secondary';
      default: return 'outline';
    }
  };

  const handleRefresh = async () => {
    if (!onRefresh) return;

    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const getNetworkStatusBadge = () => {
    const statusConfig = {
      fast: { label: '高速', variant: 'default' as const, color: 'text-green-600' },
      normal: { label: '通常', variant: 'secondary' as const, color: 'text-blue-600' },
      slow: { label: '低速', variant: 'outline' as const, color: 'text-amber-600' },
      congested: { label: '混雑', variant: 'destructive' as const, color: 'text-red-600' }
    };

    const config = statusConfig[networkStatus];
    return (
      <Badge variant={config.variant} className={config.color}>
        {config.label}
      </Badge>
    );
  };

  const getEstimatedTime = () => {
    if (estimatedTime) return estimatedTime;

    const currentStepInfo = STEPS.find(step => step.id === currentStep);
    if (!currentStepInfo) return '-';

    // ネットワーク状況による推定時間調整
    const multiplier = networkStatus === 'fast' ? 0.7 : networkStatus === 'slow' ? 1.5 : networkStatus === 'congested' ? 2.5 : 1;

    if (currentStep === 'confirming' && requiredConfirmations > 0) {
      const baseTimePerConfirmation = chain === 'eth' ? 15 : chain === 'btc' ? 10 : 3; // 秒単位の基本時間
      const remainingConfirmations = Math.max(0, requiredConfirmations - confirmations);
      const estimatedSeconds = remainingConfirmations * baseTimePerConfirmation * multiplier;

      if (estimatedSeconds < 60) {
        return `約${Math.round(estimatedSeconds)}秒`;
      } else if (estimatedSeconds < 3600) {
        return `約${Math.round(estimatedSeconds / 60)}分`;
      } else {
        return `約${Math.round(estimatedSeconds / 3600)}時間`;
      }
    }

    return currentStepInfo.estimatedTime;
  };

  const getCurrentStepInfo = () => {
    return STEPS.find(step => step.id === currentStep);
  };

  return (
    <Card className={`w-full transition-all duration-300 ${stepTransition ? 'scale-105' : ''} ${className}`}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <div className={`p-2 rounded-full ${getCurrentStepInfo()?.bgColor} transition-colors duration-500`}>
              {getCurrentStepInfo()?.icon}
            </div>
            入金進行状況
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono">
              {chain?.toUpperCase()} {asset || ''}
            </Badge>
            {getNetworkStatusBadge()}
            {onRefresh && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="h-8 w-8 p-0"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* 現在のステップ情報 */}
        {getCurrentStepInfo() && (
          <Alert className={`border-l-4 ${getCurrentStepInfo()?.bgColor} transition-all duration-500`}>
            <div className={getCurrentStepInfo()?.color}>
              {getCurrentStepInfo()?.icon}
            </div>
            <AlertDescription>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">{getCurrentStepInfo()?.title}</h4>
                  <Badge variant="outline" className="text-xs">
                    {getEstimatedTime()}
                  </Badge>
                </div>
                <p className="text-sm">{getCurrentStepInfo()?.description}</p>
                {isExpanded && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {getCurrentStepInfo()?.detailedDescription}
                  </p>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}


        {/* 詳細情報（展開可能） */}
        <div className="space-y-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full justify-between h-auto p-3 hover:bg-muted/50"
          >
            <span className="text-sm font-medium">詳細情報</span>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>

          {isExpanded && (
            <div className="space-y-4 animate-in slide-in-from-top duration-300">
              {/* トランザクション情報 */}
              {txHash && (
                <div className="space-y-2">
                  <h5 className="text-sm font-medium">トランザクション</h5>
                  <div className="flex items-center gap-2">
                    <div className="p-3 bg-muted rounded-lg flex-1">
                      <code className="text-xs break-all">{txHash}</code>
                    </div>
                    {onViewTransaction && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onViewTransaction(txHash)}
                        className="flex-shrink-0"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* 追加情報 */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                {expectedAmount && (
                  <div>
                    <span className="text-muted-foreground">予定金額</span>
                    <div className="font-mono">{expectedAmount} {asset}</div>
                  </div>
                )}
                {lastUpdated && (
                  <div>
                    <span className="text-muted-foreground">最終更新</span>
                    <div className="font-mono text-xs">
                      {lastUpdated.toLocaleTimeString()}
                    </div>
                  </div>
                )}
              </div>

              {/* ステップ詳細 */}
              <div className="space-y-3">
                <h5 className="text-sm font-medium">処理ステップ</h5>
                <div className="space-y-2">
                  {STEPS.map((step, index) => {
                    const status = getStepStatus(step.id);
                    return (
                      <div
                        key={step.id}
                        className={`flex items-center gap-3 p-3 rounded-lg transition-all duration-300 ${status === 'current' ? step.bgColor : 'bg-muted/30'
                          }`}
                      >
                        <div className={`flex-shrink-0 ${status === 'completed' ? 'text-green-600' :
                          status === 'current' ? step.color :
                            'text-muted-foreground'
                          }`}>
                          {status === 'completed' ? (
                            <CheckCircle className="h-4 w-4" />
                          ) : status === 'current' ? (
                            <div className="relative">
                              {step.icon}
                              {(step.id === 'payment_detected' || step.id === 'confirming') && status === 'current' && (
                                <Loader2 className="h-3 w-3 animate-spin absolute -top-1 -right-1" />
                              )}
                            </div>
                          ) : (
                            step.icon
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className={`text-sm font-medium ${status === 'current' ? step.color :
                              status === 'completed' ? 'text-green-600' :
                                'text-muted-foreground'
                              }`}>
                              {step.title}
                            </span>
                            <Badge variant={getStepVariant(status)} className="text-xs">
                              {status === 'completed' ? '完了' :
                                status === 'current' ? '進行中' : '待機中'}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {step.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default DepositProgressTracker;