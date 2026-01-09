import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Users, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useReferralInfo } from "@/hooks/use-referral-info";

const Referral = () => {
  const { toast } = useToast();
  const { referralInfo, loading, error, creating, createReferralCode } = useReferralInfo();
  const [referralLink, setReferralLink] = useState("");

  // 紹介リンク生成
  useEffect(() => {
    if (referralInfo?.code) {
      const baseUrl = window.location.origin;
      setReferralLink(`${baseUrl}/auth?ref=${referralInfo.code}`);
    }
  }, [referralInfo]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "コピーしました",
      description: "クリップボードにコピーされました。",
    });
  };

  // メールアドレスをマスク表示
  const maskEmail = (email: string) => {
    const [local, domain] = email.split('@');
    if (local.length <= 2) return email;
    return `${local.substring(0, 2)}***@${domain}`;
  };

  // 紹介コード作成ハンドラー
  const handleCreateCode = async () => {
    const success = await createReferralCode();
    if (success) {
      toast({
        title: "紹介コードを作成しました",
        description: "紹介コードが正常に作成されました。",
      });
    } else {
      toast({
        title: "作成に失敗しました",
        description: error || "紹介コードの作成に失敗しました。",
        variant: "destructive",
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-2 md:space-y-2">
        <div>
          <h1 className="text-2xl md:text-2xl font-bold">紹介プログラム</h1>
          <p className="text-sm text-muted-foreground mt-1">
            友達を招待して、プラットフォームを一緒に利用しましょう
          </p>
        </div>

        {/* Stats Card */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-2">
          <Card className="bg-card border border-border">
            <CardContent className="p-2 md:p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">紹介した人数</span>
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-xl md:text-2xl font-bold">
                {loading ? '...' : referralInfo?.totalReferrals || 0}名
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                登録完了したユーザー数
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Referral Code Section */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">あなたの紹介コード</CardTitle>
            <CardDescription className="text-xs">
              以下のリンクまたはコードを友達と共有してください
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-2">
            {loading ? (
              <div className="text-center py-3 text-sm text-muted-foreground">読み込み中...</div>
            ) : error ? (
              <div className="text-center py-3 text-sm text-destructive">
                エラーが発生しました: {error}
              </div>
            ) : referralInfo?.code ? (
              <>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    紹介リンク
                  </label>
                  <div className="flex gap-2">
                    <Input
                      value={referralLink}
                      readOnly
                      className="flex-1 text-sm h-9"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(referralLink)}
                      className="h-9 px-3"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    紹介コード
                  </label>
                  <div className="flex gap-2">
                    <Input
                      value={referralInfo.code}
                      readOnly
                      className="flex-1 text-base font-mono font-bold h-9"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(referralInfo.code)}
                      className="h-9 px-3"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    新規登録時にこのコードを入力してもらうことで、紹介関係が記録されます
                  </p>
                </div>
              </>
            ) : (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground mb-3">
                  紹介コードがまだ作成されていません。
                </p>
                <Button
                  onClick={handleCreateCode}
                  disabled={creating}
                  size="sm"
                  className="min-w-[160px]"
                >
                  {creating ? '作成中...' : '紹介コードを作成'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Referrals List */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">紹介したユーザー</CardTitle>
            <CardDescription className="text-xs">あなたが紹介したユーザーの一覧</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">番号</TableHead>
                  <TableHead className="text-xs">ユーザー</TableHead>
                  <TableHead className="text-xs">登録日</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-6 text-sm">
                      読み込み中...
                    </TableCell>
                  </TableRow>
                ) : referralInfo && referralInfo.referralList.length > 0 ? (
                  referralInfo.referralList.map((referral, index) => (
                    <TableRow key={referral.id}>
                      <TableCell className="text-sm py-2">{index + 1}</TableCell>
                      <TableCell className="font-mono text-xs py-2">
                        {referral.userHandle || maskEmail(referral.email)}
                      </TableCell>
                      <TableCell className="text-xs py-2">
                        {new Date(referral.createdAt).toLocaleDateString('ja-JP', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit'
                        })}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-6">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Search className="h-4 w-4" />
                        <span className="text-sm">まだ紹介したユーザーはいません</span>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Program Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">紹介プログラムについて</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-2">
            <div className="flex items-start gap-2">
              <div className="bg-primary/10 rounded-full p-1.5 shrink-0">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-0.5">紹介の方法</h3>
                <p className="text-xs text-muted-foreground">
                  あなたの紹介リンクまたは紹介コードを友達に共有してください。<br />
                  友達が新規登録時にコードを入力すると、紹介関係が記録されます。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Referral;
