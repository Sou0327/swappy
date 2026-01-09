import { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DashboardLayout from "@/components/DashboardLayout";
import { Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface TradeRecord {
  id: string;
  market: string;
  side: 'buy' | 'sell';
  role: 'maker' | 'taker';
  price: number;
  qty: number;
  taker_fee: number;
  maker_fee: number;
  created_at: string;
}

interface DepositRecord {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  transaction_hash?: string;
  wallet_address?: string;
}

interface WithdrawalRecord {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  confirmed_at?: string;
  confirmed_by?: string;
  transaction_hash?: string;
  wallet_address?: string;
  notes?: string;
}

interface OrderRecord {
  id: string;
  user_id: string;
  market: string;
  side: 'buy' | 'sell';
  type: string;
  price: number;
  qty: number;
  filled_qty: number;
  status: string;
  created_at: string;
}

interface TransferRecord {
  id: string;
  from_user_id: string;
  to_user_id: string;
  from_user_handle: string;
  to_user_handle: string;
  amount: number;
  currency: string;
  reference_number: string;
  description?: string;
  status: 'pending' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
}

interface ConversionRecord {
  id: string;
  user_id: string;
  from_currency: string;
  to_currency: string;
  from_amount: number;
  to_amount: number;
  exchange_rate: number;
  status: 'pending' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
}

const FinancialHistory = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [active, setActive] = useState("deposit");

  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [openOrders, setOpenOrders] = useState<OrderRecord[]>([]);
  const [myOrders, setMyOrders] = useState<OrderRecord[]>([]);
  const [myTrades, setMyTrades] = useState<TradeRecord[]>([]);
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [conversions, setConversions] = useState<ConversionRecord[]>([]);
  const tradesPageSize = 50;
  const [tradesPage, setTradesPage] = useState(0);

  const loadDeposits = useCallback(async () => {
    if (!user) { setDeposits([]); return; }
    const { data } = await supabase
      .from('deposits')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    setDeposits(data || []);
  }, [user]);

  const loadWithdrawals = useCallback(async () => {
    if (!user) { setWithdrawals([]); return; }
    const { data } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    setWithdrawals(data || []);
  }, [user]);

  const loadOpenOrders = useCallback(async () => {
    if (!user) { setOpenOrders([]); return; }
    const { data } = await supabase
      .from('orders')
      .select('id, user_id, market, side, type, price, qty, filled_qty, status, created_at')
      .eq('user_id', user.id)
      .in('status', ['open', 'partially_filled'])
      .order('created_at', { ascending: false })
      .limit(200);
    setOpenOrders((data || []) as OrderRecord[]);
  }, [user]);

  const loadMyOrders = useCallback(async () => {
    if (!user) { setMyOrders([]); return; }
    const { data } = await supabase
      .from('orders')
      .select('id, user_id, market, side, type, price, qty, filled_qty, status, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200);
    setMyOrders((data || []) as OrderRecord[]);
  }, [user]);

  const loadMyTrades = useCallback(async () => {
    if (!user) { setMyTrades([]); return; }
    const fromIso = fromDate && !isNaN(new Date(fromDate).getTime()) ? new Date(fromDate).toISOString() : null;
    const toIso = toDate && !isNaN(new Date(toDate).getTime()) ? new Date(toDate).toISOString() : null;
    const { data, error } = await supabase.rpc('get_my_trades', { p_from: fromIso, p_to: toIso, p_offset: tradesPage * tradesPageSize, p_limit: tradesPageSize });
    if (!error) setMyTrades((data || []) as TradeRecord[]);
  }, [user, fromDate, toDate, tradesPage, tradesPageSize]);

  const loadTransfers = useCallback(async () => {
    if (!user) { setTransfers([]); return; }
    try {
      const { data: transfersData, error: transfersError } = await supabase
        .from('user_transfers')
        .select('*')
        .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(100);

      if (transfersError) throw transfersError;

      // Get user profiles for sender and receiver handles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, user_handle');

      if (profilesError) throw profilesError;

      const formattedTransfers = transfersData?.map(transfer => {
        const fromUser = profilesData?.find(p => p.id === transfer.from_user_id);
        const toUser = profilesData?.find(p => p.id === transfer.to_user_id);

        return {
          ...transfer,
          from_user_handle: fromUser?.user_handle || '不明',
          to_user_handle: toUser?.user_handle || '不明'
        };
      }) || [];

      setTransfers(formattedTransfers);
    } catch (error) {
      console.error('Error loading transfers:', error);
    }
  }, [user]);

  const loadConversions = useCallback(async () => {
    if (!user) { setConversions([]); return; }
    try {
      const { data, error } = await supabase
        .from('currency_conversions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setConversions(data || []);
    } catch (error) {
      console.error('Error loading conversions:', error);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadDeposits();
    loadWithdrawals();
    loadOpenOrders();
    loadMyOrders();
    loadMyTrades();
    loadTransfers();
    loadConversions();
  }, [loadDeposits, loadMyOrders, loadMyTrades, loadOpenOrders, loadWithdrawals, loadTransfers, loadConversions, user, user?.id]);

  useEffect(() => {
    if (active === 'my-trades') {
      loadMyTrades();
    }
  }, [active, tradesPage, fromDate, toDate, loadMyTrades]);

  const cancelOrder = async (id: string) => {
    try {
      const { error } = await supabase.rpc('cancel_order', { p_order_id: id });
      if (error) throw error;
      toast({ title: '取消成功', description: `注文 #${id.slice(0, 8)}… を取消しました。` });
      loadOpenOrders();
      loadMyOrders();
    } catch (e: unknown) {
      const error = e as Error;
      toast({ title: 'エラー', description: error.message || '取消に失敗しました', variant: 'destructive' });
    }
  };

  const cancelAllOpen = async () => {
    try {
      const { data, error } = await supabase.rpc('cancel_all_orders', { p_market: null });
      if (error) throw error;
      toast({ title: '一括取消', description: `${data || 0}件の注文を取消しました` });
      loadOpenOrders();
      loadMyOrders();
    } catch (e: unknown) {
      const error = e as Error;
      toast({ title: 'エラー', description: error.message || '一括取消に失敗しました', variant: 'destructive' });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl md:text-2xl font-bold text-gray-900">金融履歴</h1>
        </div>

        {/* History Tabs */}
        <Tabs defaultValue="deposit" className="w-full" onValueChange={(v) => setActive(v)}>
          {/* Desktop Tabs */}
          <TabsList className="hidden md:grid w-full grid-cols-7">
            <TabsTrigger value="deposit" className="text-primary">入金</TabsTrigger>
            <TabsTrigger value="withdraw">出金</TabsTrigger>
            <TabsTrigger value="transfer">送金</TabsTrigger>
            <TabsTrigger value="open-order">オープンオーダー</TabsTrigger>
            <TabsTrigger value="my-order">マイオーダー</TabsTrigger>
            <TabsTrigger value="my-trades">マイトレード</TabsTrigger>
            <TabsTrigger value="conversion">両替</TabsTrigger>
          </TabsList>

          {/* Mobile Tabs - Scrollable */}
          <div className="md:hidden">
            <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
              <TabsTrigger value="deposit" className="text-primary flex-shrink-0 text-sm px-3">入金</TabsTrigger>
              <TabsTrigger value="withdraw" className="flex-shrink-0 text-sm px-3">出金</TabsTrigger>
              <TabsTrigger value="transfer" className="flex-shrink-0 text-sm px-2">送金</TabsTrigger>
              <TabsTrigger value="open-order" className="flex-shrink-0 text-sm px-2">オープン</TabsTrigger>
              <TabsTrigger value="my-order" className="flex-shrink-0 text-sm px-2">マイ注文</TabsTrigger>
              <TabsTrigger value="my-trades" className="flex-shrink-0 text-sm px-2">取引</TabsTrigger>
              <TabsTrigger value="conversion" className="flex-shrink-0 text-sm px-2">両替</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="deposit" className="space-y-6">
            {/* Filter Controls */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 flex-1">
                <div className="relative">
                  <Input
                    type="text"
                    placeholder="開始日"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="pr-10"
                  />
                  <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-600" />
                </div>
                <div className="relative">
                  <Input
                    type="text"
                    placeholder="終了日"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="pr-10"
                  />
                  <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-600" />
                </div>
              </div>
              <div className="flex gap-2 sm:gap-4">
                <Button className="flex-1 sm:flex-none transition-all duration-200 active:scale-95">検索</Button>
                <Button variant="destructive" className="flex-1 sm:flex-none transition-all duration-200 active:scale-95">リセット</Button>
                <Select defaultValue="all">
                  <SelectTrigger className="w-full sm:w-32">
                    <SelectValue placeholder="すべて" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Deposit History Table */}
            <Card>
              <CardContent className="p-0">
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">日時</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">通貨</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">金額</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">アドレス/Tx</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">ステータス</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deposits.length === 0 ? (
                        <tr><td colSpan={5} className="text-center py-8 text-gray-600">記録が見つかりません</td></tr>
                      ) : deposits.map((d) => (
                        <tr key={d.id} className="border-b hover:bg-gray-100/40">
                          <td className="p-4 text-sm">{new Date(d.created_at).toLocaleString()}</td>
                          <td className="p-4 text-sm">{d.currency}</td>
                          <td className="p-4 text-sm">{Number(d.amount).toFixed(8)}</td>
                          <td className="p-4 font-mono text-xs">{d.wallet_address || '—'}{d.transaction_hash ? `/${d.transaction_hash.slice(0, 10)}…` : ''}</td>
                          <td className="p-4 text-sm">{d.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-3 p-3">
                  {deposits.length === 0 ? (
                    <div className="text-center py-8 text-gray-600">記録が見つかりません</div>
                  ) : deposits.map((d) => (
                    <Card key={d.id} className="hover:bg-accent/30 active:bg-accent/50 transition-all duration-200 active:scale-[0.98]">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="font-semibold text-base">{d.currency}</div>
                          <div className="px-2 py-1 bg-primary/10 text-primary rounded text-xs font-medium">
                            {d.status}
                          </div>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">日時:</span>
                            <span className="font-mono text-xs">
                              {new Date(d.created_at).toLocaleString('ja-JP', {
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">金額:</span>
                            <span className="font-mono text-sm font-semibold">
                              {Number(d.amount).toFixed(8)} {d.currency}
                            </span>
                          </div>
                          {(d.wallet_address || d.transaction_hash) && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Tx:</span>
                              <span className="font-mono text-xs">
                                {d.wallet_address?.slice(0, 10) || ''}…
                                {d.transaction_hash ? `/${d.transaction_hash.slice(0, 8)}…` : ''}
                              </span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          {/* My Trades */}
          <TabsContent value="my-trades" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>マイトレード</CardTitle>
                  <div className="text-sm text-gray-600">
                    {(() => {
                      const totalTrades = myTrades.length;
                      const totalQty = myTrades.reduce((s, t) => s + Number(t.qty || 0), 0);
                      const totalNotional = myTrades.reduce((s, t) => s + Number(t.qty || 0) * Number(t.price || 0), 0);
                      const totalFees = myTrades.reduce((s, t) => s + (t.role === 'taker' ? Number(t.taker_fee || 0) : Number(t.maker_fee || 0)), 0);
                      return `件数 ${totalTrades} / 量 ${totalQty.toFixed(6)} / 金額 ${totalNotional.toFixed(2)} / 手数料 ${totalFees.toFixed(6)}`;
                    })()}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">日時</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">ペア</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">サイド</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">ロール</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">価格</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">数量</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myTrades.length === 0 ? (
                        <tr><td colSpan={6} className="text-center py-8 text-gray-600">記録が見つかりません</td></tr>
                      ) : myTrades.map(t => (
                        <tr key={t.id} className="border-b hover:bg-gray-100/40">
                          <td className="p-4">{new Date(t.created_at).toLocaleString()}</td>
                          <td className="p-4">{String(t.market).replace('-', '/')}</td>
                          <td className="p-4">{t.side}</td>
                          <td className="p-4">{t.role}</td>
                          <td className="p-4">{t.price}</td>
                          <td className="p-4">{t.qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between p-4">
                  <div className="text-sm text-gray-600">ページ: {tradesPage + 1}</div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setTradesPage(p => Math.max(0, p - 1))} disabled={tradesPage === 0}>前へ</Button>
                    <Button size="sm" variant="outline" onClick={() => setTradesPage(p => p + 1)} disabled={myTrades.length < 50}>次へ</Button>
                    <Button size="sm" onClick={() => { setTradesPage(0); loadMyTrades(); }}>再読込</Button>
                    <Button size="sm" variant="outline" onClick={() => {
                      const header = ['id', 'market', 'side', 'role', 'price', 'qty', 'taker_fee', 'maker_fee', 'created_at'];
                      const rows = myTrades.map((t: TradeRecord) => [t.id, t.market, t.side, t.role, t.price, t.qty, t.taker_fee, t.maker_fee, t.created_at]);
                      const csv = [header, ...rows].map(r => r.map(v => typeof v === 'string' ? '"' + v.replace(/"/g, '""') + '"' : String(v ?? '')).join(',')).join('\n');
                      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `my_trades_${new Date().toISOString().slice(0, 10)}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}>CSV</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Other tabs would have similar structure */}
          <TabsContent value="withdraw" className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Input
                  type="text"
                  placeholder="開始日"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="pr-10"
                />
                <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-600" />
              </div>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="終了日"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="pr-10"
                />
                <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-600" />
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

            <Card>
              <CardContent className="p-0">
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">申請日時</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">通貨</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">金額</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">出金先</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">ステータス</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">承認日時</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">Tx</th>
                      </tr>
                    </thead>
                    <tbody>
                      {withdrawals.length === 0 ? (
                        <tr><td colSpan={7} className="text-center py-8 text-gray-600">記録が見つかりません</td></tr>
                      ) : withdrawals.map((w) => (
                        <tr key={w.id} className="border-b hover:bg-gray-100/40">
                          <td className="p-4">{new Date(w.created_at).toLocaleString()}</td>
                          <td className="p-4">{w.currency}</td>
                          <td className="p-4 font-mono">{Number(w.amount).toFixed(8)}</td>
                          <td className="p-4">
                            <div className="space-y-1">
                              <div className="font-mono text-xs">{w.wallet_address}</div>
                              {(w.notes || '').match(/network=([^;]+)/)?.[1] && (
                                <div className="text-xs text-gray-600">
                                  ネットワーク: {(w.notes || '').match(/network=([^;]+)/)?.[1]}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-4">
                            <div className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${w.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                              w.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                              {w.status === 'pending' ? '承認待ち' :
                                w.status === 'confirmed' ? '承認済み' :
                                  w.status === 'rejected' ? '拒否' : w.status}
                            </div>
                          </td>
                          <td className="p-4">
                            {w.confirmed_at ? (
                              <div className="text-sm">
                                {new Date(w.confirmed_at).toLocaleString()}
                              </div>
                            ) : (
                              <span className="text-gray-600">—</span>
                            )}
                          </td>
                          <td className="p-4">
                            {w.transaction_hash ? (
                              <div className="font-mono text-xs">
                                {w.transaction_hash.slice(0, 10)}…
                              </div>
                            ) : (
                              <span className="text-gray-600">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-3 p-3">
                  {withdrawals.length === 0 ? (
                    <div className="text-center py-8 text-gray-600">記録が見つかりません</div>
                  ) : withdrawals.map((w) => (
                    <Card key={w.id} className="hover:bg-accent/30 active:bg-accent/50 transition-all duration-200 active:scale-[0.98]">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="font-semibold text-base">{w.currency}</div>
                          <div className={`px-2 py-1 rounded text-xs font-medium ${
                            w.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                            w.status === 'rejected' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {w.status === 'pending' ? '承認待ち' :
                              w.status === 'confirmed' ? '承認済み' :
                                w.status === 'rejected' ? '拒否' : w.status}
                          </div>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">日時:</span>
                            <span className="font-mono text-xs">
                              {new Date(w.created_at).toLocaleString('ja-JP', {
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">金額:</span>
                            <span className="font-mono text-sm font-semibold">
                              {Number(w.amount).toFixed(8)} {w.currency}
                            </span>
                          </div>
                          {w.wallet_address && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">出金先:</span>
                              <span className="font-mono text-xs">
                                {w.wallet_address.slice(0, 10)}…
                              </span>
                            </div>
                          )}
                          {w.confirmed_at && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">承認日:</span>
                              <span className="font-mono text-xs">
                                {new Date(w.confirmed_at).toLocaleString('ja-JP', {
                                  month: '2-digit',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                          )}
                          {w.transaction_hash && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Tx:</span>
                              <span className="font-mono text-xs">
                                {w.transaction_hash.slice(0, 8)}…
                              </span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Open Orders */}
          <TabsContent value="open-order" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>オープンオーダー</CardTitle>
                <Button size="sm" variant="outline" onClick={cancelAllOpen}>すべて取消</Button>
              </CardHeader>
              <CardContent className="p-0">
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">ID</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">ペア</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">サイド</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">価格</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">数量</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">約定</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">作成</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openOrders.length === 0 ? (
                        <tr><td colSpan={8} className="text-center py-8 text-gray-600">記録が見つかりません</td></tr>
                      ) : openOrders.map(o => (
                        <tr key={o.id} className="border-b hover:bg-gray-100/40">
                          <td className="p-4 font-mono text-xs">{o.id.slice(0, 8)}…</td>
                          <td className="p-4">{o.market.replace('-', '/')}</td>
                          <td className="p-4">{o.side}</td>
                          <td className="p-4">{o.price}</td>
                          <td className="p-4">{o.qty}</td>
                          <td className="p-4">{o.filled_qty}</td>
                          <td className="p-4">{new Date(o.created_at).toLocaleString()}</td>
                          <td className="p-4"><Button size="sm" variant="outline" onClick={() => cancelOrder(o.id)}>取消</Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-3 p-3">
                  {openOrders.length === 0 ? (
                    <div className="text-center py-8 text-gray-600">記録が見つかりません</div>
                  ) : openOrders.map(o => (
                    <Card key={o.id} className="hover:bg-accent/30 active:bg-accent/50 transition-all duration-200 active:scale-[0.98]">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="font-semibold text-base">{o.market.replace('-', '/')}</div>
                          <div className={`px-2 py-1 rounded text-xs font-medium ${
                            o.side === 'buy' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {o.side === 'buy' ? '買い' : '売り'}
                          </div>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">日時:</span>
                            <span className="font-mono text-xs">
                              {new Date(o.created_at).toLocaleString('ja-JP', {
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">価格:</span>
                            <span className="font-mono text-sm font-semibold">
                              {o.price}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">数量:</span>
                            <span className="font-mono text-sm">
                              {o.qty}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">約定:</span>
                            <span className="font-mono text-sm">
                              {o.filled_qty}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">ID:</span>
                            <span className="font-mono text-xs">
                              {o.id.slice(0, 8)}…
                            </span>
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => cancelOrder(o.id)}
                            className="w-full transition-all duration-200 active:scale-95"
                          >
                            注文を取消
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* My Orders */}
          <TabsContent value="my-order" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>マイオーダー</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">ID</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">ペア</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">サイド</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">価格</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">数量</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">約定</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">状態</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">作成</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myOrders.length === 0 ? (
                        <tr><td colSpan={8} className="text-center py-8 text-gray-600">記録が見つかりません</td></tr>
                      ) : myOrders.map(o => (
                        <tr key={o.id} className="border-b hover:bg-gray-100/40">
                          <td className="p-4 font-mono text-xs">{o.id.slice(0, 8)}…</td>
                          <td className="p-4">{o.market.replace('-', '/')}</td>
                          <td className="p-4">{o.side}</td>
                          <td className="p-4">{o.price}</td>
                          <td className="p-4">{o.qty}</td>
                          <td className="p-4">{o.filled_qty}</td>
                          <td className="p-4">{o.status}</td>
                          <td className="p-4">{new Date(o.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-3 p-3">
                  {myOrders.length === 0 ? (
                    <div className="text-center py-8 text-gray-600">記録が見つかりません</div>
                  ) : myOrders.map(o => (
                    <Card key={o.id} className="hover:bg-accent/30 active:bg-accent/50 transition-all duration-200 active:scale-[0.98]">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="font-semibold text-base">{o.market.replace('-', '/')}</div>
                          <div className={`px-2 py-1 rounded text-xs font-medium ${
                            o.side === 'buy' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {o.side === 'buy' ? '買い' : '売り'}
                          </div>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">日時:</span>
                            <span className="font-mono text-xs">
                              {new Date(o.created_at).toLocaleString('ja-JP', {
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">価格:</span>
                            <span className="font-mono text-sm font-semibold">
                              {o.price}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">数量:</span>
                            <span className="font-mono text-sm">
                              {o.qty}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">約定:</span>
                            <span className="font-mono text-sm">
                              {o.filled_qty}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">状態:</span>
                            <span className={`text-xs font-medium ${
                              o.status === 'filled' ? 'text-green-600' :
                              o.status === 'partially_filled' ? 'text-yellow-600' :
                              o.status === 'cancelled' ? 'text-red-600' : 'text-blue-600'
                            }`}>
                              {o.status === 'filled' ? '約定済' :
                                o.status === 'partially_filled' ? '部分約定' :
                                  o.status === 'cancelled' ? 'キャンセル' :
                                    o.status === 'open' ? '注文中' : o.status}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">ID:</span>
                            <span className="font-mono text-xs">
                              {o.id.slice(0, 8)}…
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          {/* Transfer History */}
          <TabsContent value="transfer" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>送金履歴</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">日時</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">種別</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">相手</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">金額</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">参照番号</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">ステータス</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transfers.length === 0 ? (
                        <tr><td colSpan={6} className="text-center py-8 text-gray-600">記録が見つかりません</td></tr>
                      ) : transfers.map((t) => {
                        const isSent = t.from_user_id === user?.id;
                        return (
                          <tr key={t.id} className="border-b hover:bg-gray-100/40">
                            <td className="p-4">{new Date(t.created_at).toLocaleString()}</td>
                            <td className="p-4">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                isSent ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                              }`}>
                                {isSent ? '送金' : '受取'}
                              </span>
                            </td>
                            <td className="p-4">
                              {isSent ? t.to_user_handle : t.from_user_handle}
                            </td>
                            <td className="p-4 font-mono">{Number(t.amount).toFixed(8)} {t.currency}</td>
                            <td className="p-4 font-mono text-xs">{t.reference_number}</td>
                            <td className="p-4">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                t.status === 'completed' ? 'bg-green-100 text-green-800' :
                                t.status === 'failed' ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {t.status === 'completed' ? '完了' :
                                 t.status === 'failed' ? '失敗' :
                                 t.status === 'pending' ? '処理中' : t.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-3 p-3">
                  {transfers.length === 0 ? (
                    <div className="text-center py-8 text-gray-600">記録が見つかりません</div>
                  ) : transfers.map((t) => {
                    const isSent = t.from_user_id === user?.id;
                    return (
                      <Card key={t.id} className="hover:bg-accent/30 active:bg-accent/50 transition-all duration-200 active:scale-[0.98]">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="font-semibold text-base">
                              {isSent ? t.to_user_handle : t.from_user_handle}
                            </div>
                            <div className={`px-2 py-1 rounded text-xs font-medium ${
                              isSent ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                            }`}>
                              {isSent ? '送金' : '受取'}
                            </div>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">日時:</span>
                              <span className="font-mono text-xs">
                                {new Date(t.created_at).toLocaleString('ja-JP', {
                                  month: '2-digit',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">金額:</span>
                              <span className="font-mono text-sm font-semibold">
                                {Number(t.amount).toFixed(8)} {t.currency}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">参照番号:</span>
                              <span className="font-mono text-xs">
                                {t.reference_number}
                              </span>
                            </div>
                            {t.description && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">説明:</span>
                                <span className="text-xs">
                                  {t.description}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">ステータス:</span>
                              <span className={`text-xs font-medium ${
                                t.status === 'completed' ? 'text-green-600' :
                                t.status === 'failed' ? 'text-red-600' :
                                'text-yellow-600'
                              }`}>
                                {t.status === 'completed' ? '完了' :
                                 t.status === 'failed' ? '失敗' :
                                 t.status === 'pending' ? '処理中' : t.status}
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Conversion History */}
          <TabsContent value="conversion" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>両替履歴</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">日時</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">変換元</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">変換先</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">レート</th>
                        <th className="text-left p-4 font-medium text-gray-900 text-sm whitespace-nowrap">ステータス</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conversions.length === 0 ? (
                        <tr><td colSpan={5} className="text-center py-8 text-gray-600">記録が見つかりません</td></tr>
                      ) : conversions.map((c) => (
                        <tr key={c.id} className="border-b hover:bg-gray-100/40">
                          <td className="p-4">{new Date(c.created_at).toLocaleString()}</td>
                          <td className="p-4 font-mono">
                            {Number(c.from_amount).toFixed(8)} {c.from_currency}
                          </td>
                          <td className="p-4 font-mono">
                            {Number(c.to_amount).toFixed(8)} {c.to_currency}
                          </td>
                          <td className="p-4 font-mono">
                            1 {c.from_currency} = {Number(c.exchange_rate).toFixed(8)} {c.to_currency}
                          </td>
                          <td className="p-4">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              c.status === 'completed' ? 'bg-green-100 text-green-800' :
                              c.status === 'failed' ? 'bg-red-100 text-red-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {c.status === 'completed' ? '完了' :
                               c.status === 'failed' ? '失敗' :
                               c.status === 'pending' ? '処理中' : c.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-3 p-3">
                  {conversions.length === 0 ? (
                    <div className="text-center py-8 text-gray-600">記録が見つかりません</div>
                  ) : conversions.map((c) => (
                    <Card key={c.id} className="hover:bg-accent/30 active:bg-accent/50 transition-all duration-200 active:scale-[0.98]">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="font-semibold text-base">
                            {c.from_currency} → {c.to_currency}
                          </div>
                          <div className={`px-2 py-1 rounded text-xs font-medium ${
                            c.status === 'completed' ? 'bg-green-100 text-green-800' :
                            c.status === 'failed' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {c.status === 'completed' ? '完了' :
                             c.status === 'failed' ? '失敗' :
                             c.status === 'pending' ? '処理中' : c.status}
                          </div>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">日時:</span>
                            <span className="font-mono text-xs">
                              {new Date(c.created_at).toLocaleString('ja-JP', {
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">変換元:</span>
                            <span className="font-mono text-sm font-semibold">
                              {Number(c.from_amount).toFixed(8)} {c.from_currency}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">変換先:</span>
                            <span className="font-mono text-sm font-semibold">
                              {Number(c.to_amount).toFixed(8)} {c.to_currency}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">レート:</span>
                            <span className="font-mono text-xs">
                              1 {c.from_currency} = {Number(c.exchange_rate).toFixed(8)} {c.to_currency}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default FinancialHistory;
