import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '../components/DashboardLayout';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { supabase } from '../integrations/supabase/client';
import { Loader2, Plus, Edit, Trash2, Power, Coins, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

/*
  トークン管理画面

  機能:
  - 対応トークンの一覧表示
  - トークンの追加/編集/削除
  - アクティブ/非アクティブ切り替え
  - チェーン別フィルタ

  対象ユーザー: Admin/Moderator権限
*/

interface SupportedToken {
  id: string;
  chain: 'evm' | 'btc' | 'trc' | 'xrp' | 'ada';
  network: string;
  asset: string;
  name: string;
  symbol: string;
  decimals: number;
  contract_address?: string;
  deposit_enabled: boolean;
  withdraw_enabled: boolean;
  convert_enabled: boolean;
  min_deposit?: number;
  min_withdraw?: number;
  withdraw_fee?: number;
  display_order: number;
  icon_url?: string;
  active: boolean;
  // Phase 5: chain_configs統合による新規フィールド
  min_confirmations?: number;
  explorer_url?: string;
  destination_tag_required?: boolean;
  created_at: string;
  updated_at: string;
}

// ====================================
// API Functions
// ====================================

async function callTokenManager(action: string, data: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('認証が必要です');

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/token-manager`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    },
    body: JSON.stringify({ action, ...data })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to call token-manager');
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || 'Unknown error');
  }

  return result.data;
}

// ====================================
// Labels
// ====================================

const chainLabels = {
  evm: 'EVM',
  btc: 'Bitcoin',
  trc: 'Tron',
  xrp: 'Ripple',
  ada: 'Cardano'
};

// ====================================
// Main Component
// ====================================

export default function AdminTokens() {
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<SupportedToken | null>(null);
  const [chainFilter, setChainFilter] = useState<string>('all');

  // Form state
  const [formData, setFormData] = useState<Partial<SupportedToken>>({
    chain: 'evm',
    network: 'ethereum',
    asset: '',
    name: '',
    symbol: '',
    decimals: 18,
    contract_address: '',
    deposit_enabled: true,
    withdraw_enabled: true,
    convert_enabled: true,
    min_deposit: null,
    min_withdraw: null,
    withdraw_fee: null,
    display_order: 0,
    icon_url: '',
    active: true,
    // Phase 5: chain_configs統合による新規フィールド
    min_confirmations: null,
    explorer_url: '',
    destination_tag_required: false
  });

  // Queries - 全件取得してクライアント側でフィルタリング
  const { data: tokens = [], isLoading } = useQuery<SupportedToken[]>({
    queryKey: ['supportedTokens'],
    queryFn: () => callTokenManager('list', {}),
    refetchInterval: 30000
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (token: Partial<SupportedToken>) => callTokenManager('create', { token }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supportedTokens'] });
      toast.success('トークンを追加しました');
      setIsCreateDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(`追加エラー: ${error.message}`);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<SupportedToken> }) =>
      callTokenManager('update', { id, updates }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supportedTokens'] });
      toast.success('トークンを更新しました');
      setIsEditDialogOpen(false);
      setSelectedToken(null);
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(`更新エラー: ${error.message}`);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => callTokenManager('delete', { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supportedTokens'] });
      toast.success('トークンを削除しました');
    },
    onError: (error: Error) => {
      toast.error(`削除エラー: ${error.message}`);
    }
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (id: string) => callTokenManager('toggle_active', { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supportedTokens'] });
      toast.success('ステータスを更新しました');
    },
    onError: (error: Error) => {
      toast.error(`更新エラー: ${error.message}`);
    }
  });

  // ====================================
  // UI Handlers
  // ====================================

  // 数値入力のパースヘルパー（'0'を正しく扱い、空欄はnullで明示的にクリア）
  const parseNumericValue = (value: string): number | null => {
    if (value === '') return null;
    const num = Number(value);
    return isNaN(num) ? null : num;
  };

  const resetForm = () => {
    setFormData({
      chain: 'evm',
      network: 'ethereum',
      asset: '',
      name: '',
      symbol: '',
      decimals: 18,
      contract_address: '',
      deposit_enabled: true,
      withdraw_enabled: true,
      convert_enabled: true,
      min_deposit: null,
      min_withdraw: null,
      withdraw_fee: null,
      display_order: 0,
      icon_url: '',
      active: true,
      // Phase 5: chain_configs統合による新規フィールド
      min_confirmations: null,
      explorer_url: '',
      destination_tag_required: false
    });
  };

  const handleCreate = () => {
    if (!formData.chain || !formData.network || !formData.asset || !formData.name || !formData.symbol) {
      toast.error('必須項目を入力してください');
      return;
    }
    createMutation.mutate(formData);
  };

  const handleEdit = (token: SupportedToken) => {
    setSelectedToken(token);
    setFormData(token);
    setIsEditDialogOpen(true);
  };

  const handleUpdate = () => {
    if (!selectedToken) return;
    if (!formData.chain || !formData.network || !formData.asset || !formData.name || !formData.symbol) {
      toast.error('必須項目を入力してください');
      return;
    }
    updateMutation.mutate({
      id: selectedToken.id,
      updates: formData
    });
  };

  // クライアント側でのフィルタリングとソート
  const filteredTokens = useMemo(() => {
    // フィルタリング
    let filtered = [...tokens];

    if (chainFilter !== 'all') {
      filtered = filtered.filter(token => token.chain === chainFilter);
    }

    // ソート（display_order昇順）
    filtered.sort((a, b) => a.display_order - b.display_order);

    return filtered;
  }, [tokens, chainFilter]);

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-2">トークン管理</h1>
            <p className="text-muted-foreground">
              対応トークンの追加・編集・管理を行います
            </p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                トークン追加
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>新しいトークンを追加</DialogTitle>
                <DialogDescription>
                  新しい対応トークンを追加します
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="chain">チェーン *</Label>
                    <Select
                      value={formData.chain}
                      onValueChange={(value: 'evm' | 'btc' | 'trc' | 'xrp' | 'ada') => setFormData({ ...formData, chain: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(chainLabels).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="network">ネットワーク *</Label>
                    <Input
                      id="network"
                      value={formData.network}
                      onChange={(e) => setFormData({ ...formData, network: e.target.value })}
                      placeholder="mainnet, testnet, etc."
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Label htmlFor="asset">アセット *</Label>
                    <Input
                      id="asset"
                      value={formData.asset}
                      onChange={(e) => setFormData({ ...formData, asset: e.target.value.toUpperCase() })}
                      placeholder="ETH, USDT, etc."
                    />
                  </div>
                  <div>
                    <Label htmlFor="symbol">シンボル *</Label>
                    <Input
                      id="symbol"
                      value={formData.symbol}
                      onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                      placeholder="ETH, USDT"
                    />
                  </div>
                  <div>
                    <Label htmlFor="decimals">小数点桁数 *</Label>
                    <Input
                      id="decimals"
                      type="number"
                      min="0"
                      max="18"
                      value={formData.decimals}
                      onChange={(e) => setFormData({ ...formData, decimals: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="name">トークン名 *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ethereum, Tether USD"
                  />
                </div>
                <div>
                  <Label htmlFor="contract_address">コントラクトアドレス（ERC20等）</Label>
                  <Input
                    id="contract_address"
                    value={formData.contract_address}
                    onChange={(e) => setFormData({ ...formData, contract_address: e.target.value })}
                    placeholder="0x..."
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="min_deposit">最小入金額</Label>
                    <Input
                      id="min_deposit"
                      type="number"
                      step="0.00000001"
                      min="0"
                      value={formData.min_deposit ?? ''}
                      onChange={(e) => setFormData({ ...formData, min_deposit: parseNumericValue(e.target.value) })}
                      placeholder="0.0"
                    />
                  </div>
                  <div>
                    <Label htmlFor="min_confirmations">最小確認数</Label>
                    <Input
                      id="min_confirmations"
                      type="number"
                      min="1"
                      value={formData.min_confirmations ?? ''}
                      onChange={(e) => setFormData({ ...formData, min_confirmations: e.target.value ? parseInt(e.target.value) : null })}
                      placeholder="12 (EVM), 6 (BTC), 19 (TRC)"
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="min_withdraw">最小出金額</Label>
                    <Input
                      id="min_withdraw"
                      type="number"
                      step="0.00000001"
                      min="0"
                      value={formData.min_withdraw ?? ''}
                      onChange={(e) => setFormData({ ...formData, min_withdraw: parseNumericValue(e.target.value) })}
                      placeholder="0.0"
                    />
                  </div>
                  <div>
                    <Label htmlFor="withdraw_fee">出金手数料</Label>
                    <Input
                      id="withdraw_fee"
                      type="number"
                      step="0.00000001"
                      min="0"
                      value={formData.withdraw_fee ?? ''}
                      onChange={(e) => setFormData({ ...formData, withdraw_fee: parseNumericValue(e.target.value) })}
                      placeholder="0.0"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="icon_url">アイコンURL</Label>
                  <Input
                    id="icon_url"
                    value={formData.icon_url}
                    onChange={(e) => setFormData({ ...formData, icon_url: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <Label htmlFor="explorer_url">ブロックエクスプローラーURL</Label>
                  <Input
                    id="explorer_url"
                    value={formData.explorer_url}
                    onChange={(e) => setFormData({ ...formData, explorer_url: e.target.value })}
                    placeholder="https://etherscan.io"
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="deposit_enabled"
                      checked={formData.deposit_enabled}
                      onChange={(e) => setFormData({ ...formData, deposit_enabled: e.target.checked })}
                      className="h-4 w-4"
                    />
                    <Label htmlFor="deposit_enabled" className="cursor-pointer">入金可能</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="withdraw_enabled"
                      checked={formData.withdraw_enabled}
                      onChange={(e) => setFormData({ ...formData, withdraw_enabled: e.target.checked })}
                      className="h-4 w-4"
                    />
                    <Label htmlFor="withdraw_enabled" className="cursor-pointer">出金可能</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="convert_enabled"
                      checked={formData.convert_enabled}
                      onChange={(e) => setFormData({ ...formData, convert_enabled: e.target.checked })}
                      className="h-4 w-4"
                    />
                    <Label htmlFor="convert_enabled" className="cursor-pointer">両替可能</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="destination_tag_required"
                      checked={formData.destination_tag_required}
                      onChange={(e) => setFormData({ ...formData, destination_tag_required: e.target.checked })}
                      className="h-4 w-4"
                    />
                    <Label htmlFor="destination_tag_required" className="cursor-pointer">宛先タグ必須</Label>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="display_order">表示順序</Label>
                    <Input
                      id="display_order"
                      type="number"
                      value={formData.display_order}
                      onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-8">
                    <input
                      type="checkbox"
                      id="active"
                      checked={formData.active}
                      onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                      className="h-4 w-4"
                    />
                    <Label htmlFor="active" className="cursor-pointer">アクティブ</Label>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsCreateDialogOpen(false);
                    resetForm();
                  }}
                >
                  キャンセル
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  追加
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Coins className="h-5 w-5" />
                  対応トークン一覧
                </CardTitle>
                <CardDescription>
                  {tokens.length}件のトークンが登録されています
                </CardDescription>
              </div>
              <div className="w-48">
                <Select value={chainFilter} onValueChange={setChainFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全てのチェーン</SelectItem>
                    {Object.entries(chainLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : filteredTokens.length === 0 ? (
              <div className="py-12 text-center">
                <Coins className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">トークンが登録されていません</p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>チェーン</TableHead>
                      <TableHead>トークン</TableHead>
                      <TableHead>ネットワーク</TableHead>
                      <TableHead>小数点</TableHead>
                      <TableHead>最小入金</TableHead>
                      <TableHead>最小出金</TableHead>
                      <TableHead>手数料</TableHead>
                      <TableHead>機能</TableHead>
                      <TableHead>ステータス</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTokens.map((token) => (
                      <TableRow key={token.id}>
                        <TableCell>
                          <Badge variant="outline">
                            {chainLabels[token.chain]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{token.name}</div>
                            <div className="text-sm text-muted-foreground">{token.symbol}</div>
                          </div>
                        </TableCell>
                        <TableCell>{token.network}</TableCell>
                        <TableCell>{token.decimals}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {token.min_deposit !== undefined && token.min_deposit !== null
                              ? token.min_deposit
                              : '-'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {token.min_withdraw !== undefined && token.min_withdraw !== null
                              ? token.min_withdraw
                              : '-'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {token.withdraw_fee !== undefined && token.withdraw_fee !== null
                              ? token.withdraw_fee
                              : '-'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {token.deposit_enabled && <Badge variant="outline" className="text-xs">入金</Badge>}
                            {token.withdraw_enabled && <Badge variant="outline" className="text-xs">出金</Badge>}
                            {token.convert_enabled && <Badge variant="outline" className="text-xs">両替</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>
                          {token.active ? (
                            <Badge>アクティブ</Badge>
                          ) : (
                            <Badge variant="secondary">非アクティブ</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(token)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => toggleActiveMutation.mutate(token.id)}
                            >
                              <Power className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>トークンを削除</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {token.name}を削除します。この操作は取り消せません。
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteMutation.mutate(token.id)}
                                    className="bg-destructive text-destructive-foreground"
                                  >
                                    削除
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>トークンを編集</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="edit-chain">チェーン *</Label>
                  <Select
                    value={formData.chain}
                    onValueChange={(value: 'evm' | 'btc' | 'trc' | 'xrp' | 'ada') => setFormData({ ...formData, chain: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(chainLabels).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit-network">ネットワーク *</Label>
                  <Input
                    id="edit-network"
                    value={formData.network}
                    onChange={(e) => setFormData({ ...formData, network: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label htmlFor="edit-asset">アセット *</Label>
                  <Input
                    id="edit-asset"
                    value={formData.asset}
                    onChange={(e) => setFormData({ ...formData, asset: e.target.value.toUpperCase() })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-symbol">シンボル *</Label>
                  <Input
                    id="edit-symbol"
                    value={formData.symbol}
                    onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-decimals">小数点桁数 *</Label>
                  <Input
                    id="edit-decimals"
                    type="number"
                    min="0"
                    max="18"
                    value={formData.decimals}
                    onChange={(e) => setFormData({ ...formData, decimals: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="edit-name">トークン名 *</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="edit-contract_address">コントラクトアドレス</Label>
                <Input
                  id="edit-contract_address"
                  value={formData.contract_address}
                  onChange={(e) => setFormData({ ...formData, contract_address: e.target.value })}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="edit-min_deposit">最小入金額</Label>
                  <Input
                    id="edit-min_deposit"
                    type="number"
                    step="0.00000001"
                    min="0"
                    value={formData.min_deposit ?? ''}
                    onChange={(e) => setFormData({ ...formData, min_deposit: parseNumericValue(e.target.value) })}
                    placeholder="0.0"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-min_confirmations">最小確認数</Label>
                  <Input
                    id="edit-min_confirmations"
                    type="number"
                    min="1"
                    value={formData.min_confirmations ?? ''}
                    onChange={(e) => setFormData({ ...formData, min_confirmations: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="12 (EVM), 6 (BTC), 19 (TRC)"
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="edit-min_withdraw">最小出金額</Label>
                  <Input
                    id="edit-min_withdraw"
                    type="number"
                    step="0.00000001"
                    min="0"
                    value={formData.min_withdraw ?? ''}
                    onChange={(e) => setFormData({ ...formData, min_withdraw: parseNumericValue(e.target.value) })}
                    placeholder="0.0"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-withdraw_fee">出金手数料</Label>
                  <Input
                    id="edit-withdraw_fee"
                    type="number"
                    step="0.00000001"
                    min="0"
                    value={formData.withdraw_fee ?? ''}
                    onChange={(e) => setFormData({ ...formData, withdraw_fee: parseNumericValue(e.target.value) })}
                    placeholder="0.0"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="edit-icon_url">アイコンURL</Label>
                <Input
                  id="edit-icon_url"
                  value={formData.icon_url}
                  onChange={(e) => setFormData({ ...formData, icon_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div>
                <Label htmlFor="edit-explorer_url">ブロックエクスプローラーURL</Label>
                <Input
                  id="edit-explorer_url"
                  value={formData.explorer_url}
                  onChange={(e) => setFormData({ ...formData, explorer_url: e.target.value })}
                  placeholder="https://etherscan.io"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="edit-deposit_enabled"
                    checked={formData.deposit_enabled}
                    onChange={(e) => setFormData({ ...formData, deposit_enabled: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="edit-deposit_enabled" className="cursor-pointer">入金可能</Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="edit-withdraw_enabled"
                    checked={formData.withdraw_enabled}
                    onChange={(e) => setFormData({ ...formData, withdraw_enabled: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="edit-withdraw_enabled" className="cursor-pointer">出金可能</Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="edit-convert_enabled"
                    checked={formData.convert_enabled}
                    onChange={(e) => setFormData({ ...formData, convert_enabled: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="edit-convert_enabled" className="cursor-pointer">両替可能</Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="edit-destination_tag_required"
                    checked={formData.destination_tag_required}
                    onChange={(e) => setFormData({ ...formData, destination_tag_required: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="edit-destination_tag_required" className="cursor-pointer">宛先タグ必須</Label>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="edit-display_order">表示順序</Label>
                  <Input
                    id="edit-display_order"
                    type="number"
                    value={formData.display_order}
                    onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="flex items-center gap-2 mt-8">
                  <input
                    type="checkbox"
                    id="edit-active"
                    checked={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="edit-active" className="cursor-pointer">アクティブ</Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditDialogOpen(false);
                  setSelectedToken(null);
                  resetForm();
                }}
              >
                キャンセル
              </Button>
              <Button
                onClick={handleUpdate}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                更新
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}