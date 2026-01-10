import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation('auth');
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

    setCodeValidation({ status: 'checking', message: t('referral.checking') });

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
          message: t('referral.notFound')
        });
        return;
      }

      setCodeValidation({
        status: 'valid',
        message: t('referral.valid'),
        codeId: data.id,
        referrerId: data.user_id
      });
    } catch (error) {
      console.error('Error validating referral code:', error);
      setCodeValidation({
        status: 'invalid',
        message: t('referral.error')
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
          title: t('toast.welcomeBack'),
          description: t('toast.loginSuccess'),
        });
        // Redirect to role-based routing
        window.location.href = "/redirect";
      }
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        title: t('toast.loginFailed'),
        description: err.message || t('toast.checkCredentials'),
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
        title: t('toast.passwordMismatch'),
        description: t('toast.passwordMismatchDesc'),
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: t('toast.passwordTooShort'),
        description: t('toast.passwordTooShortDesc'),
        variant: "destructive",
      });
      return;
    }

    // 紹介コード検証
    if (referralCode && codeValidation.status !== 'valid') {
      toast({
        title: t('toast.invalidReferral'),
        description: codeValidation.message || t('toast.tryAgain'),
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
        title: t('toast.accountCreated'),
        description: referralCode
          ? t('toast.checkEmailWithReferral')
          : t('toast.checkEmail'),
      });

      // If email confirmation is disabled, redirect immediately
      if (data.user && data.session) {
        window.location.href = "/redirect";
      }

    } catch (error: unknown) {
      const err = error as Error;
      toast({
        title: t('toast.signupFailed'),
        description: err.message || t('toast.tryAgain'),
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
            {t('welcome', { platform: PLATFORM_NAME })}
          </h1>
          <p className="text-gray-600">
            {t('subtitle')}
          </p>
        </div>

        <Card className="bg-white border border-gray-200 shadow-lg rounded-2xl">
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">{t('signin.tab')}</TabsTrigger>
              <TabsTrigger value="signup">{t('signup.tab')}</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <CardHeader>
                <CardTitle className="text-gray-900 text-base font-semibold">{t('signin.title')}</CardTitle>
                <CardDescription className="text-gray-600">
                  {t('signin.subtitle')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-gray-900 font-medium">{t('fields.email')}</Label>
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
                    <Label htmlFor="password" className="text-gray-900 font-medium">{t('fields.password')}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder={t('fields.password')}
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
                    {loading ? t('signin.loading') : t('signin.button')}
                  </Button>
                  <div className="text-right">
                    <Button type="button" variant="link" className="px-0 text-gray-600 hover:text-gray-900" onClick={async () => {
                      if (!email) { toast({ title: t('toast.enterEmail'), description: t('toast.enterEmailDesc') }); return; }
                      try {
                        const redirectTo = `${window.location.origin}/auth/reset`;
                        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
                        if (error) throw error;
                        toast({ title: t('toast.emailSent'), description: t('toast.emailSentDesc') });
                      } catch (e: unknown) {
                        const err = e as Error;
                        toast({ title: t('toast.sendFailed'), description: err.message || t('toast.tryLater'), variant: 'destructive' });
                      }
                    }}>{t('signin.forgotPassword')}</Button>
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
                      {t('restriction.title')}
                    </CardTitle>
                    <CardDescription className="text-gray-600">
                      {t('restriction.subtitle')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <h4 className="font-semibold text-gray-900 mb-2">{t('restriction.notice')}</h4>
                        <div className="text-sm text-gray-700 space-y-2 whitespace-pre-line">
                          {SERVICE_RESTRICTIONS.getRestrictionMessage()}
                        </div>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <h4 className="font-semibold text-gray-900 mb-2">{t('restriction.existingUsers')}</h4>
                        <p className="text-sm text-gray-700">
                          {t('restriction.existingUsersDesc')}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </>
              ) : (
                // 通常の新規登録フォーム
                <>
                  <CardHeader>
                    <CardTitle className="text-gray-900 text-base font-semibold">{t('signup.title')}</CardTitle>
                    <CardDescription className="text-gray-600">
                      {t('signup.subtitle', { platform: PLATFORM_NAME })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullName" className="text-gray-900 font-medium">{t('fields.fullName')}</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="fullName"
                        type="text"
                        placeholder={t('fields.fullNamePlaceholder')}
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="pl-10 border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-email" className="text-gray-900 font-medium">{t('fields.email')}</Label>
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
                    <Label htmlFor="signup-password" className="text-gray-900 font-medium">{t('fields.password')}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="signup-password"
                        type={showPassword ? "text" : "password"}
                        placeholder={t('fields.passwordPlaceholder')}
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
                    <Label htmlFor="confirm-password" className="text-gray-900 font-medium">{t('fields.confirmPassword')}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="confirm-password"
                        type={showPassword ? "text" : "password"}
                        placeholder={t('fields.confirmPasswordPlaceholder')}
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
                      {t('fields.referralCode')}
                    </Label>
                    <div className="relative">
                      <Input
                        id="referral-code"
                        type="text"
                        placeholder={t('fields.referralCodePlaceholder')}
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
                      {t('referral.hint')}
                    </p>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-gray-900 text-white hover:bg-gray-800 rounded-xl py-3 font-medium transition-all duration-300 hover:scale-[1.02]"
                    disabled={loading}
                  >
                    {loading ? t('signup.loading') : t('signup.button')}
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
            {t('backToHome')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Auth;