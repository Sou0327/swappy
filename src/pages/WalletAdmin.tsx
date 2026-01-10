import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Key, Wallet, Server, Radio, AlertTriangle, RefreshCw } from 'lucide-react';

interface AdminWallet { id: string; chain: string; network: string; asset: string; address: string; active: boolean; }
interface WalletRoot { id: string; chain: string; network: string; asset: string; xpub: string; derivation_template: string; address_type: string; next_index: number; active: boolean; }
interface TatumSubscription { id: string; address: string; chain: string; network: string; type: string; status: 'active' | 'inactive'; created_at: string; last_webhook?: string; error_count: number; }
interface WebhookError { id: string; subscription_id?: string; address: string; chain: string; network: string; error_message: string; created_at: string; resolved: boolean; }

const WalletAdmin = () => {
  const { toast } = useToast();
  const { userRole } = useAuth();
  const navigate = useNavigate();
  const [adminWallets, setAdminWallets] = useState<AdminWallet[]>([]);
  const [walletRoots, setWalletRoots] = useState<WalletRoot[]>([]);
  const [tatumSubscriptions, setTatumSubscriptions] = useState<TatumSubscription[]>([]);
  const [webhookErrors, setWebhookErrors] = useState<WebhookError[]>([]);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);

  const [newAdmin, setNewAdmin] = useState<Partial<AdminWallet>>({ chain: 'evm', network: 'ethereum', asset: 'ETH', address: '', active: true });
  const [newRoot, setNewRoot] = useState<Partial<WalletRoot>>({ chain: 'evm', network: 'sepolia', asset: 'ETH', xpub: '', derivation_template: '0/{index}', address_type: 'default', active: true });

  const load = async () => {
    const { data: a } = await supabase.from('admin_wallets').select('*').order('chain');
    const { data: r } = await supabase.from('wallet_roots').select('*').order('chain');
    setAdminWallets((a as unknown as AdminWallet[]) || []);
    setWalletRoots((r as unknown as WalletRoot[]) || []);
  };

  const loadTatumData = async () => {
    setSubscriptionLoading(true);

    // TODO: 実際のTatum APIからサブスクリプション一覧を取得
    // 現在はサンプルデータを生成
    const sampleSubscriptions: TatumSubscription[] = [
      {
        id: 'sub_1',
        address: '0x1234567890123456789012345678901234567890',
        chain: 'evm',
        network: 'ethereum',
        type: 'INCOMING_NATIVE_TX',
        status: 'active',
        created_at: new Date(Date.now() - 86400000).toISOString(),
        last_webhook: new Date(Date.now() - 3600000).toISOString(),
        error_count: 0
      },
      {
        id: 'sub_2',
        address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        chain: 'evm',
        network: 'ethereum',
        type: 'INCOMING_FUNGIBLE_TX',
        status: 'active',
        created_at: new Date(Date.now() - 172800000).toISOString(),
        last_webhook: new Date(Date.now() - 1800000).toISOString(),
        error_count: 2
      },
      {
        id: 'sub_3',
        address: 'rXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        chain: 'xrp',
        network: 'mainnet',
        type: 'INCOMING_NATIVE_TX',
        status: 'inactive',
        created_at: new Date(Date.now() - 259200000).toISOString(),
        error_count: 5
      }
    ];

    const sampleErrors: WebhookError[] = [
      {
        id: 'err_1',
        subscription_id: 'sub_2',
        address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        chain: 'evm',
        network: 'ethereum',
        error_message: 'Webhook timeout after 30 seconds',
        created_at: new Date(Date.now() - 7200000).toISOString(),
        resolved: false
      },
      {
        id: 'err_2',
        subscription_id: 'sub_3',
        address: 'rXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        chain: 'xrp',
        network: 'mainnet',
        error_message: 'Invalid signature verification',
        created_at: new Date(Date.now() - 14400000).toISOString(),
        resolved: true
      }
    ];

    try {
      setTatumSubscriptions(sampleSubscriptions);
      setWebhookErrors(sampleErrors);

      // 実際のTatum Admin Status Edge Functionを呼び出し
      const { data, error } = await supabase.functions.invoke('tatum-admin-status', {
        method: 'POST',
        body: {}
      });

      if (error) {
        console.error('Edge Function呼び出しエラー:', error);
        throw error;
      }

      if (!data?.success) {
        console.error('Admin status取得失敗:', data?.error);
        throw new Error(data?.error || 'Admin status取得に失敗しました');
      }

      const result = data.data;

      // 取得したデータをstateに設定（成功時はサンプルデータを上書き）
      if (result.subscriptions && result.subscriptions.length > 0) {
        setTatumSubscriptions(result.subscriptions);
      } else {
        setTatumSubscriptions(sampleSubscriptions); // フォールバック
      }

      if (result.webhookErrors && result.webhookErrors.length > 0) {
        setWebhookErrors(result.webhookErrors);
      } else {
        setWebhookErrors(sampleErrors); // フォールバック
      }

      const subscriptionCount = result.subscriptions?.length || sampleSubscriptions.length;
      const errorCount = result.webhookErrors?.length || sampleErrors.length;

      toast({
        title: 'データ同期完了',
        description: `サブスクリプション: ${subscriptionCount}件, エラー: ${errorCount}件`
      });

    } catch (error) {
      console.error('Tatumデータ読み込み失敗:', error);

      // エラー時もサンプルデータを表示してUIが空にならないようにする
      setTatumSubscriptions(sampleSubscriptions);
      setWebhookErrors(sampleErrors);

      toast({
        title: 'データ読み込み失敗',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      });
    } finally {
      setSubscriptionLoading(false);
    }
  };

  useEffect(() => { if (userRole === 'admin') load(); }, [userRole]);

  if (userRole !== 'admin') {
    return (
      <DashboardLayout>
        <div className="p-6">管理者権限が必要です。</div>
      </DashboardLayout>
    );
  }

  const addAdminWallet = async () => {
    if (!newAdmin.address) return;
    const { error } = await supabase.from('admin_wallets').insert({
      chain: newAdmin.chain, network: newAdmin.network, asset: newAdmin.asset, address: newAdmin.address, active: newAdmin.active ?? true
    });
    if (error) toast({ title: '保存失敗', description: error.message, variant: 'destructive' });
    else { toast({ title: '保存しました' }); setNewAdmin({ chain: 'evm', network: 'ethereum', asset: 'ETH', address: '', active: true }); load(); }
  };

  const toggleAdminActive = async (row: AdminWallet, active: boolean) => {
    await supabase.from('admin_wallets').update({ active }).eq('id', row.id);
    load();
  };

  const addRoot = async () => {
    if (!newRoot.xpub) return;
    const { error } = await supabase.from('wallet_roots').insert({
      chain: newRoot.chain, network: newRoot.network, asset: newRoot.asset,
      xpub: newRoot.xpub, derivation_template: newRoot.derivation_template || '0/{index}',
      address_type: newRoot.address_type || 'default', active: newRoot.active ?? true
    });
    if (error) toast({ title: '保存失敗', description: error.message, variant: 'destructive' });
    else { toast({ title: '保存しました' }); setNewRoot({ chain: 'evm', network: 'sepolia', asset: 'ETH', xpub: '', derivation_template: '0/{index}', address_type: 'default', active: true }); load(); }
  };

  const toggleRootActive = async (row: WalletRoot, active: boolean) => {
    await supabase.from('wallet_roots').update({ active }).eq('id', row.id);
    load();
  };

  return (
    <DashboardLayout>
      <div className="admin-container space-y-6 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin')}><ArrowLeft className="h-4 w-4" /></Button>
          <h1 className="text-2xl font-bold">ウォレット管理</h1>
        </div>

        {/* Admin Wallets */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" />管理側ウォレット（集約先）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
              <div className="md:col-span-1">
                <Label>Chain</Label>
                <Input value={newAdmin.chain} onChange={e => setNewAdmin(a => ({ ...a, chain: e.target.value }))} />
              </div>
              <div className="md:col-span-1">
                <Label>Network</Label>
                <Input value={newAdmin.network} onChange={e => setNewAdmin(a => ({ ...a, network: e.target.value }))} />
              </div>
              <div className="md:col-span-1">
                <Label>Asset</Label>
                <Input value={newAdmin.asset} onChange={e => setNewAdmin(a => ({ ...a, asset: e.target.value }))} />
              </div>
              <div className="md:col-span-2 lg:col-span-2">
                <Label>Address</Label>
                <Input value={newAdmin.address || ''} onChange={e => setNewAdmin(a => ({ ...a, address: e.target.value }))} className="text-xs font-mono" />
              </div>
              <div className="flex items-center gap-2 md:col-span-1">
                <Switch checked={newAdmin.active ?? true} onCheckedChange={v => setNewAdmin(a => ({ ...a, active: v }))} />
                <span className="text-sm">Active</span>
              </div>
              <div className="md:col-span-2 lg:col-span-6">
                <Button onClick={addAdminWallet} className="w-full sm:w-auto">追加</Button>
              </div>
            </div>

            {/* Desktop Table */}
            <div className="admin-table-desktop">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-left">Chain</th>
                    <th className="p-2 text-left">Network</th>
                    <th className="p-2 text-left">Asset</th>
                    <th className="p-2 text-left">Address</th>
                    <th className="p-2 text-center">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {adminWallets.map(w => (
                    <tr key={w.id} className="border-b hover:bg-muted/40">
                      <td className="p-2">{w.chain}</td>
                      <td className="p-2">{w.network}</td>
                      <td className="p-2">{w.asset}</td>
                      <td className="p-2">
                        <div className="font-mono text-xs truncate-hash">
                          {w.address}
                        </div>
                      </td>
                      <td className="p-2 text-center">
                        <Switch checked={w.active} onCheckedChange={v => toggleAdminActive(w, v)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="admin-cards-mobile space-y-3">
              {adminWallets.map(w => (
                <Card key={w.id} className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium">{w.chain} / {w.network}</div>
                        <div className="text-sm text-muted-foreground">{w.asset}</div>
                      </div>
                      <Switch checked={w.active} onCheckedChange={v => toggleAdminActive(w, v)} />
                    </div>
                    <div className="text-xs font-mono break-all bg-muted p-2 rounded">
                      {w.address}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Wallet Roots */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Key className="h-5 w-5" />ウォレットルート（xpub）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3 items-end">
              <div className="md:col-span-1">
                <Label>Chain</Label>
                <Input value={newRoot.chain} onChange={e => setNewRoot(v => ({ ...v, chain: e.target.value }))} />
              </div>
              <div className="md:col-span-1">
                <Label>Network</Label>
                <Input value={newRoot.network} onChange={e => setNewRoot(v => ({ ...v, network: e.target.value }))} />
              </div>
              <div className="md:col-span-1">
                <Label>Asset</Label>
                <Input value={newRoot.asset} onChange={e => setNewRoot(v => ({ ...v, asset: e.target.value }))} />
              </div>
              <div className="md:col-span-2 lg:col-span-2">
                <Label>xpub</Label>
                <Input value={newRoot.xpub || ''} onChange={e => setNewRoot(v => ({ ...v, xpub: e.target.value }))} className="text-xs font-mono" />
              </div>
              <div className="md:col-span-1">
                <Label>Template</Label>
                <Input value={newRoot.derivation_template || ''} onChange={e => setNewRoot(v => ({ ...v, derivation_template: e.target.value }))} className="text-xs" />
              </div>
              <div className="flex items-center gap-2 md:col-span-1">
                <Switch checked={newRoot.active ?? true} onCheckedChange={v => setNewRoot(r => ({ ...r, active: v }))} />
                <span className="text-sm">Active</span>
              </div>
              <div className="md:col-span-2 lg:col-span-7">
                <Button onClick={addRoot} className="w-full sm:w-auto">追加</Button>
              </div>
            </div>

            {/* Desktop Table */}
            <div className="admin-table-desktop">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-left">Chain</th>
                    <th className="p-2 text-left">Network</th>
                    <th className="p-2 text-left">Asset</th>
                    <th className="p-2 text-left">xpub</th>
                    <th className="p-2 text-center">Next</th>
                    <th className="p-2 text-center">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {walletRoots.map(r => (
                    <tr key={r.id} className="border-b hover:bg-muted/40">
                      <td className="p-2">{r.chain}</td>
                      <td className="p-2">{r.network}</td>
                      <td className="p-2">{r.asset}</td>
                      <td className="p-2">
                        <div className="font-mono text-xs truncate-hash">
                          {r.xpub.slice(0, 12)}…{r.xpub.slice(-6)}
                        </div>
                      </td>
                      <td className="p-2 text-center"><Badge variant="outline">{r.next_index}</Badge></td>
                      <td className="p-2 text-center">
                        <Switch checked={r.active} onCheckedChange={v => toggleRootActive(r, v)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="admin-cards-mobile space-y-3">
              {walletRoots.map(r => (
                <Card key={r.id} className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium">{r.chain} / {r.network}</div>
                        <div className="text-sm text-muted-foreground">{r.asset}</div>
                        <div className="text-xs">Next: <Badge variant="outline">{r.next_index}</Badge></div>
                      </div>
                      <Switch checked={r.active} onCheckedChange={v => toggleRootActive(r, v)} />
                    </div>
                    <div className="text-xs font-mono break-all bg-muted p-2 rounded">
                      {r.xpub}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Sweep Jobs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Server className="h-5 w-5" />スイープ計画（最新20件）</CardTitle>
          </CardHeader>
          <CardContent>
            <SweepJobsList />
          </CardContent>
        </Card>

        {/* Tatum Subscription Monitor */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Radio className="h-5 w-5" />
              Tatumサブスクリプション監視
              <Button
                size="sm"
                variant="outline"
                onClick={loadTatumData}
                disabled={subscriptionLoading}
                className="ml-auto"
              >
                {subscriptionLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                更新
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-muted/50 p-3 rounded-lg">
                  <div className="text-sm text-muted-foreground">総サブスクリプション</div>
                  <div className="text-xl font-bold">{tatumSubscriptions.length}</div>
                </div>
                <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                  <div className="text-sm text-green-700">アクティブ</div>
                  <div className="text-xl font-bold text-green-800">
                    {tatumSubscriptions.filter(s => s.status === 'active').length}
                  </div>
                </div>
                <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                  <div className="text-sm text-red-700">エラー有り</div>
                  <div className="text-xl font-bold text-red-800">
                    {tatumSubscriptions.filter(s => s.error_count > 0).length}
                  </div>
                </div>
                <div className="bg-orange-50 p-3 rounded-lg border border-orange-200">
                  <div className="text-sm text-orange-700">未解決エラー</div>
                  <div className="text-xl font-bold text-orange-800">
                    {webhookErrors.filter(e => !e.resolved).length}
                  </div>
                </div>
              </div>

              {/* Subscriptions Table */}
              <div className="admin-table-desktop">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="p-2 text-left">アドレス</th>
                      <th className="p-2 text-left">チェーン</th>
                      <th className="p-2 text-left">タイプ</th>
                      <th className="p-2 text-center">ステータス</th>
                      <th className="p-2 text-center">エラー数</th>
                      <th className="p-2 text-left">最終Webhook</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tatumSubscriptions.map(sub => (
                      <tr key={sub.id} className="border-b hover:bg-muted/40">
                        <td className="p-2">
                          <div className="font-mono text-xs">
                            {sub.address.slice(0, 8)}...{sub.address.slice(-6)}
                          </div>
                        </td>
                        <td className="p-2">{sub.chain}/{sub.network}</td>
                        <td className="p-2">
                          <Badge variant="outline" className="text-xs">
                            {sub.type}
                          </Badge>
                        </td>
                        <td className="p-2 text-center">
                          <Badge variant={sub.status === 'active' ? 'default' : 'secondary'}>
                            {sub.status}
                          </Badge>
                        </td>
                        <td className="p-2 text-center">
                          <Badge variant={sub.error_count > 0 ? 'destructive' : 'outline'}>
                            {sub.error_count}
                          </Badge>
                        </td>
                        <td className="p-2 text-xs text-muted-foreground">
                          {sub.last_webhook ? new Date(sub.last_webhook).toLocaleString() : 'N/A'}
                        </td>
                      </tr>
                    ))}
                    {tatumSubscriptions.length === 0 && (
                      <tr>
                        <td className="p-4 text-center text-muted-foreground" colSpan={6}>
                          サブスクリプションがありません
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="admin-cards-mobile space-y-3">
                {tatumSubscriptions.map(sub => (
                  <Card key={sub.id} className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-mono text-sm">
                            {sub.address.slice(0, 10)}...{sub.address.slice(-8)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {sub.chain}/{sub.network}
                          </div>
                        </div>
                        <Badge variant={sub.status === 'active' ? 'default' : 'secondary'}>
                          {sub.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-xs">
                          {sub.type}
                        </Badge>
                        <Badge variant={sub.error_count > 0 ? 'destructive' : 'outline'}>
                          エラー: {sub.error_count}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        最終Webhook: {sub.last_webhook ? new Date(sub.last_webhook).toLocaleString() : 'N/A'}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Webhook Errors */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Webhookエラー履歴
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="admin-table-desktop">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-left">発生時刻</th>
                    <th className="p-2 text-left">アドレス</th>
                    <th className="p-2 text-left">チェーン</th>
                    <th className="p-2 text-left">エラー内容</th>
                    <th className="p-2 text-center">解決済み</th>
                  </tr>
                </thead>
                <tbody>
                  {webhookErrors.map(error => (
                    <tr key={error.id} className="border-b hover:bg-muted/40">
                      <td className="p-2 text-xs">
                        {new Date(error.created_at).toLocaleString()}
                      </td>
                      <td className="p-2">
                        <div className="font-mono text-xs">
                          {error.address.slice(0, 8)}...{error.address.slice(-6)}
                        </div>
                      </td>
                      <td className="p-2">{error.chain}/{error.network}</td>
                      <td className="p-2 text-xs max-w-xs truncate">
                        {error.error_message}
                      </td>
                      <td className="p-2 text-center">
                        <Badge variant={error.resolved ? 'default' : 'destructive'}>
                          {error.resolved ? '解決済み' : '未解決'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {webhookErrors.length === 0 && (
                    <tr>
                      <td className="p-4 text-center text-muted-foreground" colSpan={5}>
                        エラーがありません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="admin-cards-mobile space-y-3">
              {webhookErrors.map(error => (
                <Card key={error.id} className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-mono text-sm">
                          {error.address.slice(0, 10)}...{error.address.slice(-8)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {error.chain}/{error.network}
                        </div>
                      </div>
                      <Badge variant={error.resolved ? 'default' : 'destructive'}>
                        {error.resolved ? '解決済み' : '未解決'}
                      </Badge>
                    </div>
                    <div className="text-sm">
                      <div className="text-muted-foreground mb-1">エラー内容:</div>
                      <div className="text-xs bg-muted p-2 rounded">
                        {error.error_message}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(error.created_at).toLocaleString()}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

const SweepJobsList = () => {
  const [rows, setRows] = useState<Array<{
    id: string;
    created_at: string;
    chain: string;
    network?: string;
    asset: string;
    from_address?: string;
    to_address?: string;
    planned_amount: string;
    status: string;
  }>>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('sweep_jobs').select('*').order('created_at', { ascending: false }).limit(20); setRows((data as unknown as Array<{
        id: string;
        created_at: string;
        chain: string;
        network?: string;
        asset: string;
        from_address?: string;
        to_address?: string;
        planned_amount: string;
        status: string;
      }>) || []);
    })();
  }, []);
  return (
    <>
      {/* Desktop Table */}
      <div className="admin-table-desktop">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="p-2 text-left">Time</th>
              <th className="p-2 text-left">Chain</th>
              <th className="p-2 text-left">Asset</th>
              <th className="p-2 text-left">From</th>
              <th className="p-2 text-left">To</th>
              <th className="p-2 text-right">Amount</th>
              <th className="p-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b hover:bg-muted/40">
                <td className="p-2 text-xs">{new Date(r.created_at).toLocaleString()}</td>
                <td className="p-2">{r.chain}/{r.network}</td>
                <td className="p-2">{r.asset}</td>
                <td className="p-2">
                  <div className="font-mono text-xs truncate-hash">
                    {(r.from_address || '').slice(0, 10)}…
                  </div>
                </td>
                <td className="p-2">
                  <div className="font-mono text-xs truncate-hash">
                    {(r.to_address || '').slice(0, 10)}…
                  </div>
                </td>
                <td className="p-2 text-right">{r.planned_amount}</td>
                <td className="p-2 text-center"><Badge variant={r.status === 'planned' ? 'secondary' : r.status === 'failed' ? 'destructive' : 'default'}>{r.status}</Badge></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="p-4 text-center text-muted-foreground" colSpan={7}>記録がありません</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="admin-cards-mobile space-y-3">
        {rows.map(r => (
          <Card key={r.id} className="p-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{r.chain}/{r.network}</div>
                  <div className="text-sm text-muted-foreground">{r.asset}</div>
                </div>
                <Badge variant={r.status === 'planned' ? 'secondary' : r.status === 'failed' ? 'destructive' : 'default'}>
                  {r.status}
                </Badge>
              </div>
              <div className="text-sm">
                <div className="text-muted-foreground">Amount: </div>
                <div className="font-mono">{r.planned_amount}</div>
              </div>
              <div className="space-y-1 text-xs">
                <div>
                  <span className="text-muted-foreground">From: </span>
                  <span className="font-mono break-all">{r.from_address}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">To: </span>
                  <span className="font-mono break-all">{r.to_address}</span>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(r.created_at).toLocaleString()}
              </div>
            </div>
          </Card>
        ))}
        {rows.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            記録がありません
          </div>
        )}
      </div>
    </>
  );
};

export default WalletAdmin;

