import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, RefreshCw, AlertCircle, Coins } from 'lucide-react';

// 型定義
interface BalanceInfo {
  address: string;
  balance: string;
  chain: string;
  network: string;
  asset: string;
  user_id: string;
  error?: string;
}

interface BalanceSummary {
  chain: string;
  network: string;
  asset: string;
  totalBalance: string;
  addressCount: number;
}

interface BalanceAggregatorResponse {
  success: boolean;
  balances: BalanceInfo[];
  summary: BalanceSummary | null;
  message?: string;
}

const BalanceAggregator: React.FC = () => {
  const { toast } = useToast();
  const [selectedChain, setSelectedChain] = React.useState<string>('evm');
  const [selectedNetwork, setSelectedNetwork] = React.useState<string>('ethereum');
  const [selectedAsset, setSelectedAsset] = React.useState<string>('ETH');

  // 残高データ取得
  const {
    data,
    isLoading,
    error,
    refetch,
    isFetching
  } = useQuery<BalanceAggregatorResponse>({
    queryKey: ['balance-aggregator', selectedChain, selectedNetwork, selectedAsset],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('balance-aggregator', {
        body: {
          chain: selectedChain,
          network: selectedNetwork,
          asset: selectedAsset
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || '残高取得に失敗しました');

      return data as BalanceAggregatorResponse;
    },
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // 最新化ボタンクリック
  const handleRefresh = () => {
    refetch();
    toast({
      title: '最新化中',
      description: '残高データを更新しています...',
    });
  };

  // アドレスを短縮表示
  const shortenAddress = (address: string): string => {
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // ローディング状態
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center space-x-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p>読み込み中...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // エラー状態
  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              エラーが発生しました: {error.message}
            </AlertDescription>
          </Alert>
          <Button onClick={handleRefresh} variant="outline" className="mt-4">
            <RefreshCw className="mr-2 h-4 w-4" />
            再試行
          </Button>
        </CardContent>
      </Card>
    );
  }

  const balances = data?.balances || [];
  const summary = data?.summary;

  return (
    <div className="space-y-6">
      {/* サマリーカード */}
      {summary && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5" />
              残高サマリー
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-500">合計残高</p>
                <p className="text-2xl font-bold">{summary.totalBalance} {summary.asset}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">アドレス数</p>
                <p className="text-2xl font-bold">{summary.addressCount} アドレス</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">ネットワーク</p>
                <p className="text-lg font-semibold">
                  {summary.chain.toUpperCase()} / {summary.network}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* フィルタとアクション */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>オンチェーン残高一覧</CardTitle>
              <CardDescription>
                deposit_addressesの実際のブロックチェーン残高
              </CardDescription>
            </div>
            <Button
              onClick={handleRefresh}
              variant="outline"
              size="sm"
              disabled={isFetching}
            >
              {isFetching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              最新化
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* フィルタ */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">チェーン</label>
              <Select value={selectedChain} onValueChange={setSelectedChain}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="evm">EVM</SelectItem>
                  <SelectItem value="btc">Bitcoin</SelectItem>
                  <SelectItem value="trc">Tron</SelectItem>
                  <SelectItem value="xrp">XRP</SelectItem>
                  <SelectItem value="ada">Cardano</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">ネットワーク</label>
              <Select value={selectedNetwork} onValueChange={setSelectedNetwork}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {selectedChain === 'evm' && (
                    <>
                      <SelectItem value="ethereum">Ethereum Mainnet</SelectItem>
                      <SelectItem value="sepolia">Sepolia Testnet</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">アセット</label>
              <Select value={selectedAsset} onValueChange={setSelectedAsset}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {selectedChain === 'evm' && (
                    <>
                      <SelectItem value="ETH">ETH</SelectItem>
                      <SelectItem value="USDT">USDT</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* データテーブル */}
          {balances.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                入金アドレスが見つかりませんでした。{data?.message}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>アドレス</TableHead>
                    <TableHead>残高</TableHead>
                    <TableHead>チェーン</TableHead>
                    <TableHead>ネットワーク</TableHead>
                    <TableHead>ステータス</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balances.map((balance, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-mono text-sm">
                        {shortenAddress(balance.address)}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {balance.balance} {balance.asset}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{balance.chain.toUpperCase()}</Badge>
                      </TableCell>
                      <TableCell>{balance.network}</TableCell>
                      <TableCell>
                        {balance.error ? (
                          <Badge variant="destructive">エラー: {balance.error}</Badge>
                        ) : parseFloat(balance.balance) > 0 ? (
                          <Badge variant="default">残高あり</Badge>
                        ) : (
                          <Badge variant="secondary">空</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BalanceAggregator;
