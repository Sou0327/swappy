import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { getPriceSnapshot } from "@/lib/price-service";
import { supabase } from "@/integrations/supabase/client";
import AnimatedCounter from "@/components/AnimatedCounter";
import {
  Eye,
  EyeOff,
  FileText,
  Upload,
  TrendingUp,
  Info,
  RefreshCw,
  Shield,
  Clock,
  HelpCircle
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [totalBalance, setTotalBalance] = useState(0);
  const [btcPrice, setBtcPrice] = useState(97000); // デフォルト値（2025年9月相場）
  const [loading, setLoading] = useState(true);
  const [kycCompleted, setKycCompleted] = useState(false);

  const fetchUserAssets = useCallback(async () => {
    try {
      // user_assetsから直接取得（本番環境の表示問題を解決するため）
      // 注: 将来的にledger_entriesとの整合性が取れたらuser_balances_viewに戻す可能性あり
      const { data: assets } = await supabase
        .from('user_assets')
        .select('currency, balance')
        .eq('user_id', user?.id);

      const rows: Array<{ currency: string; amount: number }> = (assets || []).map((a: { currency: string; balance: string | number }) => ({
        currency: a.currency as string,
        amount: Number(a.balance)
      }));

      // BTC換算表示のため、BTCを常に価格取得に含める
      const symbols = Array.from(new Set([...rows.map(r => r.currency), 'BTC']));
      const snap = await getPriceSnapshot(symbols);
      const totalUsd = rows.reduce((sum, r) => sum + r.amount * (snap.usd[r.currency] || 1), 0);

      // BTC価格を更新（BTC換算表示用）
      if (snap.usd['BTC']) {
        setBtcPrice(snap.usd['BTC']);
      }

      setTotalBalance(totalUsd);
    } catch (error) {
      console.error('Error fetching assets:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const fetchUserStatus = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      // プロフィールからKYC状態を確認
      const { data: profile } = await supabase
        .from('profiles')
        .select('kyc_status')
        .eq('id', user.id)
        .maybeSingle();
      
      if (profile) {
        setKycCompleted(profile.kyc_status === 'verified');
      }
    } catch (error) {
      console.error('Error fetching user status:', error);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      fetchUserAssets();
      fetchUserStatus();
    }
  }, [user?.id, fetchUserAssets, fetchUserStatus]);

  // アカウントアクセス履歴は画面上から非表示（将来のために実装は保留）

  return (
    <DashboardLayout>
      <div className="space-y-2 md:space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl md:text-2xl font-bold text-gray-900">ダッシュボード</h1>
        </div>

        {/* Wallet Overview */}
        <div>
          <h2 className="text-base md:text-base font-semibold mb-2 md:mb-2 text-gray-900">ウォレット概要</h2>
          <Card>
            <CardContent className="p-2 md:p-2">
              <div className="mb-2">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm text-gray-600">合計価値 (USD)</span>
                      <Info className="h-4 w-4 text-gray-400" />
                      <button
                        className="text-primary cursor-pointer hover:underline text-sm transition-all duration-200 active:scale-95"
                        onClick={() => navigate("/wallet")}
                      >
                        資産詳細
                      </button>
                    </div>
                    <div className="text-2xl md:text-2xl font-bold">
                      {loading ? 'Loading...' : balanceVisible ? (
                        <AnimatedCounter 
                          value={totalBalance} 
                          prefix="$ " 
                          decimals={2} 
                          duration={2000}
                        />
                      ) : '****'}
                    </div>
                    <div className="text-xs md:text-sm font-normal text-gray-600 mt-1">
                      ≈ {balanceVisible ? (
                        <AnimatedCounter
                          value={totalBalance / btcPrice}
                          suffix=" BTC"
                          decimals={8}
                          duration={2500}
                        />
                      ) : '****'}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 md:flex-none" onClick={() => navigate("/deposit")}>入金</Button>
                    <Button size="sm" variant="outline" className="flex-1 md:flex-none" onClick={() => navigate("/withdraw")}>出金</Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Getting Started */}
        <div>
          <h2 className="text-base md:text-base font-semibold mb-2 md:mb-2 text-gray-900">
            {!kycCompleted ? '初回の暗号通貨ステップを始める' : 'クイックアクション'}
          </h2>
          {!kycCompleted && (
            <p className="text-gray-600 mb-2 md:mb-2 text-sm md:text-sm">
              これらの簡単なアクションを完了して、アカウントをアクティベートし、セキュリティを強化することで、暗号通貨の旅を始めましょう。
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-2">
            {!kycCompleted && (
              <Card>
                <CardContent className="p-2 md:p-2">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-0">
                    <div className="flex items-center gap-2 md:gap-2 flex-1">
                      <div className="p-2 md:p-3 bg-primary/10 rounded-lg flex-shrink-0">
                        <FileText className="h-5 w-5 md:h-5 md:w-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-gray-900 text-sm md:text-sm">本人確認</h3>
                        <p className="text-xs md:text-sm text-gray-600">
                          KYC書類をアップロードしてください。- 任意 -
                        </p>
                      </div>
                    </div>
                    <Button size="sm" className="md:size-default transition-all duration-200 active:scale-95" onClick={() => navigate("/kyc")}>確認</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-2 md:p-2">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-0">
                  <div className="flex items-center gap-2 md:gap-2 flex-1">
                    <div className="p-2 md:p-3 bg-primary/10 rounded-lg flex-shrink-0">
                      <Upload className="h-5 w-5 md:h-5 md:w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-gray-900 text-sm md:text-sm">暗号通貨を入金</h3>
                      <p className="text-xs md:text-sm text-gray-600">
                        アドレスまたはQRコードでコインを選択して入金してください
                      </p>
                    </div>
                  </div>
                  <Button size="sm" className="md:size-default transition-all duration-200 active:scale-95" onClick={() => navigate("/deposit")}>入金</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-2 md:p-2">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-0">
                  <div className="flex items-center gap-2 md:gap-2 flex-1">
                    <div className="p-2 md:p-3 bg-primary/10 rounded-lg flex-shrink-0">
                      <TrendingUp className="h-5 w-5 md:h-5 md:w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-gray-900 text-sm md:text-sm">取引開始</h3>
                      <p className="text-xs md:text-sm text-gray-600">
                        スポットマーケットにアクセスして暗号通貨を即座に売買してください
                      </p>
                    </div>
                  </div>
                  <Button size="sm" className="md:size-default transition-all duration-200 active:scale-95" onClick={() => navigate("/trade")}>取引</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Additional Quick Actions */}
        <div>
          <h2 className="text-base md:text-base font-semibold mb-2 md:mb-2 text-gray-900">その他のサービス</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-2">
            {/* 両替 */}
            <button
              onClick={() => navigate("/convert")}
              className="p-2 bg-white rounded-lg border hover:border-primary/50 hover:bg-primary/5 active:bg-primary/10 transition-all duration-200 active:scale-95 text-left"
            >
              <div className="flex flex-col items-center text-center gap-2">
                <div className="p-2 bg-green-100 rounded-lg">
                  <RefreshCw className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 text-sm">両替</h3>
                  <p className="text-xs text-gray-600 mt-1">暗号通貨の交換</p>
                </div>
              </div>
            </button>

            {/* セキュリティ */}
            <button
              onClick={() => navigate("/security")}
              className="p-2 bg-white rounded-lg border hover:border-primary/50 hover:bg-primary/5 active:bg-primary/10 transition-all duration-200 active:scale-95 text-left"
            >
              <div className="flex flex-col items-center text-center gap-2">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Shield className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 text-sm">セキュリティ</h3>
                  <p className="text-xs text-gray-600 mt-1">アカウント設定</p>
                </div>
              </div>
            </button>

            {/* 履歴 */}
            <button
              onClick={() => navigate("/history")}
              className="p-2 bg-white rounded-lg border hover:border-primary/50 hover:bg-primary/5 active:bg-primary/10 transition-all duration-200 active:scale-95 text-left"
            >
              <div className="flex flex-col items-center text-center gap-2">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Clock className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 text-sm">履歴</h3>
                  <p className="text-xs text-gray-600 mt-1">取引履歴</p>
                </div>
              </div>
            </button>

            {/* サポート */}
            <button
              onClick={() => navigate("/support")}
              className="p-2 bg-white rounded-lg border hover:border-primary/50 hover:bg-primary/5 active:bg-primary/10 transition-all duration-200 active:scale-95 text-left"
            >
              <div className="flex flex-col items-center text-center gap-2">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <HelpCircle className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 text-sm">サポート</h3>
                  <p className="text-xs text-gray-600 mt-1">ヘルプ・お問合せ</p>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* アカウントアクセス履歴（非表示） */}
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
