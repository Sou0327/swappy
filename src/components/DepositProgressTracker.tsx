import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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

// ステップIDから翻訳キー名へのマッピング
const STEP_TRANSLATION_KEYS: Record<DepositStep, string> = {
  'awaiting_payment': 'awaitingPayment',
  'payment_detected': 'paymentDetected',
  'confirming': 'confirming',
  'completed': 'completed',
  'failed': 'failed'
};

// ステップごとのスタイル設定（翻訳不要）
const STEP_STYLES: Record<DepositStep, { color: string; bgColor: string; icon: React.ReactNode }> = {
  'awaiting_payment': {
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    icon: <Clock className="h-4 w-4" />
  },
  'payment_detected': {
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    icon: <Radar className="h-4 w-4" />
  },
  'confirming': {
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    icon: <Timer className="h-4 w-4" />
  },
  'completed': {
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    icon: <CheckCircle className="h-4 w-4" />
  },
  'failed': {
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    icon: <AlertCircle className="h-4 w-4" />
  }
};

const STEP_ORDER: DepositStep[] = ['awaiting_payment', 'payment_detected', 'confirming', 'completed', 'failed'];

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
  const { t } = useTranslation('wallet');
  const [progress, setProgress] = useState(0);
  const [isExpanded, setIsExpanded] = useState(showDetails);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [stepTransition, setStepTransition] = useState(false);

  // 翻訳対応のSTEPS配列を動的生成
  const STEPS: StepInfo[] = useMemo(() =>
    STEP_ORDER.map(stepId => {
      const translationKey = STEP_TRANSLATION_KEYS[stepId];
      const style = STEP_STYLES[stepId];
      return {
        id: stepId,
        title: t(`deposit.progress.steps.${translationKey}.title`),
        description: t(`deposit.progress.steps.${translationKey}.description`),
        detailedDescription: t(`deposit.progress.steps.${translationKey}.detailedDescription`),
        estimatedTime: t(`deposit.progress.steps.${translationKey}.estimatedTime`),
        icon: style.icon,
        color: style.color,
        bgColor: style.bgColor
      };
    }), [t]);

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
      fast: { variant: 'default' as const, color: 'text-green-600' },
      normal: { variant: 'secondary' as const, color: 'text-blue-600' },
      slow: { variant: 'outline' as const, color: 'text-amber-600' },
      congested: { variant: 'destructive' as const, color: 'text-red-600' }
    };

    const config = statusConfig[networkStatus];
    return (
      <Badge variant={config.variant} className={config.color}>
        {t(`deposit.progress.networkStatus.${networkStatus}`)}
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
        return t('deposit.progress.estimatedTime.seconds', { count: Math.round(estimatedSeconds) });
      } else if (estimatedSeconds < 3600) {
        return t('deposit.progress.estimatedTime.minutes', { count: Math.round(estimatedSeconds / 60) });
      } else {
        return t('deposit.progress.estimatedTime.hours', { count: Math.round(estimatedSeconds / 3600) });
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
            {t('deposit.progress.cardTitle')}
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
            <span className="text-sm font-medium">{t('deposit.progress.details')}</span>
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
                  <h5 className="text-sm font-medium">{t('deposit.progress.transaction')}</h5>
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
                    <span className="text-muted-foreground">{t('deposit.progress.expectedAmount')}</span>
                    <div className="font-mono">{expectedAmount} {asset}</div>
                  </div>
                )}
                {lastUpdated && (
                  <div>
                    <span className="text-muted-foreground">{t('deposit.progress.lastUpdated')}</span>
                    <div className="font-mono text-xs">
                      {lastUpdated.toLocaleTimeString()}
                    </div>
                  </div>
                )}
              </div>

              {/* ステップ詳細 */}
              <div className="space-y-3">
                <h5 className="text-sm font-medium">{t('deposit.progress.processingSteps')}</h5>
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
                              {status === 'completed' ? t('deposit.progress.status.completed') :
                                status === 'current' ? t('deposit.progress.status.inProgress') : t('deposit.progress.status.waiting')}
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