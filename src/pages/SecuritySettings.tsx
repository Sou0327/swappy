import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Shield, Mail, FileText, AlertTriangle, Key, UserCheck, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const SecuritySettings = () => {
  const { t } = useTranslation('security');
  const { user } = useAuth();
  const { toast } = useToast();
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!user?.id) return;
      // no-op
    };
    load();
  }, [user?.id]);

  const securityOptions = [
    {
      icon: Shield,
      title: "二要素認証 (2FA)",
      description: "二要素認証は強化されたセキュリティ対策です。有効にすると、ログイン時に2つのタイプの識別が必要になります。",
      subItem: {
        icon: "🛡️",
        title: "Google認証 (推奨)",
        description: "アカウントログイン、出金などの確認に使用。",
        action: "有効",
        variant: "default" as const
      }
    },
    {
      icon: Mail,
      title: "メール確認",
      description: "",
      subItem: {
        icon: "✉️",
        title: "メール確認",
        description: `このメールをログイン、パスワード回復、出金確認に使用してください。`,
        email: user?.email,
        verified: true,
        action: "有効",
        variant: "default" as const
      }
    }
  ];

  const identityOptions = [
    {
      icon: FileText,
      title: "KYC確認",
      description: "より良い使用と利用性のためにKYCを提出してください。",
      action: "表示",
      variant: "outline" as const
    },
    {
      icon: AlertTriangle,
      title: "フィッシング対策コード",
      description: "フィッシング対策コードを設定することで、通知メールが当サイトからのものか、フィッシング攻撃かを判断できるようになります。",
      status: "未生成",
      statusColor: "destructive" as const,
      action: "生成",
      variant: "default" as const
    },
    {
      icon: Key,
      title: "回復キー (推奨)",
      description: "PassPhraseを保存",
      action: "有効",
      variant: "default" as const
    },
    {
      icon: Lock,
      title: "ログインパスワード",
      description: "これにより、アカウントを安全で安心に保つことができます。",
      action: "変更",
      variant: "outline" as const
    },
    {
      icon: UserCheck,
      title: "アカウント凍結",
      description: "",
      action: "凍結",
      variant: "destructive" as const
    }
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl md:text-2xl font-bold text-gray-900">{t('pageTitle')}</h1>
        </div>

        {/* 二要素認証・メール確認は本フェーズ対象外 */}

        {/* Identity Verification Section */}
        <div>

          <div className="space-y-4">
            {/* KYCは非導入方針のためUI非表示 */}

            {/* フィッシング対策コード・回復キーは対象外 */}

            <Card>
              <CardContent className="p-4 md:p-6">
                {/* Desktop Layout */}
                <div className="hidden md:flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-primary/10 rounded-lg">
                      <Lock className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{t('password.title')}</h3>
                      <p className="text-sm text-muted-foreground">
                        {t('password.descriptionSecure')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input className="w-48" type="password" placeholder={t('password.new')} value={pw1} onChange={(e) => setPw1(e.target.value)} />
                    <Input className="w-48" type="password" placeholder={t('password.confirmShort')} value={pw2} onChange={(e) => setPw2(e.target.value)} />
                    <Button variant="outline" className="border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-all duration-200 active:scale-95" disabled={saving} onClick={async () => {
                      if (pw1.length < 6) { toast({ title: t('toast.tooShort'), description: t('toast.tooShortDesc'), variant: 'destructive' }); return; }
                      if (pw1 !== pw2) { toast({ title: t('toast.mismatch'), description: t('toast.mismatchDesc'), variant: 'destructive' }); return; }
                      setSaving(true);
                      try {
                        const { error } = await supabase.auth.updateUser({ password: pw1 });
                        if (error) throw error;
                        toast({ title: t('toast.updated'), description: t('toast.updatedDesc') });
                        setPw1(''); setPw2('');
                      } catch (e: unknown) {
                        const error = e as Error;
                        toast({ title: t('toast.updateFailed'), description: error.message || t('toast.updateFailedDesc'), variant: 'destructive' });
                      } finally {
                        setSaving(false);
                      }
                    }}>
                      {saving ? t('password.updating') : t('password.changeShort')}
                    </Button>
                  </div>
                </div>

                {/* Mobile Layout */}
                <div className="md:hidden space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-primary/10 rounded-lg flex-shrink-0">
                      <Lock className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-base">{t('password.title')}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {t('password.descriptionSecure')}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Input
                      type="password"
                      placeholder={t('password.new')}
                      value={pw1}
                      onChange={(e) => setPw1(e.target.value)}
                      className="w-full"
                    />
                    <Input
                      type="password"
                      placeholder={t('password.confirmPassword')}
                      value={pw2}
                      onChange={(e) => setPw2(e.target.value)}
                      className="w-full"
                    />
                    <Button
                      variant="outline"
                      className="w-full border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-all duration-200 active:scale-95"
                      disabled={saving}
                      onClick={async () => {
                        if (pw1.length < 6) { toast({ title: t('toast.tooShort'), description: t('toast.tooShortDesc'), variant: 'destructive' }); return; }
                        if (pw1 !== pw2) { toast({ title: t('toast.mismatch'), description: t('toast.mismatchDesc'), variant: 'destructive' }); return; }
                        setSaving(true);
                        try {
                          const { error } = await supabase.auth.updateUser({ password: pw1 });
                          if (error) throw error;
                          toast({ title: t('toast.updated'), description: t('toast.updatedDesc') });
                          setPw1(''); setPw2('');
                        } catch (e: unknown) {
                          const error = e as Error;
                          toast({ title: t('toast.updateFailed'), description: error.message || t('toast.updateFailedDesc'), variant: 'destructive' });
                        } finally {
                          setSaving(false);
                        }
                      }}
                    >
                      {saving ? t('password.updating') : t('password.changePassword')}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 md:p-6">
                {/* Desktop Layout */}
                <div className="hidden md:flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-red-100 rounded-lg">
                      <span className="text-2xl">🧊</span>
                    </div>
                    <div>
                      <h3 className="font-semibold">{t('accountFreeze.title')}</h3>
                      <p className="text-sm text-muted-foreground">
                        {t('accountFreeze.descriptionShort')}
                      </p>
                    </div>
                  </div>
                  <Button variant="destructive" className="transition-all duration-200 active:scale-95">
                    {t('accountFreeze.freezeShort')}
                  </Button>
                </div>

                {/* Mobile Layout */}
                <div className="md:hidden space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-red-100 rounded-lg flex-shrink-0">
                      <span className="text-base">🧊</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-base">{t('accountFreeze.title')}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {t('accountFreeze.descriptionShort')}
                      </p>
                    </div>
                  </div>
                  <Button variant="destructive" className="w-full transition-all duration-200 active:scale-95">
                    {t('accountFreeze.freezeAccount')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default SecuritySettings;
