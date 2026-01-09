import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, TrendingUp, Code, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { useAdminReferrals } from "@/hooks/use-admin-referrals";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const AdminReferrals = () => {
  const {
    stats,
    referrals,
    topReferrers,
    loading,
    error,
    refresh,
    currentPage,
    pageSize,
    totalCount,
    totalPages,
    goToPage,
    changePageSize
  } = useAdminReferrals();

  return (
    <DashboardLayout>
      <div className="space-y-2 md:space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-2xl font-bold">紹介コード管理</h1>
            <p className="text-sm text-muted-foreground mt-1">
              紹介コードと紹介関係の統計・管理
            </p>
          </div>
          <Button onClick={refresh} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`h-3 w-3 mr-2 ${loading ? 'animate-spin' : ''}`} />
            更新
          </Button>
        </div>

        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-4 pb-4">
              <p className="text-sm text-destructive text-center">エラー: {error}</p>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-2">
          <Card className="bg-card border border-border">
            <CardContent className="p-2 md:p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">発行済み紹介コード</span>
                <Code className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-xl md:text-2xl font-bold">
                {loading ? '...' : stats?.totalCodes || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                アクティブなコード数
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border border-border">
            <CardContent className="p-2 md:p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">総紹介数</span>
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-xl md:text-2xl font-bold">
                {loading ? '...' : stats?.totalReferrals || 0}名
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                紹介により登録したユーザー
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border border-border">
            <CardContent className="p-2 md:p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">平均紹介数</span>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-xl md:text-2xl font-bold">
                {loading
                  ? '...'
                  : stats?.totalCodes && stats?.totalCodes > 0
                    ? (stats.totalReferrals / stats.totalCodes).toFixed(1)
                    : '0.0'
                }
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                1コードあたりの紹介数
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Top Referrers */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">トップ紹介者</CardTitle>
            <CardDescription className="text-xs">紹介数の多いユーザー TOP10</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16 text-xs whitespace-nowrap">順位</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">ユーザー</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">紹介コード</TableHead>
                  <TableHead className="text-right text-xs whitespace-nowrap">紹介数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-sm">
                      読み込み中...
                    </TableCell>
                  </TableRow>
                ) : topReferrers && topReferrers.length > 0 ? (
                  topReferrers.map((referrer, index) => (
                    <TableRow key={referrer.userId}>
                      <TableCell className="text-sm font-medium py-2 whitespace-nowrap">
                        {index === 0 && '🥇'}
                        {index === 1 && '🥈'}
                        {index === 2 && '🥉'}
                        {index > 2 && `${index + 1}`}
                      </TableCell>
                      <TableCell className="font-mono text-xs py-2">
                        <div className="truncate max-w-[200px]" title={referrer.userHandle || referrer.email}>
                          {referrer.userHandle || referrer.email}
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <Badge variant="outline" className="font-mono text-xs whitespace-nowrap">
                          {referrer.referralCode}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm font-bold py-2 whitespace-nowrap">
                        {referrer.referralCount}名
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-sm text-muted-foreground">
                      紹介データがありません
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Referrals List */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">紹介関係一覧</CardTitle>
            <CardDescription className="text-xs">
              全{totalCount}件の紹介関係
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">紹介者</TableHead>
                  <TableHead className="text-xs">被紹介者</TableHead>
                  <TableHead className="text-xs">紹介コード</TableHead>
                  <TableHead className="text-xs">登録日</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-sm">
                      読み込み中...
                    </TableCell>
                  </TableRow>
                ) : referrals && referrals.length > 0 ? (
                  referrals.map((referral) => (
                    <TableRow key={referral.id}>
                      <TableCell className="font-mono text-xs py-2">
                        {referral.referrerHandle || referral.referrerEmail}
                      </TableCell>
                      <TableCell className="font-mono text-xs py-2">
                        {referral.refereeHandle || referral.refereeEmail}
                      </TableCell>
                      <TableCell className="py-2">
                        <Badge variant="secondary" className="font-mono text-xs">
                          {referral.referralCode}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs py-2">
                        {new Date(referral.createdAt).toLocaleDateString('ja-JP', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-sm text-muted-foreground">
                      紹介データがありません
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalCount > 0 && (
              <div className="flex flex-col md:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>表示件数:</span>
                  <Select
                    value={pageSize.toString()}
                    onValueChange={(value) => changePageSize(Number(value))}
                  >
                    <SelectTrigger className="w-20 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1 || loading}
                    className="h-8 px-3"
                  >
                    <ChevronLeft className="h-3 w-3 mr-1" />
                    前へ
                  </Button>

                  <span className="text-xs text-muted-foreground">
                    {currentPage} / {totalPages}ページ
                  </span>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages || loading}
                    className="h-8 px-3"
                  >
                    次へ
                    <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>

                <div className="text-xs text-muted-foreground">
                  {(currentPage - 1) * pageSize + 1}〜
                  {Math.min(currentPage * pageSize, totalCount)}件 / 全{totalCount}件
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AdminReferrals;
