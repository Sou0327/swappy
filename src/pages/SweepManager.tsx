import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AdminWalletForm from '@/components/sweep/AdminWalletForm';
import BalanceAggregator from '@/components/sweep/BalanceAggregator';
import SweepJobList from '@/components/sweep/SweepJobList';
import { Wallet, BarChart3, ListChecks } from 'lucide-react';

const SweepManager: React.FC = () => {
  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
      {/* ページヘッダー */}
      <div>
        <h1 className="text-3xl font-bold">スイープ管理</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          入金アドレスから管理ウォレットへの資金移動管理
        </p>
      </div>

      {/* タブインターフェース */}
      <Tabs defaultValue="wallet" className="w-full">
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-flex">
          <TabsTrigger value="wallet" className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            <span className="hidden sm:inline">管理ウォレット設定</span>
            <span className="sm:hidden">設定</span>
          </TabsTrigger>
          <TabsTrigger value="balance" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">残高ダッシュボード</span>
            <span className="sm:hidden">残高</span>
          </TabsTrigger>
          <TabsTrigger value="jobs" className="flex items-center gap-2">
            <ListChecks className="h-4 w-4" />
            <span className="hidden sm:inline">スイープジョブ</span>
            <span className="sm:hidden">ジョブ</span>
          </TabsTrigger>
        </TabsList>

        {/* 管理ウォレット設定タブ */}
        <TabsContent value="wallet" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>管理ウォレット登録</CardTitle>
              <CardDescription>
                スイープ先となる管理ウォレットのアドレスを登録します
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AdminWalletForm />
            </CardContent>
          </Card>
        </TabsContent>

        {/* 残高ダッシュボードタブ */}
        <TabsContent value="balance" className="mt-6">
          <BalanceAggregator />
        </TabsContent>

        {/* スイープジョブタブ */}
        <TabsContent value="jobs" className="mt-6">
          <SweepJobList />
        </TabsContent>
      </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default SweepManager;
