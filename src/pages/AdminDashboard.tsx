import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import DashboardLayout from "@/components/DashboardLayout";
import { UserAssetDetails } from "@/components/UserAssetDetails";
import {
  Users,
  UserCheck,
  UserX,
  Shield,
  Settings,
  Search,
  Edit,
  Trash2,
  DollarSign,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  CheckCircle,
  XCircle,
  Clock,
  Save,
  X,
  FileText,
  User,
  Eye,
  MapPin,
  Copy,
  ChevronRight,
  ArrowLeft,
  Plus,
  Send,
  Bell,
  Coins,
  Gift
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { generateMultichainAddress, getSupportedAssets, getAllDepositableAssets, type MultichainAddressInfo, type SupportedChain, type SupportedNetwork, type SupportedAsset } from "@/lib/multichain-wallet-utils";
import { generateXRPDepositInfo } from "@/lib/xrp-wallet-utils";
import { getPriceSnapshot, computePairRate } from "@/lib/price-service";

type UserRole = 'admin' | 'moderator' | 'user';

interface UserRoleData {
  role: UserRole;
}

interface Transfer {
  id: string;
  from_user_id: string;
  to_user_id: string;
  from_user_handle: string;
  to_user_handle: string;
  amount: number;
  currency: string;
  reference_number: string;
  description?: string;
  status: 'pending' | 'completed' | 'failed';
  created_at: string;
  updated_at?: string;  // オプション項目に変更
}

interface RawUserProfile {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  user_roles: UserRoleData[];
}

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  role: UserRole;
}

interface Deposit {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  chain?: string; // optional in types
  network?: string; // optional in types
  status: 'pending' | 'confirmed' | 'rejected';
  transaction_hash?: string;
  wallet_address?: string;
  created_at: string;
  confirmed_at?: string;
  confirmed_by?: string;
  notes?: string;
  profiles?: {
    email: string;
    full_name: string;
  };
}

interface Withdrawal {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'confirmed' | 'rejected';
  wallet_address: string;
  transaction_hash?: string;
  created_at: string;
  confirmed_at?: string;
  confirmed_by?: string;
  notes?: string;
  profiles?: {
    email: string;
    full_name: string;
  };
}

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

interface Market {
  id: string;
  base: string;
  quote: string;
  price_tick: number;
  qty_step: number;
  min_notional: number;
  status: 'active' | 'paused' | 'disabled' | string;
  maker_fee_rate?: number;
  taker_fee_rate?: number;
}

interface SupportTicket {
  id: string;
  user_id: string;
  subject: string;
  message: string;
  status: 'open' | 'pending' | 'closed';
  priority: 'low' | 'medium' | 'high';
  created_at: string;
  updated_at: string;
  profiles?: {
    email: string;
    full_name: string;
  };
}

// データベースから取得される生のサポートチケットデータ
interface RawSupportTicket {
  id: string;
  user_id: string;
  subject: string;
  body: string; // データベースでは body フィールド
  status: string;
  created_at: string;
  updated_at: string;
}

interface SupportReply {
  id: string;
  ticket_id: string;
  user_id: string;
  message: string;
  is_admin_reply: boolean;
  created_at: string;
  profiles?: {
    email: string;
    full_name: string;
  };
}

// KYC関連のインターフェース
interface KYCApplication {
  id: string;
  kyc_status: 'none' | 'pending' | 'verified' | 'rejected';
  kyc_level: number;
  kyc_updated_at?: string;
  kyc_notes?: string;
  first_name?: string;
  last_name?: string;
  first_name_kana?: string;
  last_name_kana?: string;
  birth_date?: string;
  phone_number?: string;
  postal_code?: string;
  prefecture?: string;
  city?: string;
  address?: string;
  building?: string;
  email: string;
  full_name: string;
  created_at: string;
}

interface KYCDocument {
  id: string;
  user_id: string;
  document_type: 'identity' | 'address' | 'selfie' | 'income';
  file_name: string;
  file_path: string;
  file_size?: number;
  mime_type?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;
  created_at: string;
  updated_at: string;
}

// ユーザー入金アドレス管理用の型定義
type UserDepositAddressRow = Database["public"]["Tables"]["user_deposit_addresses"]["Row"];

interface UserDepositAddress {
  id: string;
  user_id: string;
  currency: string;
  network: string;
  address: string;
  derivation_path: string | null;
  is_active: boolean | null;
  private_key_encrypted: string | null;
  created_at: string | null;
  updated_at: string | null;
  destination_tag?: string | null;
  chain_hint?: SupportedChain | 'unknown';
  profiles?: {
    email: string;
    full_name: string;
  };
}

const formatUserDepositAddress = (
  record: UserDepositAddressRow,
  profile?: { email: string; full_name: string | null }
): UserDepositAddress => ({
  ...record,
  chain_hint: detectChainFromAddress({
    address: record.address,
    currency: record.currency,
    network: record.network,
    derivation_path: record.derivation_path
  }) ?? 'unknown',
  profiles: profile
    ? {
      email: profile.email,
      full_name: profile.full_name ?? ''
    }
    : undefined
});

type CombinationDescriptor = {
  chain: SupportedChain;
  network: SupportedNetwork;
  asset: string; // SupportedAssetからstringに変更
};

const normalizeNetwork = (value: string | null | undefined): string =>
  (value || '').toLowerCase();

const detectChainFromAddress = (
  address: Pick<UserDepositAddress, 'address' | 'currency' | 'network' | 'derivation_path'>
): SupportedChain | null => {
  const network = normalizeNetwork(address.network);
  if (network.includes('tron') || network.includes('trc')) return 'trc';
  if (network.includes('eth') || network.includes('sepolia')) return 'eth';
  if (network.includes('btc')) return 'btc';
  if (network.includes('xrp')) return 'xrp';
  if (network.includes('ada') || network.includes('cardano')) return 'ada';

  // アドレス形式チェックを最優先（最も信頼性が高い）
  const value = address.address || '';
  if (value.startsWith('0x')) {
    return 'eth';
  }
  if (/^T[A-Za-z1-9]{10,}$/.test(value)) {
    return 'trc';
  }
  if (/^r[1-9A-HJ-NP-Za-km-z]{10,}$/.test(value)) {
    return 'xrp';
  }
  if (/^addr1[0-9a-z]+$/.test(value) || /^addr_test1[0-9a-z]+$/.test(value)) {
    return 'ada';
  }
  if (/^(bc1|[13])[A-HJ-NP-Za-km-z0-9]{10,}$/.test(value)) {
    return 'btc';
  }

  // アドレス形式で判定できない場合のみderivation pathをチェック
  const derivationPath = address.derivation_path?.toLowerCase() ?? '';
  if (derivationPath.includes("/195'")) return 'trc';
  if (derivationPath.includes("/60'")) return 'eth';
  if (derivationPath.includes("/1815'")) return 'ada';
  if (derivationPath.includes("/144'")) return 'xrp';
  if (derivationPath.includes("/0'")) return 'btc'; // 最後にチェック

  return null;
};

const getCombinationKey = (combination: CombinationDescriptor) =>
  `${combination.chain}-${combination.network}-${combination.asset}`;

const matchesCombination = (
  combination: CombinationDescriptor,
  address: UserDepositAddress
) => {
  if (address.currency !== combination.asset) {
    return false;
  }

  const addressNetwork = normalizeNetwork(address.network);
  const combinationNetwork = normalizeNetwork(combination.network);
  if (addressNetwork && combinationNetwork && addressNetwork !== combinationNetwork) {
    const isGenericMainnet = addressNetwork === 'mainnet' && combinationNetwork === 'mainnet';
    if (!isGenericMainnet) {
      return false;
    }
  }

  const chainHint = address.chain_hint && address.chain_hint !== 'unknown'
    ? address.chain_hint
    : detectChainFromAddress(address);

  if (chainHint && chainHint !== combination.chain) {
    return false;
  }

  return true;
};

const findAddressForCombination = (
  addresses: UserDepositAddress[],
  combination: CombinationDescriptor
) => addresses.find(addr => matchesCombination(combination, addr));

const AdminDashboard = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const navigate = useNavigate();
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [assets, setAssets] = useState<UserAsset[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [reply, setReply] = useState<Record<string, string>>({});
  const [newMarket, setNewMarket] = useState<Partial<Market>>({ id: '', base: '', quote: '', price_tick: 0.01, qty_step: 0.000001, min_notional: 1, status: 'active', maker_fee_rate: 0.0, taker_fee_rate: 0.0015 });
  const [supportFilter, setSupportFilter] = useState<'all' | 'open' | 'pending' | 'closed'>('all');
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [repliesByTicket, setRepliesByTicket] = useState<Record<string, SupportReply[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("users");
  const [editingAsset, setEditingAsset] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ balance: string, locked_balance: string }>({ balance: '', locked_balance: '' });
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userAssets, setUserAssets] = useState<UserAsset[]>([]);
  const [kycApplications, setKycApplications] = useState<KYCApplication[]>([]);
  const [kycDocuments, setKycDocuments] = useState<KYCDocument[]>([]);
  const [selectedKycUserId, setSelectedKycUserId] = useState<string | null>(null);
  const [kycReviewNotes, setKycReviewNotes] = useState<string>('');

  // ユーザー入金アドレス管理用のstate
  const [userDepositAddresses, setUserDepositAddresses] = useState<UserDepositAddress[]>([]);

  // 価格データ管理用のstate
  const [priceData, setPriceData] = useState<{ usd: Record<string, number>; usd_jpy?: number } | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [selectedUserForAddress, setSelectedUserForAddress] = useState<string | null>(null);
  const [editingAddress, setEditingAddress] = useState<string | null>(null);
  // 🚨 緊急修正: チェーン別編集状態管理（ID重複問題対応）
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [newAddress, setNewAddress] = useState<string>('');
  const [addressSearchTerm, setAddressSearchTerm] = useState<string>('');
  const [selectedUserAddresses, setSelectedUserAddresses] = useState<UserDepositAddress[]>([]);
  const [generatingAddress, setGeneratingAddress] = useState<string | null>(null);
  const [updatingAddress, setUpdatingAddress] = useState<string | null>(null);
  const [selectedUserProfile, setSelectedUserProfile] = useState<{ id: string; email?: string; full_name?: string } | null>(null);

  // 画像表示用のstate（Safari対応）
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [selectedImageFileName, setSelectedImageFileName] = useState<string | null>(null);

  const { toast } = useToast();

  const fetchUsers = useCallback(async () => {
    try {
      // First get all profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Then get all user roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');

      if (rolesError) throw rolesError;

      // Combine the data
      const formattedUsers: UserProfile[] = profilesData?.map(profile => {
        const userRole = rolesData?.find(role => role.user_id === profile.id);
        return {
          ...profile,
          role: (userRole?.role || 'user') as UserRole
        };
      }) || [];

      setUsers(formattedUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: "エラー",
        description: "ユーザー情報の取得に失敗しました。",
        variant: "destructive",
      });
    }
  }, [toast]);

  const fetchDeposits = useCallback(async () => {
    try {
      const { data: depositsData, error: depositsError } = await supabase
        .from('deposits')
        .select('*')
        .order('created_at', { ascending: false });

      if (depositsError) throw depositsError;

      // Get user profiles separately
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, full_name');

      if (profilesError) throw profilesError;

      // Combine the data
      const formattedDeposits = depositsData?.map(deposit => ({
        ...deposit,
        amount: typeof deposit.amount === 'number' ? deposit.amount : Number(deposit.amount ?? 0),
        status: deposit.status as 'pending' | 'confirmed' | 'rejected',
        profiles: profilesData?.find(p => p.id === deposit.user_id)
      })) || [];

      setDeposits(formattedDeposits);
    } catch (error) {
      console.error('Error fetching deposits:', error);
    }
  }, []);

  const fetchWithdrawals = useCallback(async () => {
    try {
      const { data: withdrawalsData, error: withdrawalsError } = await supabase
        .from('withdrawals')
        .select('*')
        .order('created_at', { ascending: false });

      if (withdrawalsError) throw withdrawalsError;

      // Get user profiles separately
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, full_name');

      if (profilesError) throw profilesError;

      // Combine the data
      const formattedWithdrawals = withdrawalsData?.map(withdrawal => ({
        ...withdrawal,
        status: withdrawal.status as 'pending' | 'confirmed' | 'rejected',
        profiles: profilesData?.find(p => p.id === withdrawal.user_id)
      })) || [];

      setWithdrawals(formattedWithdrawals);
    } catch (error) {
      console.error('Error fetching withdrawals:', error);
    }
  }, []);

  const fetchTransfers = useCallback(async () => {
    try {
      const { data: transfersData, error: transfersError } = await supabase
        .from('user_transfers')
        .select('*')
        .order('created_at', { ascending: false });

      if (transfersError) throw transfersError;

      // Get user profiles separately for both sender and receiver
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, user_handle');

      if (profilesError) throw profilesError;

      // Combine the data
      const formattedTransfers = transfersData?.map(transfer => {
        const fromUser = profilesData?.find(p => p.id === transfer.from_user_id);
        const toUser = profilesData?.find(p => p.id === transfer.to_user_id);

        return {
          ...transfer,
          from_user_handle: fromUser?.user_handle || '不明',
          to_user_handle: toUser?.user_handle || '不明',
          status: transfer.status as 'pending' | 'completed' | 'failed',
          updated_at: transfer.created_at // updated_atがなければcreated_atを使う
        };
      }) || [];

      setTransfers(formattedTransfers);
    } catch (error) {
      console.error('Error fetching transfers:', error);
    }
  }, []);

  const fetchAssets = useCallback(async () => {
    try {
      // 別々にクエリを実行してから結合する方式に変更
      const { data: assetsData, error: assetsError } = await supabase
        .from('user_assets')
        .select('*')
        .order('balance', { ascending: false });

      if (assetsError) {
        console.error('Assets query error:', assetsError);
        throw assetsError;
      }

      // プロファイルデータを別途取得
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, full_name');

      if (profilesError) {
        console.error('Profiles query error:', profilesError);
        throw profilesError;
      }

      // データを結合
      const combinedData = assetsData?.map(asset => ({
        ...asset,
        profiles: profilesData?.find(profile => profile.id === asset.user_id) ? {
          id: profilesData.find(profile => profile.id === asset.user_id)!.id,
          email: profilesData.find(profile => profile.id === asset.user_id)!.email,
          full_name: profilesData.find(profile => profile.id === asset.user_id)!.full_name
        } : undefined
      })) || [];

      // 削除されたユーザー（profilesが存在しない）のassetレコードを除外
      const filteredData = combinedData.filter(asset => asset.profiles !== undefined);

      setAssets(filteredData);
    } catch (error) {
      console.error('Error fetching assets:', error);
      toast({
        title: "エラー",
        description: "資産データの取得に失敗しました。",
        variant: "destructive",
      });
    }
  }, [toast]);

  // ユーザーごとの資産をグループ化する関数
  const groupAssetsByUser = useCallback(() => {
    const grouped = assets.reduce((acc, asset) => {
      const userId = asset.user_id;
      if (!acc[userId]) {
        acc[userId] = {
          user: {
            id: userId,
            email: asset.profiles?.email,
            full_name: asset.profiles?.full_name
          },
          assets: []
        };
      }
      acc[userId].assets.push(asset);
      return acc;
    }, {} as Record<string, { user: { id: string; email?: string; full_name?: string }, assets: UserAsset[] }>);

    return Object.entries(grouped);
  }, [assets]);

  // 特定ユーザーの詳細資産を取得
  const fetchUserAssets = useCallback(async (userId: string) => {
    try {
      const { data: userAssetsData, error } = await supabase
        .from('user_assets')
        .select('*')
        .eq('user_id', userId)
        .order('currency');

      if (error) throw error;

      // プロファイルデータを取得
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.error('Profile query error:', profileError);
      }

      // サポートされている全通貨を取得
      const supportedAssets = getAllDepositableAssets();

      // 既存のアセットをマップに変換
      const existingAssetsMap = new Map(userAssetsData?.map(asset => [asset.currency, asset]) || []);

      // 不足している通貨を特定して初期化
      const missingAssets = supportedAssets.filter(asset => !existingAssetsMap.has(asset));

      if (missingAssets.length > 0) {
        // 不足している通貨を0残高で初期化
        const newAssets = missingAssets.map(currency => ({
          user_id: userId,
          currency,
          balance: 0,
          locked_balance: 0
        }));

        // データベースに初期レコードを挿入
        const { error: insertError } = await supabase
          .from('user_assets')
          .upsert(newAssets, { onConflict: 'user_id,currency' });

        if (insertError) {
          console.error('Error inserting missing assets:', insertError);
        }

        // 再度データを取得（初期化されたレコードを含む）
        const { data: updatedUserAssetsData, error: refetchError } = await supabase
          .from('user_assets')
          .select('*')
          .eq('user_id', userId)
          .order('currency');

        if (refetchError) {
          console.error('Error refetching user assets:', refetchError);
        } else {
          // 更新されたデータを使用
          const updatedCombinedAssets = updatedUserAssetsData?.map(asset => ({
            ...asset,
            profiles: profileData ? { id: profileData.id, email: profileData.email, full_name: profileData.full_name } : undefined
          })) || [];
          setUserAssets(updatedCombinedAssets);
          return;
        }
      }

      // データを結合（従来の処理）
      const combinedUserAssets = userAssetsData?.map(asset => ({
        ...asset,
        profiles: profileData ? { id: profileData.id, email: profileData.email, full_name: profileData.full_name } : undefined
      })) || [];

      setUserAssets(combinedUserAssets);
    } catch (error) {
      console.error('Error fetching user assets:', error);
      toast({
        title: "エラー",
        description: "ユーザー資産データの取得に失敗しました。",
        variant: "destructive",
      });
    }
  }, [toast]);

  // ユーザーの資産編集を保存する関数（ledger_entriesとuser_assetsの双方向同期）
  const saveAssetEdit = useCallback(async (assetId: string, balance: string, lockedBalance: string) => {
    try {
      // 編集前の残高を取得
      const { data: currentAsset, error: fetchError } = await supabase
        .from('user_assets')
        .select('user_id, currency, balance, locked_balance')
        .eq('id', assetId)
        .single();

      if (fetchError || !currentAsset) {
        throw new Error('資産情報の取得に失敗しました');
      }

      const newBalance = parseFloat(balance);
      const newLockedBalance = parseFloat(lockedBalance);
      const currentBalance = parseFloat(String(currentAsset.balance)) || 0;
      const currentLockedBalance = parseFloat(String(currentAsset.locked_balance)) || 0;

      // 残高とロック残高の差分を計算
      const balanceDiff = newBalance - currentBalance;
      const lockedDiff = newLockedBalance - currentLockedBalance;

      // 差分がある場合のみledger_entriesに記録
      if (balanceDiff !== 0 || lockedDiff !== 0) {
        const { error: ledgerError } = await supabase
          .from('ledger_entries')
          .insert({
            user_id: currentAsset.user_id,
            currency: currentAsset.currency,
            amount: balanceDiff,
            locked_delta: lockedDiff,
            kind: 'adj',
            ref_type: 'system',
            ref_id: null
          });

        if (ledgerError) {
          console.error('Ledger entry error:', ledgerError);
          throw new Error('台帳エントリの作成に失敗しました');
        }
      }

      // user_assetsテーブルを更新
      const { error } = await supabase
        .from('user_assets')
        .update({
          balance: newBalance,
          locked_balance: newLockedBalance,
          updated_at: new Date().toISOString()
        })
        .eq('id', assetId);

      if (error) throw error;

      toast({
        title: "成功",
        description: "資産残高が更新されました。",
      });

      // 詳細画面を再読み込み
      if (selectedUserId) {
        await fetchUserAssets(selectedUserId);
      }
      // 全体のリストも更新
      await fetchAssets();
    } catch (error) {
      console.error('Error updating asset:', error);
      toast({
        title: "エラー",
        description: `資産残高の更新に失敗しました: ${error.message}`,
        variant: "destructive",
      });
    }
  }, [selectedUserId, fetchUserAssets, fetchAssets, toast]);

  const fetchMarkets = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('markets')
        .select('*')
        .order('id', { ascending: true });
      if (error) throw error;
      setMarkets(data as Market[] || []);
    } catch (error) {
      console.error('Error fetching markets:', error);
    }
  }, []);
  const fetchTickets = useCallback(async () => {
    try {
      const { data: rawTickets, error } = await supabase.from('support_tickets').select('*').order('created_at', { ascending: false });
      if (error) throw error;

      // 生データを SupportTicket 型に変換
      const formattedTickets: SupportTicket[] = (rawTickets as RawSupportTicket[] || []).map(ticket => ({
        ...ticket,
        message: ticket.body, // body フィールドを message にマッピング
        priority: 'medium', // デフォルト値を設定（必要に応じて調整）
        status: ticket.status as 'open' | 'pending' | 'closed'
      }));

      setTickets(formattedTickets);

      const { data: r } = await supabase.from('support_replies').select('*').order('created_at', { ascending: true });
      const map: Record<string, SupportReply[]> = {};
      (r || []).forEach((row: SupportReply) => {
        map[row.ticket_id] = map[row.ticket_id] || [];
        map[row.ticket_id].push(row);
      });
      setRepliesByTicket(map);
    } catch (error) {
      console.error('Error fetching tickets:', error);
    }
  }, []);

  // KYC申請データを取得
  const fetchKYCApplications = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id,
          kyc_status,
          kyc_level,
          kyc_updated_at,
          kyc_notes,
          email,
          full_name,
          created_at,
          first_name,
          last_name,
          first_name_kana,
          last_name_kana,
          birth_date,
          phone_number,
          postal_code,
          prefecture,
          city,
          address,
          building
        `)
        .not('kyc_status', 'is', null)
        .neq('kyc_status', 'none')
        .order('kyc_updated_at', { ascending: false });

      if (error) throw error;

      // データをKYCApplication型として設定（データベースから取得したデータをそのまま使用）
      const formattedApplications: KYCApplication[] = (data || []) as unknown as KYCApplication[];

      setKycApplications(formattedApplications);
    } catch (error) {
      console.error('Error fetching KYC applications:', error);
    }
  }, []);

  // KYC書類データを取得
  const fetchKYCDocuments = useCallback(async () => {
    try {
      const { data: rawDocuments, error } = await supabase
        .from('kyc_documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // データを KYCDocument 型に変換
      const formattedDocuments: KYCDocument[] = (rawDocuments || []).map(doc => ({
        ...doc,
        document_type: doc.document_type as 'identity' | 'address' | 'selfie' | 'income',
        status: doc.status as 'pending' | 'approved' | 'rejected'
      }));

      setKycDocuments(formattedDocuments);
    } catch (error) {
      console.error('Error fetching KYC documents:', error);
    }
  }, []);

  // ユーザー入金アドレスデータを取得
  const fetchUserDepositAddresses = useCallback(async () => {
    try {
      const { data: addressData, error } = await supabase
        .from('user_deposit_addresses')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // プロファイルデータを別途取得
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, full_name');

      if (profilesError) throw profilesError;

      // データを結合
      const formattedAddresses: UserDepositAddress[] = (addressData || []).map(addr => ({
        ...addr,
        profiles: profilesData?.find(p => p.id === addr.user_id)
      }));

      setUserDepositAddresses(formattedAddresses);
    } catch (error) {
      console.error('Error fetching user deposit addresses:', error);
      toast({
        title: "エラー",
        description: "ユーザー入金アドレスの取得に失敗しました。",
        variant: "destructive",
      });
    }
  }, [toast]);

  // 価格データを取得する関数
  const fetchPriceData = useCallback(async () => {
    try {
      setPriceLoading(true);
      setPriceError(null);
      const supportedAssets = getAllDepositableAssets();
      const priceSnapshot = await getPriceSnapshot(supportedAssets);
      setPriceData(priceSnapshot);
    } catch (error) {
      console.error('価格データの取得に失敗:', error);
      setPriceError('価格データの取得に失敗しました');
      toast({
        title: "警告",
        description: "価格データの取得に失敗しました。総評価額が正確に表示されない可能性があります。",
        variant: "destructive",
      });
    } finally {
      setPriceLoading(false);
    }
  }, [toast]);

  // 資産をUSDT評価額で計算する関数
  const calculateUsdtValue = useCallback((assets: UserAsset[]) => {
    if (!priceData) {
      return 0;
    }

    const totalUsdtValue = assets.reduce((sum, asset) => {
      const totalBalance = asset.balance + asset.locked_balance;
      if (totalBalance === 0) return sum;

      try {
        // 各通貨をUSDTに変換
        const rate = computePairRate(asset.currency, 'USDT', priceData);
        const usdtValue = totalBalance * rate;
        return sum + usdtValue;
      } catch (error) {
        console.error(`通貨 ${asset.currency} のUSDT変換エラー:`, error);
        return sum;
      }
    }, 0);

    return totalUsdtValue;
  }, [priceData]);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchUsers(),
        fetchDeposits(),
        fetchWithdrawals(),
        fetchTransfers(),
        fetchAssets(),
        fetchMarkets(),
        fetchTickets(),
        fetchKYCApplications(),
        fetchKYCDocuments(),
        fetchUserDepositAddresses(),
        fetchPriceData()
      ]);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "エラー",
        description: "データの取得に失敗しました。",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [fetchUsers, fetchDeposits, fetchWithdrawals, fetchTransfers, fetchAssets, fetchMarkets, fetchTickets, fetchKYCApplications, fetchKYCDocuments, fetchUserDepositAddresses, fetchPriceData, toast]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const updateTicketStatus = async (ticketId: string, status: 'open' | 'pending' | 'closed') => {
    try {
      const { error } = await supabase.from('support_tickets').update({ status }).eq('id', ticketId);
      if (error) throw error;
      toast({ title: '成功', description: 'チケットを更新しました。' });
      fetchTickets();
    } catch (error) {
      console.error('Error updating ticket:', error);
      toast({ title: 'エラー', description: 'チケット更新に失敗しました。', variant: 'destructive' });
    }
  };
  const sendReply = async (ticketId: string) => {
    const msg = (reply[ticketId] || '').trim();
    if (!msg) return;
    try {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from('support_replies').insert({
        ticket_id: ticketId,
        user_id: u.user?.id,
        message: msg,
        is_admin_reply: true
      });
      if (error) throw error;

      // 返信文をクリア
      setReply(prev => ({ ...prev, [ticketId]: '' }));

      // チケット一覧を再取得して返信を反映
      await fetchTickets();

      toast({ title: '成功', description: '返信を送信しました。' });
    } catch (error) {
      console.error('Error sending reply:', error);
      toast({ title: 'エラー', description: '返信送信に失敗しました。', variant: 'destructive' });
    }
  };

  const updateMarket = async (id: string, patch: Partial<Market>) => {
    try {
      const { error } = await supabase
        .from('markets')
        .update(patch)
        .eq('id', id);
      if (error) throw error;
      toast({ title: '成功', description: 'マーケットを更新しました' });
      fetchMarkets();
    } catch (e) {
      toast({ title: 'エラー', description: 'マーケット更新に失敗しました', variant: 'destructive' });
    }
  };

  const createMarket = async () => {
    try {
      if (!newMarket.id || !newMarket.base || !newMarket.quote) {
        toast({ title: '入力不備', description: 'ID, base, quote は必須です', variant: 'destructive' });
        return;
      }
      const { error } = await supabase
        .from('markets')
        .insert({
          id: newMarket.id,
          base: newMarket.base,
          quote: newMarket.quote,
          price_tick: newMarket.price_tick || 0.01,
          qty_step: newMarket.qty_step || 0.000001,
          min_notional: newMarket.min_notional || 1,
          status: newMarket.status || 'active',
          maker_fee_rate: newMarket.maker_fee_rate ?? 0.0,
          taker_fee_rate: newMarket.taker_fee_rate ?? 0.0015,
        });
      if (error) throw error;
      toast({ title: '成功', description: 'マーケットを追加しました' });
      setNewMarket({ id: '', base: '', quote: '', price_tick: 0.01, qty_step: 0.000001, min_notional: 1, status: 'active', maker_fee_rate: 0.0, taker_fee_rate: 0.0015 });
      fetchMarkets();
    } catch (e) {
      toast({ title: 'エラー', description: 'マーケット作成に失敗しました', variant: 'destructive' });
    }
  };

  const updateUserRole = async (userId: string, newRole: UserRole) => {
    try {
      const { error } = await supabase
        .from('user_roles')
        .update({ role: newRole })
        .eq('user_id', userId);

      if (error) throw error;

      toast({
        title: "成功",
        description: "ユーザーロールが更新されました。",
      });

      fetchUsers();
    } catch (error) {
      console.error('Error updating user role:', error);
      toast({
        title: "エラー",
        description: "ユーザーロールの更新に失敗しました。",
        variant: "destructive",
      });
    }
  };

  const updateDepositStatus = async (depositId: string, status: 'confirmed' | 'rejected', notes?: string) => {
    try {
      // get deposit details
      const { data: dep } = await supabase.from('deposits').select('*').eq('id', depositId).maybeSingle();
      const { error } = await supabase
        .from('deposits')
        .update({
          status,
          confirmed_at: status === 'confirmed' ? new Date().toISOString() : null,
          confirmed_by: status === 'confirmed' ? (await supabase.auth.getUser()).data.user?.id : null,
          notes
        })
        .eq('id', depositId);

      if (error) throw error;

      // ledger entry on confirm
      if (status === 'confirmed' && dep) {
        await supabase.from('ledger_entries').insert({
          user_id: dep.user_id,
          currency: dep.currency,
          amount: Number(dep.amount),
          locked_delta: 0,
          kind: 'deposit',
          ref_type: 'deposit',
          ref_id: depositId,
        });
      }

      toast({
        title: "成功",
        description: `入金が${status === 'confirmed' ? '承認' : '拒否'}されました。`,
      });

      fetchDeposits();
    } catch (error) {
      console.error('Error updating deposit:', error);
      toast({
        title: "エラー",
        description: "入金ステータスの更新に失敗しました。",
        variant: "destructive",
      });
    }
  };

  const updateWithdrawalStatus = async (withdrawalId: string, status: 'confirmed' | 'rejected', notes?: string) => {
    try {
      // 出金詳細を取得
      const { data: w } = await supabase.from('withdrawals').select('*').eq('id', withdrawalId).maybeSingle();

      if (!w) {
        throw new Error('出金申請が見つかりません');
      }

      // user_assetsレコードの存在確認と残高チェック
      const { data: userAsset, error: assetFetchError } = await supabase
        .from('user_assets')
        .select('balance, locked_balance')
        .eq('user_id', w.user_id)
        .eq('currency', w.currency)
        .single();

      if (assetFetchError) {
        console.error('User asset not found:', assetFetchError);
        throw new Error(`ユーザーの${w.currency}資産レコードが見つかりません`);
      }

      // ロック残高チェック
      if (Number(userAsset.locked_balance) < Number(w.amount)) {
        throw new Error(`ロック残高不足: 必要${w.amount} ${w.currency}, 現在${userAsset.locked_balance} ${w.currency}`);
      }

      // 承認時は通常残高もチェック
      if (status === 'confirmed' && Number(userAsset.balance) < Number(w.amount)) {
        throw new Error(`残高不足: 必要${w.amount} ${w.currency}, 現在${userAsset.balance} ${w.currency}`);
      }

      // withdrawalsテーブル更新
      const { error } = await supabase
        .from('withdrawals')
        .update({
          status,
          confirmed_at: status === 'confirmed' ? new Date().toISOString() : null,
          confirmed_by: status === 'confirmed' ? (await supabase.auth.getUser()).data.user?.id : null,
          notes
        })
        .eq('id', withdrawalId);

      if (error) throw error;

      if (w) {
        if (status === 'confirmed') {
          // confirmed: subtract from total balance and unlock (double operation)
          await supabase.from('ledger_entries').insert([
            {
              user_id: w.user_id,
              currency: w.currency,
              amount: -Number(w.amount),
              locked_delta: -Number(w.amount),
              kind: 'withdrawal',
              ref_type: 'withdrawal',
              ref_id: withdrawalId,
            }
          ]);

          // user_assetsテーブルも同期更新（承認時：残高減算 + ロック解除）
          const newBalance = Number(userAsset.balance) - Number(w.amount);
          const newLockedBalance = Number(userAsset.locked_balance) - Number(w.amount);

          const { error: userAssetError } = await supabase
            .from('user_assets')
            .update({
              balance: newBalance,
              locked_balance: newLockedBalance,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', w.user_id)
            .eq('currency', w.currency);

          if (userAssetError) {
            console.error('Error updating user_assets on confirmation:', userAssetError);
            throw userAssetError;
          }

        } else if (status === 'rejected') {
          // rejected: unlock only (return locked funds to available)
          await supabase.from('ledger_entries').insert([
            {
              user_id: w.user_id,
              currency: w.currency,
              amount: 0,
              locked_delta: -Number(w.amount),
              kind: 'withdrawal',
              ref_type: 'withdrawal',
              ref_id: withdrawalId,
            }
          ]);

          // user_assetsテーブルも同期更新（拒否時：ロック解除のみ）
          const newLockedBalance = Number(userAsset.locked_balance) - Number(w.amount);

          const { error: userAssetError } = await supabase
            .from('user_assets')
            .update({
              locked_balance: newLockedBalance,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', w.user_id)
            .eq('currency', w.currency);

          if (userAssetError) {
            console.error('Error updating user_assets on rejection:', userAssetError);
            throw userAssetError;
          }
        }
      }

      toast({
        title: "成功",
        description: `出金が${status === 'confirmed' ? '承認' : '拒否'}されました。`,
      });

      // 出金リストと資産リストの両方を更新
      fetchWithdrawals();
      fetchAssets();
    } catch (error) {
      console.error('Error updating withdrawal:', error);
      toast({
        title: "エラー",
        description: "出金ステータスの更新に失敗しました。",
        variant: "destructive",
      });
    }
  };

  // KYC申請の承認・拒否処理
  const updateKYCStatus = async (userId: string, status: 'verified' | 'rejected', notes?: string) => {
    try {
      const { data: currentUser } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('profiles')
        .update({
          kyc_status: status,
          kyc_level: status === 'verified' ? 2 : 0,
          kyc_updated_at: new Date().toISOString(),
          kyc_notes: notes || ''
        })
        .eq('id', userId);

      if (error) throw error;

      toast({
        title: "成功",
        description: `KYC申請が${status === 'verified' ? '承認' : '拒否'}されました。`,
      });

      fetchKYCApplications();
    } catch (error) {
      console.error('Error updating KYC status:', error);
      toast({
        title: "エラー",
        description: "KYCステータスの更新に失敗しました。",
        variant: "destructive",
      });
    }
  };

  // KYC書類の承認・拒否処理
  const updateKYCDocumentStatus = async (documentId: string, status: 'approved' | 'rejected', notes?: string) => {
    try {
      const { data: currentUser } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('kyc_documents')
        .update({
          status,
          reviewed_by: currentUser.user?.id,
          reviewed_at: new Date().toISOString(),
          review_notes: notes || ''
        })
        .eq('id', documentId);

      if (error) throw error;

      toast({
        title: "成功",
        description: `書類が${status === 'approved' ? '承認' : '拒否'}されました。`,
      });

      fetchKYCDocuments();
    } catch (error) {
      console.error('Error updating document status:', error);
      toast({
        title: "エラー",
        description: "書類ステータスの更新に失敗しました。",
        variant: "destructive",
      });
    }
  };

  const updateAssetBalance = async (assetId: string, balance: number, lockedBalance: number) => {
    try {
      const { error } = await supabase
        .from('user_assets')
        .update({
          balance: balance,
          locked_balance: lockedBalance,
          updated_at: new Date().toISOString()
        })
        .eq('id', assetId);

      if (error) throw error;

      toast({
        title: "成功",
        description: "資産残高が更新されました。",
      });

      setEditingAsset(null);
      setEditValues({ balance: '', locked_balance: '' });
      fetchAssets();
    } catch (error) {
      console.error('Error updating asset:', error);
      toast({
        title: "エラー",
        description: "資産残高の更新に失敗しました。",
        variant: "destructive",
      });
    }
  };

  const startEditAsset = (asset: UserAsset) => {
    setEditingAsset(asset.id);
    setEditValues({
      balance: asset.balance.toString(),
      locked_balance: asset.locked_balance.toString()
    });
  };

  const cancelEditAsset = () => {
    setEditingAsset(null);
    setEditValues({ balance: '', locked_balance: '' });
  };

  const saveAssetChanges = (assetId: string) => {
    const balance = parseFloat(editValues.balance);
    const lockedBalance = parseFloat(editValues.locked_balance);

    if (isNaN(balance) || isNaN(lockedBalance) || balance < 0 || lockedBalance < 0) {
      toast({
        title: "エラー",
        description: "有効な数値を入力してください。",
        variant: "destructive",
      });
      return;
    }

    updateAssetBalance(assetId, balance, lockedBalance);
  };

  // ユーザー入金アドレス更新機能
  const updateUserDepositAddress = async (addressId: string, newAddressValue: string) => {
    // 更新中の状態を設定（重複操作防止とローディング表示）
    setUpdatingAddress(addressId);

    try {
      // アドレス形式の基本検証
      if (!newAddressValue || newAddressValue.trim().length === 0) {
        toast({
          title: "エラー",
          description: "有効なアドレスを入力してください。",
          variant: "destructive",
        });
        setUpdatingAddress(null);
        return;
      }

      // 重複チェック
      const existingAddress = userDepositAddresses.find(
        addr => addr.address === newAddressValue.trim() && addr.id !== addressId
      );
      if (existingAddress) {
        toast({
          title: "エラー",
          description: "このアドレスは既に使用されています。",
          variant: "destructive",
        });
        setUpdatingAddress(null);
        return;
      }

      const { data: currentUser } = await supabase.auth.getUser();

      // アドレス更新
      const { error } = await supabase
        .from('user_deposit_addresses')
        .update({
          address: newAddressValue.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', addressId);

      if (error) throw error;

      // 監査ログに記録
      await supabase.from('audit_logs').insert({
        actor_user_id: currentUser.user?.id,
        resource: 'user_deposit_addresses',
        resource_id: addressId,
        action: 'update',
        details: {
          old_address: userDepositAddresses.find(a => a.id === addressId)?.address,
          new_address: newAddressValue.trim(),
        }
      });

      toast({
        title: "成功",
        description: "入金アドレスが更新されました。",
      });

      // データを再読み込み（awaitを追加して確実に完了を待つ）
      await fetchUserDepositAddresses();

      // 選択されたユーザーのアドレス表示も更新（UIで使用される状態）
      if (selectedUserId) {
        await fetchSelectedUserAddresses(selectedUserId);
      }

      setEditingAddress(null);
      setEditingKey(null);
      setNewAddress('');
      setUpdatingAddress(null);
    } catch (error) {
      console.error('Error updating address:', error);
      toast({
        title: "エラー",
        description: "入金アドレスの更新に失敗しました。",
        variant: "destructive",
      });
      setUpdatingAddress(null);
    }
  };

  const startEditAddress = (
    address: UserDepositAddress,
    combination: CombinationDescriptor
  ) => {
    const combinationKey = getCombinationKey(combination);

    setEditingAddress(address.id);
    setEditingKey(combinationKey);
    setNewAddress(address.address);
  };

  const cancelEditAddress = () => {
    setEditingAddress(null);
    setEditingKey(null);
    setNewAddress('');
  };

  // 選択されたユーザーのアドレス一覧を取得
  const fetchSelectedUserAddresses = useCallback(async (userId: string) => {
    try {
      const { data: addressData, error } = await supabase
        .from('user_deposit_addresses')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching user addresses:', error);
        throw error;
      }

      const formattedAddresses: UserDepositAddress[] = (addressData || []).map(addr => {
        const baseAddress = addr as UserDepositAddress;
        const chainHint = detectChainFromAddress({
          address: baseAddress.address,
          currency: baseAddress.currency,
          network: baseAddress.network,
          derivation_path: baseAddress.derivation_path
        }) ?? 'unknown';

        return {
          ...baseAddress,
          chain_hint: chainHint,
          profiles: users.find(u => u.id === userId) ? {
            email: users.find(u => u.id === userId)!.email,
            full_name: users.find(u => u.id === userId)!.full_name
          } : undefined
        };
      });

      setSelectedUserAddresses(formattedAddresses);
    } catch (error) {
      console.error('Error fetching user addresses:', error);
      toast({
        title: "エラー",
        description: "ユーザーアドレスの取得に失敗しました。",
        variant: "destructive",
      });
    }
  }, [users, toast]);

  // アドレス生成機能
  const generateDepositAddress = async (
    userId: string,
    chain: SupportedChain,
    network: SupportedNetwork,
    asset: SupportedAsset
  ) => {
    const combinationDescriptor: CombinationDescriptor = { chain, network, asset };
    const key = getCombinationKey(combinationDescriptor);
    setGeneratingAddress(key);

    try {
      // 既存のアドレスチェック（チェーン識別対応）
      const { data: existingRecords, error: existingFetchError } = await supabase
        .from('user_deposit_addresses')
        .select('*')
        .eq('user_id', userId)
        .eq('currency', asset)
        .eq('network', network);

      if (existingFetchError) {
        console.error('Error checking existing address:', existingFetchError);
        throw existingFetchError;
      }

      // チェーン固有の既存アドレスをフィルタリング
      const chainSpecificRecord = existingRecords?.find(record => {
        const isETHChain = chain === 'eth' && record.address.startsWith('0x');
        const isTRCChain = chain === 'trc' && record.address.startsWith('T');
        const isXRPChain = chain === 'xrp' && record.address.startsWith('r');
        const isBTCChain = chain === 'btc' && (record.address.startsWith('1') || record.address.startsWith('3') || record.address.startsWith('bc1'));
        const isADAChain = chain === 'ada' && record.address.startsWith('addr');

        return isETHChain || isTRCChain || isXRPChain || isBTCChain || isADAChain;
      });

      if (chainSpecificRecord) {
        toast({
          title: "警告",
          description: "このユーザーは既にこの組み合わせのアドレスを持っています。",
          variant: "destructive",
        });

        // UI状態が最新でない場合に備え同期
        setSelectedUserAddresses(prev => {
          const existsInState = prev.some(addr => addr.id === chainSpecificRecord.id);
          if (existsInState) return prev;

          const profile = users.find(u => u.id === userId)
            ? {
              email: users.find(u => u.id === userId)!.email,
              full_name: users.find(u => u.id === userId)!.full_name ?? ''
            }
            : undefined;

          return [
            formatUserDepositAddress(chainSpecificRecord, profile),
            ...prev
          ];
        });

        setGeneratingAddress(null);
        return;
      }

      const existingAddress = findAddressForCombination(selectedUserAddresses, combinationDescriptor);

      // 同一チェーンで既存アドレスをチェック（ETH/USDT、TRC/USDTの場合）
      let reuseAddressInfo: Pick<MultichainAddressInfo, 'address' | 'derivationPath' | 'destinationTag'> | null = null;
      if ((chain === 'eth' && asset === 'USDT') || (chain === 'trc' && asset === 'USDT')) {
        const baseAsset = chain === 'eth' ? 'ETH' : 'TRX';
        const baseAddress = findAddressForCombination(selectedUserAddresses, {
          chain,
          network,
          asset: baseAsset as SupportedAsset
        });

        if (baseAddress) {
          reuseAddressInfo = {
            address: baseAddress.address,
            derivationPath: baseAddress.derivation_path || undefined,
            destinationTag: baseAddress.destination_tag
              ? Number(baseAddress.destination_tag)
              : undefined
          };
        }
      }

      const parseDestinationTag = (value: unknown) => {
        if (typeof value === 'number') return value;
        if (typeof value === 'string' && value.trim().length > 0) {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : undefined;
        }
        return undefined;
      };

      // XRP は非同期でDB参照が必要なため、専用ヘルパー関数で対応
      const generateAddressForChain = async (
        targetChain: SupportedChain,
        targetNetwork: SupportedNetwork,
        targetAsset: SupportedAsset,
        targetUserId: string
      ): Promise<Pick<MultichainAddressInfo, 'address' | 'derivationPath' | 'destinationTag'>> => {
        if (targetChain === 'xrp') {
          if (targetNetwork !== 'mainnet' && targetNetwork !== 'testnet') {
            throw new Error('XRP は mainnet/testnet のみサポートしています');
          }
          const xrpInfo = await generateXRPDepositInfo(supabase, targetUserId, targetNetwork);
          return {
            address: xrpInfo.address,
            derivationPath: undefined,
            destinationTag: xrpInfo.destinationTag
          };
        }
        return generateMultichainAddress(targetUserId, targetChain, targetNetwork, targetAsset);
      };

      const buildInsertPayload = (
        info: Pick<MultichainAddressInfo, 'address' | 'derivationPath' | 'destinationTag'>
      ) => {
        type UserDepositAddressInsert = Database["public"]["Tables"]["user_deposit_addresses"]["Insert"];

        const normalizedDerivationPath = info.derivationPath ?? (
          info.destinationTag !== undefined
            ? `destination_tag:${info.destinationTag}`
            : null
        );

        const payload: UserDepositAddressInsert = {
          user_id: userId,
          currency: asset,
          network: network,
          address: info.address,
          derivation_path: normalizedDerivationPath,
          is_active: true
        };

        return payload;
      };

      // アドレス生成または再利用（XRP は非同期でDB参照が必要）
      let addressInfo: Pick<MultichainAddressInfo, 'address' | 'derivationPath' | 'destinationTag'> =
        reuseAddressInfo ?? await generateAddressForChain(chain, network, asset, userId);

      // destinationTagが文字列で返ってきた場合に備え正規化
      if (addressInfo.destinationTag !== undefined) {
        addressInfo = {
          ...addressInfo,
          destinationTag: parseDestinationTag(addressInfo.destinationTag)
        };
      }

      const { data: currentUser } = await supabase.auth.getUser();

      let insertPayload = buildInsertPayload(addressInfo);
      let insertResult = await supabase
        .from('user_deposit_addresses')
        .insert(insertPayload);

      if (insertResult.error) {
        const isDuplicateAddress = insertResult.error.code === '23505';

        // 既存アドレス再利用時に一意制約へ抵触した場合は、新しいアドレスを生成してリトライ
        if (reuseAddressInfo && isDuplicateAddress) {
          console.warn('⚠️ アドレス重複検知。新しいアドレスで再試行します。', {
            originalAddress: addressInfo.address,
            originalDerivationPath: addressInfo.derivationPath,
            error: insertResult.error
          });

          addressInfo = await generateAddressForChain(chain, network, asset, userId);
          if (addressInfo.destinationTag !== undefined) {
            addressInfo = {
              ...addressInfo,
              destinationTag: parseDestinationTag(addressInfo.destinationTag)
            };
          }

          insertPayload = buildInsertPayload(addressInfo);
          insertResult = await supabase
            .from('user_deposit_addresses')
            .insert(insertPayload);
        }

        if (insertResult.error) {
          console.error('❌ 入金アドレス挿入失敗', insertResult.error);
          throw insertResult.error;
        }
      }

      // 監査ログに記録
      await supabase.from('audit_logs').insert({
        actor_user_id: currentUser.user?.id,
        resource: 'user_deposit_addresses',
        action: 'create',
        details: {
          user_id: userId,
          currency: asset,
          network: network,
          address: addressInfo.address
        }
      });

      toast({
        title: "成功",
        description: `${asset} (${network}) の入金アドレスを生成しました。`,
      });

      // 選択されたユーザーのアドレス一覧を再取得
      await fetchSelectedUserAddresses(userId);
    } catch (error) {
      console.error('Error generating address:', error);

      const message =
        typeof error === 'object' && error && 'message' in error
          ? String(error.message)
          : 'アドレス生成に失敗しました。';

      const details =
        typeof error === 'object' && error && 'details' in error
          ? String(error.details)
          : undefined;

      toast({
        title: "エラー",
        description: details ? `${message}\n${details}` : message,
        variant: "destructive",
      });
    } finally {
      setGeneratingAddress(null);
    }
  };

  // ユーザー選択時の処理
  const handleUserSelect = async (userId: string) => {
    try {
      // プロファイル情報を取得
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.error('Profile fetch error:', profileError);
        toast({
          title: "エラー",
          description: "ユーザー情報の取得に失敗しました。",
          variant: "destructive",
        });
        return;
      }

      setSelectedUserId(userId);
      setSelectedUserProfile(profileData);

      // ユーザーの既存アドレスを取得
      await fetchSelectedUserAddresses(userId);

    } catch (error) {
      console.error('Error selecting user:', error);
      toast({
        title: "エラー",
        description: "ユーザー選択に失敗しました。",
        variant: "destructive",
      });
    }
  };

  // ユーザー選択をリセット
  const resetUserSelection = () => {
    setSelectedUserId(null);
    setSelectedUserProfile(null);
    setSelectedUserAddresses([]);
    setGeneratingAddress(null);
  };

  // サポートされている通貨・チェーン組み合わせを取得
  const getSupportedCombinations = (): Array<{
    chain: SupportedChain;
    network: SupportedNetwork;
    assets: SupportedAsset[];
    chainName: string;
  }> => {
    const combinations = [
      {
        chain: 'eth' as SupportedChain,
        network: 'mainnet' as SupportedNetwork,
        assets: getSupportedAssets('eth', 'mainnet'),
        chainName: 'Ethereum'
      },
      {
        chain: 'btc' as SupportedChain,
        network: 'mainnet' as SupportedNetwork,
        assets: getSupportedAssets('btc', 'mainnet'),
        chainName: 'Bitcoin'
      },
      {
        chain: 'trc' as SupportedChain,
        network: 'mainnet' as SupportedNetwork,
        assets: getSupportedAssets('trc', 'mainnet'),
        chainName: 'Tron'
      },
      {
        chain: 'xrp' as SupportedChain,
        network: 'mainnet' as SupportedNetwork,
        assets: getSupportedAssets('xrp', 'mainnet'),
        chainName: 'XRP Ledger'
      },
      {
        chain: 'ada' as SupportedChain,
        network: 'mainnet' as SupportedNetwork,
        assets: getSupportedAssets('ada', 'mainnet'),
        chainName: 'Cardano'
      }
    ];

    return combinations.filter(combo => combo.assets.length > 0);
  };

  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRoleBadgeVariant = (role: UserRole) => {
    switch (role) {
      case 'admin': return 'destructive';
      case 'moderator': return 'secondary';
      default: return 'outline';
    }
  };

  const getUserStats = () => {
    const totalUsers = users.length;
    const adminUsers = users.filter(u => u.role === 'admin').length;
    const activeUsers = users.filter(u => new Date(u.created_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length;

    return { totalUsers, adminUsers, activeUsers };
  };

  const getTransactionStats = () => {
    const pendingDeposits = deposits.filter(d => d.status === 'pending').length;
    const pendingWithdrawals = withdrawals.filter(w => w.status === 'pending').length;

    // 全資産をUSDT評価額で計算
    const totalUsdtAssets = calculateUsdtValue(assets);

    return { pendingDeposits, pendingWithdrawals, totalAssets: totalUsdtAssets };
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'confirmed': return 'default';
      case 'pending': return 'secondary';
      case 'rejected': return 'destructive';
      default: return 'outline';
    }
  };

  const stats = getUserStats();
  const txStats = getTransactionStats();

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-base">読み込み中...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-1">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-0">
          <h1 className="text-xl md:text-xl font-bold">管理者ダッシュボード</h1>
          <div className="flex items-center gap-2">
            <Button onClick={fetchAllData} size="sm">
              更新
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="space-y-1">
          {/* メインメトリクス */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
            <div className="bg-white/70 backdrop-blur-sm rounded-xl p-2 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-1.5">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Users className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">ユーザー</p>
                  <p className="text-base font-semibold text-gray-900">{stats.totalUsers}</p>
                </div>
              </div>
            </div>

            <div className="bg-white/70 backdrop-blur-sm rounded-xl p-2 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-1.5">
                <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
                  <Shield className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">管理者</p>
                  <p className="text-base font-semibold text-gray-900">{stats.adminUsers}</p>
                </div>
              </div>
            </div>

            <div className="bg-white/70 backdrop-blur-sm rounded-xl p-2 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-1.5">
                <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                  <UserCheck className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">アクティブ</p>
                  <p className="text-base font-semibold text-gray-900">{stats.activeUsers}</p>
                </div>
              </div>
            </div>

            <div className="bg-white/70 backdrop-blur-sm rounded-xl p-2 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-1.5">
                <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
                  <Wallet className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">総資産 (USDT)</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {priceLoading ? (
                      '計算中...'
                    ) : priceError ? (
                      'エラー'
                    ) : (
                      `${txStats.totalAssets.toFixed(2)} USDT`
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* トランザクションメトリクス */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-2 border border-blue-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-blue-600 font-medium mb-1">承認待ち入金</p>
                  <p className="text-xl font-bold text-blue-900">{txStats.pendingDeposits}</p>
                </div>
                <ArrowDownLeft className="h-4 w-4 text-blue-500" />
              </div>
            </div>

            <div className="bg-gradient-to-r from-red-50 to-pink-50 rounded-xl p-2 border border-red-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-red-600 font-medium mb-1">承認待ち出金</p>
                  <p className="text-xl font-bold text-red-900">{txStats.pendingWithdrawals}</p>
                </div>
                <ArrowUpRight className="h-4 w-4 text-red-500" />
              </div>
            </div>

            <div className="bg-gradient-to-r from-gray-50 to-slate-50 rounded-xl p-2 border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600 font-medium mb-1">ウォレット管理</p>
                  <Button size="sm" variant="outline" onClick={() => navigate('/admin/wallets')} className="mt-1 h-8 text-xs">
                    管理画面
                  </Button>
                </div>
                <Wallet className="h-4 w-4 text-gray-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Tabbed Interface */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-1">
          {/* Mobile Dropdown */}
          <div className="md:hidden">
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 bg-background text-foreground text-sm font-medium"
            >
              <option value="users">ユーザー管理</option>
              <option value="deposits">入金管理</option>
              <option value="withdrawals">出金管理</option>
              <option value="transfers">送金管理</option>
              <option value="assets">資産管理</option>
              <option value="markets">マーケット管理</option>
              <option value="support">サポート</option>
              <option value="kyc">KYC管理</option>
              <option value="hdwallet">HDウォレット管理</option>
              <option value="user-addresses">ユーザー入金アドレス管理</option>
              <option value="announcements">お知らせ管理</option>
              <option value="tokens">トークン管理</option>
              <option value="referrals">紹介管理</option>
            </select>
          </div>

          {/* Desktop Tabs - 2行レイアウト */}
          <div className="hidden md:block space-y-2">
            {/* メイン機能タブ（1行目） */}
            <TabsList className="grid w-full grid-cols-7 h-auto">
              <TabsTrigger value="users" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Users className="h-4 w-4 mr-2" />
                ユーザー
              </TabsTrigger>
              <TabsTrigger value="deposits" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <ArrowDownLeft className="h-4 w-4 mr-2" />
                入金
              </TabsTrigger>
              <TabsTrigger value="withdrawals" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <ArrowUpRight className="h-4 w-4 mr-2" />
                出金
              </TabsTrigger>
              <TabsTrigger value="transfers" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Send className="h-4 w-4 mr-2" />
                送金
              </TabsTrigger>
              <TabsTrigger value="assets" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Wallet className="h-4 w-4 mr-2" />
                資産
              </TabsTrigger>
              <TabsTrigger value="kyc" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Shield className="h-4 w-4 mr-2" />
                KYC
              </TabsTrigger>
              <TabsTrigger value="support" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <FileText className="h-4 w-4 mr-2" />
                サポート
              </TabsTrigger>
            </TabsList>

            {/* システム設定タブ（2行目） */}
            <TabsList className="grid w-full grid-cols-6 h-auto bg-muted/50">
              <TabsTrigger value="markets" className="text-sm">
                <DollarSign className="h-3 w-3 mr-1" />
                マーケット
              </TabsTrigger>
              <TabsTrigger value="hdwallet" className="text-sm">
                <Wallet className="h-3 w-3 mr-1" />
                HDウォレット
              </TabsTrigger>
              <TabsTrigger value="user-addresses" className="text-sm">
                <MapPin className="h-3 w-3 mr-1" />
                入金アドレス
              </TabsTrigger>
              <TabsTrigger value="announcements" className="text-sm">
                <Bell className="h-3 w-3 mr-1" />
                お知らせ
              </TabsTrigger>
              <TabsTrigger value="tokens" className="text-sm">
                <Coins className="h-3 w-3 mr-1" />
                トークン
              </TabsTrigger>
              <TabsTrigger value="referrals" className="text-sm">
                <Gift className="h-3 w-3 mr-1" />
                紹介
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Users Tab */}
          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  ユーザー管理
                </CardTitle>
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="ユーザーを検索..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-sm">ステータス:</span>
                  <select className="border rounded px-2 py-1 bg-background text-foreground" value={supportFilter} onChange={(e) => setSupportFilter(e.target.value as 'all' | 'open' | 'pending' | 'closed')}>
                    <option value="all">all</option>
                    <option value="open">open</option>
                    <option value="pending">pending</option>
                    <option value="closed">closed</option>
                  </select>
                </div>
                {/* Desktop Table */}
                <div className="hidden lg:block">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2 font-medium">ユーザー</th>
                        <th className="text-left p-2 font-medium">メール</th>
                        <th className="text-left p-2 font-medium">ロール</th>
                        <th className="text-left p-2 font-medium">登録日</th>
                        <th className="text-left p-2 font-medium">アクション</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((user) => (
                        <tr key={user.id} className="border-b hover:bg-muted/50">
                          <td className="p-2">
                            <div>
                              <div className="font-medium">{user.full_name || '未設定'}</div>
                              <div className="text-sm text-muted-foreground">{user.id}</div>
                            </div>
                          </td>
                          <td className="p-2">{user.email}</td>
                          <td className="p-2">
                            <Badge variant={getRoleBadgeVariant(user.role)}>
                              {user.role}
                            </Badge>
                          </td>
                          <td className="p-2">
                            {new Date(user.created_at).toLocaleDateString('ja-JP')}
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-2">
                              <select
                                value={user.role}
                                onChange={(e) => updateUserRole(user.id, e.target.value as UserRole)}
                                className="text-sm border rounded px-2 py-1 bg-background text-foreground"
                              >
                                <option value="user">user</option>
                                <option value="moderator">moderator</option>
                                <option value="admin">admin</option>
                              </select>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="lg:hidden space-y-1">
                  {filteredUsers.map((user) => (
                    <Card key={user.id} className="p-2">
                      <div className="space-y-1">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium">{user.full_name || '未設定'}</div>
                            <div className="text-sm text-muted-foreground">{user.email}</div>
                          </div>
                          <Badge variant={getRoleBadgeVariant(user.role)}>
                            {user.role}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          登録日: {new Date(user.created_at).toLocaleDateString('ja-JP')}
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={user.role}
                            onChange={(e) => updateUserRole(user.id, e.target.value as UserRole)}
                            className="text-sm border rounded px-2 py-1 bg-background text-foreground flex-1"
                          >
                            <option value="user">user</option>
                            <option value="moderator">moderator</option>
                            <option value="admin">admin</option>
                          </select>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>

                {filteredUsers.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    ユーザーが見つかりません
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Deposits Tab */}
          <TabsContent value="deposits">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowDownLeft className="h-4 w-4" />
                  入金管理
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Desktop Table */}
                <div className="admin-table-desktop overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
                  <table className="w-full text-sm sm:text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2 font-medium">ユーザー</th>
                        <th className="text-left p-2 font-medium">金額</th>
                        <th className="text-left p-2 font-medium">通貨</th>
                        <th className="text-left p-2 font-medium">チェーン / ネットワーク</th>
                        <th className="text-left p-2 font-medium">トランザクション</th>
                        <th className="text-left p-2 font-medium">ステータス</th>
                        <th className="text-left p-2 font-medium">作成日時</th>
                        <th className="text-left p-2 font-medium">アクション</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deposits.map((deposit) => (
                        <tr key={deposit.id} className="border-b hover:bg-muted/50">
                          <td className="p-2">
                            <div>
                              <div className="font-medium">{deposit.profiles?.full_name || '未設定'}</div>
                              <div className="text-sm text-muted-foreground">{deposit.profiles?.email}</div>
                            </div>
                          </td>
                          <td className="p-2 font-mono">{Number(deposit.amount || 0).toFixed(8)}</td>
                          <td className="p-2">{deposit.currency}</td>
                          <td className="p-2 text-sm">
                            <div className="flex flex-col gap-1">
                              <span className="font-medium">{deposit.chain || '—'}</span>
                              <span className="text-muted-foreground">{deposit.network || '—'}</span>
                            </div>
                          </td>
                          <td className="p-2 text-sm">
                            {deposit.transaction_hash ? (
                              <div className="flex flex-col gap-1">
                                <span className="font-mono break-all">
                                  {deposit.transaction_hash.slice(0, 10)}…
                                </span>
                                {deposit.wallet_address && (
                                  <span className="text-xs text-muted-foreground font-mono break-all">
                                    {deposit.wallet_address}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-2">
                            <Badge variant={getStatusBadgeVariant(deposit.status)}>
                              {deposit.status}
                            </Badge>
                          </td>
                          <td className="p-2">
                            {new Date(deposit.created_at).toLocaleString('ja-JP')}
                          </td>
                          <td className="p-2">
                            {deposit.status === 'pending' && (
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => updateDepositStatus(deposit.id, 'confirmed')}
                                >
                                  <CheckCircle className="h-4 w-4 mr-1" />
                                  承認
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => updateDepositStatus(deposit.id, 'rejected')}
                                >
                                  <XCircle className="h-4 w-4 mr-1" />
                                  拒否
                                </Button>
                              </div>
                            )}
                            {deposit.status !== 'pending' && (
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <Clock className="h-4 w-4" />
                                {deposit.confirmed_at && new Date(deposit.confirmed_at).toLocaleDateString('ja-JP')}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {deposits.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      入金記録がありません
                    </div>
                  )}
                </div>

                {/* Mobile Cards */}
                <div className="admin-cards-mobile space-y-1">
                  {deposits.map((deposit) => (
                    <Card key={deposit.id} className="p-2">
                      <div className="space-y-1">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium">{deposit.profiles?.full_name || '未設定'}</div>
                            <div className="text-sm text-muted-foreground">{deposit.profiles?.email}</div>
                          </div>
                          <Badge variant={getStatusBadgeVariant(deposit.status)}>
                            {deposit.status}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 text-sm">
                          <div>
                            <span className="font-medium">金額:</span>
                            <span className="ml-2 font-mono">{Number(deposit.amount || 0).toFixed(8)}</span>
                          </div>
                          <div>
                            <span className="font-medium">通貨:</span>
                            <span className="ml-2">{deposit.currency}</span>
                          </div>
                          <div>
                            <span className="font-medium">チェーン:</span>
                            <span className="ml-2">{deposit.chain || '—'}</span>
                          </div>
                          <div>
                            <span className="font-medium">ネットワーク:</span>
                            <span className="ml-2">{deposit.network || '—'}</span>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          作成日時: {new Date(deposit.created_at).toLocaleString('ja-JP')}
                        </div>
                        {deposit.status === 'pending' && (
                          <div className="flex gap-2 pt-2">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => updateDepositStatus(deposit.id, 'confirmed')}
                              className="flex-1"
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              承認
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => updateDepositStatus(deposit.id, 'rejected')}
                              className="flex-1"
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              拒否
                            </Button>
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                  {deposits.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      入金記録がありません
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Withdrawals Tab */}
          <TabsContent value="withdrawals">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowUpRight className="h-4 w-4" />
                  出金管理
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Desktop Table */}
                <div className="admin-table-desktop overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
                  <table className="w-full text-sm sm:text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2 font-medium">ユーザー</th>
                        <th className="text-left p-2 font-medium">金額</th>
                        <th className="text-left p-2 font-medium">通貨</th>
                        <th className="text-left p-2 font-medium">出金先</th>
                        <th className="text-left p-2 font-medium">ネットワーク/メモ</th>
                        <th className="text-left p-2 font-medium">ステータス</th>
                        <th className="text-left p-2 font-medium">作成日</th>
                        <th className="text-left p-2 font-medium">アクション</th>
                      </tr>
                    </thead>
                    <tbody>
                      {withdrawals.map((withdrawal) => (
                        <tr key={withdrawal.id} className="border-b hover:bg-muted/50">
                          <td className="p-2">
                            <div>
                              <div className="font-medium">{withdrawal.profiles?.full_name || '未設定'}</div>
                              <div className="text-sm text-muted-foreground">{withdrawal.profiles?.email}</div>
                            </div>
                          </td>
                          <td className="p-2 font-mono">${withdrawal.amount.toFixed(8)}</td>
                          <td className="p-2">{withdrawal.currency}</td>
                          <td className="p-2">
                            <div className="text-sm font-mono">{withdrawal.wallet_address}</div>
                          </td>
                          <td className="p-2 text-sm">
                            {(() => {
                              const notes: string = (withdrawal as { notes?: string }).notes || '';
                              const m = /network=([^;]*)/.exec(notes);
                              const mm = /memo=([^;]*)/.exec(notes);
                              const network = m && m[1] ? m[1] : '—';
                              const memo = mm && mm[1] ? mm[1] : '';
                              return (
                                <div className="space-y-1">
                                  <div><span className="text-muted-foreground">NW:</span> {network}</div>
                                  {memo && <div><span className="text-muted-foreground">Memo:</span> {memo}</div>}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="p-2">
                            <Badge variant={getStatusBadgeVariant(withdrawal.status)}>
                              {withdrawal.status}
                            </Badge>
                          </td>
                          <td className="p-2">
                            {new Date(withdrawal.created_at).toLocaleDateString('ja-JP')}
                          </td>
                          <td className="p-2">
                            {withdrawal.status === 'pending' && (
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => updateWithdrawalStatus(withdrawal.id, 'confirmed')}
                                >
                                  <CheckCircle className="h-4 w-4 mr-1" />
                                  承認
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => updateWithdrawalStatus(withdrawal.id, 'rejected')}
                                >
                                  <XCircle className="h-4 w-4 mr-1" />
                                  拒否
                                </Button>
                              </div>
                            )}
                            {withdrawal.status !== 'pending' && (
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <Clock className="h-4 w-4" />
                                {withdrawal.confirmed_at && new Date(withdrawal.confirmed_at).toLocaleDateString('ja-JP')}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {withdrawals.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      出金記録がありません
                    </div>
                  )}
                </div>

                {/* Mobile Cards */}
                <div className="admin-cards-mobile space-y-1">
                  {withdrawals.map((withdrawal) => (
                    <Card key={withdrawal.id} className="p-2">
                      <div className="space-y-1">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium">{withdrawal.profiles?.full_name || '未設定'}</div>
                            <div className="text-sm text-muted-foreground">{withdrawal.profiles?.email}</div>
                          </div>
                          <Badge variant={getStatusBadgeVariant(withdrawal.status)}>
                            {withdrawal.status}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 text-sm">
                          <div>
                            <span className="font-medium">金額:</span>
                            <span className="ml-2 font-mono">${withdrawal.amount.toFixed(8)}</span>
                          </div>
                          <div>
                            <span className="font-medium">通貨:</span>
                            <span className="ml-2">{withdrawal.currency}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="font-medium">出金先:</span>
                            <span className="ml-2 font-mono text-xs break-all">{withdrawal.wallet_address}</span>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          作成日: {new Date(withdrawal.created_at).toLocaleDateString('ja-JP')}
                        </div>
                        {withdrawal.status === 'pending' && (
                          <div className="flex gap-2 pt-2">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => updateWithdrawalStatus(withdrawal.id, 'confirmed')}
                              className="flex-1"
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              承認
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => updateWithdrawalStatus(withdrawal.id, 'rejected')}
                              className="flex-1"
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              拒否
                            </Button>
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                  {withdrawals.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      出金記録がありません
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Transfers Tab */}
          <TabsContent value="transfers">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  送金管理
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {transfers.map((transfer) => (
                    <Card key={transfer.id}>
                      <div className="p-2">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                送金者: {transfer.from_user_handle}
                              </span>
                              <span className="text-muted-foreground">→</span>
                              <span className="font-medium">
                                受信者: {transfer.to_user_handle}
                              </span>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              金額: {transfer.amount} {transfer.currency}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              参照番号: {transfer.reference_number}
                            </div>
                            {transfer.description && (
                              <div className="text-sm text-muted-foreground">
                                説明: {transfer.description}
                              </div>
                            )}
                          </div>
                          <div className="text-right space-y-1">
                            <div className="text-sm text-muted-foreground">
                              {new Date(transfer.created_at).toLocaleString('ja-JP')}
                            </div>
                            <Badge
                              variant={transfer.status === 'completed' ? "default" : "secondary"}
                            >
                              {transfer.status === 'completed' ? '完了' : transfer.status}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                  {transfers.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      送金記録がありません
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Assets Tab */}
          <TabsContent value="assets">
            {selectedUserId ? (
              // ユーザー詳細画面
              <UserAssetDetails
                userAssets={userAssets}
                onBack={() => {
                  setSelectedUserId(null);
                  setUserAssets([]);
                }}
                onSaveAsset={saveAssetEdit}
                priceData={priceData}
                priceLoading={priceLoading}
                priceError={priceError}
                calculateUsdtValue={calculateUsdtValue}
              />
            ) : (
              // ユーザー一覧画面
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="h-4 w-4" />
                    資産管理
                  </CardTitle>
                  <div className="text-sm text-muted-foreground">
                    ユーザーをクリックして詳細を表示
                  </div>
                </CardHeader>
                <CardContent>
                  {groupAssetsByUser().length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      資産記録がありません
                    </div>
                  ) : (
                    <div className="grid gap-1.5 md:grid-cols-2 lg:grid-cols-3">
                      {groupAssetsByUser().map(([userId, userGroup]) => {
                        const totalUsdtValue = calculateUsdtValue(userGroup.assets);
                        const currencyList = userGroup.assets.map(a => a.currency).join(', ');
                        return (
                          <Card
                            key={userId}
                            className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-primary/20"
                            onClick={() => {
                              setSelectedUserId(userId);
                              fetchUserAssets(userId);
                            }}
                          >
                            <CardHeader className="pb-3">
                              <CardTitle className="text-base flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                {userGroup.user?.full_name || '未設定'}
                              </CardTitle>
                              <div className="text-sm text-muted-foreground">{userGroup.user?.email}</div>
                            </CardHeader>
                            <CardContent>
                              <div className="space-y-1">
                                <div className="flex justify-between items-center">
                                  <span className="text-sm text-muted-foreground">資産数:</span>
                                  <Badge variant="secondary">{userGroup.assets.length} 種類</Badge>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-sm text-muted-foreground">総評価額 (USDT):</span>
                                  <div className="flex items-center gap-1">
                                    {priceLoading ? (
                                      <span className="text-xs text-muted-foreground">計算中...</span>
                                    ) : priceError ? (
                                      <span className="text-xs text-red-500">エラー</span>
                                    ) : (
                                      <span className="font-mono font-bold">{totalUsdtValue.toFixed(2)} USDT</span>
                                    )}
                                  </div>
                                </div>
                                <div className="border-t pt-2">
                                  <div className="text-xs text-muted-foreground mb-1">保有通貨:</div>
                                  <div className="text-sm">{currencyList}</div>
                                </div>
                                <div className="text-right">
                                  <Button size="sm" variant="outline" className="pointer-events-none">
                                    <Edit className="h-4 w-4 mr-1" />
                                    編集
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Markets Tab */}
          <TabsContent value="markets">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  マーケット管理
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Add Market */}
                <div className="mb-6 grid grid-cols-1 md:grid-cols-7 gap-2 items-end">
                  <Input placeholder="ID (BASE-QUOTE)" value={newMarket.id || ''} onChange={(e) => setNewMarket(prev => ({ ...prev, id: e.target.value }))} />
                  <Input placeholder="BASE" value={newMarket.base || ''} onChange={(e) => setNewMarket(prev => ({ ...prev, base: e.target.value }))} />
                  <Input placeholder="QUOTE" value={newMarket.quote || ''} onChange={(e) => setNewMarket(prev => ({ ...prev, quote: e.target.value }))} />
                  <Input placeholder="price_tick" type="number" step="0.0001" value={newMarket.price_tick as number} onChange={(e) => setNewMarket(prev => ({ ...prev, price_tick: Number(e.target.value) }))} />
                  <Input placeholder="qty_step" type="number" step="0.000001" value={newMarket.qty_step as number} onChange={(e) => setNewMarket(prev => ({ ...prev, qty_step: Number(e.target.value) }))} />
                  <Input placeholder="min_notional" type="number" step="0.01" value={newMarket.min_notional as number} onChange={(e) => setNewMarket(prev => ({ ...prev, min_notional: Number(e.target.value) }))} />
                  <Button onClick={createMarket}>追加</Button>
                </div>
                {/* Desktop Table */}
                <div className="admin-table-desktop overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
                  <table className="w-full text-sm sm:text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2 font-medium">ID</th>
                        <th className="text-left p-2 font-medium">通貨</th>
                        <th className="text-left p-2 font-medium">Tick/Step</th>
                        <th className="text-left p-2 font-medium">最小約定額</th>
                        <th className="text-left p-2 font-medium">手数料(M/T)</th>
                        <th className="text-left p-2 font-medium">ステータス</th>
                        <th className="text-left p-2 font-medium">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {markets.map(m => (
                        <tr key={m.id} className="border-b hover:bg-muted/40">
                          <td className="p-2 font-mono text-xs">{m.id}</td>
                          <td className="p-2">{m.base}/{m.quote}</td>
                          <td className="p-2">{m.price_tick} / {m.qty_step}</td>
                          <td className="p-2">{m.min_notional}</td>
                          <td className="p-2">
                            <div className="flex gap-2 items-center">
                              <Input className="w-24 text-foreground" type="number" step="0.0001" defaultValue={m.maker_fee_rate ?? 0} onBlur={(e) => updateMarket(m.id, { maker_fee_rate: Number(e.target.value) })} />
                              <Input className="w-24 text-foreground" type="number" step="0.0001" defaultValue={m.taker_fee_rate ?? 0.0015} onBlur={(e) => updateMarket(m.id, { taker_fee_rate: Number(e.target.value) })} />
                            </div>
                          </td>
                          <td className="p-2">
                            <select className="border rounded px-2 py-1 bg-background text-foreground" value={m.status} onChange={(e) => updateMarket(m.id, { status: e.target.value })}>
                              <option value="active">active</option>
                              <option value="paused">paused</option>
                              <option value="disabled">disabled</option>
                            </select>
                          </td>
                          <td className="p-2">
                            <Button size="sm" variant="outline" onClick={() => fetchMarkets()}>再読込</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="admin-cards-mobile space-y-1">
                  {markets.map((market) => (
                    <Card key={market.id} className="p-2">
                      <div className="space-y-1">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium font-mono text-sm">{market.id}</div>
                            <div className="text-sm text-muted-foreground">{market.base}/{market.quote}</div>
                          </div>
                          <select
                            className="border rounded px-2 py-1 bg-background text-foreground text-sm"
                            value={market.status}
                            onChange={(e) => updateMarket(market.id, { status: e.target.value })}
                          >
                            <option value="active">active</option>
                            <option value="paused">paused</option>
                            <option value="disabled">disabled</option>
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 text-sm">
                          <div>
                            <span className="font-medium">Tick:</span>
                            <span className="ml-2">{market.price_tick}</span>
                          </div>
                          <div>
                            <span className="font-medium">Step:</span>
                            <span className="ml-2">{market.qty_step}</span>
                          </div>
                          <div>
                            <span className="font-medium">最小約定:</span>
                            <span className="ml-2">{market.min_notional}</span>
                          </div>
                          <div className="col-span-2">
                            <div className="flex gap-2 items-center">
                              <span className="font-medium text-xs">M:</span>
                              <Input
                                className="flex-1 h-8 text-xs"
                                type="number"
                                step="0.0001"
                                defaultValue={market.maker_fee_rate ?? 0}
                                onBlur={(e) => updateMarket(market.id, { maker_fee_rate: Number(e.target.value) })}
                              />
                              <span className="font-medium text-xs">T:</span>
                              <Input
                                className="flex-1 h-8 text-xs"
                                type="number"
                                step="0.0001"
                                defaultValue={market.taker_fee_rate ?? 0.0015}
                                onBlur={(e) => updateMarket(market.id, { taker_fee_rate: Number(e.target.value) })}
                              />
                            </div>
                          </div>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => fetchMarkets()} className="w-full">
                          再読込
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Support Tab */}
          <TabsContent value="support">
            <Card>
              <CardHeader>
                <CardTitle>サポート管理</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-sm">ステータス:</span>
                  <select className="border rounded px-2 py-1 bg-background text-foreground" value={supportFilter} onChange={(e) => setSupportFilter(e.target.value as 'all' | 'open' | 'pending' | 'closed')}>
                    <option value="all">all</option>
                    <option value="open">open</option>
                    <option value="pending">pending</option>
                    <option value="closed">closed</option>
                  </select>
                </div>
                {/* Desktop Table */}
                <div className="admin-table-desktop overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
                  <table className="w-full text-sm sm:text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">ID</th>
                        <th className="text-left p-2">ユーザー</th>
                        <th className="text-left p-2">件名</th>
                        <th className="text-left p-2">ステータス</th>
                        <th className="text-left p-2">作成</th>
                        <th className="text-left p-2">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(tickets.filter((t: SupportTicket) => supportFilter === 'all' || t.status === supportFilter)).flatMap((t: SupportTicket) => [
                        <tr key={t.id} className="border-b hover:bg-muted/40">
                          <td className="p-2 font-mono text-xs">{t.id.slice(0, 8)}…</td>
                          <td className="p-2">{t.user_id}</td>
                          <td className="p-2">{t.subject}</td>
                          <td className="p-2">
                            <select className="border rounded px-2 py-1 bg-background text-foreground" value={t.status} onChange={(e) => updateTicketStatus(t.id, e.target.value as 'open' | 'pending' | 'closed')}>
                              <option value="open">open</option>
                              <option value="pending">pending</option>
                              <option value="closed">closed</option>
                            </select>
                          </td>
                          <td className="p-2">{new Date(t.created_at).toLocaleString()}</td>
                          <td className="p-2">
                            <div className="flex items-center gap-2">
                              <Input className="w-64" placeholder="返信を書く…" value={reply[t.id] || ''} onChange={(e) => setReply(prev => ({ ...prev, [t.id]: e.target.value }))} />
                              <Button size="sm" variant="outline" onClick={() => sendReply(t.id)}>返信</Button>
                              <Button size="sm" variant="ghost" onClick={() => alert(t.message || '(本文なし)')}>本文</Button>
                            </div>
                          </td>
                        </tr>,
                        <tr key={`${t.id}-replies`}>
                          <td colSpan={6} className="p-2 bg-muted/30">
                            <div className="text-xs text-muted-foreground mb-1">スレッド</div>
                            <div className="space-y-1">
                              {(repliesByTicket[t.id] || []).map((r: SupportReply, i: number) => (
                                <div key={r.id || i} className="text-xs"><span className="font-mono">{r.user_id?.slice(0, 8)}…</span> <span className="text-muted-foreground">[{new Date(r.created_at).toLocaleString()}]</span>: {r.message}</div>
                              ))}
                              {(repliesByTicket[t.id] || []).length === 0 && (
                                <div className="text-xs text-muted-foreground">返信はまだありません</div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ])}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="admin-cards-mobile space-y-1">
                  {(tickets.filter((t: SupportTicket) => supportFilter === 'all' || t.status === supportFilter)).map((ticket: SupportTicket) => (
                    <Card key={ticket.id} className="p-2">
                      <div className="space-y-1">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium text-sm">{ticket.subject}</div>
                            <div className="text-xs text-muted-foreground font-mono">{ticket.id.slice(0, 8)}…</div>
                          </div>
                          <select
                            className="border rounded px-2 py-1 bg-background text-foreground text-xs"
                            value={ticket.status}
                            onChange={(e) => updateTicketStatus(ticket.id, e.target.value as 'open' | 'pending' | 'closed')}
                          >
                            <option value="open">open</option>
                            <option value="pending">pending</option>
                            <option value="closed">closed</option>
                          </select>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          作成: {new Date(ticket.created_at).toLocaleString()}
                        </div>
                        <div className="flex gap-2 items-center">
                          <Input
                            className="flex-1 text-xs h-8"
                            placeholder="返信を書く…"
                            value={reply[ticket.id] || ''}
                            onChange={(e) => setReply(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                          />
                          <Button size="sm" variant="outline" onClick={() => sendReply(ticket.id)} className="text-xs">
                            返信
                          </Button>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => alert(ticket.message || '(本文なし)')} className="text-xs flex-1">
                            本文表示
                          </Button>
                        </div>
                        {/* Replies */}
                        {(repliesByTicket[ticket.id] || []).length > 0 && (
                          <div className="border-t pt-3">
                            <div className="text-xs font-medium mb-1">返信履歴 ({(repliesByTicket[ticket.id] || []).length}件)</div>
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                              {(repliesByTicket[ticket.id] || []).map((r: SupportReply, i: number) => (
                                <div key={r.id || i} className="text-xs p-2 bg-muted/30 rounded">
                                  <div className="font-mono text-xs text-muted-foreground">
                                    {r.user_id?.slice(0, 8)}… [{new Date(r.created_at).toLocaleString()}]
                                  </div>
                                  <div className="mt-1">{r.message}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                  {(tickets.filter((t: SupportTicket) => supportFilter === 'all' || t.status === supportFilter)).length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      該当するチケットはありません
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* KYC Management Tab */}
          <TabsContent value="kyc">
            <div className="space-y-1">
              {/* KYC Applications */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    KYC申請一覧
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Desktop Table */}
                  <div className="admin-table-desktop overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
                    <table className="w-full text-sm sm:text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="p-3 font-semibold">ユーザーID</th>
                          <th className="p-3 font-semibold">メールアドレス</th>
                          <th className="p-3 font-semibold">氏名</th>
                          <th className="p-3 font-semibold">ステータス</th>
                          <th className="p-3 font-semibold">申請日</th>
                          <th className="p-3 font-semibold">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kycApplications.map((application) => (
                          <tr key={application.id} className="border-b hover:bg-muted/40">
                            <td className="p-3 font-mono text-xs">{application.id.slice(0, 8)}...</td>
                            <td className="p-3">{application.email}</td>
                            <td className="p-3">
                              {application.first_name && application.last_name ?
                                `${application.first_name} ${application.last_name}` :
                                application.full_name || '-'
                              }
                            </td>
                            <td className="p-3">
                              <Badge variant={
                                application.kyc_status === 'verified' ? 'default' :
                                  application.kyc_status === 'pending' ? 'secondary' :
                                    application.kyc_status === 'rejected' ? 'destructive' : 'outline'
                              }>
                                {application.kyc_status === 'verified' ? '承認済み' :
                                  application.kyc_status === 'pending' ? '審査中' :
                                    application.kyc_status === 'rejected' ? '拒否' : '未審査'}
                              </Badge>
                            </td>
                            <td className="p-3 text-sm text-muted-foreground">
                              {application.kyc_updated_at ?
                                new Date(application.kyc_updated_at).toLocaleDateString('ja-JP') :
                                new Date(application.created_at).toLocaleDateString('ja-JP')
                              }
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                {application.kyc_status === 'pending' && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-green-600 border-green-600 hover:bg-green-50"
                                      onClick={() => {
                                        const notes = kycReviewNotes || '管理者により承認されました';
                                        updateKYCStatus(application.id, 'verified', notes);
                                        setKycReviewNotes('');
                                      }}
                                    >
                                      <CheckCircle className="h-4 w-4 mr-1" />
                                      承認
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-red-600 border-red-600 hover:bg-red-50"
                                      onClick={() => {
                                        const notes = kycReviewNotes || '書類に不備があります';
                                        updateKYCStatus(application.id, 'rejected', notes);
                                        setKycReviewNotes('');
                                      }}
                                    >
                                      <XCircle className="h-4 w-4 mr-1" />
                                      拒否
                                    </Button>
                                  </>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setSelectedKycUserId(
                                    selectedKycUserId === application.id ? null : application.id
                                  )}
                                >
                                  詳細
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {kycApplications.length === 0 && (
                          <tr>
                            <td colSpan={6} className="p-2 text-center text-muted-foreground">
                              KYC申請はありません
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="admin-cards-mobile space-y-1">
                    {kycApplications.map((application) => (
                      <Card key={application.id} className="p-2">
                        <div className="space-y-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="font-medium text-sm">
                                {application.first_name && application.last_name ?
                                  `${application.first_name} ${application.last_name}` :
                                  application.full_name || '-'
                                }
                              </div>
                              <div className="text-xs text-muted-foreground">{application.email}</div>
                              <div className="text-xs text-muted-foreground font-mono">{application.id.slice(0, 8)}...</div>
                            </div>
                            <Badge variant={
                              application.kyc_status === 'verified' ? 'default' :
                                application.kyc_status === 'pending' ? 'secondary' :
                                  application.kyc_status === 'rejected' ? 'destructive' : 'outline'
                            }>
                              {application.kyc_status === 'verified' ? '承認済み' :
                                application.kyc_status === 'pending' ? '審査中' :
                                  application.kyc_status === 'rejected' ? '拒否' : '未審査'}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            申請日: {application.kyc_updated_at ?
                              new Date(application.kyc_updated_at).toLocaleDateString('ja-JP') :
                              new Date(application.created_at).toLocaleDateString('ja-JP')
                            }
                          </div>
                          <div className="flex flex-col gap-2">
                            {application.kyc_status === 'pending' && (
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1 text-green-600 border-green-600 hover:bg-green-50 text-xs"
                                  onClick={() => {
                                    const notes = kycReviewNotes || '管理者により承認されました';
                                    updateKYCStatus(application.id, 'verified', notes);
                                    setKycReviewNotes('');
                                  }}
                                >
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  承認
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1 text-red-600 border-red-600 hover:bg-red-50 text-xs"
                                  onClick={() => {
                                    const notes = kycReviewNotes || '書類に不備があります';
                                    updateKYCStatus(application.id, 'rejected', notes);
                                    setKycReviewNotes('');
                                  }}
                                >
                                  <XCircle className="h-3 w-3 mr-1" />
                                  拒否
                                </Button>
                              </div>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedKycUserId(
                                selectedKycUserId === application.id ? null : application.id
                              )}
                              className="text-xs"
                            >
                              詳細表示
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                    {kycApplications.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        KYC申請はありません
                      </div>
                    )}
                  </div>

                  {/* Review Notes Input */}
                  <div className="mt-1 p-2 border rounded-lg bg-muted/20">
                    <Label htmlFor="reviewNotes" className="text-sm font-medium">
                      承認・拒否時のメモ（省略可）
                    </Label>
                    <Input
                      id="reviewNotes"
                      placeholder="承認・拒否理由や追加コメントを入力..."
                      value={kycReviewNotes}
                      onChange={(e) => setKycReviewNotes(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Selected User Details */}
              {selectedKycUserId && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      ユーザー詳細情報
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const selectedApplication = kycApplications.find(app => app.id === selectedKycUserId);
                      if (!selectedApplication) return <p>ユーザー情報が見つかりません</p>;

                      return (
                        <div className="space-y-1">
                          {/* Personal Information */}
                          <div>
                            <h4 className="font-semibold mb-1">個人情報</h4>
                            <div className="grid grid-cols-2 gap-1.5 text-sm">
                              <div>
                                <span className="font-medium">氏名（漢字）:</span>
                                <span className="ml-2">
                                  {selectedApplication.first_name && selectedApplication.last_name
                                    ? `${selectedApplication.last_name} ${selectedApplication.first_name}`
                                    : selectedApplication.full_name || '未登録'
                                  }
                                </span>
                              </div>
                              <div>
                                <span className="font-medium">氏名（カナ）:</span>
                                <span className="ml-2">
                                  {selectedApplication.first_name_kana && selectedApplication.last_name_kana
                                    ? `${selectedApplication.last_name_kana} ${selectedApplication.first_name_kana}`
                                    : '未登録'
                                  }
                                </span>
                              </div>
                              <div>
                                <span className="font-medium">生年月日:</span>
                                <span className="ml-2">{selectedApplication.birth_date || '未登録'}</span>
                              </div>
                              <div>
                                <span className="font-medium">電話番号:</span>
                                <span className="ml-2">{selectedApplication.phone_number || '未登録'}</span>
                              </div>
                              <div>
                                <span className="font-medium">メールアドレス:</span>
                                <span className="ml-2">{selectedApplication.email}</span>
                              </div>
                            </div>
                          </div>

                          {/* Address Information */}
                          <div>
                            <h4 className="font-semibold mb-1">住所情報</h4>
                            <div className="grid grid-cols-2 gap-1.5 text-sm">
                              <div>
                                <span className="font-medium">郵便番号:</span>
                                <span className="ml-2">{selectedApplication.postal_code || '未登録'}</span>
                              </div>
                              <div>
                                <span className="font-medium">都道府県:</span>
                                <span className="ml-2">{selectedApplication.prefecture || '未登録'}</span>
                              </div>
                              <div>
                                <span className="font-medium">市区町村:</span>
                                <span className="ml-2">{selectedApplication.city || '未登録'}</span>
                              </div>
                              <div>
                                <span className="font-medium">町域・番地:</span>
                                <span className="ml-2">{selectedApplication.address || '未登録'}</span>
                              </div>
                              {selectedApplication.building && (
                                <div className="col-span-2">
                                  <span className="font-medium">建物名・部屋番号:</span>
                                  <span className="ml-2">{selectedApplication.building}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* KYC Status Information */}
                          <div>
                            <h4 className="font-semibold mb-1">KYCステータス</h4>
                            <div className="grid grid-cols-2 gap-1.5 text-sm">
                              <div>
                                <span className="font-medium">ステータス:</span>
                                <span className="ml-2">
                                  <Badge variant={
                                    selectedApplication.kyc_status === 'verified' ? 'default' :
                                      selectedApplication.kyc_status === 'pending' ? 'secondary' :
                                        selectedApplication.kyc_status === 'rejected' ? 'destructive' : 'outline'
                                  }>
                                    {selectedApplication.kyc_status === 'verified' ? '承認済み' :
                                      selectedApplication.kyc_status === 'pending' ? '審査中' :
                                        selectedApplication.kyc_status === 'rejected' ? '拒否' : '未審査'}
                                  </Badge>
                                </span>
                              </div>
                              <div>
                                <span className="font-medium">レベル:</span>
                                <span className="ml-2">{selectedApplication.kyc_level}</span>
                              </div>
                              {selectedApplication.kyc_notes && (
                                <div className="col-span-2">
                                  <span className="font-medium">メモ:</span>
                                  <span className="ml-2">{selectedApplication.kyc_notes}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* KYC Documents */}
                          <div>
                            <h4 className="font-semibold mb-1">提出書類</h4>
                            <div className="space-y-2">
                              {kycDocuments
                                .filter(doc => doc.user_id === selectedKycUserId)
                                .map((document) => (
                                  <div key={document.id} className="flex items-center justify-between p-3 border rounded-lg">
                                    <div className="flex items-center gap-1.5">
                                      <FileText className="h-4 w-4 text-muted-foreground" />
                                      <div>
                                        <div className="font-medium">
                                          {document.document_type === 'identity' ? '本人確認書類' :
                                            document.document_type === 'address' ? '住所確認書類' :
                                              document.document_type === 'selfie' ? '自撮り写真' :
                                                document.document_type === 'income' ? '収入証明書類' :
                                                  document.document_type}
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                          {document.file_name} • {document.file_size ? `${Math.round(document.file_size / 1024)}KB` : ''}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Badge variant={getStatusBadgeVariant(document.status)}>
                                        {document.status === 'approved' ? '承認済み' :
                                          document.status === 'pending' ? '審査中' : '要修正'}
                                      </Badge>

                                      {/* ファイル表示・ダウンロードボタン */}
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={async () => {
                                          try {
                                            const { data, error } = await supabase.storage
                                              .from('kyc-documents')
                                              .createSignedUrl(document.file_path, 3600);

                                            if (error) {
                                              console.error('署名付きURL取得エラー:', error);
                                              toast({
                                                title: 'エラー',
                                                description: 'ファイルの取得に失敗しました',
                                                variant: 'destructive'
                                              });
                                              return;
                                            }

                                            if (data?.signedUrl) {
                                              // Safari対応：モーダルダイアログで画像を表示
                                              setSelectedImageUrl(data.signedUrl);
                                              setSelectedImageFileName(document.file_name);
                                              setImageDialogOpen(true);
                                            }
                                          } catch (error) {
                                            console.error('ファイル表示エラー:', error);
                                            toast({
                                              title: 'エラー',
                                              description: 'ファイルの表示に失敗しました',
                                              variant: 'destructive'
                                            });
                                          }
                                        }}
                                      >
                                        <Eye className="h-4 w-4 mr-1" />
                                        表示
                                      </Button>

                                      {document.status === 'pending' && (
                                        <div className="flex gap-1">
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="text-green-600 border-green-600 hover:bg-green-50"
                                            onClick={() => updateKYCDocumentStatus(document.id, 'approved', '承認されました')}
                                          >
                                            承認
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="text-red-600 border-red-600 hover:bg-red-50"
                                            onClick={() => updateKYCDocumentStatus(document.id, 'rejected', '要修正')}
                                          >
                                            拒否
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              {kycDocuments.filter(doc => doc.user_id === selectedKycUserId).length === 0 && (
                                <p className="text-muted-foreground">提出済み書類はありません</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* HDWallet Management Tab */}
          <TabsContent value="hdwallet">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  HDウォレット管理
                </CardTitle>
                <CardDescription>
                  マスターキー生成とマルチチェーンウォレット管理
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="flex flex-col gap-1.5">
                  <p className="text-muted-foreground">
                    HDウォレットシステムの管理と監視を行います。マスターキー生成、Wallet Roots初期化、システム状態の確認ができます。
                  </p>
                  <Button
                    onClick={() => navigate('/admin/hdwallet')}
                    className="w-full sm:w-auto"
                  >
                    <Wallet className="mr-2 h-4 w-4" />
                    HDウォレット管理画面を開く
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Announcements Management Tab */}
          <TabsContent value="announcements">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  お知らせ・通知管理
                </CardTitle>
                <CardDescription>
                  プラットフォーム全体へのお知らせと通知を管理
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="flex flex-col gap-1.5">
                  <p className="text-muted-foreground">
                    お知らせの作成・編集・公開管理、一斉通知の送信、通知テンプレートの管理を行います。
                  </p>
                  <Button
                    onClick={() => navigate('/admin/announcements')}
                    className="w-full sm:w-auto"
                  >
                    <Bell className="mr-2 h-4 w-4" />
                    お知らせ管理画面を開く
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Token Management Tab */}
          <TabsContent value="tokens">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Coins className="h-4 w-4" />
                  対応トークン管理
                </CardTitle>
                <CardDescription>
                  プラットフォームで対応するトークンの追加・編集・管理
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="flex flex-col gap-1.5">
                  <p className="text-muted-foreground">
                    対応トークンの追加・編集、入金・出金・両替機能の有効化、表示順序の管理を行います。
                  </p>
                  <Button
                    onClick={() => navigate('/admin/tokens')}
                    className="w-full sm:w-auto"
                  >
                    <Coins className="mr-2 h-4 w-4" />
                    トークン管理画面を開く
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Referral Management Tab */}
          <TabsContent value="referrals">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gift className="h-4 w-4" />
                  紹介コードシステム管理
                </CardTitle>
                <CardDescription>
                  紹介コードの統計、紹介関係、報酬の管理
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="flex flex-col gap-1.5">
                  <p className="text-muted-foreground">
                    ユーザーの紹介コード管理、紹介関係の確認、報酬の承認・拒否を行います。
                  </p>
                  <Button
                    onClick={() => navigate('/admin/referrals')}
                    className="w-full sm:w-auto"
                  >
                    <Gift className="mr-2 h-4 w-4" />
                    紹介管理画面を開く
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* User Deposit Address Management Tab */}
          <TabsContent value="user-addresses">
            <div className="space-y-1">
              {/* ヘッダー */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    ユーザー入金アドレス管理
                  </CardTitle>
                  <CardDescription>
                    ユーザーを選択して、通貨・チェーン組み合わせごとに入金アドレスを管理します
                  </CardDescription>
                </CardHeader>
              </Card>

              {!selectedUserId ? (
                <Card>
                  <CardHeader>
                    <CardTitle>ステップ 1: ユーザーを選択</CardTitle>
                    <CardDescription>
                      入金アドレスを管理するユーザーを選択してください
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      {/* 検索フィールド */}
                      <div className="flex gap-1.5">
                        <Input
                          placeholder="ユーザーをメール・名前で検索..."
                          value={addressSearchTerm}
                          onChange={(e) => setAddressSearchTerm(e.target.value)}
                          className="flex-1"
                        />
                        <Button onClick={fetchUsers} size="sm">
                          <Search className="h-4 w-4 mr-2" />
                          更新
                        </Button>
                      </div>

                      {/* ユーザーリスト */}
                      <div className="border rounded-lg max-h-96 overflow-y-auto">
                        {users
                          .filter(user =>
                            !addressSearchTerm ||
                            user.email?.toLowerCase().includes(addressSearchTerm.toLowerCase()) ||
                            user.full_name?.toLowerCase().includes(addressSearchTerm.toLowerCase())
                          )
                          .map((user) => (
                            <div
                              key={user.id}
                              className="p-2 border-b last:border-b-0 hover:bg-muted/40 cursor-pointer transition-colors"
                              onClick={() => handleUserSelect(user.id)}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="font-medium">
                                    {user.full_name || "名前未設定"}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {user.email}
                                  </div>
                                  <div className="text-xs text-muted-foreground mt-1">
                                    ID: {user.id}
                                  </div>
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </div>
                            </div>
                          ))}
                        {users.length === 0 && (
                          <div className="p-2 text-center text-muted-foreground">
                            ユーザーが見つかりません
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-1">
                  {/* 選択中のユーザー情報 */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            {selectedUserProfile?.full_name || "名前未設定"}
                          </CardTitle>
                          <CardDescription>
                            {selectedUserProfile?.email} (ID: {selectedUserId})
                          </CardDescription>
                        </div>
                        <Button variant="outline" onClick={resetUserSelection}>
                          <ArrowLeft className="h-4 w-4 mr-2" />
                          ユーザー選択に戻る
                        </Button>
                      </div>
                    </CardHeader>
                  </Card>

                  {/* 通貨・チェーン組み合わせ一覧 */}
                  <Card>
                    <CardHeader>
                      <CardTitle>ステップ 2: 入金アドレス管理</CardTitle>
                      <CardDescription>
                        各通貨・チェーン組み合わせのアドレスを生成・編集できます
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-1.5 md:grid-cols-2">
                        {getSupportedCombinations().map((combination) => (
                          combination.assets.map((asset) => {
                            const descriptor: CombinationDescriptor = {
                              chain: combination.chain,
                              network: combination.network,
                              asset
                            };
                            const combinationKey = getCombinationKey(descriptor);
                            const existingAddress = findAddressForCombination(selectedUserAddresses, descriptor);
                            const isGenerating = generatingAddress === combinationKey;

                            return (
                              <Card key={combinationKey} className="p-2">
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <div className="font-medium flex items-center gap-2">
                                        <Badge variant="outline">{asset}</Badge>
                                        <Badge variant="secondary">{combination.chainName}</Badge>
                                      </div>
                                      <div className="text-xs text-muted-foreground mt-1">
                                        ネットワーク: {combination.network}
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      {existingAddress ? (
                                        <Badge variant="default">生成済み</Badge>
                                      ) : (
                                        <Badge variant="secondary">未生成</Badge>
                                      )}
                                    </div>
                                  </div>

                                  {existingAddress ? (
                                    <div className="space-y-2">
                                      {editingKey === combinationKey ? (
                                        <div className="space-y-2">
                                          <Input
                                            value={newAddress}
                                            onChange={(e) => setNewAddress(e.target.value)}
                                            className="font-mono text-xs"
                                            placeholder="新しいアドレス"
                                          />
                                          <div className="flex gap-2">
                                            <Button
                                              size="sm"
                                              onClick={() => updateUserDepositAddress(existingAddress.id, newAddress)}
                                              className="flex-1"
                                            >
                                              <Save className="h-4 w-4 mr-2" />
                                              保存
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={cancelEditAddress}
                                            >
                                              <X className="h-4 w-4" />
                                            </Button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="space-y-2">
                                          <div className="bg-muted p-2 rounded font-mono text-xs break-all">
                                            {existingAddress.address}
                                          </div>
                                          <div className="flex gap-2">
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={() => startEditAddress(existingAddress, descriptor)}
                                              className="flex-1"
                                            >
                                              <Edit className="h-4 w-4 mr-2" />
                                              編集
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              onClick={() => {
                                                navigator.clipboard.writeText(existingAddress.address);
                                                toast({ title: "コピーしました", description: "アドレスがクリップボードにコピーされました" });
                                              }}
                                            >
                                              <Copy className="h-4 w-4" />
                                            </Button>
                                          </div>
                                          <div className="text-xs text-muted-foreground">
                                            作成日: {existingAddress.created_at ? new Date(existingAddress.created_at).toLocaleDateString() : "-"}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="text-center py-4">
                                      <Button
                                        size="sm"
                                        onClick={() => generateDepositAddress(
                                          selectedUserId,
                                          combination.chain,
                                          combination.network,
                                          asset
                                        )}
                                        disabled={isGenerating}
                                        className="w-full"
                                      >
                                        {isGenerating ? (
                                          <>
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                                            生成中...
                                          </>
                                        ) : (
                                          <>
                                            <Plus className="h-4 w-4 mr-2" />
                                            アドレス生成
                                          </>
                                        )}
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </Card>
                            );
                          })
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </TabsContent>

        </Tabs>
      </div>

      {/* KYC書類画像表示用ダイアログ（Safari対応） */}
      <Dialog open={imageDialogOpen} onOpenChange={setImageDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{selectedImageFileName || 'KYC書類'}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-1.5 p-2">
            {selectedImageUrl && (
              <>
                <img
                  src={selectedImageUrl}
                  alt={selectedImageFileName || 'KYC書類'}
                  className="max-w-full h-auto rounded-lg shadow-lg"
                  onError={(e) => {
                    console.error('画像読み込みエラー');
                    toast({
                      title: 'エラー',
                      description: '画像の読み込みに失敗しました',
                      variant: 'destructive'
                    });
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    if (selectedImageUrl) {
                      const link = document.createElement('a');
                      link.href = selectedImageUrl;
                      link.download = selectedImageFileName || 'kyc-document';
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }
                  }}
                >
                  ダウンロード
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default AdminDashboard;
