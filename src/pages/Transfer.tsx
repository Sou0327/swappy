import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Send,
  Search,
  User,
  Wallet,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  CreditCard
} from "lucide-react";

interface UserAsset {
  currency: string;
  balance: number;
  locked_balance: number;
}

interface RecipientInfo {
  id: string;
  email: string | null;
  user_handle: string;
  display_name: string | null;
  full_name: string | null;
}


const Transfer = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  // フォーム状態
  const [recipientSearch, setRecipientSearch] = useState("");
  const [selectedRecipient, setSelectedRecipient] = useState<RecipientInfo | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [showConfirmation, setShowConfirmation] = useState(false);

  // データ状態
  const [userAssets, setUserAssets] = useState<UserAsset[]>([]);
  const [searchResults, setSearchResults] = useState<RecipientInfo[]>([]);

  // UI状態
  const [isSearching, setIsSearching] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [showBalance, setShowBalance] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ユーザー資産の取得
  useEffect(() => {
    const fetchUserAssets = async () => {
      if (!user?.id) return;

      const { data, error } = await supabase
        .from('user_assets')
        .select('currency, balance, locked_balance')
        .eq('user_id', user.id)
        .gt('balance', 0); // 残高がある通貨のみ

      if (!error && data) {
        setUserAssets(data);
      }
    };

    fetchUserAssets();
  }, [user?.id]);


  // ユーザー検索(デバウンス付き)
  const normalizeQuery = useCallback((value: string) => {
    return value.trim().replace(/^@+/, "");
  }, []);

  const searchUsers = useCallback(async (rawQuery: string) => {
    const query = normalizeQuery(rawQuery);

    if (!query || query.length < 2) {
      setSearchResults([]);
      setSelectedIndex(-1);
      return;
    }

    setIsSearching(true);

    try {
      const { data, error } = await supabase
        .rpc('search_public_profiles', { p_query: query });

      if (error) {
        toast({
          title: "検索エラー",
          description: "ユーザー検索中にエラーが発生しました",
          variant: "destructive"
        });
        setSearchResults([]);
        return;
      }

      const mappedResults = (data ?? []).filter((profile) => profile.user_handle).map((profile) => ({
        id: profile.profile_id,
        email: profile.email,
        user_handle: profile.user_handle,
        display_name: profile.display_name,
        full_name: profile.full_name,
      }));

      setSearchResults(mappedResults);
      setSelectedIndex(-1);
    } catch (error) {
      toast({
        title: "検索エラー",
        description: "予期しないエラーが発生しました",
        variant: "destructive"
      });
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [normalizeQuery, toast]);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const trimmedQuery = recipientSearch.trim();

    if (!trimmedQuery) {
      setSearchResults([]);
      setSelectedIndex(-1);
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      void searchUsers(recipientSearch);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
    };
  }, [recipientSearch, searchUsers]);

  // 検索結果が更新された時のフォーカス管理
  useEffect(() => {
    if (searchResults.length > 0 && recipientSearch.trim().length >= 2) {
      setSearchFocused(true);
    }
  }, [searchResults, recipientSearch]);

  // 送金処理
  const handleTransfer = async () => {
    if (!selectedRecipient || !selectedCurrency || !amount) {
      return;
    }

    setIsTransferring(true);
    try {
      const rpcParams = {
        p_to_user_identifier: selectedRecipient.user_handle,
        p_currency: selectedCurrency,
        p_amount: parseFloat(amount),
        p_description: description.trim() || null
      };

      const { data, error } = await supabase.rpc('transfer_funds', rpcParams);

      if (error) throw error;

      const result = data as { success: boolean; error?: string; reference_number?: string };

      if (result.success) {
        toast({
          title: "送金完了",
          description: `${amount} ${selectedCurrency} を @${selectedRecipient.user_handle} に送金しました\n参照番号: ${result.reference_number}`,
        });

        // フォームリセット
        setSelectedRecipient(null);
        setRecipientSearch("");
        setSelectedCurrency("");
        setAmount("");
        setDescription("");
        setShowConfirmation(false);

        // 残高を再取得
        const { data: updatedAssets } = await supabase
          .from('user_assets')
          .select('currency, balance, locked_balance')
          .eq('user_id', user?.id)
          .gt('balance', 0);

        if (updatedAssets) {
          setUserAssets(updatedAssets);
        }
      } else {
        throw new Error(result.error || '送金に失敗しました');
      }
    } catch (error) {
      console.error('送金エラー:', error);
      const message = error instanceof Error ? error.message : "送金に失敗しました。再試行してください。";
      toast({
        title: "送金エラー",
        description: message,
        variant: "destructive"
      });
    } finally {
      setIsTransferring(false);
    }
  };

  // バリデーション
  const canSubmit = useMemo(() => {
    if (!selectedRecipient || !selectedCurrency || !amount) {
      return false;
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return false;
    }

    const selectedAsset = userAssets.find((asset) => asset.currency === selectedCurrency);
    if (!selectedAsset) return false;

    // 利用可能残高 = balance - locked_balance
    const availableBalance = selectedAsset.balance - (selectedAsset.locked_balance || 0);
    return numericAmount <= availableBalance;
  }, [amount, selectedCurrency, selectedRecipient, userAssets]);

  if (showConfirmation) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowConfirmation(false)}
              className="text-muted-foreground"
            >
              ← 戻る
            </Button>
            <h1 className="text-2xl font-bold">送金確認</h1>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                送金内容の確認
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 送金先 */}
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">送金先</Label>
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                    {selectedRecipient?.display_name?.[0] || '?'}
                  </div>
                  <div>
                    <p className="font-medium">{selectedRecipient?.display_name}</p>
                    <p className="text-sm text-muted-foreground">@{selectedRecipient?.user_handle}</p>
                  </div>
                </div>
              </div>

              {/* 送金金額 */}
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">送金金額</Label>
                <div className="text-2xl font-bold">
                  {amount} {selectedCurrency}
                </div>
              </div>

              {/* 説明 */}
              {description && (
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">説明</Label>
                  <p className="text-sm p-3 bg-muted/50 rounded-lg">{description}</p>
                </div>
              )}

              <Separator />

              {/* 確認ボタン */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowConfirmation(false)}
                >
                  キャンセル
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleTransfer}
                  disabled={isTransferring}
                >
                  {isTransferring ? '送金中...' : '送金実行'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl md:text-2xl font-bold">送金</h1>


        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* メインフォーム */}
          <div className="lg:col-span-2 space-y-6">
            {/* 送金先検索 */}
            <Card style={{ overflow: 'visible', position: 'relative' }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  送金先を選択
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4" style={{ overflow: 'visible', position: 'relative' }}>
                <div className="space-y-2">
                  <Label htmlFor="recipient">ユーザーID、メールアドレス、または表示名</Label>
                  <div className="relative" style={{ position: 'relative', zIndex: 1 }}>
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="recipient"
                      placeholder="@username, email@example.com, または 表示名"
                      value={recipientSearch}
                      onChange={(e) => {
                        setRecipientSearch(e.target.value);
                      }}
                      onFocus={() => {
                        setSearchFocused(true);
                      }}
                      onBlur={() => {
                        // 検索結果がある場合は少し長めの遅延を設ける
                        const delay = searchResults.length > 0 ? 300 : 200;
                        setTimeout(() => {
                          // 検索結果が選択されていない場合のみフォーカスを外す
                          if (!selectedRecipient) {
                            setSearchFocused(false);
                          }
                        }, delay);
                      }}
                      onKeyDown={(e) => {
                        if (searchResults.length === 0) return;

                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setSelectedIndex(prev =>
                            prev < searchResults.length - 1 ? prev + 1 : 0
                          );
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setSelectedIndex(prev =>
                            prev > 0 ? prev - 1 : searchResults.length - 1
                          );
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          if (selectedIndex >= 0 && searchResults[selectedIndex]) {
                            const selected = searchResults[selectedIndex];
                            setSelectedRecipient(selected);
                            setRecipientSearch(`@${selected.user_handle}`);
                            setSearchResults([]);
                            setSearchFocused(false);
                          }
                        } else if (e.key === 'Escape') {
                          setSearchResults([]);
                          setSearchFocused(false);
                        }
                      }}
                      className="pl-10"
                    />

                    {/* 検索結果 - 入力フィールドの直下に配置 */}
                    {(searchResults.length > 0 && !selectedRecipient) && (
                      <Card style={{
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        left: '0',
                        right: '0',
                        zIndex: 1000,
                        backgroundColor: 'white',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                        maxHeight: '250px'
                      }}>
                        <CardContent className="p-0 max-h-64 overflow-y-auto">
                          {isSearching && (
                            <div className="p-3 text-center text-muted-foreground">
                              <div className="flex items-center justify-center gap-2">
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                                検索中...
                              </div>
                            </div>
                          )}
                          {!isSearching && searchResults.map((result, index) => (
                            <button
                              key={result.id}
                              className={`w-full p-3 text-left transition-colors border-b last:border-b-0 ${index === selectedIndex
                                  ? 'bg-primary/10 border-primary/20'
                                  : 'hover:bg-muted/50'
                                } first:rounded-t-lg last:rounded-b-lg`}
                              onClick={() => {
                                setSelectedRecipient(result);
                                setRecipientSearch(`@${result.user_handle}`);
                                setSearchResults([]);
                                setSearchFocused(false);
                              }}
                              onMouseEnter={() => setSelectedIndex(index)}
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-md">
                                  {result.display_name?.[0]?.toUpperCase() || result.user_handle?.[0]?.toUpperCase() || '?'}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm truncate">{result.display_name || result.full_name || result.user_handle}</p>
                                  <p className="text-xs text-muted-foreground font-mono">@{result.user_handle}</p>
                                  {result.email && (
                                    <p className="text-xs text-muted-foreground truncate">{result.email}</p>
                                  )}
                                </div>
                                {index === selectedIndex && (
                                  <div className="text-primary">
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                    </svg>
                                  </div>
                                )}
                              </div>
                            </button>
                          ))}
                          {!isSearching && searchResults.length === 0 && recipientSearch.length >= 2 && (
                            <div className="p-3 text-center text-muted-foreground">
                              ユーザーが見つかりません
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>



                {/* 選択済み受信者 */}
                {selectedRecipient && (
                  <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg shadow-sm">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center text-white font-bold shadow-md">
                      {selectedRecipient.display_name?.[0]?.toUpperCase() || selectedRecipient.user_handle?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-green-900">{selectedRecipient.display_name || selectedRecipient.full_name}</p>
                      <p className="text-sm text-green-700 font-mono">@{selectedRecipient.user_handle}</p>
                      {selectedRecipient.email && (
                        <p className="text-xs text-green-600">{selectedRecipient.email}</p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedRecipient(null);
                        setRecipientSearch("");
                        setSearchResults([]);
                      }}
                      className="text-green-700 border-green-300 hover:bg-green-100"
                    >
                      変更
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 送金金額 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  送金金額
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="currency">通貨</Label>
                    <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
                      <SelectTrigger>
                        <SelectValue placeholder="通貨を選択" />
                      </SelectTrigger>
                      <SelectContent>
                        {userAssets.map((asset) => {
                          const availableBalance = asset.balance - (asset.locked_balance || 0);
                          return (
                            <SelectItem key={asset.currency} value={asset.currency}>
                              <div className="flex items-center justify-between w-full">
                                <span>{asset.currency}</span>
                                <span className="text-muted-foreground ml-2">
                                  {showBalance ? availableBalance.toFixed(8) : '••••••••'}
                                </span>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="amount">数量選択</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowBalance(!showBalance)}
                        className="h-auto p-1"
                      >
                        {showBalance ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <div className="relative">
                      <Input
                        id="amount"
                        type="number"
                        step="0.00000001"
                        placeholder="0.00000000"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="pr-16"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 px-2 text-xs"
                        onClick={() => {
                          if (selectedCurrency) {
                            const selectedAsset = userAssets.find(asset => asset.currency === selectedCurrency);
                            if (selectedAsset) {
                              const availableBalance = selectedAsset.balance - (selectedAsset.locked_balance || 0);
                              setAmount(availableBalance.toString());
                            }
                          }
                        }}
                        disabled={!selectedCurrency}
                      >
                        最大
                      </Button>
                    </div>
                  </div>
                </div>

                {/* 残高と限度額表示 */}
                {selectedCurrency && (
                  <div className="space-y-2 text-sm text-muted-foreground">
                    {(() => {
                      const selectedAsset = userAssets.find(asset => asset.currency === selectedCurrency);
                      if (!selectedAsset) return null;
                      const availableBalance = selectedAsset.balance - (selectedAsset.locked_balance || 0);
                      return (
                        <p>利用可能残高: {showBalance ? availableBalance.toFixed(8) : '••••••••'} {selectedCurrency}</p>
                      );
                    })()}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="description">説明（オプション）</Label>
                  <Textarea
                    id="description"
                    placeholder="送金の理由や説明を入力..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            {/* 送金ボタン */}
            <Card>
              <CardContent className="pt-6">
                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => setShowConfirmation(true)}
                  disabled={!canSubmit}
                >
                  <Send className="h-4 w-4 mr-2" />
                  送金内容を確認
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* サイドバー */}
          <div className="space-y-6">
            {/* 注意事項 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                  ご注意
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <p>• 送金は即座に実行され、キャンセルできません</p>
                <p>• 送金先ユーザーIDを必ずご確認ください</p>
                <p>• ネットワーク手数料は発生しません</p>
              </CardContent>
            </Card>

            {/* 保有資産 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  保有資産
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {userAssets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">送金可能な資産がありません</p>
                ) : (
                  userAssets.map((asset) => {
                    const availableBalance = asset.balance - (asset.locked_balance || 0);
                    return (
                      <div key={asset.currency} className="flex justify-between items-center">
                        <Badge variant="outline">{asset.currency}</Badge>
                        <span className="text-sm font-mono">
                          {showBalance ? availableBalance.toFixed(8) : '••••••••'}
                        </span>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Transfer;
