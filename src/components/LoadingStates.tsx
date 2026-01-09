import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Loader2,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Clock,
  Zap,
  Wifi,
  Database,
  Key,
  Shield,
  Activity,
  TrendingUp,
  X
} from 'lucide-react';
import { type SupportedChain, type SupportedNetwork, type SupportedAsset } from '@/lib/multichain-wallet-utils';

// ローディング段階の定義
export interface LoadingStage {
  id: string;
  title: string;
  description: string;
  estimatedDuration: number; // ミリ秒
  icon?: React.ReactNode;
  optional?: boolean;
}

// ローディング状態
export type LoadingState = 'idle' | 'loading' | 'success' | 'error' | 'cancelled';

// ローディングコンテキスト
export interface LoadingContext {
  operation: string;
  chain?: SupportedChain;
  network?: SupportedNetwork;
  asset?: SupportedAsset;
  metadata?: Record<string, unknown>;
}

// プログレスレポート
export interface ProgressReport {
  currentStage: string;
  completedStages: string[];
  totalStages: number;
  estimatedTimeRemaining: number;
  progress: number; // 0-100
  message?: string;
  warnings?: string[];
  errors?: string[];
}

// 段階別ローディング管理
export class StageLoadingManager {
  private stages: LoadingStage[];
  private currentStageIndex: number = 0;
  private startTime: number = 0;
  private stageStartTime: number = 0;
  private completedStages: Set<string> = new Set();
  private onProgressCallback?: (report: ProgressReport) => void;

  constructor(stages: LoadingStage[], onProgress?: (report: ProgressReport) => void) {
    this.stages = stages;
    this.onProgressCallback = onProgress;
  }

  start(): void {
    this.startTime = Date.now();
    this.stageStartTime = Date.now();
    this.currentStageIndex = 0;
    this.completedStages.clear();
    this.reportProgress();
  }

  nextStage(): void {
    if (this.currentStageIndex < this.stages.length) {
      const currentStage = this.stages[this.currentStageIndex];
      this.completedStages.add(currentStage.id);
      this.currentStageIndex++;
      this.stageStartTime = Date.now();
      this.reportProgress();
    }
  }

  skipStage(reason?: string): void {
    if (this.currentStageIndex < this.stages.length) {
      const currentStage = this.stages[this.currentStageIndex];
      console.log(`ステージスキップ: ${currentStage.title}${reason ? ` (理由: ${reason})` : ''}`);
      this.nextStage();
    }
  }

  complete(): void {
    this.currentStageIndex = this.stages.length;
    this.reportProgress();
  }

  private reportProgress(): void {
    if (!this.onProgressCallback) return;

    const currentStage = this.getCurrentStage();
    const progress = (this.completedStages.size / this.stages.length) * 100;
    const estimatedTimeRemaining = this.calculateEstimatedTime();

    const report: ProgressReport = {
      currentStage: currentStage?.title || '完了',
      completedStages: Array.from(this.completedStages),
      totalStages: this.stages.length,
      estimatedTimeRemaining,
      progress,
      message: currentStage?.description
    };

    this.onProgressCallback(report);
  }

  private getCurrentStage(): LoadingStage | null {
    return this.currentStageIndex < this.stages.length ? this.stages[this.currentStageIndex] : null;
  }

  private calculateEstimatedTime(): number {
    const remainingStages = this.stages.slice(this.currentStageIndex);
    return remainingStages.reduce((total, stage) => total + stage.estimatedDuration, 0);
  }

  getCurrentProgress(): ProgressReport {
    const currentStage = this.getCurrentStage();
    const progress = (this.completedStages.size / this.stages.length) * 100;
    const estimatedTimeRemaining = this.calculateEstimatedTime();

    return {
      currentStage: currentStage?.title || '完了',
      completedStages: Array.from(this.completedStages),
      totalStages: this.stages.length,
      estimatedTimeRemaining,
      progress,
      message: currentStage?.description
    };
  }
}

// プリセット段階定義
export const LOADING_STAGES = {
  ADDRESS_GENERATION: [
    {
      id: 'auth_check',
      title: '認証確認',
      description: 'ユーザー認証情報を確認しています',
      estimatedDuration: 500,
      icon: <Shield className="h-4 w-4" />
    },
    {
      id: 'chain_config',
      title: 'チェーン設定取得',
      description: 'ブロックチェーン設定を読み込んでいます',
      estimatedDuration: 1000,
      icon: <Database className="h-4 w-4" />
    },
    {
      id: 'address_check',
      title: '既存アドレス確認',
      description: '既存のウォレットアドレスを確認しています',
      estimatedDuration: 1500,
      icon: <Key className="h-4 w-4" />
    },
    {
      id: 'address_generate',
      title: 'アドレス生成',
      description: '新しいウォレットアドレスを生成しています',
      estimatedDuration: 3000,
      icon: <Zap className="h-4 w-4" />
    },
    {
      id: 'subscription_setup',
      title: '監視設定',
      description: 'Tatumサブスクリプションを設定しています',
      estimatedDuration: 2000,
      icon: <Activity className="h-4 w-4" />
    }
  ],

  TRANSACTION_MONITORING: [
    {
      id: 'tx_detection',
      title: 'トランザクション検知',
      description: 'ブロックチェーンでトランザクションを検知しています',
      estimatedDuration: 5000,
      icon: <Wifi className="h-4 w-4" />
    },
    {
      id: 'tx_validation',
      title: 'トランザクション検証',
      description: 'トランザクションの詳細を検証しています',
      estimatedDuration: 2000,
      icon: <Shield className="h-4 w-4" />
    },
    {
      id: 'confirmation_wait',
      title: '確認待機',
      description: 'ネットワーク確認を待機しています',
      estimatedDuration: 300000, // 5分
      icon: <Clock className="h-4 w-4" />
    }
  ],

  DATA_LOADING: [
    {
      id: 'auth_init',
      title: '認証初期化',
      description: 'ユーザーセッションを初期化しています',
      estimatedDuration: 500,
      icon: <Shield className="h-4 w-4" />
    },
    {
      id: 'data_fetch',
      title: 'データ取得',
      description: 'データベースから情報を取得しています',
      estimatedDuration: 2000,
      icon: <Database className="h-4 w-4" />
    },
    {
      id: 'data_process',
      title: 'データ処理',
      description: '取得したデータを処理しています',
      estimatedDuration: 1000,
      icon: <TrendingUp className="h-4 w-4" />
    }
  ]
};

// リッチローディングコンポーネント
interface RichLoadingDisplayProps {
  stages: LoadingStage[];
  context: LoadingContext;
  onCancel?: () => void;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}

export const RichLoadingDisplay: React.FC<RichLoadingDisplayProps> = ({
  stages,
  context,
  onCancel,
  onRetry,
  className = '',
  compact = false
}) => {
  const [manager] = useState(() => new StageLoadingManager(stages));
  const [progress, setProgress] = useState<ProgressReport>(manager.getCurrentProgress());
  const [state, setState] = useState<LoadingState>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    manager['onProgressCallback'] = setProgress;
    setState('loading');
    manager.start();

    // 模擬的なステージ進行（実際の実装では外部から制御）
    const interval = setInterval(() => {
      if (manager['currentStageIndex'] < stages.length) {
        manager.nextStage();
      } else {
        setState('success');
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [manager, stages]);

  const formatTimeRemaining = (ms: number): string => {
    if (ms < 1000) return '即座';
    if (ms < 60000) return `約${Math.round(ms / 1000)}秒`;
    return `約${Math.round(ms / 60000)}分`;
  };

  if (compact) {
    return (
      <div className={`flex items-center gap-3 p-3 rounded-lg bg-muted/30 ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <div className="flex-1">
          <div className="text-sm font-medium">{progress.currentStage}</div>
          <div className="text-xs text-muted-foreground">{progress.message}</div>
        </div>
        <div className="text-xs text-muted-foreground">
          {Math.round(progress.progress)}%
        </div>
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            {context.operation}
          </CardTitle>
          <div className="flex items-center gap-2">
            {context.chain && context.asset && (
              <Badge variant="outline">
                {context.chain.toUpperCase()} {context.asset}
              </Badge>
            )}
            {state === 'loading' && (
              <Badge variant="secondary">
                {formatTimeRemaining(progress.estimatedTimeRemaining)}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* 現在のステージ */}
        <Alert className="border-blue-200 bg-blue-50">
          <Activity className="h-4 w-4 text-blue-600" />
          <AlertDescription>
            <div className="space-y-2">
              <div className="font-medium text-blue-800">{progress.currentStage}</div>
              <div className="text-sm text-blue-700">{progress.message}</div>
            </div>
          </AlertDescription>
        </Alert>

        {/* プログレスバー */}
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span>進行状況</span>
            <span className="font-mono">{Math.round(progress.progress)}%</span>
          </div>
          <Progress value={progress.progress} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{progress.completedStages.length} / {progress.totalStages} 完了</span>
            <span>残り時間: {formatTimeRemaining(progress.estimatedTimeRemaining)}</span>
          </div>
        </div>

        {/* ステージ詳細 */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">処理ステップ</h4>
          <div className="space-y-2">
            {stages.map((stage, index) => {
              const isCompleted = progress.completedStages.includes(stage.id);
              const isCurrent = progress.currentStage === stage.title;
              const isPending = !isCompleted && !isCurrent;

              return (
                <div
                  key={stage.id}
                  className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                    isCurrent ? 'bg-blue-50 border border-blue-200' :
                    isCompleted ? 'bg-green-50 border border-green-200' :
                    'bg-muted/30'
                  }`}
                >
                  <div className={`flex-shrink-0 ${
                    isCompleted ? 'text-green-600' :
                    isCurrent ? 'text-blue-600' :
                    'text-muted-foreground'
                  }`}>
                    {isCompleted ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : isCurrent ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      stage.icon || <Clock className="h-4 w-4" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className={`text-sm font-medium ${
                      isPending ? 'text-muted-foreground' : ''
                    }`}>
                      {stage.title}
                    </div>
                    <div className={`text-xs ${
                      isPending ? 'text-muted-foreground' : 'text-muted-foreground'
                    }`}>
                      {stage.description}
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <Badge variant={
                      isCompleted ? 'default' :
                      isCurrent ? 'secondary' :
                      'outline'
                    } className="text-xs">
                      {isCompleted ? '完了' :
                       isCurrent ? '実行中' :
                       '待機中'}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* アクションボタン */}
        {(onCancel || onRetry) && (
          <div className="flex gap-2 pt-4 border-t">
            {onRetry && state === 'error' && (
              <Button variant="outline" onClick={onRetry}>
                <RefreshCw className="h-4 w-4 mr-2" />
                再試行
              </Button>
            )}
            {onCancel && state === 'loading' && (
              <Button variant="outline" onClick={onCancel}>
                <X className="h-4 w-4 mr-2" />
                キャンセル
              </Button>
            )}
          </div>
        )}

        {/* エラー表示 */}
        {error && (
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              {error}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};

// シンプルローディング（既存LoadingStateの代替）
interface SmartLoadingStateProps {
  loading: boolean;
  error?: unknown;
  loadingComponent?: React.ReactNode;
  errorComponent?: React.ReactNode;
  children: React.ReactNode;
  context?: LoadingContext;
  onRetry?: () => void;
}

export const SmartLoadingState: React.FC<SmartLoadingStateProps> = ({
  loading,
  error,
  loadingComponent,
  errorComponent,
  children,
  context,
  onRetry
}) => {
  if (loading) {
    if (loadingComponent) {
      return <>{loadingComponent}</>;
    }

    return (
      <div className="flex items-center justify-center p-6">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <div className="text-sm text-muted-foreground">
            {context?.operation || '読み込み中...'}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    if (errorComponent) {
      return <>{errorComponent}</>;
    }

    return (
      <Alert className="border-red-200 bg-red-50">
        <AlertTriangle className="h-4 w-4 text-red-600" />
        <AlertDescription>
          <div className="space-y-2">
            <div className="text-red-800">エラーが発生しました</div>
            <div className="text-sm text-red-700">
              {error?.message || error?.toString() || '不明なエラー'}
            </div>
            {onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
                <RefreshCw className="h-4 w-4 mr-2" />
                再試行
              </Button>
            )}
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  return <>{children}</>;
};

export default {
  StageLoadingManager,
  RichLoadingDisplay,
  SmartLoadingState,
  LOADING_STAGES
};