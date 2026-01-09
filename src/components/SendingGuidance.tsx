import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertTriangle,
  Clock,
  Zap,
  Shield,
  Info,
  ExternalLink,
  Calculator,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

export type SupportedChain = 'eth' | 'btc' | 'xrp' | 'trc' | 'ada';
export type SupportedNetwork = 'mainnet' | 'testnet' | 'sepolia' | 'shasta';
export type SupportedAsset = 'ETH' | 'BTC' | 'XRP' | 'TRX' | 'ADA' | 'USDT';

interface SendingGuidanceProps {
  chain: SupportedChain;
  network: SupportedNetwork;
  asset: SupportedAsset;
  address?: string;
  destinationTag?: string;
  minDeposit?: number;
  requiredConfirmations?: number;
  className?: string;
}

interface FeeRecommendation {
  speed: 'slow' | 'standard' | 'fast';
  label: string;
  estimatedTime: string;
  description: string;
  gasPrice?: string;
  satoshiPerByte?: number;
  drops?: number;
  sun?: number;
}

interface ChainGuidance {
  name: string;
  networkExplorer: string;
  feeRecommendations: FeeRecommendation[];
  commonMistakes: string[];
  bestPractices: string[];
  supportedWallets: string[];
  troubleshooting: { issue: string; solution: string }[];
}

const CHAIN_GUIDANCE: Record<SupportedChain, ChainGuidance> = {
  eth: {
    name: 'Ethereum',
    networkExplorer: 'https://etherscan.io',
    feeRecommendations: [
      {
        speed: 'slow',
        label: '低速（節約）',
        estimatedTime: '5-10分',
        description: 'ネットワーク混雑時は遅延の可能性',
        gasPrice: '20-30 Gwei'
      },
      {
        speed: 'standard',
        label: '標準（推奨）',
        estimatedTime: '2-5分',
        description: 'バランスの取れた速度と手数料',
        gasPrice: '35-50 Gwei'
      },
      {
        speed: 'fast',
        label: '高速',
        estimatedTime: '30秒-2分',
        description: '緊急時や高額取引に適用',
        gasPrice: '60-100 Gwei'
      }
    ],
    commonMistakes: [
      '手数料（Gas Fee）を低く設定しすぎて取引が失敗',
      'ERC-20トークンを送金する際にETHの残高不足',
      '間違ったネットワーク（BSC、Polygon等）への送金',
      'コントラクトアドレスに直接送金'
    ],
    bestPractices: [
      '送金前に必ずETHの残高を確認（手数料用）',
      'テストネットでの事前確認を推奨',
      '高額取引時は少額でのテスト送金を実施',
      'ネットワーク混雑状況をethgasstationで確認'
    ],
    supportedWallets: [
      'MetaMask', 'Trust Wallet', 'Coinbase Wallet', 'WalletConnect対応ウォレット'
    ],
    troubleshooting: [
      {
        issue: '取引が長時間Pending状態',
        solution: '手数料を上げてリプレース取引を送信、またはネットワーク混雑解消を待機'
      },
      {
        issue: 'Insufficient funds for gas',
        solution: 'ETH残高を追加してから再度送金を実行'
      },
      {
        issue: '送金したが残高に反映されない',
        solution: 'トランザクションハッシュでEtherscanを確認、必要確認数を待機'
      }
    ]
  },
  btc: {
    name: 'Bitcoin',
    networkExplorer: 'https://blockstream.info',
    feeRecommendations: [
      {
        speed: 'slow',
        label: '低速（節約）',
        estimatedTime: '30-60分',
        description: '1-3 sat/vB、混雑時は数時間かかる場合あり',
        satoshiPerByte: 2
      },
      {
        speed: 'standard',
        label: '標準（推奨）',
        estimatedTime: '10-30分',
        description: '5-15 sat/vB、通常の送金に適用',
        satoshiPerByte: 10
      },
      {
        speed: 'fast',
        label: '高速',
        estimatedTime: '1-10分',
        description: '20-50 sat/vB、緊急時に使用',
        satoshiPerByte: 35
      }
    ],
    commonMistakes: [
      'アドレス形式の間違い（Legacy、SegWit、Bech32）',
      '最小送金単位（546 satoshi）未満の送金',
      '手数料を極端に低く設定して取引が滞留',
      '送金前のUTXO統合を怠り高額手数料'
    ],
    bestPractices: [
      'mempool.spaceで現在の手数料相場を確認',
      '少額取引は手数料効率を考慮',
      '重要な取引は RBF（Replace-by-Fee）対応ウォレット使用',
      'SegWitアドレス（bc1...）の使用を推奨'
    ],
    supportedWallets: [
      'Electrum', 'Bitcoin Core', 'BlueWallet', 'Blockstream Green'
    ],
    troubleshooting: [
      {
        issue: '取引が数時間確認されない',
        solution: 'mempool状況を確認し、RBFで手数料を上げるか、CPFP（Child Pays for Parent）を使用'
      },
      {
        issue: 'アドレス形式エラー',
        solution: 'Legacy（1...）、SegWit（3...）、Bech32（bc1...）の正しい形式を確認'
      },
      {
        issue: '残高が表示されない',
        solution: '使用するウォレットがアドレス形式に対応しているか確認、フルノード同期待機'
      }
    ]
  },
  xrp: {
    name: 'XRP Ledger',
    networkExplorer: 'https://xrpscan.com',
    feeRecommendations: [
      {
        speed: 'standard',
        label: '標準',
        estimatedTime: '3-5秒',
        description: '通常は12 drops（0.000012 XRP）で十分',
        drops: 12
      },
      {
        speed: 'fast',
        label: '高速',
        estimatedTime: '1-3秒',
        description: 'ネットワーク混雑時は20-50 drops',
        drops: 30
      }
    ],
    commonMistakes: [
      'Destination Tagの入力忘れ（取引所では必須）',
      '20 XRP未満の送金で口座が作成されない',
      '手数料を大きく設定しすぎて無駄なコスト',
      '無効なDestination Tagの使用'
    ],
    bestPractices: [
      '取引所への送金時は必ずDestination Tag確認',
      '新規アドレスには20 XRP以上を送金',
      '送金前にアドレスとタグの再確認を実施',
      'テスト送金時も20 XRP以上で実行'
    ],
    supportedWallets: [
      'XUMM', 'Ledger Live', 'Toast Wallet', 'Gatehub'
    ],
    troubleshooting: [
      {
        issue: '送金したが相手に届かない',
        solution: 'Destination Tagが正しく入力されているか確認、取引所のサポートに連絡'
      },
      {
        issue: '残高が20 XRP未満で送金できない',
        solution: 'XRPは20 XRPのアカウント準備金が必要、追加入金して20 XRP以上にする'
      },
      {
        issue: '取引所で入金が反映されない',
        solution: 'Destination Tagが正しいか確認、取引ハッシュと共に取引所サポートに問い合わせ'
      }
    ]
  },
  trc: {
    name: 'Tron',
    networkExplorer: 'https://tronscan.org',
    feeRecommendations: [
      {
        speed: 'standard',
        label: '標準',
        estimatedTime: '1-3分',
        description: 'TRX送金: 1.1 TRX、TRC-20: 13-20 TRX',
        sun: 1100000
      }
    ],
    commonMistakes: [
      'TRC-20送金時のTRX残高不足（手数料用）',
      'エネルギーやバンド幅不足による失敗',
      '間違ったネットワーク（ERC-20）への送金',
      '手数料を考慮しない全額送金'
    ],
    bestPractices: [
      'TRC-20送金前に20 TRX以上の残高確保',
      '高額取引時は事前にエネルギーをフリーズ',
      'TronLinkなど公式ウォレットの使用',
      '送金時はネットワーク（TRC-20）を再確認'
    ],
    supportedWallets: [
      'TronLink', 'Trust Wallet', 'Klever Wallet', 'Ledger Live'
    ],
    troubleshooting: [
      {
        issue: 'TRC-20送金が失敗する',
        solution: 'TRX残高を20 TRX以上に増やしてから再送金、またはエネルギーをフリーズ'
      },
      {
        issue: '手数料が予想より高い',
        solution: 'エネルギーとバンド幅をフリーズして手数料を削減'
      },
      {
        issue: '送金完了後も残高が変わらない',
        solution: 'TronScanでトランザクション成功を確認、ウォレットの同期更新を実行'
      }
    ]
  },
  ada: {
    name: 'Cardano',
    networkExplorer: 'https://cardanoscan.io',
    feeRecommendations: [
      {
        speed: 'standard',
        label: '標準',
        estimatedTime: '1-2分',
        description: '固定手数料約0.17 ADA',
        // Note: ADA fees are mostly fixed, no variable rates
      }
    ],
    commonMistakes: [
      'UTXOモデルの理解不足による送金失敗',
      '最小ADA量（約1 ADA）未満の出力作成',
      'Shelleyアドレス（addr1...）以外の使用',
      'メタデータの不適切な使用'
    ],
    bestPractices: [
      'Daedalus、Yoroi等の公式ウォレット使用',
      '送金前に最新のウォレット同期確認',
      'ShelleyアドレスのUTXO統合を定期実行',
      'ステーキング中の場合は委任状況も確認'
    ],
    supportedWallets: [
      'Daedalus', 'Yoroi', 'Nami', 'Eternl'
    ],
    troubleshooting: [
      {
        issue: '送金が失敗する',
        solution: 'UTXOの統合を実行してから再送金、ウォレットの完全同期を確認'
      },
      {
        issue: '残高が正しく表示されない',
        solution: 'ウォレットの再同期を実行、複数のアドレスを確認'
      },
      {
        issue: 'ステーキング報酬が反映されない',
        solution: '2-3エポック（10-15日）待機後も反映されない場合は委任プールを確認'
      }
    ]
  }
};

const SendingGuidance: React.FC<SendingGuidanceProps> = ({
  chain,
  network,
  asset,
  address,
  destinationTag,
  minDeposit,
  requiredConfirmations,
  className = ''
}) => {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const guidance = CHAIN_GUIDANCE[chain];

  const isTestnet = network !== 'mainnet';
  const isXRP = chain === 'xrp';
  const isERC20 = asset === 'USDT' && chain === 'eth';
  const isTRC20 = asset === 'USDT' && chain === 'trc';

  const getExplorerUrl = () => {
    if (isTestnet) {
      switch (chain) {
        case 'eth': return 'https://sepolia.etherscan.io';
        case 'btc': return 'https://blockstream.info/testnet';
        case 'trc': return 'https://shasta.tronscan.org';
        default: return guidance.networkExplorer;
      }
    }
    return guidance.networkExplorer;
  };

  const getCurrentFeeRecommendation = () => {
    // ネットワーク混雑度に基づく動的な手数料推奨（実装時はAPIから取得）
    return guidance.feeRecommendations.find(rec => rec.speed === 'standard') || guidance.feeRecommendations[0];
  };

  return (
    <Card className={`w-full ${className}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          {guidance.name} 送金ガイド
          {isTestnet && (
            <Badge variant="outline" className="text-amber-600">
              テストネット
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">概要</TabsTrigger>
            <TabsTrigger value="fees">手数料</TabsTrigger>
            <TabsTrigger value="safety">安全性</TabsTrigger>
            <TabsTrigger value="troubleshoot">トラブル</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* 送金先情報 */}
            {address && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <div>
                      <strong>送金先アドレス:</strong>
                      <div className="font-mono text-sm bg-muted p-2 rounded mt-1 break-all">
                        {address}
                      </div>
                    </div>
                    {isXRP && destinationTag && (
                      <div>
                        <strong className="text-amber-600">Destination Tag:</strong>
                        <div className="font-mono text-sm bg-amber-50 p-2 rounded mt-1">
                          {destinationTag}
                        </div>
                      </div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* 重要な情報 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-green-600" />
                  <span className="font-medium">最小入金額</span>
                </div>
                <p className="text-2xl font-bold text-green-600">
                  {minDeposit || '確認中'} {asset}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-600" />
                  <span className="font-medium">必要確認数</span>
                </div>
                <p className="text-2xl font-bold text-blue-600">
                  {requiredConfirmations || '確認中'} ブロック
                </p>
              </div>
            </div>

            {/* チェーン固有の注意事項 */}
            <Alert className={`border-amber-200 bg-amber-50 ${
              isXRP ? 'border-red-200 bg-red-50' : ''
            }`}>
              <AlertTriangle className={`h-4 w-4 ${
                isXRP ? 'text-red-600' : 'text-amber-600'
              }`} />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">
                    {isXRP ? 'XRP重要注意事項' :
                     isERC20 ? 'ERC-20トークン注意事項' :
                     isTRC20 ? 'TRC-20トークン注意事項' :
                     `${guidance.name}送金時の注意事項`}
                  </p>
                  {isXRP && (
                    <ul className="text-sm space-y-1">
                      <li>• <strong>Destination Tag入力は必須です</strong></li>
                      <li>• 入力忘れは資金紛失の原因となります</li>
                      <li>• 新規アドレスには20 XRP以上の送金が必要</li>
                    </ul>
                  )}
                  {isERC20 && (
                    <ul className="text-sm space-y-1">
                      <li>• ETHネットワークのERC-20トークンです</li>
                      <li>• 手数料用にETHの残高が必要です</li>
                      <li>• TRC-20（Tronネットワーク）と間違えないでください</li>
                    </ul>
                  )}
                  {isTRC20 && (
                    <ul className="text-sm space-y-1">
                      <li>• TronネットワークのTRC-20トークンです</li>
                      <li>• 手数料用にTRXの残高が必要です</li>
                      <li>• ERC-20（Ethereumネットワーク）と間違えないでください</li>
                    </ul>
                  )}
                </div>
              </AlertDescription>
            </Alert>

            {/* 推奨ウォレット */}
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                推奨ウォレット
              </h4>
              <div className="flex flex-wrap gap-2">
                {guidance.supportedWallets.map((wallet, index) => (
                  <Badge key={index} variant="outline">
                    {wallet}
                  </Badge>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="fees" className="space-y-4">
            {/* 現在の推奨手数料 */}
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                現在の推奨手数料
              </h4>

              <div className="grid gap-3">
                {guidance.feeRecommendations.map((rec, index) => (
                  <div key={index} className={`p-4 border rounded-lg ${
                    rec.speed === 'standard' ? 'border-blue-200 bg-blue-50' : 'border-gray-200'
                  }`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{rec.label}</span>
                          {rec.speed === 'standard' && (
                            <Badge variant="default" className="text-xs">推奨</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {rec.description}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-sm">
                          {rec.gasPrice && rec.gasPrice}
                          {rec.satoshiPerByte && `${rec.satoshiPerByte} sat/vB`}
                          {rec.drops && `${rec.drops} drops`}
                          {rec.sun && `${rec.sun / 1000000} TRX`}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {rec.estimatedTime}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 手数料節約のヒント */}
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">手数料を節約するコツ</p>
                  <ul className="text-sm space-y-1">
                    {chain === 'eth' && (
                      <>
                        <li>• ネットワークが空いている時間帯（日本時間早朝）を狙う</li>
                        <li>• ethgasstation.infoで現在の手数料相場を確認</li>
                        <li>• 少額取引は手数料効率を考慮する</li>
                      </>
                    )}
                    {chain === 'btc' && (
                      <>
                        <li>• mempool.spaceで現在の混雑状況を確認</li>
                        <li>• UTXOを事前に統合しておく</li>
                        <li>• SegWitアドレス(bc1...)を使用する</li>
                      </>
                    )}
                    {chain === 'trc' && (
                      <>
                        <li>• エネルギーとバンド幅をフリーズして手数料削減</li>
                        <li>• TRX送金時は手数料が安い</li>
                        <li>• 定期的にリソースの管理を行う</li>
                      </>
                    )}
                  </ul>
                </div>
              </AlertDescription>
            </Alert>

            {/* リアルタイム手数料確認 */}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={getExplorerUrl()} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1" />
                  ブロックエクスプローラー
                </a>
              </Button>
              {chain === 'eth' && (
                <Button variant="outline" size="sm" asChild>
                  <a href="https://ethgasstation.info" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1" />
                    ガス価格トラッカー
                  </a>
                </Button>
              )}
              {chain === 'btc' && (
                <Button variant="outline" size="sm" asChild>
                  <a href="https://mempool.space" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Mempool状況
                  </a>
                </Button>
              )}
            </div>
          </TabsContent>

          <TabsContent value="safety" className="space-y-4">
            {/* ベストプラクティス */}
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                ベストプラクティス
              </h4>
              <div className="space-y-2">
                {guidance.bestPractices.map((practice, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">{practice}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* よくある間違い */}
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                よくある間違い
              </h4>
              <div className="space-y-2">
                {guidance.commonMistakes.map((mistake, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">{mistake}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 送金前チェックリスト */}
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">送金前チェックリスト</p>
                  <div className="space-y-1 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" className="rounded" />
                      アドレスを再度確認しました
                    </label>
                    {isXRP && (
                      <label className="flex items-center gap-2">
                        <input type="checkbox" className="rounded" />
                        Destination Tagを確認しました
                      </label>
                    )}
                    <label className="flex items-center gap-2">
                      <input type="checkbox" className="rounded" />
                      送金金額が最小入金額以上です
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" className="rounded" />
                      手数料用の残高を確認しました
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" className="rounded" />
                      ネットワークを確認しました
                    </label>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          </TabsContent>

          <TabsContent value="troubleshoot" className="space-y-4">
            {/* トラブルシューティング */}
            <div className="space-y-4">
              <h4 className="font-medium">よくあるトラブルと解決方法</h4>

              {guidance.troubleshooting.map((item, index) => (
                <Alert key={index}>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <p className="font-medium">{item.issue}</p>
                      <p className="text-sm text-muted-foreground">{item.solution}</p>
                    </div>
                  </AlertDescription>
                </Alert>
              ))}
            </div>

            {/* サポート情報 */}
            <Alert className="border-blue-200 bg-blue-50">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">さらにサポートが必要な場合</p>
                  <div className="text-sm space-y-1">
                    <p>1. トランザクションハッシュをブロックエクスプローラーで確認</p>
                    <p>2. 使用したウォレットのサポートドキュメントを確認</p>
                    <p>3. 取引所への送金の場合は取引所サポートに連絡</p>
                    <p>4. 当プラットフォームのサポートにお問い合わせください</p>
                  </div>
                </div>
              </AlertDescription>
            </Alert>

            {/* 緊急時連絡先 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button variant="outline" className="h-auto p-4">
                <div className="text-left">
                  <div className="font-medium">テクニカルサポート</div>
                  <div className="text-sm text-muted-foreground">
                    技術的な問題について
                  </div>
                </div>
              </Button>

              <Button variant="outline" className="h-auto p-4">
                <div className="text-left">
                  <div className="font-medium">カスタマーサポート</div>
                  <div className="text-sm text-muted-foreground">
                    入金・出金について
                  </div>
                </div>
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default SendingGuidance;