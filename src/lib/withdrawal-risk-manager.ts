import { supabase } from '@/integrations/supabase/client';
import { AuditLogger, AuditAction } from './security/audit-logger';

/**
 * 出金リスクレベル
 */
export enum WithdrawalRiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * 出金ステータス
 */
export enum WithdrawalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

/**
 * 出金要求詳細
 */
export interface WithdrawalRequest {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  chain: string;
  network: string;
  toAddress: string;
  destinationTag?: string;
  memo?: string;
  status: WithdrawalStatus;
  riskLevel?: WithdrawalRiskLevel;
  createdAt: string;
  requestedBy: string;
  userMetadata?: Record<string, unknown>;
}

/**
 * リスク評価結果
 */
export interface RiskAssessmentResult {
  riskLevel: WithdrawalRiskLevel;
  score: number; // 0-100
  factors: RiskFactor[];
  autoApprove: boolean;
  requiresManualReview: boolean;
  requiresAdminApproval: boolean;
  recommendations: string[];
}

/**
 * リスク要因
 */
export interface RiskFactor {
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  score: number;
  details?: Record<string, unknown>;
}

/**
 * 出金限度額設定
 */
export interface WithdrawalLimits {
  id: string;
  chain: string;
  network: string;
  asset: string;
  max_single_amount: number;
  max_daily_amount: number;
  max_monthly_amount: number;
  created_at: string;
  updated_at: string;
}

/**
 * アドレスリスト設定
 */
export interface AddressList {
  id: string;
  address: string;
  chain: string;
  list_type: 'blacklist' | 'whitelist';
  risk_level: string;
  source: string;
  created_at: string;
  updated_at: string;
}

/**
 * 出金パターン分析
 */
export interface WithdrawalPattern extends Record<string, unknown> {
  userId: string;
  totalAmount24h: number;
  totalAmount7d: number;
  totalAmount30d: number;
  frequency24h: number;
  frequency7d: number;
  averageAmount: number;
  uniqueAddresses24h: number;
  firstWithdrawalDate?: string;
  lastWithdrawalDate?: string;
  suspiciousPatterns: string[];
}

/**
 * アドレスリスク評価
 */
export interface AddressRiskInfo extends Record<string, unknown> {
  address: string;
  chain: string;
  riskLevel: WithdrawalRiskLevel;
  isBlacklisted: boolean;
  isWhitelisted: boolean;
  associatedWithExchange: boolean;
  associatedWithMixer: boolean;
  previouslyUsed: boolean;
  riskSources: string[];
}

/**
 * 出金承認・リスク管理システム
 */
export class WithdrawalRiskManager {
  private riskWeights = {
    amount: 0.25,
    frequency: 0.20,
    addressRisk: 0.25,
    userHistory: 0.15,
    timing: 0.10,
    geographic: 0.05
  };

  private thresholds = {
    autoApprove: 30,
    manualReview: 60,
    adminRequired: 80,
    reject: 95
  };

  /**
   * 出金要求のリスク評価
   */
  async assessWithdrawalRisk(request: WithdrawalRequest): Promise<RiskAssessmentResult> {
    try {
      const factors: RiskFactor[] = [];
      let totalScore = 0;

      // 1. 金額リスク分析
      const amountRisk = await this.assessAmountRisk(request);
      factors.push(amountRisk);
      totalScore += amountRisk.score * this.riskWeights.amount;

      // 2. 頻度リスク分析
      const frequencyRisk = await this.assessFrequencyRisk(request);
      factors.push(frequencyRisk);
      totalScore += frequencyRisk.score * this.riskWeights.frequency;

      // 3. アドレスリスク分析
      const addressRisk = await this.assessAddressRisk(request);
      factors.push(addressRisk);
      totalScore += addressRisk.score * this.riskWeights.addressRisk;

      // 4. ユーザー履歴リスク分析
      const userHistoryRisk = await this.assessUserHistoryRisk(request);
      factors.push(userHistoryRisk);
      totalScore += userHistoryRisk.score * this.riskWeights.userHistory;

      // 5. タイミングリスク分析
      const timingRisk = await this.assessTimingRisk(request);
      factors.push(timingRisk);
      totalScore += timingRisk.score * this.riskWeights.timing;

      // 6. 地理的リスク分析
      const geographicRisk = await this.assessGeographicRisk(request);
      factors.push(geographicRisk);
      totalScore += geographicRisk.score * this.riskWeights.geographic;

      // リスクレベルと承認フローを決定
      const approvalResult = this.determineRiskLevelAndApproval(totalScore, factors);
      const result: RiskAssessmentResult = {
        ...approvalResult,
        score: Math.round(totalScore),
        factors
      };

      // 監査ログ記録
      await AuditLogger.log(
        AuditAction.WITHDRAWAL_REQUEST,
        'withdrawal_risk_manager',
        {
          withdrawalId: request.id,
          riskLevel: result.riskLevel,
          score: result.score,
          autoApprove: result.autoApprove
        },
        { userId: request.userId, riskLevel: result.riskLevel }
      );

      return result;

    } catch (error) {
      console.error(`出金リスク評価エラー (${request.id}):`, error);
      
      // エラー時は最高リスクレベル
      return {
        riskLevel: WithdrawalRiskLevel.CRITICAL,
        score: 100,
        factors: [{
          type: 'system_error',
          description: 'リスク評価システムエラー',
          severity: 'critical',
          score: 100,
          details: { error: error.message }
        }],
        autoApprove: false,
        requiresManualReview: true,
        requiresAdminApproval: true,
        recommendations: ['システム管理者による手動確認が必要']
      };
    }
  }

  /**
   * 金額リスク分析
   */
  private async assessAmountRisk(request: WithdrawalRequest): Promise<RiskFactor> {
    try {
      // チェーン・アセット別の限度額設定を取得
      // 暫定的にデフォルト値を使用（実際のテーブル構造に合わせて後で修正）
      const limits: WithdrawalLimits | null = {
        id: 'default',
        chain: request.chain,
        network: request.network,
        asset: request.currency,
        max_single_amount: 10000,
        max_daily_amount: 50000,
        max_monthly_amount: 500000,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      if (!limits) {
        return {
          type: 'amount_risk',
          description: '限度額設定なし',
          severity: 'medium',
          score: 50
        };
      }

      let score = 0;
      const descriptions: string[] = [];

      // 単回限度額チェック
      const singleLimitRatio = request.amount / limits.max_single_amount;
      if (singleLimitRatio > 1) {
        score += 60;
        descriptions.push('単回限度額超過');
      } else if (singleLimitRatio > 0.8) {
        score += 40;
        descriptions.push('単回限度額の80%超過');
      } else if (singleLimitRatio > 0.5) {
        score += 20;
        descriptions.push('単回限度額の50%超過');
      }

      // 日次限度額チェック
      const dailyTotal = await this.getDailyWithdrawalTotal(request.userId, request.chain, request.currency);
      const dailyLimitRatio = (dailyTotal + request.amount) / limits.max_daily_amount;
      if (dailyLimitRatio > 1) {
        score += 60;
        descriptions.push('日次限度額超過');
      } else if (dailyLimitRatio > 0.8) {
        score += 30;
        descriptions.push('日次限度額の80%超過');
      }

      // 異常金額パターンチェック
      const userAverage = await this.getUserAverageWithdrawal(request.userId, request.chain, request.currency);
      if (userAverage > 0) {
        const averageRatio = request.amount / userAverage;
        if (averageRatio > 10) {
          score += 40;
          descriptions.push('平均金額の10倍超過');
        } else if (averageRatio > 5) {
          score += 20;
          descriptions.push('平均金額の5倍超過');
        }
      }

      return {
        type: 'amount_risk',
        description: descriptions.length > 0 ? descriptions.join(', ') : '金額リスク正常',
        severity: score > 60 ? 'high' : score > 30 ? 'medium' : 'low',
        score: Math.min(score, 100),
        details: {
          amount: request.amount,
          singleLimitRatio,
          dailyLimitRatio,
          userAverage
        }
      };

    } catch (error) {
      console.error('金額リスク分析エラー:', error);
      return {
        type: 'amount_risk',
        description: '金額リスク分析エラー',
        severity: 'high',
        score: 70
      };
    }
  }

  /**
   * 頻度リスク分析
   */
  private async assessFrequencyRisk(request: WithdrawalRequest): Promise<RiskFactor> {
    try {
      const pattern = await this.analyzeWithdrawalPattern(request.userId, request.chain);
      
      let score = 0;
      const descriptions: string[] = [];

      // 24時間内の頻度チェック
      if (pattern.frequency24h > 10) {
        score += 60;
        descriptions.push('24時間内の頻度が異常に高い');
      } else if (pattern.frequency24h > 5) {
        score += 30;
        descriptions.push('24時間内の頻度が高い');
      }

      // 連続出金パターンチェック
      const consecutiveWithdrawals = await this.getConsecutiveWithdrawals(request.userId, request.chain);
      if (consecutiveWithdrawals > 15) {
        score += 40;
        descriptions.push('連続出金パターン検出');
      }

      // 疑わしいパターンチェック
      if (pattern.suspiciousPatterns.length > 0) {
        score += 50;
        descriptions.push(`疑わしいパターン: ${pattern.suspiciousPatterns.join(', ')}`);
      }

      return {
        type: 'frequency_risk',
        description: descriptions.length > 0 ? descriptions.join(', ') : '頻度リスク正常',
        severity: score > 60 ? 'high' : score > 30 ? 'medium' : 'low',
        score: Math.min(score, 100),
        details: pattern
      };

    } catch (error) {
      console.error('頻度リスク分析エラー:', error);
      return {
        type: 'frequency_risk',
        description: '頻度リスク分析エラー',
        severity: 'medium',
        score: 50
      };
    }
  }

  /**
   * アドレスリスク分析
   */
  private async assessAddressRisk(request: WithdrawalRequest): Promise<RiskFactor> {
    try {
      const addressRisk = await this.getAddressRiskInfo(request.toAddress, request.chain);
      
      let score = 0;
      const descriptions: string[] = [];

      if (addressRisk.isBlacklisted) {
        score += 100;
        descriptions.push('ブラックリストアドレス');
      } else if (addressRisk.isWhitelisted) {
        score -= 20;
        descriptions.push('ホワイトリストアドレス');
      }

      if (addressRisk.associatedWithMixer) {
        score += 80;
        descriptions.push('ミキサーサービス関連');
      }

      if (addressRisk.associatedWithExchange) {
        score += 10;
        descriptions.push('取引所関連アドレス');
      }

      if (!addressRisk.previouslyUsed) {
        score += 30;
        descriptions.push('初回使用アドレス');
      }

      if (addressRisk.riskSources.length > 0) {
        score += 25 * addressRisk.riskSources.length;
        descriptions.push(`リスクソース: ${addressRisk.riskSources.join(', ')}`);
      }

      return {
        type: 'address_risk',
        description: descriptions.length > 0 ? descriptions.join(', ') : 'アドレスリスク正常',
        severity: score > 80 ? 'critical' : score > 60 ? 'high' : score > 30 ? 'medium' : 'low',
        score: Math.max(0, Math.min(score, 100)),
        details: addressRisk
      };

    } catch (error) {
      console.error('アドレスリスク分析エラー:', error);
      return {
        type: 'address_risk',
        description: 'アドレスリスク分析エラー',
        severity: 'medium',
        score: 50
      };
    }
  }

  /**
   * ユーザー履歴リスク分析
   */
  private async assessUserHistoryRisk(request: WithdrawalRequest): Promise<RiskFactor> {
    try {
      let score = 0;
      const descriptions: string[] = [];

      // ユーザーアカウント作成日チェック
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('created_at')
        .eq('id', request.userId)
        .single();

      if (userProfile) {
        const accountAge = Date.now() - new Date(userProfile.created_at).getTime();
        const daysSinceCreation = accountAge / (1000 * 60 * 60 * 24);

        if (daysSinceCreation < 1) {
          score += 60;
          descriptions.push('新規アカウント（24時間未満）');
        } else if (daysSinceCreation < 7) {
          score += 30;
          descriptions.push('新規アカウント（1週間未満）');
        }

        // TODO: KYC状態とリスクレベルのチェック（将来のテーブル構造に合わせて実装）
        // KYCとリスクレベルのデータは別テーブルまたは別カラムで管理される予定
      }

      // 過去の出金失敗履歴チェック
      const { data: failedWithdrawals } = await supabase
        .from('withdrawals')
        .select('id')
        .eq('user_id', request.userId)
        .eq('status', 'failed')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      if (failedWithdrawals && failedWithdrawals.length > 2) {
        score += 30;
        descriptions.push(`過去30日間に${failedWithdrawals.length}回の出金失敗`);
      }

      return {
        type: 'user_history_risk',
        description: descriptions.length > 0 ? descriptions.join(', ') : 'ユーザー履歴リスク正常',
        severity: score > 60 ? 'high' : score > 30 ? 'medium' : 'low',
        score: Math.min(score, 100),
        details: {
          userProfile,
          failedWithdrawalsCount: failedWithdrawals?.length || 0
        }
      };

    } catch (error) {
      console.error('ユーザー履歴リスク分析エラー:', error);
      return {
        type: 'user_history_risk',
        description: 'ユーザー履歴リスク分析エラー',
        severity: 'medium',
        score: 50
      };
    }
  }

  /**
   * タイミングリスク分析
   */
  private async assessTimingRisk(request: WithdrawalRequest): Promise<RiskFactor> {
    try {
      let score = 0;
      const descriptions: string[] = [];
      const now = new Date();
      const hour = now.getHours();

      // 深夜・早朝時間帯チェック（UTC基準）
      if (hour < 6 || hour > 22) {
        score += 20;
        descriptions.push('深夜・早朝時間帯の取引');
      }

      // 週末チェック
      const dayOfWeek = now.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        score += 15;
        descriptions.push('週末の取引');
      }

      // 連続取引間隔チェック
      const { data: lastWithdrawal } = await supabase
        .from('withdrawals')
        .select('created_at')
        .eq('user_id', request.userId)
        .neq('id', request.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (lastWithdrawal) {
        const timeDiff = Date.now() - new Date(lastWithdrawal.created_at).getTime();
        const minutesDiff = timeDiff / (1000 * 60);

        if (minutesDiff < 5) {
          score += 40;
          descriptions.push('前回取引から5分未満');
        } else if (minutesDiff < 30) {
          score += 20;
          descriptions.push('前回取引から30分未満');
        }
      }

      return {
        type: 'timing_risk',
        description: descriptions.length > 0 ? descriptions.join(', ') : 'タイミングリスク正常',
        severity: score > 40 ? 'medium' : 'low',
        score: Math.min(score, 100),
        details: {
          hour,
          dayOfWeek,
          lastWithdrawalTime: lastWithdrawal?.created_at
        }
      };

    } catch (error) {
      console.error('タイミングリスク分析エラー:', error);
      return {
        type: 'timing_risk',
        description: 'タイミングリスク分析エラー',
        severity: 'low',
        score: 25
      };
    }
  }

  /**
   * 地理的リスク分析
   */
  private async assessGeographicRisk(request: WithdrawalRequest): Promise<RiskFactor> {
    try {
      let score = 0;
      const descriptions: string[] = [];

      // IPアドレス履歴による地理的パターン分析
      // 実装: IPアドレスから地理情報を取得し、異常なパターンを検出
      // ここでは簡易実装

      const geoData = request.userMetadata?.geoLocation as Record<string, unknown> | undefined;
      
      if (geoData) {
        const country = geoData.country as string;
        const isHighRiskCountry = this.isHighRiskCountry(country);
        
        if (isHighRiskCountry) {
          score += 40;
          descriptions.push(`高リスク地域からのアクセス: ${country}`);
        }

        // VPN/プロキシ検出
        if (geoData.isVPN || geoData.isProxy) {
          score += 30;
          descriptions.push('VPN/プロキシ使用の可能性');
        }
      }

      return {
        type: 'geographic_risk',
        description: descriptions.length > 0 ? descriptions.join(', ') : '地理的リスク正常',
        severity: score > 40 ? 'medium' : 'low',
        score: Math.min(score, 100),
        details: geoData
      };

    } catch (error) {
      console.error('地理的リスク分析エラー:', error);
      return {
        type: 'geographic_risk',
        description: '地理的リスク分析エラー',
        severity: 'low',
        score: 25
      };
    }
  }

  /**
   * リスクレベルと承認フローを決定
   */
  private determineRiskLevelAndApproval(score: number, factors: RiskFactor[]): Omit<RiskAssessmentResult, 'score' | 'factors'> {
    const criticalFactors = factors.filter(f => f.severity === 'critical');
    const highFactors = factors.filter(f => f.severity === 'high');

    let riskLevel: WithdrawalRiskLevel;
    let autoApprove = false;
    let requiresManualReview = false;
    let requiresAdminApproval = false;
    const recommendations: string[] = [];

    // 重要な要因による強制的な高リスク判定
    if (criticalFactors.length > 0) {
      riskLevel = WithdrawalRiskLevel.CRITICAL;
      requiresAdminApproval = true;
      recommendations.push('管理者による緊急確認が必要');
    } else if (score >= this.thresholds.reject) {
      riskLevel = WithdrawalRiskLevel.CRITICAL;
      requiresAdminApproval = true;
      recommendations.push('自動拒否の可能性');
    } else if (score >= this.thresholds.adminRequired || highFactors.length >= 2) {
      riskLevel = WithdrawalRiskLevel.HIGH;
      requiresAdminApproval = true;
      recommendations.push('管理者承認が必要');
    } else if (score >= this.thresholds.manualReview) {
      riskLevel = WithdrawalRiskLevel.MEDIUM;
      requiresManualReview = true;
      recommendations.push('手動レビューが必要');
    } else if (score <= this.thresholds.autoApprove) {
      riskLevel = WithdrawalRiskLevel.LOW;
      autoApprove = true;
      recommendations.push('自動承認可能');
    } else {
      riskLevel = WithdrawalRiskLevel.MEDIUM;
      requiresManualReview = true;
      recommendations.push('追加確認が推奨');
    }

    return {
      riskLevel,
      autoApprove,
      requiresManualReview,
      requiresAdminApproval,
      recommendations
    };
  }

  /**
   * 日次出金総額を取得
   */
  private async getDailyWithdrawalTotal(userId: string, chain: string, currency: string): Promise<number> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data, error } = await supabase
        .from('withdrawals')
        .select('amount')
        .eq('user_id', userId)
        .gte('created_at', today.toISOString())
        .neq('status', 'failed');

      if (error || !data) {
        return 0;
      }

      return data.reduce((total, withdrawal) => total + withdrawal.amount, 0);

    } catch (error) {
      console.error('日次出金総額取得エラー:', error);
      return 0;
    }
  }

  /**
   * ユーザーの平均出金額を取得
   */
  private async getUserAverageWithdrawal(userId: string, chain: string, currency: string): Promise<number> {
    try {
      const { data, error } = await supabase
        .from('withdrawals')
        .select('amount')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .limit(10);

      if (error || !data || data.length === 0) {
        return 0;
      }

      const total = data.reduce((sum, withdrawal) => sum + withdrawal.amount, 0);
      return total / data.length;

    } catch (error) {
      console.error('平均出金額取得エラー:', error);
      return 0;
    }
  }

  /**
   * 出金パターン分析
   */
  private async analyzeWithdrawalPattern(userId: string, chain: string): Promise<WithdrawalPattern> {
    try {
      const now = new Date();
      const day24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const day7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const day30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const { data: withdrawals } = await supabase
        .from('withdrawals')
        .select('amount, created_at')
        .eq('user_id', userId)
        .gte('created_at', day30d.toISOString())
        .order('created_at', { ascending: false });

      if (!withdrawals) {
        return {
          userId,
          totalAmount24h: 0,
          totalAmount7d: 0,
          totalAmount30d: 0,
          frequency24h: 0,
          frequency7d: 0,
          averageAmount: 0,
          uniqueAddresses24h: 0,
          suspiciousPatterns: []
        };
      }

      const withdrawals24h = withdrawals.filter(w => new Date(w.created_at) >= day24h);
      const withdrawals7d = withdrawals.filter(w => new Date(w.created_at) >= day7d);

      const totalAmount24h = withdrawals24h.reduce((sum, w) => sum + w.amount, 0);
      const totalAmount7d = withdrawals7d.reduce((sum, w) => sum + w.amount, 0);
      const totalAmount30d = withdrawals.reduce((sum, w) => sum + w.amount, 0);

      const uniqueAddresses24h = withdrawals24h.length; // to_addressが存在しないため暫定的に件数を使用
      const averageAmount = withdrawals.length > 0 ? totalAmount30d / withdrawals.length : 0;

      // 疑わしいパターンの検出
      const suspiciousPatterns: string[] = [];
      
      if (withdrawals24h.length > 10) {
        suspiciousPatterns.push('24時間内の大量出金');
      }
      
      if (uniqueAddresses24h > 5) {
        suspiciousPatterns.push('24時間内の多数アドレス使用');
      }

      return {
        userId,
        totalAmount24h,
        totalAmount7d,
        totalAmount30d,
        frequency24h: withdrawals24h.length,
        frequency7d: withdrawals7d.length,
        averageAmount,
        uniqueAddresses24h,
        firstWithdrawalDate: withdrawals[withdrawals.length - 1]?.created_at,
        lastWithdrawalDate: withdrawals[0]?.created_at,
        suspiciousPatterns
      };

    } catch (error) {
      console.error('出金パターン分析エラー:', error);
      return {
        userId,
        totalAmount24h: 0,
        totalAmount7d: 0,
        totalAmount30d: 0,
        frequency24h: 0,
        frequency7d: 0,
        averageAmount: 0,
        uniqueAddresses24h: 0,
        suspiciousPatterns: ['分析エラー']
      };
    }
  }

  /**
   * 連続出金回数を取得
   */
  private async getConsecutiveWithdrawals(userId: string, chain: string): Promise<number> {
    try {
      const { data: withdrawals } = await supabase
        .from('withdrawals')
        .select('created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!withdrawals || withdrawals.length < 2) {
        return 0;
      }

      let consecutive = 1;
      for (let i = 1; i < withdrawals.length; i++) {
        const prevTime = new Date(withdrawals[i - 1].created_at).getTime();
        const currTime = new Date(withdrawals[i].created_at).getTime();
        const diffHours = (prevTime - currTime) / (1000 * 60 * 60);

        if (diffHours <= 24) {
          consecutive++;
        } else {
          break;
        }
      }

      return consecutive;

    } catch (error) {
      console.error('連続出金チェックエラー:', error);
      return 0;
    }
  }

  /**
   * アドレスリスク情報を取得
   */
  private async getAddressRiskInfo(address: string, chain: string): Promise<AddressRiskInfo> {
    try {
      // 暫定的にデフォルト値を返す（実際のテーブル構造に合わせて後で修正）
      const isBlacklisted = false;
      const isWhitelisted = false;
      const riskSources: string[] = [];

      // 過去の使用履歴チェック（to_addressカラムが存在しないため暫定的に無効化）
      const previouslyUsed = false;

      // リスクレベル決定
      let riskLevel = WithdrawalRiskLevel.LOW;
      if (isBlacklisted) {
        riskLevel = WithdrawalRiskLevel.CRITICAL;
      } else if (riskSources.length > 0) {
        riskLevel = WithdrawalRiskLevel.HIGH;
      } else if (!previouslyUsed) {
        riskLevel = WithdrawalRiskLevel.MEDIUM;
      }

      return {
        address,
        chain,
        riskLevel,
        isBlacklisted,
        isWhitelisted,
        associatedWithExchange: false, // 実装: 取引所アドレスDB照会
        associatedWithMixer: false, // 実装: ミキサーサービスDB照会
        previouslyUsed,
        riskSources
      };

    } catch (error) {
      console.error('アドレスリスク情報取得エラー:', error);
      return {
        address,
        chain,
        riskLevel: WithdrawalRiskLevel.MEDIUM,
        isBlacklisted: false,
        isWhitelisted: false,
        associatedWithExchange: false,
        associatedWithMixer: false,
        previouslyUsed: false,
        riskSources: []
      };
    }
  }

  /**
   * 高リスク国判定
   */
  private isHighRiskCountry(country: string): boolean {
    const highRiskCountries = [
      'AF', 'KP', 'IR', 'SY', // 制裁対象国
      // 他の高リスク国を追加
    ];
    
    return highRiskCountries.includes(country);
  }

  /**
   * 出金要求を承認
   */
  async approveWithdrawal(withdrawalId: string, approvedBy: string, comments?: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('withdrawals')
        .update({
          status: 'approved',
          approved_by: approvedBy,
          approved_at: new Date().toISOString(),
          admin_comments: comments,
          updated_at: new Date().toISOString()
        })
        .eq('id', withdrawalId);

      if (error) {
        throw error;
      }

      // 監査ログ記録
      await AuditLogger.log(
        AuditAction.WITHDRAWAL_APPROVE,
        'withdrawal_risk_manager',
        {
          withdrawalId,
          approvedBy,
          comments
        },
        { userId: approvedBy, riskLevel: 'medium' }
      );

    } catch (error) {
      console.error(`出金承認エラー (${withdrawalId}):`, error);
      throw error;
    }
  }

  /**
   * 出金要求を拒否
   */
  async rejectWithdrawal(withdrawalId: string, rejectedBy: string, reason: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('withdrawals')
        .update({
          status: 'rejected',
          rejected_by: rejectedBy,
          rejected_at: new Date().toISOString(),
          rejection_reason: reason,
          updated_at: new Date().toISOString()
        })
        .eq('id', withdrawalId);

      if (error) {
        throw error;
      }

      // 監査ログ記録
      await AuditLogger.log(
        AuditAction.WITHDRAWAL_REJECT,
        'withdrawal_risk_manager',
        {
          withdrawalId,
          rejectedBy,
          reason
        },
        { userId: rejectedBy, riskLevel: 'high' }
      );

    } catch (error) {
      console.error(`出金拒否エラー (${withdrawalId}):`, error);
      throw error;
    }
  }
}