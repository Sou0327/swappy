import React, { useState, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Edit, Save, X } from "lucide-react";
import { computePairRate } from "@/lib/price-service";

interface UserAsset {
  id: string;
  user_id: string;
  currency: string;
  balance: number;
  locked_balance: number;
  created_at: string;
  updated_at: string;
  profiles?: {
    id: string;
    email: string;
    full_name: string;
  };
}

interface UserAssetDetailsProps {
  userAssets: UserAsset[];
  onBack: () => void;
  onSaveAsset: (assetId: string, balance: string, lockedBalance: string) => Promise<void>;
  priceData?: { usd: Record<string, number>; usd_jpy?: number } | null;
  priceLoading?: boolean;
  priceError?: string | null;
  calculateUsdtValue?: (assets: UserAsset[]) => number;
}

export const UserAssetDetails: React.FC<UserAssetDetailsProps> = memo(({
  userAssets,
  onBack,
  onSaveAsset,
  priceData,
  priceLoading = false,
  priceError = null,
  calculateUsdtValue
}) => {
  const [editingAsset, setEditingAsset] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({balance: '', locked_balance: ''});

  // 個別資産のUSDT価値を計算
  const calculateAssetUsdtValue = (asset: UserAsset) => {
    if (!priceData) return 0;

    try {
      const totalBalance = asset.balance + asset.locked_balance;
      if (totalBalance === 0) return 0;

      // price-service.tsのcomputePairRate関数を使用
      const rate = computePairRate(asset.currency, 'USDT', priceData);
      const usdtValue = totalBalance * rate;

      console.log(`💎 ${asset.currency}: ${totalBalance} * ${rate} = ${usdtValue} USDT`);
      return usdtValue;
    } catch (error) {
      console.error(`通貨 ${asset.currency} のUSDT変換エラー:`, error);
      return 0;
    }
  };

  // 全資産の合計USDT価値を計算
  const totalUsdtValue = calculateUsdtValue ? calculateUsdtValue(userAssets) :
    userAssets.reduce((sum, asset) => sum + calculateAssetUsdtValue(asset), 0);

  const startEditAsset = (asset: UserAsset) => {
    setEditingAsset(asset.id);
    setEditValues({
      balance: asset.balance.toString(),
      locked_balance: asset.locked_balance.toString()
    });
  };

  const saveAssetEdit = async (assetId: string) => {
    try {
      await onSaveAsset(assetId, editValues.balance, editValues.locked_balance);
      setEditingAsset(null);
      setEditValues({balance: '', locked_balance: ''});
    } catch (error) {
      console.error('Failed to save asset:', error);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            ユーザー資産詳細
          </CardTitle>
          <Button variant="outline" onClick={onBack}>
            <X className="h-4 w-4 mr-1" />
            戻る
          </Button>
        </div>
        {userAssets.length > 0 && userAssets[0].profiles && (
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">
              {userAssets[0].profiles.full_name} ({userAssets[0].profiles.email})
            </div>
            <div className="text-sm font-semibold text-primary">
              総評価額: {priceLoading ? (
                '計算中...'
              ) : priceError ? (
                <span className="text-red-500">価格データエラー</span>
              ) : (
                `${totalUsdtValue.toFixed(2)} USDT`
              )}
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {userAssets.map((asset) => (
            <Card key={asset.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{asset.currency}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">利用可能残高:</span>
                    {editingAsset === asset.id ? (
                      <Input
                        type="number"
                        step="0.00000001"
                        min="0"
                        value={editValues.balance}
                        onChange={(e) => setEditValues(prev => ({...prev, balance: e.target.value}))}
                        className="w-24 h-8 font-mono text-sm"
                      />
                    ) : (
                      <span className="font-mono">{asset.balance.toFixed(8)}</span>
                    )}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">ロック残高:</span>
                    {editingAsset === asset.id ? (
                      <Input
                        type="number"
                        step="0.00000001"
                        min="0"
                        value={editValues.locked_balance}
                        onChange={(e) => setEditValues(prev => ({...prev, locked_balance: e.target.value}))}
                        className="w-24 h-8 font-mono text-sm"
                      />
                    ) : (
                      <span className="font-mono">{asset.locked_balance.toFixed(8)}</span>
                    )}
                  </div>
                  <div className="flex justify-between font-bold border-t pt-2">
                    <span>総残高:</span>
                    <span className="font-mono">{(asset.balance + asset.locked_balance).toFixed(8)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>USDT評価額:</span>
                    <span className="font-mono">
                      {priceLoading ? (
                        '計算中...'
                      ) : priceError ? (
                        <span className="text-red-500">エラー</span>
                      ) : (
                        `${calculateAssetUsdtValue(asset).toFixed(2)} USDT`
                      )}
                    </span>
                  </div>
                  <div className="pt-2">
                    {editingAsset === asset.id ? (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => saveAssetEdit(asset.id)}
                          className="flex-1"
                        >
                          <Save className="h-4 w-4 mr-1" />
                          保存
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingAsset(null);
                            setEditValues({balance: '', locked_balance: ''});
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startEditAsset(asset)}
                        className="w-full"
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        編集
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
});