import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Copy, CheckCircle, XCircle, Loader2, Zap, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useMetaMask } from '@/hooks/useMetaMask';

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

interface SweepJobDetailProps {
  job: SweepJob;
  open: boolean;
  onClose: () => void;
}

const SweepJobDetail: React.FC<SweepJobDetailProps> = ({ job, open, onClose }) => {
  const { toast } = useToast();
  const { connect, signTransaction, isConnecting } = useMetaMask();

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [localUnsignedTx, setLocalUnsignedTx] = useState(job.unsigned_tx);
  const [localSignedTx, setLocalSignedTx] = useState(job.signed_tx);
  const [localTxHash, setLocalTxHash] = useState(job.tx_hash);

  // チェーンタイプに応じた署名方法判定
  const isEvmChain = job.chain === 'evm';
  const walletGuide = {
    evm: { name: 'MetaMask', supported: true },
    trc: { name: 'TronLink', supported: false },
    btc: { name: 'Leather / Xverse', supported: false },
    ada: { name: 'Nami / Eternl', supported: false },
    xrp: { name: 'Xumm', supported: false },
  }[job.chain] || { name: '不明', supported: false };

  // unsigned transactionをコピー
  const handleCopyUnsignedTx = () => {
    if (!localUnsignedTx) return;

    const txJson = JSON.stringify(localUnsignedTx, null, 2);
    navigator.clipboard.writeText(txJson);

    toast({
      title: 'コピー完了',
      description: 'Unsigned Transactionをクリップボードにコピーしました',
    });
  };

  // tx_hashをコピー
  const handleCopyTxHash = () => {
    if (!localTxHash) return;

    navigator.clipboard.writeText(localTxHash);

    toast({
      title: 'コピー完了',
      description: 'Transaction Hashをクリップボードにコピーしました',
    });
  };

  // unsigned_tx生成
  const handleGenerateUnsignedTx = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('sweep-tx-realtime-signer', {
        body: { job_id: job.id },
      });

      if (error) throw error;

      if (data?.unsigned_tx) {
        setLocalUnsignedTx(data.unsigned_tx);
        toast({
          title: '✅ Unsigned Transaction生成完了',
          description: 'トランザクションが正常に生成されました',
        });
      }
    } catch (error) {
      console.error('Error generating unsigned_tx:', error);
      toast({
        title: '❌ 生成失敗',
        description: error instanceof Error ? error.message : '不明なエラーが発生しました',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // MetaMask署名
  const handleSignWithMetaMask = async () => {
    setIsSigning(true);
    try {
      // MetaMaskに接続
      await connect();

      // unsigned_txを署名
      const txHash = await signTransaction(localUnsignedTx);

      setLocalSignedTx(txHash);
      toast({
        title: '✅ 署名完了',
        description: 'MetaMaskで署名が完了しました',
      });
    } catch (error) {
      console.error('Error signing transaction:', error);
      toast({
        title: '❌ 署名失敗',
        description: error instanceof Error ? error.message : '不明なエラーが発生しました',
        variant: 'destructive',
      });
    } finally {
      setIsSigning(false);
    }
  };

  // ブロードキャスト
  const handleBroadcast = async () => {
    if (!localSignedTx) {
      toast({
        title: '⚠️ 警告',
        description: '署名済みトランザクションがありません',
        variant: 'destructive',
      });
      return;
    }

    setIsBroadcasting(true);
    try {
      const { data, error } = await supabase.functions.invoke('sweep-broadcast', {
        body: {
          job_id: job.id,
          signed_tx: localSignedTx,
        },
      });

      if (error) throw error;

      if (data?.transaction_hash) {
        setLocalTxHash(data.transaction_hash);
        toast({
          title: '✅ ブロードキャスト完了',
          description: 'トランザクションがブロックチェーンに送信されました',
        });
      }
    } catch (error) {
      console.error('Error broadcasting transaction:', error);
      toast({
        title: '❌ ブロードキャスト失敗',
        description: error instanceof Error ? error.message : '不明なエラーが発生しました',
        variant: 'destructive',
      });
    } finally {
      setIsBroadcasting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>スイープジョブ詳細</DialogTitle>
          <DialogDescription>
            ジョブID: {job.id}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* 基本情報 */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">基本情報</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">チェーン</p>
                <p className="font-medium">{job.chain.toUpperCase()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">ネットワーク</p>
                <p className="font-medium">{job.network}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">アセット</p>
                <p className="font-medium">{job.asset}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">ステータス</p>
                <Badge
                  variant={
                    job.status === 'failed'
                      ? 'destructive'
                      : job.status === 'confirmed'
                      ? 'default'
                      : 'secondary'
                  }
                >
                  {job.status}
                </Badge>
              </div>
            </div>
          </div>

          {/* トランザクション情報 */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">トランザクション情報</h3>
            <div className="space-y-2">
              <div>
                <p className="text-sm text-gray-500">送信元アドレス</p>
                <p className="font-mono text-sm break-all">{job.from_address}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">送信先アドレス</p>
                <p className="font-mono text-sm break-all">{job.to_address}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">金額</p>
                <p className="text-lg font-bold">
                  {job.planned_amount} {job.currency}
                </p>
              </div>
            </div>
          </div>

          {/* Unsigned Transaction */}
          {localUnsignedTx && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Unsigned Transaction</h3>
                <Button
                  onClick={handleCopyUnsignedTx}
                  variant="outline"
                  size="sm"
                >
                  <Copy className="h-4 w-4 mr-1" />
                  コピー
                </Button>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto">
                <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                  {JSON.stringify(localUnsignedTx, null, 2)}
                </pre>
              </div>
              <p className="text-xs text-gray-500">
                ℹ️ このJSONを外部ツール（MetaMask, Ledger等）で署名してください
              </p>
            </div>
          )}

          {/* Transaction Hash */}
          {localTxHash && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Transaction Hash</h3>
                <Button
                  onClick={handleCopyTxHash}
                  variant="outline"
                  size="sm"
                >
                  <Copy className="h-4 w-4 mr-1" />
                  コピー
                </Button>
              </div>
              <p className="font-mono text-sm break-all bg-gray-50 dark:bg-gray-900 p-3 rounded">
                {localTxHash}
              </p>
            </div>
          )}

          {/* エラーメッセージ */}
          {job.error_message && (
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-red-600 flex items-center gap-2">
                <XCircle className="h-5 w-5" />
                エラー情報
              </h3>
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 rounded-lg">
                <p className="text-sm text-red-800 dark:text-red-200">
                  {job.error_message}
                </p>
              </div>
            </div>
          )}

          {/* 日時情報 */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">作成日時:</span>
              <span>{new Date(job.created_at).toLocaleString('ja-JP')}</span>
            </div>
            {job.updated_at && (
              <div className="flex justify-between">
                <span className="text-gray-500">更新日時:</span>
                <span>{new Date(job.updated_at).toLocaleString('ja-JP')}</span>
              </div>
            )}
          </div>

          {/* ワークフローアクション */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">ワークフロー</h3>

            {/* Step 1: unsigned_tx生成 */}
            {job.status === 'planned' && !localUnsignedTx && (
              <Button
                onClick={handleGenerateUnsignedTx}
                disabled={isGenerating}
                className="w-full"
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    生成中...
                  </>
                ) : (
                  <>
                    <Zap className="h-5 w-5 mr-2" />
                    Unsigned Transaction生成
                  </>
                )}
              </Button>
            )}

            {/* Step 2: ウォレット署名 */}
            {job.status === 'planned' && localUnsignedTx && !localSignedTx && (
              <>
                {isEvmChain ? (
                  // EVMチェーン: MetaMask署名
                  <Button
                    onClick={handleSignWithMetaMask}
                    disabled={isSigning || isConnecting}
                    className="w-full bg-orange-500 hover:bg-orange-600"
                    size="lg"
                  >
                    {isSigning || isConnecting ? (
                      <>
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        {isConnecting ? '接続中...' : '署名中...'}
                      </>
                    ) : (
                      <>
                        <Zap className="h-5 w-5 mr-2" />
                        MetaMaskで署名
                      </>
                    )}
                  </Button>
                ) : (
                  // 非EVMチェーン: 手動署名案内
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4 rounded-lg">
                    <h4 className="font-semibold mb-2 flex items-center gap-2 text-yellow-700 dark:text-yellow-300">
                      <Zap className="h-5 w-5" />
                      {job.chain.toUpperCase()}チェーン署名ガイド
                    </h4>
                    <p className="text-sm mb-2">
                      推奨ウォレット: <strong>{walletGuide.name}</strong>
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-sm">
                      <li>上記のUnsigned Transactionをコピー</li>
                      <li>{walletGuide.name}で署名を実行</li>
                      <li>署名済みトランザクションを取得</li>
                      <li>下の「ブロードキャスト」ボタンで送信（開発中: 手動入力フィールドを追加予定）</li>
                    </ol>
                    <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
                      ℹ️ {walletGuide.name}の自動連携は今後実装予定です
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Step 3: ブロードキャスト */}
            {localSignedTx && !localTxHash && (
              <Button
                onClick={handleBroadcast}
                disabled={isBroadcasting}
                className="w-full bg-green-500 hover:bg-green-600"
                size="lg"
              >
                {isBroadcasting ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    送信中...
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5 mr-2" />
                    ブロードキャスト
                  </>
                )}
              </Button>
            )}

            {/* 完了状態 */}
            {localTxHash && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 rounded-lg">
                <h4 className="font-semibold mb-2 flex items-center gap-2 text-green-700 dark:text-green-300">
                  <CheckCircle className="h-5 w-5" />
                  ワークフロー完了
                </h4>
                <p className="text-sm">
                  トランザクションが正常にブロードキャストされました。
                  <br />
                  ブロックチェーンでの確認をお待ちください。
                </p>
              </div>
            )}
          </div>

          {/* 手動ワークフローガイド */}
          {job.status === 'planned' && job.unsigned_tx && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-blue-600" />
                次のステップ（{isEvmChain ? 'MetaMask' : walletGuide.name}署名）
              </h4>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                <li>上記のUnsigned Transactionをコピー</li>
                <li>{isEvmChain ? 'MetaMask' : walletGuide.name}、またはハードウェアウォレットで署名</li>
                <li>署名済みトランザクションをブロードキャスト</li>
                <li>Transaction Hashを記録</li>
              </ol>
              {!isEvmChain && (
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                  ℹ️ {job.chain.toUpperCase()}チェーン用ウォレット連携は今後実装予定です
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end mt-6">
          <Button onClick={onClose} variant="outline">
            閉じる
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SweepJobDetail;
