import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Shield, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
// import { useKYC } from "@/hooks/use-kyc";
// import { SumsubKYC } from "@/components/SumsubKYC";

const MyAccount = () => {
  const { t } = useTranslation('account');
  const { user, isDemoMode } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [kycSettings] = useState({ kycEnabled: false }); // 一時的に無効化
  const [fullName, setFullName] = useState("");
  const [userHandle, setUserHandle] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!user?.id) return;
      const { data, error } = await supabase.from('profiles').select('full_name, user_handle').eq('id', user.id).maybeSingle();
      if (!error && data) {
        setFullName(data.full_name || '');
        setUserHandle(data.user_handle || '');
      }
    };
    load();
  }, [user?.id]);

  return (
    <DashboardLayout>
      <div className="space-y-1">
        {/* Header */}
        <h1 className="text-2xl md:text-2xl font-bold">{t('pageTitle')}</h1>

        {/* Profile Header Card */}
        <Card>
          <CardContent className="p-2 md:p-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 md:gap-1.5">
              <div>
                <Label className="text-sm text-muted-foreground">{t('profile.fullName')}</Label>
                <p className="font-medium">{fullName || t('profile.notSet')}</p>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">{t('profile.email')}</Label>
                <p className="font-medium break-all">{user?.email}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Detailed Account Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {t('accountInfo.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 md:p-2">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5 md:gap-1.5">
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">{t('profile.email')}</Label>
                <p className="font-medium text-sm md:text-sm break-all">{user?.email}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">{t('accountInfo.userId')}</Label>
                <div className="flex items-center gap-1.5">
                  <p className="font-medium text-sm md:text-sm font-mono">@{userHandle || t('profile.notSet')}</p>
                  <button
                    onClick={() => navigator.clipboard?.writeText(userHandle || '')}
                    className="p-1 hover:bg-gray-100 rounded transition-colors"
                    title={t('accountInfo.copy')}
                    disabled={!userHandle}
                  >
                    <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">{t('accountInfo.lastLogin')}</Label>
                <p className="text-sm font-mono">
                  {user?.last_sign_in_at
                    ? new Date(user.last_sign_in_at).toLocaleString('ja-JP', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })
                    : t('profile.noInfo')
                  }
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">{t('accountInfo.createdAt')}</Label>
                <p className="text-sm font-mono">
                  {user?.created_at ? new Date(user.created_at).toLocaleDateString('ja-JP') : t('profile.noInfo')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Basic Information Form */}
        <Card>
          <CardHeader>
            <CardTitle>{t('basicInfo.title')}</CardTitle>
          </CardHeader>
          <CardContent className="p-2 md:p-2 space-y-1 md:space-y-1">
            <div className="grid grid-cols-1 gap-1.5 md:gap-1.5">
              <div className="space-y-1">
                <Label htmlFor="fullName">{t('basicInfo.fullNameRequired')}</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="bg-muted/50"
                />
              </div>
            </div>

            <Button
              className="w-full sm:w-auto bg-primary hover:bg-primary/90 active:bg-primary/80 transition-all duration-200 active:scale-95"
              disabled={loading}
              onClick={async () => {
              if (!user?.id) return;
              setLoading(true);
              try {
                const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', user.id);
                if (error) throw error;
                toast({ title: t('toast.saved') });
              } catch (e: unknown) {
                const error = e as Error;
                toast({ title: t('toast.saveFailed'), description: error.message || t('toast.retryMessage'), variant: 'destructive' });
              } finally {
                setLoading(false);
              }
            }}>
              {loading ? t('actions.saving') : t('actions.save')}
            </Button>
          </CardContent>
        </Card>

        {/* KYC Section with Sumsub */}
        {kycSettings.kycEnabled && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                {t('kyc.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 md:p-2 space-y-1 md:space-y-1">
              <div className="p-2 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex flex-col sm:flex-row items-start gap-1.5">
                  <Shield className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-blue-900">{t('kyc.sumsubTitle')}</div>
                    <div className="text-sm text-blue-800 mt-1">
                      {t('kyc.sumsubDescription')}
                    </div>
                  </div>
                </div>
              </div>
              {/* 一時的にSumsubKYCコンポーネントを無効化 */}
              <div className="p-2 border rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">
                  {t('kyc.testMessage')}
                </p>
                <Button
                  onClick={() => {
                    toast({
                      title: t('kyc.testSuccess'),
                      description: t('kyc.testSuccessDesc')
                    });
                  }}
                  className="w-full transition-all duration-200 active:scale-95"
                >
                  {t('kyc.testButton')}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Logout Section - デモモード時は非表示 */}
        {!isDemoMode && (
        <Card className="border-red-200">
          <CardContent className="p-2 md:p-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
              <div className="flex items-center gap-1.5">
                <div className="p-3 bg-red-100 rounded-lg flex-shrink-0">
                  <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-base text-gray-900">{t('logout.title')}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('logout.description')}
                  </p>
                </div>
              </div>
              <Button
                variant="destructive"
                className="w-full sm:w-auto transition-all duration-200 active:scale-95"
                onClick={async () => {
                  try {
                    toast({
                      title: t('logout.loggingOut'),
                      description: t('logout.pleaseWait')
                    });

                    // 1. セッション存在確認
                    const { data: { session } } = await supabase.auth.getSession();

                    if (session) {
                      // セッションが存在する場合は通常のログアウト
                      try {
                        await supabase.auth.signOut();
                      } catch (error: unknown) {
                        const err = error as { message?: string };
                        // AuthSessionMissingErrorは許容（既にログアウト状態）
                        if (!err.message?.includes('Auth session missing')) {
                          throw error; // 他のエラーは再スロー
                        }
                        console.warn('セッション既に無効:', error);
                      }
                    }
                  } catch (error: unknown) {
                    console.error('ログアウトエラー:', error);
                    // エラーが発生してもログアウトは続行
                  } finally {
                    // 必ず実行：ローカルストレージクリーンアップとリダイレクト
                    try {
                      // Supabaseのローカルセッションを強制削除
                      await supabase.auth.signOut({ scope: 'local' });
                    } catch {
                      // エラーでも続行
                    }

                    // 念のためSupabase関連のlocalStorageを手動削除
                    try {
                      Object.keys(localStorage).forEach(key => {
                        if (key.startsWith('sb-')) {
                          localStorage.removeItem(key);
                        }
                      });
                    } catch (e) {
                      console.warn('localStorage cleanup failed:', e);
                    }

                    // 認証ページにリダイレクト
                    navigate('/auth');

                    toast({
                      title: t('logout.complete'),
                      description: t('logout.completeDesc')
                    });
                  }
                }}
              >
                <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                {t('logout.button')}
              </Button>
            </div>
          </CardContent>
        </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default MyAccount;
