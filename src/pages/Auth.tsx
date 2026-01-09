import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff, Mail, Lock, User, Gift, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SERVICE_RESTRICTIONS } from "@/lib/service-restrictions";
import { PLATFORM_NAME } from "@/config/branding";

const Auth = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [codeValidation, setCodeValidation] = useState<{
    status: 'idle' | 'checking' | 'valid' | 'invalid';
    message: string;
    codeId?: string;
    referrerId?: string;
  }>({ status: 'idle', message: '' });
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Check if user is already logged in
  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/redirect");
      }
    };
    checkUser();
  }, [navigate]);

  // URLパラメータから紹介コードを取得
  useEffect(() => {
    const refCode = searchParams.get('ref');
    if (refCode) {
      setReferralCode(refCode.toUpperCase());
    }
  }, [searchParams]);

  // 紹介コード検証（debounce）
  const validateReferralCode = useCallback(async (code: string) => {
    if (!code || code.length < 3) {
      setCodeValidation({ status: 'idle', message: '' });
      return;
    }

    setCodeValidation({ status: 'checking', message: '確認中...' });

    try {
      // シンプルな紹介コード検証
      const { data, error } = await supabase
        .from('referral_codes')
        .select('id, user_id, is_active')
        .eq('code', code.toUpperCase())
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        setCodeValidation({
          status: 'invalid',
          message: '紹介コードが見つかりません'
        });
        return;
      }

      setCodeValidation({
        status: 'valid',
        message: '有効な紹介コードです',
        codeId: data.id,
        referrerId: data.user_id
      });
    } catch (error) {
      console.error('Error validating referral code:', error);
      setCodeValidation({
        status: 'invalid',
        message: 'コードの検証中にエラーが発生しました'
      });
    }
  }, []);

  // Debounce紹介コード検証
  useEffect(() => {
    const timer = setTimeout(() => {
      if (referralCode) {
        validateReferralCode(referralCode);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [referralCode, validateReferralCode]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Clean up any existing auth state first
      try {
        await supabase.auth.signOut({ scope: 'global' });
      } catch (err) {
        // Continue even if this fails
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      if (data.user) {
        toast({
          title: "おかえりなさい！",
          description: "正常にログインしました。",
        });
        // Redirect to role-based routing
        window.location.href = "/redirect";
      }
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        title: "ログインに失敗しました",
        description: err.message || "認証情報を確認して再試行してください。",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({
        title: "パスワードが一致しません",
        description: "両方のパスワードが同じであることを確認してください。",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "パスワードが短すぎます",
        description: "パスワードは6文字以上である必要があります。",
        variant: "destructive",
      });
      return;
    }

    // 紹介コード検証
    if (referralCode && codeValidation.status !== 'valid') {
      toast({
        title: "無効な紹介コードです",
        description: codeValidation.message || "紹介コードを確認してください。",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Clean up any existing auth state first
      try {
        await supabase.auth.signOut({ scope: 'global' });
      } catch (err) {
        // Continue even if this fails
      }

      const redirectUrl = `${window.location.origin}/redirect`;

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName,
            referral_code_used: referralCode && codeValidation.status === 'valid' ? referralCode.toUpperCase() : undefined,
          }
        }
      });

      if (error) {
        throw error;
      }

      // 紹介関係はデータベーストリガーで自動的に記録されます
      // referral_code_usedがprofilesテーブルに保存され、トリガーが紹介関係を作成します

      toast({
        title: "アカウントが正常に作成されました！",
        description: referralCode
          ? "アカウントを確認するためにメールをチェックしてください。紹介コードが適用されました！"
          : "アカウントを確認するためにメールをチェックしてください。",
      });

      // If email confirmation is disabled, redirect immediately
      if (data.user && data.session) {
        window.location.href = "/redirect";
      }

    } catch (error: unknown) {
      const err = error as Error;
      toast({
        title: "登録に失敗しました",
        description: err.message || "再試行してください。",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pt-20 flex items-center justify-center bg-white">
      <div className="container mx-auto px-6 py-12 max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-light mb-2 text-gray-900">
            <span className="text-primary font-medium">{PLATFORM_NAME}</span>へようこそ
          </h1>
          <p className="text-gray-600">
            アカウントにログインするか、新しいアカウントを作成してください
          </p>
        </div>

        <Card className="bg-white border border-gray-200 shadow-lg rounded-2xl">
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">ログイン</TabsTrigger>
              <TabsTrigger value="signup">新規登録</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <CardHeader>
                <CardTitle className="text-gray-900 text-base font-semibold">ログイン</CardTitle>
                <CardDescription className="text-gray-600">
                  アカウントにアクセスするために認証情報を入力してください
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-gray-900 font-medium">メールアドレス</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="your@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10 border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-gray-900 font-medium">パスワード</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="パスワード"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 pr-10 border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary"
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-gray-50"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-gray-400" />
                        ) : (
                          <Eye className="h-4 w-4 text-gray-400" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-gray-900 text-white hover:bg-gray-800 rounded-xl py-3 font-medium transition-all duration-300 hover:scale-[1.02]"
                    disabled={loading}
                  >
                    {loading ? "ログイン中..." : "ログイン"}
                  </Button>
                  <div className="text-right">
                    <Button type="button" variant="link" className="px-0 text-gray-600 hover:text-gray-900" onClick={async () => {
                      if (!email) { toast({ title: 'メールを入力', description: 'リセットリンクを送るため、メールを入力してください' }); return; }
                      try {
                        const redirectTo = `${window.location.origin}/auth/reset`;
                        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
                        if (error) throw error;
                        toast({ title: '送信しました', description: 'パスワード再設定メールを送信しました' });
                      } catch (e: unknown) {
                        const err = e as Error;
                        toast({ title: '送信に失敗', description: err.message || 'しばらくしてからお試しください', variant: 'destructive' });
                      }
                    }}>パスワードをお忘れですか？</Button>
                  </div>
                </form>
              </CardContent>
            </TabsContent>

            <TabsContent value="signup">
              {!SERVICE_RESTRICTIONS.isRegistrationEnabled() ? (
                // サービス制限中のメッセージ表示
                <>
                  <CardHeader>
                    <CardTitle className="text-gray-900 text-base font-semibold flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-yellow-600" />
                      新規登録の一時停止
                    </CardTitle>
                    <CardDescription className="text-gray-600">
                      現在、新規ユーザー登録を一時的に停止しております
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <h4 className="font-semibold text-gray-900 mb-2">お知らせ</h4>
                        <div className="text-sm text-gray-700 space-y-2 whitespace-pre-line">
                          {SERVICE_RESTRICTIONS.getRestrictionMessage()}
                        </div>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <h4 className="font-semibold text-gray-900 mb-2">既存ユーザーの皆様へ</h4>
                        <p className="text-sm text-gray-700">
                          既にアカウントをお持ちの方は、ログインタブから通常通りログインいただけます。
                          出金機能をはじめ、すべてのサービスを引き続きご利用いただけます。
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </>
              ) : (
                // 通常の新規登録フォーム
                <>
                  <CardHeader>
                    <CardTitle className="text-gray-900 text-base font-semibold">アカウント作成</CardTitle>
                    <CardDescription className="text-gray-600">
                      {PLATFORM_NAME}に参加して暗号通貨取引を始めましょう
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullName" className="text-gray-900 font-medium">氏名</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="fullName"
                        type="text"
                        placeholder="お名前"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="pl-10 border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-email" className="text-gray-900 font-medium">メールアドレス</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="your@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10 border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-password" className="text-gray-900 font-medium">パスワード</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="signup-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="パスワードを作成"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 pr-10 border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary"
                        required
                        minLength={6}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-gray-50"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-gray-400" />
                        ) : (
                          <Eye className="h-4 w-4 text-gray-400" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password" className="text-gray-900 font-medium">パスワード確認</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="confirm-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="パスワードを確認"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="pl-10 border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary"
                        required
                      />
                    </div>
                  </div>

                  {/* 紹介コードフィールド */}
                  <div className="space-y-2">
                    <Label htmlFor="referral-code" className="text-gray-900 font-medium flex items-center gap-2">
                      <Gift className="h-4 w-4 text-primary" />
                      紹介コード（任意）
                    </Label>
                    <div className="relative">
                      <Input
                        id="referral-code"
                        type="text"
                        placeholder="紹介コードを入力"
                        value={referralCode}
                        onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                        className={`pl-4 pr-10 border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary ${
                          codeValidation.status === 'valid' ? 'border-green-300 bg-green-50' :
                          codeValidation.status === 'invalid' ? 'border-red-300 bg-red-50' : ''
                        }`}
                      />
                      {codeValidation.status === 'valid' && (
                        <CheckCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-green-600" />
                      )}
                      {codeValidation.status === 'invalid' && (
                        <XCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-red-600" />
                      )}
                    </div>
                    {codeValidation.status !== 'idle' && (
                      <p className={`text-xs ${
                        codeValidation.status === 'valid' ? 'text-green-600' :
                        codeValidation.status === 'invalid' ? 'text-red-600' :
                        'text-gray-500'
                      }`}>
                        {codeValidation.message}
                      </p>
                    )}
                    <p className="text-xs text-gray-500">
                      紹介コードを入力すると、登録後に特典を受け取れます
                    </p>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-gray-900 text-white hover:bg-gray-800 rounded-xl py-3 font-medium transition-all duration-300 hover:scale-[1.02]"
                    disabled={loading}
                  >
                    {loading ? "アカウント作成中..." : "アカウント作成"}
                  </Button>
                </form>
                  </CardContent>
                </>
              )}
            </TabsContent>
          </Tabs>
        </Card>

        <div className="text-center mt-6">
          <Button variant="link" className="text-gray-600 hover:text-gray-900" onClick={() => navigate("/")}>
            ホームに戻る
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Auth;