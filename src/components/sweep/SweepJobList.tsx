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
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Eye, AlertCircle } from 'lucide-react';
import SweepJobDetail from './SweepJobDetail';

// 型定義
interface SweepJob {
  id: string;
  deposit_id?: string;
  chain: string;
  network: string;
  asset: string;
  from_address: string;
  to_address: string;
  planned_amount: number;
  currency: string;
  status: 'planned' | 'signed' | 'broadcasted' | 'confirmed' | 'failed';
  unsigned_tx?: Record<string, unknown>;
  signed_tx?: string;
  tx_hash?: string;
  error_message?: string;
  created_at: string;
  updated_at?: string;
}

type StatusFilter = 'all' | 'planned' | 'signed' | 'broadcasted' | 'confirmed' | 'failed';

const SweepJobList: React.FC = () => {
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all');
  const [selectedJob, setSelectedJob] = React.useState<SweepJob | null>(null);

  // スイープジョブ取得
  const { data: jobs, isLoading, error } = useQuery<SweepJob[]>({
    queryKey: ['sweep-jobs', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('sweep_jobs')
        .select('*')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as SweepJob[];
    },
    refetchOnWindowFocus: false,
  });

  // アドレスを短縮表示
  const shortenAddress = (address: string): string => {
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // ステータスバッジの色
  const getStatusVariant = (status: SweepJob['status']) => {
    switch (status) {
      case 'planned':
        return 'secondary';
      case 'signed':
        return 'default';
      case 'broadcasted':
        return 'default';
      case 'confirmed':
        return 'default';
      case 'failed':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  // ステータスラベル
  const getStatusLabel = (status: SweepJob['status']) => {
    switch (status) {
      case 'planned':
        return '計画済み';
      case 'signed':
        return '署名済み';
      case 'broadcasted':
        return 'ブロードキャスト済み';
      case 'confirmed':
        return '確認済み';
      case 'failed':
        return '失敗';
      default:
        return status;
    }
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
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>スイープジョブ管理</CardTitle>
          <CardDescription>
            入金アドレスから管理ウォレットへの資金移動ジョブ
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* フィルタ */}
          <div className="mb-6">
            <label className="text-sm font-medium mb-2 block">ステータスフィルタ</label>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて</SelectItem>
                <SelectItem value="planned">計画済み</SelectItem>
                <SelectItem value="signed">署名済み</SelectItem>
                <SelectItem value="broadcasted">ブロードキャスト済み</SelectItem>
                <SelectItem value="confirmed">確認済み</SelectItem>
                <SelectItem value="failed">失敗</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* ジョブテーブル */}
          {!jobs || jobs.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                スイープジョブがありません
              </AlertDescription>
            </Alert>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>送信元</TableHead>
                    <TableHead>送信先</TableHead>
                    <TableHead>金額</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead>作成日時</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-mono text-xs">
                        {job.id.slice(0, 8)}...
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {shortenAddress(job.from_address)}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {shortenAddress(job.to_address)}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {job.planned_amount} {job.currency}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(job.status)}>
                          {getStatusLabel(job.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(job.created_at).toLocaleString('ja-JP')}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedJob(job)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          詳細
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 詳細ダイアログ */}
      {selectedJob && (
        <SweepJobDetail
          job={selectedJob}
          open={!!selectedJob}
          onClose={() => setSelectedJob(null)}
        />
      )}
    </>
  );
};

export default SweepJobList;
