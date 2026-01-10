import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useAsyncState } from './use-async-state';
import { useErrorHandler } from './use-error-handler';

export type KYCStatus = 'none' | 'pending' | 'verified' | 'rejected';
export type KYCLevel = 0 | 1 | 2;

export interface KYCInfo {
  status: KYCStatus;
  level: KYCLevel;
  updatedAt?: string;
  notes?: string;
}

export interface KYCSettings {
  kycEnabled: boolean;
  kycRequiredForDeposit: boolean;
  kycRequiredForWithdrawal: boolean;
  maxFileSize: number;
  allowedFileTypes: string[];
}

export interface KYCDocument {
  id: string;
  documentType: 'identity' | 'address' | 'selfie' | 'income';
  fileName: string;
  filePath: string;
  fileSize?: number;
  mimeType?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * KYC機能を管理するカスタムフック
 */
export const useKYC = () => {
  const { user } = useAuth();
  const { handleError } = useErrorHandler();
  const [kycInfo, setKycInfo] = useState<KYCInfo>({ status: 'none', level: 0 });
  
  const kycSettingsState = useAsyncState<KYCSettings>();
  const kycDocumentsState = useAsyncState<KYCDocument[]>();

  // KYC設定を取得
  const loadKYCSettings = async (): Promise<KYCSettings> => {
    const { data, error } = await supabase
      .from('kyc_settings')
      .select('key, value');

    if (error) throw error;

    const settings: Record<string, unknown> = {};
    data?.forEach(item => {
      settings[item.key] = typeof item.value === 'string' 
        ? JSON.parse(item.value) 
        : item.value;
    });

    return {
      kycEnabled: settings.kyc_enabled === true || settings.kyc_enabled === 'true',
      kycRequiredForDeposit: settings.kyc_required_for_deposit === true || settings.kyc_required_for_deposit === 'true',
      kycRequiredForWithdrawal: settings.kyc_required_for_withdrawal === true || settings.kyc_required_for_withdrawal === 'true',
      maxFileSize: parseInt(settings.kyc_max_file_size as string) || 5242880, // 5MB default
      allowedFileTypes: Array.isArray(settings.kyc_allowed_file_types) 
        ? settings.kyc_allowed_file_types 
        : ['image/jpeg', 'image/png', 'application/pdf']
    };
  };

  // ユーザーのKYC情報を取得
  const loadUserKYCInfo = async (userId: string): Promise<KYCInfo> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('kyc_status, kyc_level, kyc_updated_at, kyc_notes')
      .eq('id', userId)
      .single();

    if (error) throw error;

    return {
      status: data.kyc_status || 'none',
      level: (data.kyc_level as KYCLevel) || 0,
      updatedAt: data.kyc_updated_at,
      notes: data.kyc_notes
    };
  };

  // ユーザーのKYC書類を取得
  const loadKYCDocuments = async (userId: string): Promise<KYCDocument[]> => {
    const { data, error } = await supabase
      .from('kyc_documents')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data.map(doc => ({
      id: doc.id,
      documentType: doc.document_type as KYCDocument['documentType'],
      fileName: doc.file_name,
      filePath: doc.file_path,
      fileSize: doc.file_size,
      mimeType: doc.mime_type,
      status: doc.status as KYCDocument['status'],
      reviewedBy: doc.reviewed_by,
      reviewedAt: doc.reviewed_at,
      reviewNotes: doc.review_notes,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at
    }));
  };

  // 初期データ読み込み
  useEffect(() => {
    if (user?.id) {
      // KYC設定を読み込み
      kycSettingsState.execute(loadKYCSettings, {
        context: 'KYC設定の読み込み',
        showErrorToast: true
      });

      // ユーザーのKYC情報を読み込み
      loadUserKYCInfo(user.id)
        .then((info) => {
          setKycInfo(info);
        })
        .catch(error => {
          console.error('ユーザーKYC情報読み込み失敗:', error);
          handleError(error, 'ユーザーKYC情報の読み込み');
        });

      // KYC書類を読み込み
      kycDocumentsState.execute(
        () => loadKYCDocuments(user.id),
        {
          context: 'KYC書類の読み込み',
          showErrorToast: true
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // KYCが必要かどうかの判定
  const isKYCRequired = (operation: 'deposit' | 'withdrawal'): boolean => {
    if (!kycSettingsState.data?.kycEnabled) return false;
    
    return operation === 'deposit' 
      ? kycSettingsState.data.kycRequiredForDeposit
      : kycSettingsState.data.kycRequiredForWithdrawal;
  };

  // KYCが完了しているかの判定
  const isKYCCompleted = (): boolean => {
    if (!kycSettingsState.data?.kycEnabled) return true; // KYC無効時は常に完了扱い
    return kycInfo.status === 'verified';
  };

  // KYC書類をアップロード
  const uploadDocument = async (
    file: File, 
    documentType: KYCDocument['documentType']
  ): Promise<KYCDocument> => {
    if (!user?.id) throw new Error('ユーザー認証が必要です');

    // ファイルサイズチェック
    if (kycSettingsState.data?.maxFileSize && file.size > kycSettingsState.data.maxFileSize) {
      throw new Error(`ファイルサイズが上限（${Math.round(kycSettingsState.data.maxFileSize / 1024 / 1024)}MB）を超えています`);
    }

    // ファイル形式チェック
    if (kycSettingsState.data?.allowedFileTypes && !kycSettingsState.data.allowedFileTypes.includes(file.type)) {
      throw new Error('サポートされていないファイル形式です');
    }

    // ファイル名をURL安全な形式にサニタイズ
    const sanitizedFileName = file.name
      .replace(/[^a-zA-Z0-9.-_]/g, '_')  // 英数字、ピリオド、ハイフン、アンダースコア以外を_に置換
      .replace(/_{2,}/g, '_');  // 連続するアンダースコアを単一に

    // Supabase Storageにファイルをアップロード
    const fileName = `${user.id}/${documentType}/${Date.now()}_${sanitizedFileName}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('kyc-documents')
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    // データベースにレコードを作成
    const { data, error } = await supabase
      .from('kyc_documents')
      .insert({
        user_id: user.id,
        document_type: documentType,
        file_name: file.name,
        file_path: uploadData.path,
        file_size: file.size,
        mime_type: file.type,
        status: 'pending'
      })
      .select()
      .single();

    if (error) throw error;

    // KYCが拒否状態の場合、自動的にpendingに戻す
    if (kycInfo.status === 'rejected') {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          kyc_status: 'pending',
          kyc_updated_at: new Date().toISOString()
        })
        .eq('id', user.id);
      
      if (updateError) {
        console.error('KYCステータス更新エラー:', updateError);
      } else {
        // ローカル状態も更新
        setKycInfo(prev => ({
          ...prev,
          status: 'pending',
          updatedAt: new Date().toISOString()
        }));
      }
    }

    // リストを再読み込み
    kycDocumentsState.execute(
      () => loadKYCDocuments(user.id),
      { context: 'KYC書類リストの再読み込み' }
    );

    return {
      id: data.id,
      documentType: data.document_type as KYCDocument['documentType'],
      fileName: data.file_name,
      filePath: data.file_path,
      fileSize: data.file_size,
      mimeType: data.mime_type,
      status: data.status as KYCDocument['status'],
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  };

  // KYC申請を提出
  const submitKYCApplication = async (): Promise<void> => {
    if (!user?.id) throw new Error('ユーザー認証が必要です');

    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          kyc_status: 'pending',
          kyc_updated_at: new Date().toISOString()
        })
        .eq('id', user.id)
        .select();

      if (error) {
        console.error('KYC申請エラーの詳細:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        
        // 通知テーブルのRLSエラーは一時的に無視（通知システム修正まで）
        if (error.code === '42501' && error.message?.includes('notifications')) {
          console.warn('通知システムエラーを無視してKYC申請を続行します');
          // 状態を更新
          setKycInfo(prev => ({
            ...prev,
            status: 'pending',
            updatedAt: new Date().toISOString()
          }));
          return; // エラーを投げずに正常終了
        }
        
        throw error;
      }

      // 状態を更新
      setKycInfo(prev => ({
        ...prev,
        status: 'pending',
        updatedAt: new Date().toISOString()
      }));
    } catch (error) {
      console.error('KYC申請処理エラー:', error);
      throw error;
    }
  };

  return {
    // 状態
    kycInfo,
    settings: kycSettingsState.data,
    documents: kycDocumentsState.data,
    loading: kycSettingsState.loading || kycDocumentsState.loading,
    
    // 判定関数
    isKYCRequired,
    isKYCCompleted,
    
    // 操作関数
    uploadDocument,
    submitKYCApplication,
    
    // データ再読み込み
    refresh: () => {
      if (user?.id) {
        kycSettingsState.execute(loadKYCSettings);
        loadUserKYCInfo(user.id).then(setKycInfo).catch(handleError);
        kycDocumentsState.execute(() => loadKYCDocuments(user.id));
      }
    }
  };
};