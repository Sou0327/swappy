import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

// Zodバリデーションスキーマ
const adminWalletSchema = z.object({
  chain: z.enum(['evm', 'btc', 'trc', 'xrp', 'ada'], {
    required_error: 'チェーンを選択してください',
  }),
  network: z.string().min(1, 'ネットワークを選択してください'),
  asset: z.string().min(1, 'アセットを選択してください'),
  address: z.string().min(1, 'アドレスを入力してください'),
}).refine((data) => {
  // チェーン別アドレス検証
  if (data.chain === 'evm') {
    // EVM: 0x + 40文字の16進数
    return /^0x[a-fA-F0-9]{40}$/.test(data.address);
  }
  // 他のチェーンのバリデーションは将来実装
  return true;
}, {
  message: 'アドレスの形式が正しくありません',
  path: ['address'],
});

type AdminWalletFormData = z.infer<typeof adminWalletSchema>;

// チェーン別のネットワーク選択肢
const NETWORK_OPTIONS: Record<string, { value: string; label: string }[]> = {
  evm: [
    { value: 'ethereum', label: 'Ethereum Mainnet' },
    { value: 'sepolia', label: 'Sepolia Testnet' },
  ],
  btc: [
    { value: 'mainnet', label: 'Bitcoin Mainnet' },
    { value: 'testnet', label: 'Bitcoin Testnet' },
  ],
  trc: [
    { value: 'mainnet', label: 'Tron Mainnet' },
    { value: 'nile', label: 'Nile Testnet' },
  ],
  xrp: [
    { value: 'mainnet', label: 'XRP Mainnet' },
    { value: 'testnet', label: 'XRP Testnet' },
  ],
  ada: [
    { value: 'mainnet', label: 'Cardano Mainnet' },
    { value: 'testnet', label: 'Cardano Testnet' },
  ],
};

// チェーン別のアセット選択肢
const ASSET_OPTIONS: Record<string, { value: string; label: string }[]> = {
  evm: [
    { value: 'ETH', label: 'ETH' },
    { value: 'USDT', label: 'USDT (ERC-20)' },
  ],
  btc: [
    { value: 'BTC', label: 'BTC' },
  ],
  trc: [
    { value: 'TRX', label: 'TRX' },
    { value: 'USDT', label: 'USDT (TRC-20)' },
  ],
  xrp: [
    { value: 'XRP', label: 'XRP' },
  ],
  ada: [
    { value: 'ADA', label: 'ADA' },
  ],
};

const AdminWalletForm: React.FC = () => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<AdminWalletFormData>({
    resolver: zodResolver(adminWalletSchema),
    defaultValues: {
      chain: 'evm',
      network: 'ethereum',
      asset: 'ETH',
      address: '',
    },
  });

  const selectedChain = watch('chain');

  // チェーン変更時にネットワークとアセットをリセット
  React.useEffect(() => {
    const defaultNetwork = NETWORK_OPTIONS[selectedChain]?.[0]?.value || '';
    const defaultAsset = ASSET_OPTIONS[selectedChain]?.[0]?.value || '';
    setValue('network', defaultNetwork);
    setValue('asset', defaultAsset);
  }, [selectedChain, setValue]);

  const onSubmit = async (data: AdminWalletFormData) => {
    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('admin_wallets')
        .upsert(
          {
            chain: data.chain,
            network: data.network,
            asset: data.asset,
            address: data.address,
            active: true,
          },
          {
            onConflict: 'chain,network,asset',
          }
        );

      if (error) throw error;

      toast({
        title: '保存成功',
        description: '管理ウォレットを保存しました',
      });

      // フォームリセット
      reset();

    } catch (error) {
      console.error('Admin wallet save error:', error);
      toast({
        title: '保存エラー',
        description: error instanceof Error ? error.message : '管理ウォレットの保存に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>集約先ウォレット登録</CardTitle>
        <CardDescription>
          ユーザーからの入金を集約する管理ウォレットのアドレスを登録します
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* チェーン選択 */}
          <div className="space-y-2">
            <Label htmlFor="chain">チェーン</Label>
            <Select
              value={selectedChain}
              onValueChange={(value) => setValue('chain', value as AdminWalletFormData['chain'])}
            >
              <SelectTrigger id="chain">
                <SelectValue placeholder="チェーンを選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="evm">EVM (Ethereum, Polygon)</SelectItem>
                <SelectItem value="btc">Bitcoin</SelectItem>
                <SelectItem value="trc">Tron</SelectItem>
                <SelectItem value="xrp">XRP</SelectItem>
                <SelectItem value="ada">Cardano</SelectItem>
              </SelectContent>
            </Select>
            {errors.chain && (
              <p className="text-sm text-red-500">{errors.chain.message}</p>
            )}
          </div>

          {/* ネットワーク選択 */}
          <div className="space-y-2">
            <Label htmlFor="network">ネットワーク</Label>
            <Select
              value={watch('network')}
              onValueChange={(value) => setValue('network', value)}
            >
              <SelectTrigger id="network">
                <SelectValue placeholder="ネットワークを選択" />
              </SelectTrigger>
              <SelectContent>
                {NETWORK_OPTIONS[selectedChain]?.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.network && (
              <p className="text-sm text-red-500">{errors.network.message}</p>
            )}
          </div>

          {/* アセット選択 */}
          <div className="space-y-2">
            <Label htmlFor="asset">アセット</Label>
            <Select
              value={watch('asset')}
              onValueChange={(value) => setValue('asset', value)}
            >
              <SelectTrigger id="asset">
                <SelectValue placeholder="アセットを選択" />
              </SelectTrigger>
              <SelectContent>
                {ASSET_OPTIONS[selectedChain]?.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.asset && (
              <p className="text-sm text-red-500">{errors.asset.message}</p>
            )}
          </div>

          {/* アドレス入力 */}
          <div className="space-y-2">
            <Label htmlFor="address">アドレス</Label>
            <Input
              id="address"
              {...register('address')}
              placeholder={
                selectedChain === 'evm'
                  ? '0x1234567890123456789012345678901234567890'
                  : 'アドレスを入力'
              }
              className={errors.address ? 'border-red-500' : ''}
            />
            {errors.address && (
              <p className="text-sm text-red-500">{errors.address.message}</p>
            )}
            {selectedChain === 'evm' && (
              <p className="text-xs text-gray-500">
                EVMアドレス形式: 0x で始まる42文字（0x + 40桁の16進数）
              </p>
            )}
          </div>

          {/* 送信ボタン */}
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            保存
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default AdminWalletForm;
