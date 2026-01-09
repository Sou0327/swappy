import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const ResetPassword = () => {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Ensure we have a session from the recovery link
    supabase.auth.getSession().then(({ data }) => {
      setReady(true);
      if (!data.session) {
        toast({ title: "リンクが無効です", description: "再度メールからお試しください", variant: "destructive" });
      }
    });
  }, [toast]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { toast({ title: "短すぎるパスワード", description: "6文字以上にしてください", variant: "destructive" }); return; }
    if (password !== confirm) { toast({ title: "不一致", description: "確認用パスワードが一致しません", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: "更新しました", description: "パスワードを変更しました" });
      window.location.href = "/redirect";
    } catch (e: unknown) {
      const error = e as Error;
      toast({ title: "更新失敗", description: error.message || 'もう一度お試しください', variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen pt-20 flex items-center justify-center">
      <div className="container max-w-md px-6">
        <Card>
          <CardHeader>
            <CardTitle>パスワード再設定</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <div>
                <label className="text-sm">新しいパスワード</label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </div>
              <div>
                <label className="text-sm">確認</label>
                <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} />
              </div>
              <Button type="submit" disabled={!ready || submitting} className="w-full">{submitting ? '更新中...' : '更新する'}</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;

