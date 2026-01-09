import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '../components/DashboardLayout';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../components/ui/alert-dialog';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Separator } from '../components/ui/separator';
import { supabase } from '../integrations/supabase/client';
import { Loader2, Key, Shield, CheckCircle, AlertTriangle, Copy, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

/*
  HDウォレット・マスターキー管理画面

  機能:
  - マスターキー生成・管理
  - wallet_roots自動初期化
  - バックアップ検証
  - システム状態監視

  対象ユーザー: Admin権限のみ
*/

interface MasterKey {
  id: string;
  created_at: string;
  description?: string;
  active: boolean;
  backup_verified: boolean;
  created_by: string;
}

interface WalletRoot {
  id: string;
  chain: string;
  network: string;
  asset: string;
  xpub: string;
  derivation_path?: string;
  auto_generated: boolean;
  legacy_data: boolean;
  verified: boolean;
  last_verified_at?: string;
  active: boolean;
}

// ====================================
// API Functions
// ====================================

async function callMasterKeyManager(action: string, data: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('認証が必要です');

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/master-key-manager`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    },
    body: JSON.stringify({ action, ...data })
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || 'Unknown error');
  }

  return result.data;
}

async function callWalletRootManager(action: string, data: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('認証が必要です');

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wallet-root-manager`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    },
    body: JSON.stringify({ action, ...data })
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || 'Unknown error');
  }

  return result.data;
}

// ====================================
// Main Component
// ====================================

export default function HDWalletAdmin() {
  const queryClient = useQueryClient();
  const [generatedMnemonic, setGeneratedMnemonic] = useState<string | null>(null);
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [verificationMnemonic, setVerificationMnemonic] = useState('');
  const [selectedMasterKeyId, setSelectedMasterKeyId] = useState<string | null>(null);

  // ニーモニック確認機能用のstate
  const [viewMnemonicDialogOpen, setViewMnemonicDialogOpen] = useState(false);
  const [currentViewMnemonic, setCurrentViewMnemonic] = useState<string>('');
  const [showViewMnemonic, setShowViewMnemonic] = useState(false);

  // Master Keys Query
  const { data: masterKeys = [], isLoading: masterKeysLoading } = useQuery<MasterKey[]>({
    queryKey: ['masterKeys'],
    queryFn: () => callMasterKeyManager('list'),
    refetchInterval: 30000 // 30秒ごとに更新
  });

  // Wallet Roots Query
  const { data: walletRoots = [], isLoading: walletRootsLoading } = useQuery<WalletRoot[]>({
    queryKey: ['walletRoots'],
    queryFn: () => callWalletRootManager('list'),
    refetchInterval: 30000
  });

  // Generate Master Key Mutation
  const generateMasterKeyMutation = useMutation({
    mutationFn: ({ strength, description }: { strength: 128 | 256; description?: string }) =>
      callMasterKeyManager('generate', { strength, description }),
    onSuccess: (data) => {
      setGeneratedMnemonic(data.mnemonic);
      setSelectedMasterKeyId(data.id);
      queryClient.invalidateQueries({ queryKey: ['masterKeys'] });
      toast.success('マスターキーが生成されました');
    },
    onError: (error) => {
      toast.error(`マスターキー生成エラー: ${error.message}`);
    }
  });

  // Initialize Wallet Roots Mutation
  const initializeWalletRootsMutation = useMutation({
    mutationFn: ({ masterKeyId, force }: { masterKeyId: string; force?: boolean }) =>
      callWalletRootManager('initialize', { masterKeyId, force }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['walletRoots'] });
      toast.success('wallet_rootsの初期化が完了しました');
    },
    onError: (error) => {
      toast.error(`初期化エラー: ${error.message}`);
    }
  });

  // Verify Backup Mutation
  const verifyBackupMutation = useMutation({
    mutationFn: ({ masterKeyId, mnemonic }: { masterKeyId: string; mnemonic: string }) =>
      callMasterKeyManager('verify', { masterKeyId, mnemonic }),
    onSuccess: (data) => {
      if (data.verified) {
        toast.success('バックアップが正常に検証されました');
        queryClient.invalidateQueries({ queryKey: ['masterKeys'] });
      } else {
        toast.error('ニーモニックが一致しません');
      }
      setVerificationMnemonic('');
    },
    onError: (error) => {
      toast.error(`検証エラー: ${error.message}`);
    }
  });

  // View Mnemonic Mutation
  const viewMnemonicMutation = useMutation({
    mutationFn: ({ masterKeyId }: { masterKeyId: string }) =>
      callMasterKeyManager('decrypt', { masterKeyId }),
    onSuccess: (data) => {
      setCurrentViewMnemonic(data.mnemonic);
      setViewMnemonicDialogOpen(true);
    },
    onError: (error) => {
      toast.error(`ニーモニック取得エラー: ${error.message}`);
    }
  });

  const activeMasterKey = masterKeys.find(mk => mk.active);

  // ====================================
  // UI Handlers
  // ====================================

  const handleCopyMnemonic = () => {
    if (generatedMnemonic) {
      navigator.clipboard.writeText(generatedMnemonic);
      toast.success('ニーモニックをクリップボードにコピーしました');
    }
  };

  const handleCloseMnemonic = () => {
    setGeneratedMnemonic(null);
    setShowMnemonic(false);
  };

  const handleViewMnemonic = (masterKeyId: string) => {
    viewMnemonicMutation.mutate({ masterKeyId });
  };

  const handleCopyViewMnemonic = () => {
    if (currentViewMnemonic) {
      navigator.clipboard.writeText(currentViewMnemonic);
      toast.success('ニーモニックをクリップボードにコピーしました');
    }
  };

  const handleCloseViewMnemonic = () => {
    setViewMnemonicDialogOpen(false);
    setCurrentViewMnemonic('');
    setShowViewMnemonic(false);
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto px-2 py-3 md:px-4 md:py-6 max-w-6xl">
        <div className="mb-3 md:mb-6">
          <h1 className="text-xl md:text-2xl font-bold mb-1 md:mb-2">HDウォレット管理</h1>
          <p className="text-muted-foreground text-sm md:text-base">
            マスターキー生成・管理とwallet_roots自動初期化システム
          </p>
        </div>

        <Tabs defaultValue="overview" className="space-y-2 md:space-y-4">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 h-auto">
            <TabsTrigger value="overview">概要</TabsTrigger>
            <TabsTrigger value="master-keys">マスターキー</TabsTrigger>
            <TabsTrigger value="wallet-roots">Wallet Roots</TabsTrigger>
            <TabsTrigger value="backup">バックアップ検証</TabsTrigger>
          </TabsList>

          {/* ====================================
              概要タブ
              ==================================== */}
          <TabsContent value="overview" className="space-y-2 md:space-y-4 mt-24 md:mt-6">
            <div className="grid gap-2 md:gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-2 md:pb-4">
                  <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                    <Key className="h-4 w-4 md:h-5 md:w-5" />
                    システム状態
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 md:space-y-3 p-3 md:p-6 pt-0">
                  <div className="flex items-center justify-between">
                    <span>アクティブなマスターキー</span>
                    <Badge variant={activeMasterKey ? "default" : "destructive"}>
                      {activeMasterKey ? "設定済み" : "未設定"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>自動生成Wallet Roots</span>
                    <Badge variant="outline">
                      {walletRoots.filter(wr => wr.auto_generated).length}件
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>レガシーWallet Roots</span>
                    <Badge variant="secondary">
                      {walletRoots.filter(wr => wr.legacy_data).length}件
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>対応チェーン</span>
                    <div className="flex gap-1">
                      <Badge variant="outline" className="text-xs px-2 py-0.5">EVM</Badge>
                      <Badge variant="outline" className="text-xs px-2 py-0.5">BTC</Badge>
                      <Badge variant="outline" className="text-xs px-2 py-0.5">TRC</Badge>
                      <Badge variant="outline" className="text-xs px-2 py-0.5">XRP</Badge>
                      <Badge variant="outline" className="text-xs px-2 py-0.5">ADA</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 md:pb-4">
                  <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                    <Shield className="h-4 w-4 md:h-5 md:w-5" />
                    セキュリティ状態
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 md:space-y-3 p-3 md:p-6 pt-0">
                  <div className="flex items-center justify-between">
                    <span>バックアップ検証</span>
                    <Badge variant={activeMasterKey?.backup_verified ? "default" : "destructive"}>
                      {activeMasterKey?.backup_verified ? "検証済み" : "未検証"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>暗号化方式</span>
                    <Badge variant="outline">AES-256-GCM</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>キー導出</span>
                    <Badge variant="outline">PBKDF2 (100K)</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>

            {!activeMasterKey && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  マスターキーが設定されていません。「マスターキー」タブから新しいマスターキーを生成してください。
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          {/* ====================================
              マスターキータブ
              ==================================== */}
          <TabsContent value="master-keys" className="space-y-2 md:space-y-4 mt-24 md:mt-6">
            <Card>
              <CardHeader className="pb-2 md:pb-4">
                <CardTitle className="text-base md:text-lg">新しいマスターキーの生成</CardTitle>
                <CardDescription className="text-sm">
                  BIP39準拠のニーモニックを生成し、AES-256-GCMで暗号化保存します
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 md:space-y-3 p-3 md:p-6 pt-0">
                <div className="grid gap-2 md:gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="description">説明 (オプション)</Label>
                    <Input
                      id="description"
                      placeholder="例: 本番環境用マスターキー"
                    />
                  </div>
                  <div>
                    <Label htmlFor="strength">強度</Label>
                    <select
                      id="strength"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      defaultValue="256"
                    >
                      <option value="128">128ビット (12語)</option>
                      <option value="256">256ビット (24語)</option>
                    </select>
                  </div>
                </div>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      className="w-full"
                      disabled={generateMasterKeyMutation.isPending}
                    >
                      {generateMasterKeyMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      マスターキー生成
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>マスターキー生成の確認</AlertDialogTitle>
                      <AlertDialogDescription>
                        新しいマスターキーを生成すると、既存のアクティブなマスターキーは無効化されます。
                        この操作は取り消せません。続行しますか？
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>キャンセル</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          const description = (document.getElementById('description') as HTMLInputElement)?.value;
                          const strength = parseInt((document.getElementById('strength') as HTMLSelectElement)?.value) as 128 | 256;
                          generateMasterKeyMutation.mutate({ strength, description });
                        }}
                      >
                        生成する
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>

            {/* Generated Mnemonic Display */}
            {generatedMnemonic && (
              <Card className="border-orange-200 bg-orange-50">
                <CardHeader className="pb-2 md:pb-4">
                  <CardTitle className="flex items-center gap-2 text-orange-800 text-base md:text-lg">
                    <AlertTriangle className="h-4 w-4 md:h-5 md:w-5" />
                    重要: ニーモニック
                  </CardTitle>
                  <CardDescription className="text-orange-700 text-sm">
                    この画面は一度だけ表示されます。必ずバックアップを取ってください。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 md:space-y-3 p-3 md:p-6 pt-0">
                  <div className="relative">
                    <Textarea
                      value={showMnemonic ? generatedMnemonic : '********************************************'}
                      readOnly
                      className="font-mono text-sm bg-white"
                      rows={3}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => setShowMnemonic(!showMnemonic)}
                    >
                      {showMnemonic ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={handleCopyMnemonic}
                      className="flex-1"
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      コピー
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleCloseMnemonic}
                      className="flex-1"
                    >
                      閉じる
                    </Button>
                  </div>

                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      このニーモニックを安全な場所にバックアップしてください。
                      紛失すると、すべてのウォレットアドレスにアクセスできなくなります。
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            )}

            {/* Master Keys List */}
            <Card>
              <CardHeader className="pb-2 md:pb-4">
                <CardTitle className="text-base md:text-lg">マスターキー一覧</CardTitle>
              </CardHeader>
              <CardContent className="p-3 md:p-6 pt-0">
                {masterKeysLoading ? (
                  <div className="flex items-center justify-center py-4 md:py-8">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-2 md:space-y-3">
                    {masterKeys.map((mk) => (
                      <div
                        key={mk.id}
                        className="flex items-center justify-between p-2 md:p-3 border rounded-lg"
                      >
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {mk.description || `マスターキー ${mk.id.slice(0, 8)}`}
                            </span>
                            {mk.active && <Badge>アクティブ</Badge>}
                            {mk.backup_verified && (
                              <Badge variant="outline">
                                <CheckCircle className="mr-1 h-3 w-3" />
                                検証済み
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            作成日: {new Date(mk.created_at).toLocaleString('ja-JP')}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewMnemonic(mk.id)}
                          disabled={viewMnemonicMutation.isPending}
                        >
                          {viewMnemonicMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Eye className="mr-2 h-4 w-4" />
                          )}
                          ニーモニック確認
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ====================================
              Wallet Rootsタブ
              ==================================== */}
          <TabsContent value="wallet-roots" className="space-y-2 md:space-y-4 mt-24 md:mt-6">
            <Card>
              <CardHeader className="pb-2 md:pb-4">
                <CardTitle className="text-base md:text-lg">Wallet Roots自動初期化</CardTitle>
                <CardDescription className="text-sm">
                  アクティブなマスターキーから全チェーンのxpubを自動生成します
                </CardDescription>
              </CardHeader>
              <CardContent className="p-3 md:p-6 pt-0">
                <Button
                  onClick={() => {
                    if (activeMasterKey) {
                      initializeWalletRootsMutation.mutate({
                        masterKeyId: activeMasterKey.id
                      });
                    }
                  }}
                  disabled={!activeMasterKey || initializeWalletRootsMutation.isPending}
                  className="w-full"
                >
                  {initializeWalletRootsMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  自動初期化実行
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 md:pb-4">
                <CardTitle className="text-base md:text-lg">Wallet Roots一覧</CardTitle>
              </CardHeader>
              <CardContent className="p-3 md:p-6 pt-0">
                {walletRootsLoading ? (
                  <div className="flex items-center justify-center py-4 md:py-8">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-2 md:space-y-3">
                    {walletRoots.map((wr) => (
                      <div
                        key={wr.id}
                        className="flex items-center justify-between p-2 md:p-3 border rounded-lg"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {wr.chain.toUpperCase()}/{wr.network}/{wr.asset}
                            </span>
                            {wr.auto_generated ? (
                              <Badge>HDウォレット</Badge>
                            ) : (
                              <Badge variant="secondary">レガシー</Badge>
                            )}
                            {wr.verified && (
                              <Badge variant="outline">
                                <CheckCircle className="mr-1 h-3 w-3" />
                                検証済み
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground font-mono">
                            {wr.chain === 'trc' ? (
                              <>アドレス: {wr.xpub.slice(0, 8)}...{wr.xpub.slice(-6)}</>
                            ) : wr.chain === 'xrp' ? (
                              <>アドレス: {wr.xpub.slice(0, 8)}...{wr.xpub.slice(-6)}</>
                            ) : wr.chain === 'ada' ? (
                              <>アドレス: {wr.xpub.slice(0, 12)}...{wr.xpub.slice(-8)}</>
                            ) : (
                              <>xpub: {wr.xpub.slice(0, 20)}...</>
                            )}
                          </p>
                          {wr.derivation_path && (
                            <p className="text-sm text-muted-foreground">
                              導出パス: {wr.derivation_path}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ====================================
              バックアップ検証タブ
              ==================================== */}
          <TabsContent value="backup" className="space-y-2 md:space-y-4 mt-24 md:mt-6">
            <Card>
              <CardHeader className="pb-2 md:pb-4">
                <CardTitle className="text-base md:text-lg">バックアップ検証</CardTitle>
                <CardDescription className="text-sm">
                  保存されたニーモニックの正確性を検証します
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 md:space-y-3 p-3 md:p-6 pt-0">
                <div>
                  <Label htmlFor="verification-mnemonic">ニーモニック (24語)</Label>
                  <Textarea
                    id="verification-mnemonic"
                    placeholder="12または24語のニーモニックを入力してください"
                    value={verificationMnemonic}
                    onChange={(e) => setVerificationMnemonic(e.target.value)}
                    className="font-mono"
                    rows={3}
                  />
                </div>

                <Button
                  onClick={() => {
                    if (activeMasterKey && verificationMnemonic.trim()) {
                      verifyBackupMutation.mutate({
                        masterKeyId: activeMasterKey.id,
                        mnemonic: verificationMnemonic.trim()
                      });
                    }
                  }}
                  disabled={!activeMasterKey || !verificationMnemonic.trim() || verifyBackupMutation.isPending}
                  className="w-full"
                >
                  {verifyBackupMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  バックアップ検証
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ニーモニック確認Dialog */}
        <AlertDialog open={viewMnemonicDialogOpen} onOpenChange={setViewMnemonicDialogOpen}>
          <AlertDialogContent className="max-w-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-orange-800">
                <AlertTriangle className="h-5 w-5" />
                セキュリティ警告
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-3">
                <p className="text-orange-700 font-semibold">
                  このニーモニックフレーズは絶対に他人に共有しないでください。
                </p>
                <p className="text-sm text-muted-foreground">
                  このフレーズを知っている人は、すべてのウォレットアドレスにアクセスできます。
                  スクリーンショットを撮る際は、安全な場所に保存してください。
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-3">
              <div className="relative">
                <Textarea
                  value={showViewMnemonic ? currentViewMnemonic : '********************************************'}
                  readOnly
                  className="font-mono text-sm bg-white"
                  rows={3}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => setShowViewMnemonic(!showViewMnemonic)}
                >
                  {showViewMnemonic ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleCopyViewMnemonic}
                  className="flex-1"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  コピー
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleCloseViewMnemonic}
                  className="flex-1"
                >
                  閉じる
                </Button>
              </div>

              <Alert className="border-orange-200 bg-orange-50">
                <AlertTriangle className="h-4 w-4 text-orange-700" />
                <AlertDescription className="text-orange-700">
                  このニーモニックを紛失すると、ウォレットへのアクセスが永久に失われる可能性があります。
                  安全な場所にバックアップを保管してください。
                </AlertDescription>
              </Alert>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}