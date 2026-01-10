import { useEffect, useMemo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DemoRestrictionNotice } from "@/components/DemoRestrictionNotice";
import { PLATFORM_NAME } from "@/config/branding";

const Withdraw = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isDemoMode } = useAuth();
  const { t } = useTranslation('wallet');

  const cryptoOptions = useMemo(() => [
    { value: "USDT", label: "USDT", networks: ["ERC20", "TRC20", "BEP20", "Polygon"] },
    { value: "BTC", label: "Bitcoin (BTC)", networks: ["Bitcoin"] },
    { value: "ETH", label: "Ethereum (ETH)", networks: ["ERC20"] },
    { value: "TRX", label: "Tron (TRX)", networks: ["TRC20"] },
    { value: "XRP", label: "Ripple (XRP)", networks: ["XRP Ledger"] },
    { value: "ADA", label: "Cardano (ADA)", networks: ["Cardano"] },
  ], []);

  // アイコン
  const assetIconSrc = (symbol: string): string => {
    const map: Record<string, string> = {
      USDT: '/icons/tether.png',
      BTC: '/icons/bitcoin.png',
      ETH: '/icons/ethereum.png',
      TRX: '/icons/tron.png',
      XRP: '/icons/xrp.png',
      ADA: '/icons/cardano.png',
    };
    return map[symbol] || '';
  };

  // デフォルト最小出金額（必要に応じて調整）
  const minWithdrawMap: Record<string, number> = {
    USDT: 1,
    BTC: 0.0001,
    ETH: 0.001,
    TRX: 1,
    XRP: 20,
    ADA: 1,
  };

  const [coin, setCoin] = useState("TRX");
  const [network, setNetwork] = useState("TRC20");
  const [address, setAddress] = useState("");
  const [memoTag, setMemoTag] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [available, setAvailable] = useState<number>(0);

  const selectedCrypto = useMemo(() => cryptoOptions.find(c => c.value === coin), [coin, cryptoOptions]);
  const networks = selectedCrypto?.networks ?? [];

  const requiresTag = false; // XRPタグは任意に変更

  const minWithdraw = minWithdrawMap[coin] ?? 0;
  const maxWithdraw = available;

  const decimalsFor = (symbol: string) => {
    switch (symbol) {
      case 'BTC':
        return 8; // satoshi単位対応（1 satoshi = 0.00000001 BTC）
      case 'ETH':
        return 6;
      case 'USDT':
      case 'USDC':
      case 'TRX':
      case 'ADA':
        return 2;
      case 'XRP':
        return 6;
      default:
        return 6;
    }
  };

  const setPercent = (pct: number) => {
    if (pct === 1.0) {
      // 100%の場合は丸め処理を回避して正確な残高を使用
      setAmount(available.toString());
    } else {
      const valueNum = available * pct;
      const dec = decimalsFor(coin);
      setAmount(valueNum.toFixed(dec));
    }
  };

  // 残高読込
  const loadAvailable = useCallback(async () => {
    if (!user?.id || !coin) { setAvailable(0); return; }
    try {
      // user_assetsから直接取得（本番環境の表示問題を解決するため）
      // available = balance - locked_balance
      const { data } = await supabase
        .from('user_assets')
        .select('balance, locked_balance')
        .eq('user_id', user.id)
        .eq('currency', coin)
        .maybeSingle();

      if (data) {
        const avail = Number(data.balance || 0) - Number(data.locked_balance || 0);
        setAvailable(Math.max(0, avail));
      } else {
        setAvailable(0);
      }
    } catch {
      setAvailable(0);
    }
  }, [user?.id, coin]);

  const canSubmit = () => {
    const amt = Number(amount);
    if (!coin || !network || !address) return false;
    if (Number.isNaN(amt) || amt <= 0) return false;
    if (amt < minWithdraw || amt > available) return false;
    // XRPタグは任意なので必須チェックを削除
    return true;
  };

  const handleSubmit = async () => {
    // デモモードでの出金を防止（防御的コーディング）
    if (isDemoMode) return;
    if (!canSubmit()) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('request_withdrawal', {
        p_currency: coin,
        p_amount: Number(amount),
        p_wallet_address: address,
        p_network: network,
        p_memo: coin === "XRP" && memoTag.trim() ? memoTag.trim() : null,
      });
      if (error) throw error;
      toast({
        title: t('withdraw.toast.submitted'),
        description: t('withdraw.toast.submittedDesc', { coin, amount, network }),
      });
      setAmount("");
      // ロックが反映された利用可能残高を再取得
      await loadAvailable();
    } catch (e: unknown) {
      const error = e as Error;
      toast({ title: t('withdraw.toast.error'), description: error.message || t('withdraw.toast.errorDefault'), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  // SEO: title, description, canonical
  useEffect(() => {
    document.title = t('withdraw.pageTitle', { platform: PLATFORM_NAME });
    const descText = t('withdraw.pageDescription');
    let desc = document.querySelector('meta[name="description"]');
    if (!desc) {
      desc = document.createElement("meta");
      desc.setAttribute("name", "description");
      document.head.appendChild(desc);
    }
    desc.setAttribute("content", descText);

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", `${window.location.origin}/withdraw`);
  }, []);

  useEffect(() => {
    // Ensure network stays valid for selected coin
    if (selectedCrypto && !selectedCrypto.networks.includes(network)) {
      setNetwork(selectedCrypto.networks[0]);
    }
  }, [selectedCrypto, network]);

  useEffect(() => {
    loadAvailable();
  }, [loadAvailable]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">{t('withdraw.title')}</h1>
        </div>

        {/* デモモード制限通知 */}
        {isDemoMode && <DemoRestrictionNotice feature={t('withdraw.featureName')} className="mb-6" />}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('withdraw.formTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Step 1 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">1</div>
                    <label className="text-sm font-medium">{t('withdraw.form.coinLabel')}</label>
                  </div>
                  <Select value={coin} onValueChange={(v) => setCoin(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t('withdraw.form.selectPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {cryptoOptions.map(c => (
                        <SelectItem key={c.value} value={c.value}>
                          <div className="flex items-center gap-2">
                            {assetIconSrc(c.value) ? (
                              <img src={assetIconSrc(c.value)} alt={c.value} className="w-5 h-5" />
                            ) : (
                              <div className="w-5 h-5 bg-primary/20 rounded" />
                            )}
                            {c.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {coin && (
                    <div className="bg-primary/10 p-3 rounded-lg">
                      <div className="flex items-center gap-2">
                        {assetIconSrc(coin) ? (
                          <img src={assetIconSrc(coin)} alt={coin} className="w-5 h-5" />
                        ) : (
                          <div className="w-5 h-5 bg-primary/20 rounded" />
                        )}
                        <Badge variant="outline" className="bg-primary text-primary-foreground">{coin}</Badge>
                      </div>
                    </div>
                  )}
                </div>

                {/* Step 2 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">2</div>
                    <label className="text-sm font-medium">{t('withdraw.form.networkLabel')}</label>
                  </div>
                  <Select value={network} onValueChange={setNetwork}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t('withdraw.form.networkPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {networks.map(n => (
                        <SelectItem key={n} value={n}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Step 3 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">3</div>
                    <label className="text-sm font-medium">{t('withdraw.form.addressLabel')}</label>
                  </div>
                  <Input
                    placeholder={t('withdraw.form.addressPlaceholder')}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="font-mono"
                  />
                  {coin === "XRP" && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t('withdraw.form.tagLabel')}</label>
                      <Input
                        placeholder={t('withdraw.form.tagPlaceholder')}
                        value={memoTag}
                        onChange={(e) => setMemoTag(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                {/* Amount */}
                <div className="space-y-3">
                  <label className="text-sm font-medium">{t('withdraw.form.amountLabel')}</label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder={t('withdraw.form.amountPlaceholder')}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className={Number(amount) > available ? "border-red-500 focus:border-red-500" : ""}
                  />
                  {/* 残高不足警告 */}
                  {amount && Number(amount) > available && (
                    <div className="bg-red-50 border border-red-200 rounded-md p-3">
                      <div className="flex items-center gap-2 text-red-700">
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <span className="text-sm font-medium">{t('withdraw.balance.insufficient')}</span>
                      </div>
                      <p className="text-sm text-red-600 mt-1">
                        {t('withdraw.balance.insufficientMessage', { balance: available.toFixed(decimalsFor(coin)), coin })}
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-4 gap-2">
                    <Button variant="outline" type="button" onClick={() => setPercent(0.25)}>25%</Button>
                    <Button variant="outline" type="button" onClick={() => setPercent(0.5)}>50%</Button>
                    <Button variant="outline" type="button" onClick={() => setPercent(0.75)}>75%</Button>
                    <Button variant="outline" type="button" onClick={() => setPercent(1)} className="font-semibold">MAX</Button>
                  </div>
                </div>

                <div>
                  <Button className="w-full" onClick={handleSubmit} disabled={isDemoMode || !canSubmit() || submitting}>
                    {submitting ? t('withdraw.submitting') : t('withdraw.submit')}
                  </Button>
                  <div className="mt-4 text-sm space-y-2">
                    <div className="text-gray-600">{t('withdraw.balance.minWithdraw', { amount: minWithdraw, coin })}</div>
                    <div className="text-gray-600">{t('withdraw.balance.maxWithdraw', { amount: maxWithdraw.toFixed(decimalsFor(coin)), coin })}</div>
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-2">
                      <span className="text-blue-700 font-medium">
                        {t('withdraw.balance.available', { amount: available.toFixed(decimalsFor(coin)), coin })}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right column reserved for FAQs or tips in future */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('withdraw.notices.title')}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-600 space-y-2">
                <p>{t('withdraw.notices.addressMatch')}</p>
                <p>{t('withdraw.notices.networkCongestion')}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Withdraw;
