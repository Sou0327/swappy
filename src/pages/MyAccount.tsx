import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  const { user } = useAuth();
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
        <h1 className="text-2xl md:text-2xl font-bold">マイアカウント</h1>

        {/* Profile Header Card */}
        <Card>
          <CardContent className="p-2 md:p-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 md:gap-1.5">
              <div>
                <Label className="text-sm text-muted-foreground">フルネーム</Label>
                <p className="font-medium">{fullName || '未設定'}</p>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">メールアドレス</Label>
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
              アカウント情報
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 md:p-2">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5 md:gap-1.5">
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">メールアドレス</Label>
                <p className="font-medium text-sm md:text-sm break-all">{user?.email}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">ユーザーID</Label>
                <div className="flex items-center gap-1.5">
                  <p className="font-medium text-sm md:text-sm font-mono">@{userHandle || '未設定'}</p>
                  <button
                    onClick={() => navigator.clipboard?.writeText(userHandle || '')}
                    className="p-1 hover:bg-gray-100 rounded transition-colors"
                    title="コピー"
                    disabled={!userHandle}
                  >
                    <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">最終ログイン</Label>
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
                    : '情報なし'
                  }
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">アカウント作成日</Label>
                <p className="text-sm font-mono">
                  {user?.created_at ? new Date(user.created_at).toLocaleDateString('ja-JP') : '情報なし'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Basic Information Form */}
        <Card>
          <CardHeader>
            <CardTitle>基本情報</CardTitle>
          </CardHeader>
          <CardContent className="p-2 md:p-2 space-y-1 md:space-y-1">
            <div className="grid grid-cols-1 gap-1.5 md:gap-1.5">
              <div className="space-y-1">
                <Label htmlFor="fullName">フルネーム *</Label>
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
                toast({ title: '保存しました' });
              } catch (e: unknown) {
                const error = e as Error;
                toast({ title: '保存失敗', description: error.message || '再試行してください', variant: 'destructive' });
              } finally {
                setLoading(false);
              }
            }}>
              {loading ? '保存中...' : '保存'}
            </Button>
          </CardContent>
        </Card>

        {/* KYC Section with Sumsub */}
        {kycSettings.kycEnabled && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                本人確認 (KYC) - Sumsub統合
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 md:p-2 space-y-1 md:space-y-1">
              <div className="p-2 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex flex-col sm:flex-row items-start gap-1.5">
                  <Shield className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-blue-900">Sumsub外部KYC統合</div>
                    <div className="text-sm text-blue-800 mt-1">
                      プロフェッショナルな本人確認サービスを利用します。
                    </div>
                  </div>
                </div>
              </div>
              {/* 一時的にSumsubKYCコンポーネントを無効化 */}
              <div className="p-2 border rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">
                  Sumsub KYCコンポーネントのテスト表示です。
                </p>
                <Button 
                  onClick={() => {
                    toast({
                      title: "テスト成功",
                      description: "KYCセクションが正常に動作しています"
                    });
                  }}
                  className="w-full transition-all duration-200 active:scale-95"
                >
                  KYC機能テスト
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Logout Section */}
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
                  <h3 className="font-semibold text-base text-gray-900">ログアウト</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    アカウントからログアウトします
                  </p>
                </div>
              </div>
              <Button
                variant="destructive"
                className="w-full sm:w-auto transition-all duration-200 active:scale-95"
                onClick={async () => {
                  try {
                    toast({
                      title: "ログアウト中...",
                      description: "しばらくお待ちください"
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
                      title: "ログアウト完了",
                      description: "またのご利用をお待ちしております"
                    });
                  }
                }}
              >
                <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                ログアウト
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default MyAccount;
