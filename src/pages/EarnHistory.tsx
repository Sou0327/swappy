import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DashboardLayout from "@/components/DashboardLayout";
import { Info, Calendar } from "lucide-react";

const EarnHistory = () => {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">履歴を稼ぐ</h1>
        </div>

        {/* Earn Account Summary */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-muted-foreground">稼ぐアカウント</span>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-2xl font-bold">
                  $ 0.00 <span className="text-sm font-normal text-muted-foreground">≈ 0.00 BTC</span>
                </div>
              </div>
              <Button>マイ稼ぎ</Button>
            </div>
          </CardContent>
        </Card>

        {/* History Tabs */}
        <Tabs defaultValue="earn-history" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="earn-history">稼ぐ履歴</TabsTrigger>
            <TabsTrigger value="interest-history">利息履歴</TabsTrigger>
          </TabsList>

          <TabsContent value="earn-history" className="space-y-6">
            {/* Filter Controls */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <Input
                  type="text"
                  placeholder="開始日"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="pr-10"
                />
                <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="終了日"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="pr-10"
                />
                <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
              <Button>検索</Button>
              <Button variant="destructive">リセット</Button>
              <Select defaultValue="all">
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="すべて" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべて</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* History Table */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-4 font-medium">日付 & 時間</th>
                        <th className="text-left p-4 font-medium">コイン/トークン</th>
                        <th className="text-left p-4 font-medium">Txn ID</th>
                        <th className="text-left p-4 font-medium">ロック量</th>
                        <th className="text-left p-4 font-medium">期間 (日)</th>
                        <th className="text-left p-4 font-medium">利息</th>
                        <th className="text-left p-4 font-medium">受け取った利息</th>
                        <th className="text-left p-4 font-medium">推定利息</th>
                        <th className="text-left p-4 font-medium">リリース日</th>
                        <th className="text-left p-4 font-medium">ステータス</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Empty state */}
                    </tbody>
                  </table>
                </div>

                {/* No Records Message */}
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">🔍</div>
                  <p className="text-muted-foreground">記録が見つかりません</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="interest-history" className="space-y-6">
            {/* Filter Controls */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <Input
                  type="text"
                  placeholder="開始日"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="pr-10"
                />
                <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="終了日"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="pr-10"
                />
                <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
              <Button>検索</Button>
              <Button variant="destructive">リセット</Button>
              <Select defaultValue="all">
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="すべて" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべて</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Interest History Table */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-4 font-medium">日付 & 時間</th>
                        <th className="text-left p-4 font-medium">コイン/トークン</th>
                        <th className="text-left p-4 font-medium">利息</th>
                        <th className="text-left p-4 font-medium">ステータス</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Empty state */}
                    </tbody>
                  </table>
                </div>

                {/* No Records Message */}
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">🔍</div>
                  <p className="text-muted-foreground">記録が見つかりません</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default EarnHistory;