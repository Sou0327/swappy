import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Lock, Key, Shield, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';
import * as bip39 from '@scure/bip39';
import { HDKey } from '@scure/bip32';

// Uint8Arrayをbase64文字列に変換するヘルパー関数
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

type SetupStep = 'generate' | 'display' | 'verify' | 'backup' | 'initialize' | 'complete';

interface BlankedWord {
  index: number;
  word: string;
  isBlank: boolean;
  userWord?: string;
  error?: boolean;
}

type PasswordStrength = 'weak' | 'medium' | 'strong';

const WalletSetup = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation('wallet-setup');
  const { toast } = useToast();
  const [step, setStep] = useState<SetupStep>('generate');
  const [strength, setStrength] = useState<128 | 256>(128);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [masterKeyId, setMasterKeyId] = useState<string | null>(null);
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [showMnemonic, setShowMnemonic] = useState(false);

  // 穴埋め確認用
  const [blankedWords, setBlankedWords] = useState<BlankedWord[]>([]);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // バックアップ確認用
  const [backupConfirmed, setBackupConfirmed] = useState({
    paper: false,
    storage: false
  });

  // 初期化用
  const [initializeLoading, setInitializeLoading] = useState(false);

  // パスワード強度計算
  const getPasswordStrength = (pwd: string): PasswordStrength => {
    if (pwd.length === 0) return 'weak';
    if (pwd.length < 6) return 'weak';
    if (pwd.length < 10) return 'medium';
    if (/[!@#$%^&*(),.?":{}|<>]/.test(pwd) && pwd.length >= 12) return 'strong';
    return 'medium';
  };

  const passwordStrength = getPasswordStrength(password);

  // ユーザー未認証の場合はログインへ
  useEffect(() => {
    if (!user) {
      navigate('/auth', { replace: true });
    }
  }, [user, navigate]);

  // ステップ1: マスターキー生成
  const handleGenerate = async () => {
    if (!password || password.length < 6) {
      toast({
        title: t('errors.passwordTooShort'),
        description: t('errors.passwordMinLength'),
        variant: 'destructive'
      });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('user-wallet-manager', {
        body: {
          action: 'generate',
          password,
          strength
        }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || '生成に失敗しました');

      setMasterKeyId(data.data.masterKeyId);
      setMnemonic(data.data.mnemonic);

      setStep('display');
    } catch (error) {
      const err = error as Error;
      toast({
        title: t('errors.generationFailed'),
        description: err.message,
        variant: 'destructive'
      });
    }
  };

  // display→verifyステップへの遷移: 穴埋め準備
  const handleBackupMnemonic = () => {
    if (!mnemonic) return;

    const words = mnemonic.split(' ');
    const blankedCount = Math.max(3, Math.floor(words.length / 4));

    const shuffled = [...words.map((w, i) => ({ word: w, index: i }))]
      .sort(() => Math.random() - 0.5)
      .slice(0, blankedCount)
      .map(item => item.index);

    const blanked = words.map((word, index) => ({
      index,
      word,
      isBlank: shuffled.includes(index),
      userWord: undefined as string | undefined
    }));

    setBlankedWords(blanked);
    setVerifyError(null);
    setStep('verify');
  };

  // ステップ3: 穴埋め確認
  const handleVerify = async () => {
    const allFilled = blankedWords.every(w => !w.isBlank || w.userWord);

    if (!allFilled) {
      setVerifyError(t('errors.selectAtLeast3Words'));
      setBlankedWords(words => words.map(w =>
        w.isBlank && !w.userWord ? { ...w, error: true } : w
      ));
      toast({
        title: t('errors.tooFewWords'),
        description: t('errors.selectAtLeast3Words'),
        variant: 'destructive'
      });
      return;
    }

    const allCorrect = blankedWords.every(w => !w.isBlank || w.userWord === w.word);

    if (!allCorrect) {
      const errorWords = blankedWords.filter(w => w.isBlank && w.userWord !== w.word);
      const correctWords = blankedWords.filter(w => w.isBlank && w.userWord === w.word);

      setVerifyError(t('errors.incorrectWordOrder'));
      setBlankedWords(words => words.map(w =>
        w.isBlank && w.userWord !== w.word ? { ...w, error: true } : w
      ));
      toast({
        title: t('errors.verificationFailed'),
        description: `${t('errors.incorrectWords')}: ${errorWords.map(e => e.userWord).join(', ')} (${correctWords.length}/${errorWords.length + correctWords.length} ${t('errors.correct')})`,
        variant: 'destructive'
      });
      return;
    }

    setVerificationLoading(true);
    setVerifyError(null);
    try {
      const { data, error } = await supabase.functions.invoke('user-wallet-manager', {
        body: {
          action: 'verify',
          masterKeyId,
          password,
          wordIndices: blankedWords.filter(w => w.isBlank).map(w => w.index)
        }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || '検証に失敗しました');

      if (data.data.verified) {
        setVerifyError(null);
        setStep('backup');
      }
    } catch (error) {
      const err = error as Error;
      toast({
        title: t('errors.verificationError'),
        description: err.message,
        variant: 'destructive'
      });
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleBlankedWordChange = (index: number, value: string) => {
    setBlankedWords(words => words.map(w =>
      w.index === index ? { ...w, userWord: value.trim(), error: false } : w
    ));
    setVerifyError(null);
  };

  // ステップ3: バックアップ確認
  const handleBackupConfirm = () => {
    if (!backupConfirmed.paper || !backupConfirmed.storage) {
      toast({
        title: t('errors.confirmationRequired'),
        description: t('errors.checkAllBoxes'),
        variant: 'destructive'
      });
      return;
    }
    setStep('initialize');
  };

  // ステップ4: wallet_roots初期化（xpub生成付き）
  const handleInitialize = useCallback(async () => {
    if (!masterKeyId || !mnemonic) return;

    setInitializeLoading(true);
    try {
      console.log('[WalletSetup] ニーモニックからxpubを生成します...');

      // 1. ニーモニックからシードを生成
      const seed = await bip39.mnemonicToSeed(mnemonic, '');
      console.log('[WalletSetup] Seed生成完了');

      // 2. シードからHDルートキーを生成
      const hdRoot = HDKey.fromMasterSeed(seed);
      console.log('[WalletSetup] HDルートキー生成完了');

      // 3. 各チェーンのxpubを生成（BIP44準拠）
      const walletRoots: Array<{
        chain: string;
        network: string;
        asset: string;
        xpub: string;
        derivationPath: string;
        chainCode: string;
      }> = [];

      // EVM (Ethereum & EVM-compatible): m/44'/60'/0' (BIP44 Account Level)
      // xpubはaccountレベルで生成し、derive(0/0)でアドレスを導出
      const evmAccount = hdRoot.derive("m/44'/60'/0'");
      walletRoots.push({
        chain: 'evm',
        network: 'ethereum', // address-allocatorに合わせる
        asset: 'ETH',
        xpub: evmAccount.publicExtendedKey,
        derivationPath: "m/44'/60'/0'",
        chainCode: evmAccount.chainCode ? uint8ArrayToBase64(evmAccount.chainCode) : ''
      });
      console.log('[WalletSetup] EVM xpub生成完了:', evmAccount.publicExtendedKey.slice(0, 20) + '...');

      // BTC (Bitcoin): m/84'/0'/0' (BIP84 Native SegWit Account Level)
      const btcAccount = hdRoot.derive("m/84'/0'/0'");
      walletRoots.push({
        chain: 'btc',
        network: 'mainnet', // BTCはmainnet
        asset: 'BTC',
        xpub: btcAccount.publicExtendedKey,
        derivationPath: "m/84'/0'/0'",
        chainCode: btcAccount.chainCode ? uint8ArrayToBase64(btcAccount.chainCode) : ''
      });
      console.log('[WalletSetup] BTC xpub生成完了:', btcAccount.publicExtendedKey.slice(0, 20) + '...');

      // TRC (Tron): m/44'/195'/0' (BIP44 Account Level)
      const trxAccount = hdRoot.derive("m/44'/195'/0'");
      walletRoots.push({
        chain: 'trc',
        network: 'mainnet',
        asset: 'TRX',
        xpub: trxAccount.publicExtendedKey,
        derivationPath: "m/44'/195'/0'",
        chainCode: trxAccount.chainCode ? uint8ArrayToBase64(trxAccount.chainCode) : ''
      });
      console.log('[WalletSetup] TRC xpub生成完了:', trxAccount.publicExtendedKey.slice(0, 20) + '...');

      console.log('[WalletSetup] xpub生成完了、Edge Functionへ送信します...');

      // 4. Edge Functionへ送信
      console.log('[WalletSetup] Edge Functionへリクエスト送信:', {
        action: 'initialize-wallet-roots',
        masterKeyId,
        hasPassword: !!password,
        walletRootsCount: walletRoots.length
      });

      const { data, error } = await supabase.functions.invoke('user-wallet-manager', {
        body: {
          action: 'initialize-wallet-roots',
          masterKeyId,
          password,
          walletRoots
        }
      });

      console.log('[WalletSetup] Edge Functionレスポンス:', { data, error });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || '初期化に失敗しました');

      console.log('[WalletSetup] wallet_roots初期化完了');
      console.log('[WalletSetup] user.id:', user?.id);

      // profiles.wallet_setup_completed = true
      if (!user?.id) {
        console.error('[WalletSetup] user.idがundefinedです');
        throw new Error('ユーザー情報が見つかりません。再度ログインしてください。');
      }

      const { error: profileError, count } = await supabase
        .from('profiles')
        .update({ wallet_setup_completed: true })
        .eq('id', user.id)
        .select();

      console.log('[WalletSetup] profiles.update結果:', { profileError, count });

      if (profileError) {
        console.error('[WalletSetup] profileError:', profileError);
        throw profileError;
      }

      console.log('[WalletSetup] setStep(complete)を実行します');
      setStep('complete');
      console.log('[WalletSetup] navigateを2秒後に実行します');
      setTimeout(() => {
        console.log('[WalletSetup] navigate実行');
        navigate('/dashboard', { replace: true });
      }, 2000);
    } catch (error) {
      const err = error as Error;
      console.error('[WalletSetup] 初期化エラー:', err);
      toast({
        title: t('errors.initializationFailed'),
        description: err.message,
        variant: 'destructive'
      });
    } finally {
      setInitializeLoading(false);
    }
  }, [masterKeyId, mnemonic, password, user, t, toast, navigate]);

  // initializeステップで自動的に初期化を実行
  useEffect(() => {
    if (step === 'initialize' && !initializeLoading && masterKeyId) {
      handleInitialize();
    }
  }, [step, initializeLoading, masterKeyId, handleInitialize]);

  // ステップ1 UI
  if (step === 'generate') {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center bg-gray-50">
        <div className="container mx-auto px-4 py-8 max-w-lg">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                {t('step1.title')}
              </CardTitle>
              <CardDescription>
                {t('step1.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">{t('step1.mnemonicLength')}</label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={strength === 128 ? 'default' : 'outline'}
                      onClick={() => setStrength(128)}
                      className="flex-1"
                    >
                      {t('step1.words12')}
                    </Button>
                    <Button
                      type="button"
                      variant={strength === 256 ? 'default' : 'outline'}
                      onClick={() => setStrength(256)}
                      className="flex-1"
                    >
                      {t('step1.words24')}
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">{t('step1.passwordLabel')}</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary pr-10"
                      placeholder={t('step1.passwordPlaceholder')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-2 text-xs">
                    <span className="text-gray-500">
                      {password.length > 0 && t(`step1.passwordStrength.${passwordStrength}`, { count: password.length })}
                    </span>
                    <span className="text-gray-500">{t('step1.passwordHint')}</span>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleGenerate}
                disabled={!password || password.length < 6}
                className="w-full"
              >
                {t('step1.createWalletButton')}
              </Button>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <Shield className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <p className="font-semibold mb-1">{t('step1.securityNote')}</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>{t('step1.securityPoint1')}</li>
                      <li>{t('step1.securityPoint2')}</li>
                      <li>{t('step1.securityPoint3')}</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ステップ2 UI: ニーモニック表示
  if (step === 'display') {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center bg-gray-50">
        <div className="container mx-auto px-4 py-8 max-w-lg">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                {t('step2.displayTitle')}
              </CardTitle>
              <CardDescription>
                {t('step2.displayDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5" />
                  <div className="text-sm text-orange-800">
                    <p className="font-semibold mb-1">{t('step2.importantNote')}</p>
                    <p>{t('step2.backupWarning')}</p>
                  </div>
                </div>
              </div>

              {mnemonic && (
                <div className="space-y-4">
                  <div className="relative">
                    <textarea
                      value={showMnemonic ? mnemonic : '•'.repeat(mnemonic.length)}
                      readOnly
                      className="w-full p-4 border border-gray-200 rounded-lg bg-white font-mono text-sm"
                      rows={3}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => setShowMnemonic(!showMnemonic)}
                    >
                      {showMnemonic ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>

                  <Button
                    onClick={handleBackupMnemonic}
                    disabled={!showMnemonic}
                    className="w-full"
                  >
                    {t('step2.backedUpButton')}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ステップ3 UI: 穴埋め確認
  if (step === 'verify') {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center bg-gray-50">
        <div className="container mx-auto px-4 py-8 max-w-lg">
          <Card>
            <CardHeader>
              <CardTitle>{t('step3.title')}</CardTitle>
              <CardDescription>
                {t('step3.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {verifyError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                    <div className="text-sm text-red-800">
                      <p className="font-semibold">{t('errors.verificationFailed')}</p>
                      <p className="mt-1">{verifyError}</p>
                    </div>
                  </div>
                </div>
              )}

              {blankedWords.length > 0 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    {blankedWords.map(word => (
                      <div key={word.index} className="relative">
                        {word.isBlank ? (
                          <input
                            type="text"
                            value={word.userWord || ''}
                            onChange={(e) => handleBlankedWordChange(word.index, e.target.value)}
                            placeholder={`${word.index + 1}`}
                            className={`w-full p-2 border rounded-lg text-sm ${
                              word.error
                                ? 'border-red-500 bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500'
                                : 'border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500'
                            }`}
                          />
                        ) : (
                          <div className="p-2 border border-gray-200 rounded-lg text-sm bg-gray-50">
                            {word.word}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button
                onClick={handleVerify}
                disabled={verificationLoading}
                className="w-full"
              >
                {verificationLoading ? t('common.verifying') : t('common.verify')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ステップ4 UI
  if (step === 'backup') {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center bg-gray-50">
        <div className="container mx-auto px-4 py-8 max-w-lg">
          <Card>
            <CardHeader>
              <CardTitle>{t('step4.title')}</CardTitle>
              <CardDescription>
                {t('step4.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="paper"
                    checked={backupConfirmed.paper}
                    onCheckedChange={(checked) =>
                      setBackupConfirmed(prev => ({ ...prev, paper: checked as boolean }))
                    }
                  />
                  <div>
                    <label htmlFor="paper" className="text-sm font-medium cursor-pointer">
                      {t('step4.writtenOnPaper')}
                    </label>
                    <p className="text-xs text-gray-500">
                      {t('step4.noScreenshotHint')}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="storage"
                    checked={backupConfirmed.storage}
                    onCheckedChange={(checked) =>
                      setBackupConfirmed(prev => ({ ...prev, storage: checked as boolean }))
                    }
                  />
                  <div>
                    <label htmlFor="storage" className="text-sm font-medium cursor-pointer">
                      {t('step4.storedSafely')}
                    </label>
                    <p className="text-xs text-gray-500">
                      {t('step4.storageHint')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div className="text-sm text-red-800">
                    <p className="font-semibold mb-1">{t('step4.warning')}</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>{t('step4.warningPoint1')}</li>
                      <li>{t('step4.warningPoint2')}</li>
                      <li>{t('step4.warningPoint3')}</li>
                    </ul>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleBackupConfirm}
                className="w-full"
                disabled={!backupConfirmed.paper || !backupConfirmed.storage}
              >
                {t('common.next')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ステップ5 UI
  if (step === 'initialize') {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center bg-gray-50">
        <div className="container mx-auto px-4 py-8 max-w-lg">
          <Card>
            <CardHeader>
              <CardTitle>{t('step5.title')}</CardTitle>
              <CardDescription>
                {t('step5.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="h-2 bg-blue-500 rounded-full animate-pulse"
                      style={{ width: `${initializeLoading ? '100%' : '0%'}` }}
                    />
                  </div>
                  <p className="text-sm text-gray-600 mt-2">
                    {initializeLoading ? t('step5.generating') : t('step5.completed')}
                  </p>
                </div>

                {initializeLoading && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                      {t('step5.generatingEVM')}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      {t('step5.generatingBTC')}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                      {t('step5.generatingTRX')}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                      {t('step5.generatingXRP')}
                    </div>
                  </div>
                )}

                {!initializeLoading && (
                  <div className="flex items-center gap-2 text-green-600 bg-green-50 border border-green-200 rounded-lg p-4">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-medium">{t('step5.allChainsCompleted')}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ステップ6 UI
  if (step === 'complete') {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center bg-gray-50">
        <div className="container mx-auto px-4 py-8 max-w-lg">
          <Card>
            <CardHeader>
              <CardTitle className="text-center">{t('step6.title')}</CardTitle>
              <CardDescription className="text-center">
                {t('step6.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return null;
};

export default WalletSetup;
