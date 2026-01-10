/**
 * Sumsub KYC統合コンポーネント
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/ui/loading';
import { Shield, ExternalLink } from 'lucide-react';

interface SumsubKYCProps {
  onComplete?: (applicantId: string, status: string) => void;
  onError?: (error: string) => void;
}

export const SumsubKYC = ({ onComplete, onError }: SumsubKYCProps) => {
  const { user } = useAuth();
  const sumsubContainerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [applicantId, setApplicantId] = useState<string | null>(null);

  /**
   * Sumsubアクセストークンを生成
   */
  const generateAccessToken = async (): Promise<string> => {
    if (!user?.id) throw new Error('ユーザーが認証されていません');

    const response = await supabase.functions.invoke('sumsub-generate-token', {
      body: {
        userId: user.id,
        levelName: 'basic-kyc-level', // Sumsubで設定したレベル名
        externalUserId: user.id
      }
    });

    if (response.error) {
      throw new Error(response.error.message || 'トークン生成に失敗しました');
    }

    return response.data.token;
  };

  /**
   * SumsubのステータスをKYCステータスにマッピング
   */
  const mapSumsubStatusToKYCStatus = (reviewStatus: string | undefined): string => {
    if (!reviewStatus) return 'pending';

    switch (reviewStatus) {
      case 'completed':
      case 'approved':
        return 'verified';
      case 'pending':
      case 'reviewing':
        return 'pending';
      case 'rejected':
        return 'rejected';
      default:
        return 'pending';
    }
  };

  /**
   * Sumsubからのステータス更新を処理
   */
  const handleStatusUpdate = useCallback(async (payload: { applicantId?: string; reviewStatus?: string; reviewRejectType?: string }) => {
    if (!user?.id || !payload.reviewStatus) return;

    try {
      // データベースのKYCステータスを更新
      const kycStatus = mapSumsubStatusToKYCStatus(payload.reviewStatus);

      await supabase
        .from('profiles')
        .update({
          kyc_status: kycStatus as 'none' | 'pending' | 'verified' | 'rejected',
          kyc_level: kycStatus === 'verified' ? 2 : 1,
          kyc_updated_at: new Date().toISOString(),
          kyc_notes: payload.reviewRejectType || null
        })
        .eq('id', user.id);

      if (payload.applicantId) {
        onComplete?.(payload.applicantId, kycStatus);
      }
    } catch (error) {
      console.error('KYCステータス更新エラー:', error);
    }
  }, [user?.id, onComplete]);

  /**
   * Sumsub WebSDKを初期化
   */
  const initializeSumsubSDK = useCallback(async () => {
    if (!accessToken || !sumsubContainerRef.current) return;

    try {
      // Sumsub WebSDKの動的読み込み
      if (!window.SumSub) {
        const script = document.createElement('script');
        script.src = 'https://api.sumsub.com/idensic/static/sumsub-kyc.js';
        script.async = true;
        document.head.appendChild(script);

        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
        });
      }

      // WebSDK設定
      const sumsubConfig = {
        lang: 'ja', // 日本語
        theme: 'light',
        email: user?.email,
        phone: '', // 電話番号があれば設定
        onMessage: (type: string, payload: Record<string, unknown>) => {
          switch (type) {
            case 'idCheck.stepCompleted':
              break;

            case 'idCheck.applicantLoaded':
              if (typeof payload.applicantId === 'string') {
                setApplicantId(payload.applicantId);
              }
              break;

            case 'idCheck.applicantStatus':
              handleStatusUpdate(payload);
              break;

            case 'idCheck.applicantSubmitted':
              if (typeof payload.applicantId === 'string') {
                onComplete?.(payload.applicantId, 'submitted');
              }
              break;

            case 'idCheck.onError': {
              console.error('Sumsub エラー:', payload);
              const errorMessage = typeof payload.description === 'string'
                ? payload.description
                : 'KYC処理中にエラーが発生しました';
              onError?.(errorMessage);
              break;
            }
          }
        },
        onError: (error: Error) => {
          console.error('Sumsub SDK エラー:', error);
          onError?.(error instanceof Error ? error.message : 'SDK初期化エラー');
        }
      };

      // WebSDKを初期化
      window.SumSub.init(accessToken, sumsubConfig);
      window.SumSub.render(sumsubContainerRef.current, sumsubConfig);

    } catch (error) {
      console.error('Sumsub SDK初期化失敗:', error);
      onError?.('KYC初期化に失敗しました');
    }
  }, [accessToken, user?.email, onComplete, onError, handleStatusUpdate]);

  /**
   * KYC開始
   */
  const startKYC = async () => {
    setLoading(true);
    try {
      const token = await generateAccessToken();
      setAccessToken(token);
    } catch (error) {
      console.error('KYC開始エラー:', error);
      onError?.(error instanceof Error ? error.message : 'KYC開始に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // アクセストークン取得後、WebSDKを初期化
  useEffect(() => {
    if (accessToken) {
      initializeSumsubSDK();
    }
  }, [accessToken, initializeSumsubSDK]);

  if (!accessToken) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            本人確認 (Sumsub KYC)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <p className="mb-2">安全で迅速な本人確認サービスを提供します。</p>
            <p className="mb-4">以下の機能が利用できます：</p>
            <ul className="list-disc list-inside space-y-1 mb-4">
              <li>身分証明書の自動検証</li>
              <li>顔認証による本人確認</li>
              <li>リアルタイム審査結果</li>
              <li>200+カ国の証明書対応</li>
            </ul>
          </div>

          <LoadingState loading={loading}>
            <Button
              onClick={startKYC}
              className="w-full"
              disabled={loading}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              本人確認を開始
            </Button>
          </LoadingState>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          本人確認手続き
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Sumsub WebSDKコンテナ */}
        <div
          ref={sumsubContainerRef}
          className="w-full min-h-[600px] border rounded-lg"
          id="sumsub-websdk-container"
        />
      </CardContent>
    </Card>
  );
};

// グローバルタイプ定義
declare global {
  interface Window {
    SumSub: {
      init: (token: string, config: Record<string, unknown>) => void;
      render: (container: HTMLElement, config: Record<string, unknown>) => void;
    };
  }
}