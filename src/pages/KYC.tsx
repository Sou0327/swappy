import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Shield, CheckCircle, Clock, XCircle, FileText, User, MapPin, Calendar, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LoadingState } from "@/components/ui/loading";
import { useKYC } from "@/hooks/use-kyc";
import { supabase } from "@/integrations/supabase/client";
import { SERVICE_RESTRICTIONS } from "@/lib/service-restrictions";

interface PersonalInfo {
  firstName: string;
  lastName: string;
  firstNameKana: string;
  lastNameKana: string;
  birthDate: string;
  phoneNumber: string;
  postalCode: string;
  prefecture: string;
  city: string;
  address: string;
  building?: string;
}

const KYC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { kycInfo, settings, documents, loading: kycLoading, isKYCRequired, isKYCCompleted, uploadDocument, submitKYCApplication, refresh } = useKYC();

  const [personalInfo, setPersonalInfo] = useState<PersonalInfo>({
    firstName: '',
    lastName: '',
    firstNameKana: '',
    lastNameKana: '',
    birthDate: '',
    phoneNumber: '',
    postalCode: '',
    prefecture: '',
    city: '',
    address: '',
    building: ''
  });

  const [personalInfoSaved, setPersonalInfoSaved] = useState(false);
  const [savingPersonalInfo, setSavingPersonalInfo] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const loadPersonalInfo = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    if (!user?.id) {
      return;
    }

    // 編集中の場合は個人情報の再読み込みをスキップ
    if (isEditing && !force) {
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('first_name, last_name, first_name_kana, last_name_kana, birth_date, phone_number, postal_code, prefecture, city, address, building')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      if (data) {
        setPersonalInfo({
          firstName: data.first_name || '',
          lastName: data.last_name || '',
          firstNameKana: data.first_name_kana || '',
          lastNameKana: data.last_name_kana || '',
          birthDate: data.birth_date || '',
          phoneNumber: data.phone_number || '',
          postalCode: data.postal_code || '',
          prefecture: data.prefecture || '',
          city: data.city || '',
          address: data.address || '',
          building: data.building || ''
        });
        setPersonalInfoSaved(!!data.first_name && !!data.last_name);
      }
    } catch (error) {
      console.error('個人情報の読み込みエラー:', error);
    }
  }, [user?.id, isEditing]);

  // 初期データ読み込み（refresh関数を依存配列から除外して無限ループを防ぐ）
  useEffect(() => {
    if (!user?.id) return;

    refresh();
    loadPersonalInfo();
  }, [user?.id, loadPersonalInfo]);

  // isEditingの変化を監視して、編集終了時に個人情報を再読み込み
  useEffect(() => {
    if (!isEditing && user?.id) {
      loadPersonalInfo();
    }
  }, [isEditing, loadPersonalInfo]);


  const refreshData = () => {
    refresh();
  };

  const savePersonalInfo = async () => {
    if (!user?.id) {
      console.error('ユーザーIDが存在しません');
      return;
    }

    setSavingPersonalInfo(true);

    try {

      const updateData = {
        first_name: personalInfo.firstName,
        last_name: personalInfo.lastName,
        first_name_kana: personalInfo.firstNameKana,
        last_name_kana: personalInfo.lastNameKana,
        birth_date: personalInfo.birthDate || null,
        phone_number: personalInfo.phoneNumber || null,
        postal_code: personalInfo.postalCode,
        prefecture: personalInfo.prefecture,
        city: personalInfo.city,
        address: personalInfo.address,
        building: personalInfo.building || null
      };

      const queryPromise = supabase.rpc('update_personal_profile', {
        p_first_name: updateData.first_name,
        p_last_name: updateData.last_name,
        p_first_name_kana: updateData.first_name_kana,
        p_last_name_kana: updateData.last_name_kana,
        p_birth_date: updateData.birth_date,
        p_phone_number: updateData.phone_number,
        p_postal_code: updateData.postal_code,
        p_prefecture: updateData.prefecture,
        p_city: updateData.city,
        p_address: updateData.address,
        p_building: updateData.building
      });

      // result の型を明示的に指定
      const result: { data: unknown; error: { message: string } | null } = await queryPromise;

      // RPC関数の戻り値形式に対応（voidの場合errorのみチェック）
      const { error } = result;

      if (error) {
        console.error('個人情報更新エラー:', error);
        throw error;
      }

      setIsEditing(false);
      await loadPersonalInfo({ force: true });

      toast({
        title: "保存完了",
        description: "個人情報が正常に保存されました。"
      });
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        title: "保存失敗",
        description: err.message || "個人情報の保存に失敗しました。",
        variant: "destructive"
      });
    } finally {
      setSavingPersonalInfo(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 relative max-w-full overflow-x-hidden lg:max-w-[calc(100vw-18rem)]" style={{ pointerEvents: 'auto' }}>
        <h1 className="text-2xl font-bold">本人確認 (KYC)</h1>

        {!settings?.kycEnabled && (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              この環境では KYC は無効です。必要に応じて管理画面の設定をご確認ください。
            </CardContent>
          </Card>
        )}

        {/* KYC Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" /> 現在のステータス
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                {kycInfo.status === 'verified' ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : kycInfo.status === 'pending' ? (
                  <Clock className="h-5 w-5 text-yellow-600" />
                ) : kycInfo.status === 'rejected' ? (
                  <XCircle className="h-5 w-5 text-red-600" />
                ) : (
                  <Shield className="h-5 w-5 text-gray-600" />
                )}
                <div>
                  <div className="font-semibold">
                    {kycInfo.status === 'verified' ? '認証完了' :
                      kycInfo.status === 'pending' ? '審査中' :
                        kycInfo.status === 'rejected' ? '審査不合格' :
                          '未認証'}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {kycInfo.status === 'verified' ? '本人確認が完了しています' :
                      kycInfo.status === 'pending' ? '書類を審査中です。しばらくお待ちください' :
                        kycInfo.status === 'rejected' ? '書類に不備がありました。再提出してください' :
                          '本人確認を行ってください'}
                  </div>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">レベル {kycInfo.level}</div>
            </div>
          </CardContent>
        </Card>

        {/* Required Notice */}
        {(isKYCRequired('deposit') || isKYCRequired('withdrawal')) && !isKYCCompleted() && (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div>
                <div className="font-semibold text-yellow-900">本人確認が必要です</div>
                <div className="text-sm text-yellow-800 mt-1">
                  {isKYCRequired('deposit') && isKYCRequired('withdrawal')
                    ? '入金・出金機能をご利用いただくには本人確認が必要です'
                    : isKYCRequired('deposit')
                      ? '入金機能をご利用いただくには本人確認が必要です'
                      : '出金機能をご利用いただくには本人確認が必要です'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Service Restriction Notice */}
        {!SERVICE_RESTRICTIONS.isKYCEnabled() ? (
          <Card className="bg-white border border-yellow-300 shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl font-semibold flex items-center gap-2 text-gray-900">
                <AlertCircle className="h-6 w-6 text-yellow-600" />
                KYC申請の一時停止
              </CardTitle>
              <CardDescription className="text-gray-600">
                現在、新規のKYC（本人確認）申請は一時的に停止しております
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">お知らせ</h4>
                  <div className="text-sm text-gray-700 space-y-2 whitespace-pre-line">
                    {SERVICE_RESTRICTIONS.getRestrictionMessage()}
                  </div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">既存ユーザーの保護</h4>
                  <p className="text-sm text-gray-700">
                    既にKYC認証が完了されているユーザー様は、引き続きすべての機能をご利用いただけます。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Personal Information Section */}
            {settings?.kycEnabled && (kycInfo.status === 'none' || kycInfo.status === 'rejected') && (
              <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" /> 個人情報入力
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 氏名 */}
                <div className="space-y-2">
                  <Label htmlFor="lastName">姓 *</Label>
                  <Input
                    id="lastName"
                    value={personalInfo.lastName}
                    onChange={(e) => {
                      setPersonalInfo(prev => ({ ...prev, lastName: e.target.value }));
                      setIsEditing(true);
                    }}
                    placeholder="田中"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="firstName">名 *</Label>
                  <Input
                    id="firstName"
                    value={personalInfo.firstName}
                    onChange={(e) => {
                      setPersonalInfo(prev => ({ ...prev, firstName: e.target.value }));
                      setIsEditing(true);
                    }}
                    placeholder="太郎"
                    required
                  />
                </div>

                {/* フリガナ */}
                <div className="space-y-2">
                  <Label htmlFor="lastNameKana">セイ *</Label>
                  <Input
                    id="lastNameKana"
                    value={personalInfo.lastNameKana}
                    onChange={(e) => {
                      setPersonalInfo(prev => ({ ...prev, lastNameKana: e.target.value }));
                      setIsEditing(true);
                    }}
                    placeholder="タナカ"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="firstNameKana">メイ *</Label>
                  <Input
                    id="firstNameKana"
                    value={personalInfo.firstNameKana}
                    onChange={(e) => {
                      setPersonalInfo(prev => ({ ...prev, firstNameKana: e.target.value }));
                      setIsEditing(true);
                    }}
                    placeholder="タロウ"
                    required
                  />
                </div>

                {/* 生年月日 */}
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="birthDate" className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" /> 生年月日 *
                  </Label>
                  <Input
                    id="birthDate"
                    type="date"
                    value={personalInfo.birthDate}
                    onChange={(e) => {
                      setPersonalInfo(prev => ({ ...prev, birthDate: e.target.value }));
                      setIsEditing(true);
                    }}
                    required
                  />
                </div>

                {/* 電話番号 */}
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="phoneNumber">電話番号</Label>
                  <Input
                    id="phoneNumber"
                    type="tel"
                    value={personalInfo.phoneNumber}
                    onChange={(e) => {
                      setPersonalInfo(prev => ({ ...prev, phoneNumber: e.target.value }));
                      setIsEditing(true);
                    }}
                    placeholder="090-1234-5678"
                  />
                  <p className="text-xs text-muted-foreground">ハイフンあり・なし、どちらでも入力可能です</p>
                </div>
              </div>

              {/* 住所情報 */}
              <div className="space-y-4 pt-4 border-t">
                <h4 className="font-semibold flex items-center gap-2">
                  <MapPin className="h-4 w-4" /> 住所情報
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="postalCode">郵便番号 *</Label>
                    <Input
                      id="postalCode"
                      value={personalInfo.postalCode}
                      onChange={(e) => {
                        setPersonalInfo(prev => ({ ...prev, postalCode: e.target.value }));
                        setIsEditing(true);
                      }}
                      placeholder="123-4567"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prefecture">都道府県 *</Label>
                    <Select value={personalInfo.prefecture} onValueChange={(value) => {
                      setPersonalInfo(prev => ({ ...prev, prefecture: value }));
                      setIsEditing(true);
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="選択してください" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="東京都">東京都</SelectItem>
                        <SelectItem value="大阪府">大阪府</SelectItem>
                        <SelectItem value="神奈川県">神奈川県</SelectItem>
                        <SelectItem value="愛知県">愛知県</SelectItem>
                        <SelectItem value="埼玉県">埼玉県</SelectItem>
                        <SelectItem value="千葉県">千葉県</SelectItem>
                        <SelectItem value="兵庫県">兵庫県</SelectItem>
                        <SelectItem value="北海道">北海道</SelectItem>
                        <SelectItem value="福岡県">福岡県</SelectItem>
                        <SelectItem value="静岡県">静岡県</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">市区町村 *</Label>
                    <Input
                      id="city"
                      value={personalInfo.city}
                      onChange={(e) => {
                        setPersonalInfo(prev => ({ ...prev, city: e.target.value }));
                        setIsEditing(true);
                      }}
                      placeholder="渋谷区"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">町域・番地 *</Label>
                    <Input
                      id="address"
                      value={personalInfo.address}
                      onChange={(e) => {
                        setPersonalInfo(prev => ({ ...prev, address: e.target.value }));
                        setIsEditing(true);
                      }}
                      placeholder="神南1-2-3"
                      required
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="building">建物名・部屋番号</Label>
                    <Input
                      id="building"
                      value={personalInfo.building}
                      onChange={(e) => {
                        setPersonalInfo(prev => ({ ...prev, building: e.target.value }));
                        setIsEditing(true);
                      }}
                      placeholder="〇〇マンション101号室"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button
                  onClick={savePersonalInfo}
                  disabled={savingPersonalInfo || !personalInfo.firstName || !personalInfo.lastName}
                  className="min-w-[120px]"
                >
                  {savingPersonalInfo ? "保存中..." : personalInfoSaved ? "更新する" : "保存する"}
                </Button>
              </div>

              {personalInfoSaved && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2 text-green-800">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm font-medium">個人情報が保存されました</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Rejected Notice */}
        {settings?.kycEnabled && kycInfo.status === 'rejected' && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
              <div>
                <div className="font-semibold text-red-900">書類に不備がありました</div>
                <div className="text-sm text-red-800 mt-1">
                  {kycInfo.notes ? (
                    <>理由: {kycInfo.notes}</>
                  ) : (
                    <>書類を確認の上、修正して再度申請してください。</>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Document Upload Section */}
        {settings?.kycEnabled && kycInfo.status !== 'verified' && personalInfoSaved && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                必要書類のアップロード
              </CardTitle>
              <div className="text-sm text-muted-foreground">
                <p className="mb-2">本人確認のため、以下の書類をアップロードしてください。</p>
                <div className="bg-blue-50 p-3 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">📋 アップロード可能な書類について</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li><strong>本人確認書類:</strong> 運転免許証、マイナンバーカード、パスポートなど（顔写真付き）</li>
                    <li><strong>住所確認書類:</strong> 公共料金明細、住民票、銀行取引明細など（3ヶ月以内のもの）</li>
                    <li><strong>ファイル形式:</strong> JPEG、PNG、PDF（5MB以下）</li>
                    <li><strong>注意事項:</strong> 文字が鮮明に読める写真をアップロードしてください</li>
                  </ul>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <LoadingState loading={kycLoading}>
                <div className="space-y-4">
                  {/* Identity Document */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Label className="text-base font-medium">1. 本人確認書類</Label>
                      <span className="text-red-500 text-sm">*必須</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      顔写真付きの身分証明書をアップロードしてください（運転免許証、マイナンバーカード、パスポートなど）
                    </p>
                    <div className="p-6 border-2 border-dashed border-muted-foreground/25 rounded-lg hover:border-primary/50 transition-colors">
                      {documents?.find(d => d.documentType === 'identity') ? (
                        <div className="flex items-center gap-4">
                          <div className="p-2 bg-green-100 rounded-lg">
                            <CheckCircle className="h-5 w-5 text-green-600" />
                          </div>
                          <div className="flex-1">
                            <div className="font-medium">{documents.find(d => d.documentType === 'identity')?.fileName}</div>
                            <div className="text-sm text-muted-foreground">
                              アップロード完了 • 状態: {
                                documents.find(d => d.documentType === 'identity')?.status === 'approved' ? '✅ 承認済み' :
                                  documents.find(d => d.documentType === 'identity')?.status === 'pending' ? '⏳ 審査中' :
                                    '❌ 要修正'
                              }
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const input = document.createElement('input');
                              input.type = 'file';
                              input.multiple = true;
                              input.accept = settings?.allowedFileTypes.join(',') || 'image/*,application/pdf';
                              input.onchange = async (e) => {
                                const files = (e.target as HTMLInputElement).files;
                                if (files && files.length > 0) {
                                  try {
                                    for (let i = 0; i < files.length; i++) {
                                      await uploadDocument(files[i], 'identity');
                                    }
                                    toast({
                                      title: 'アップロード完了',
                                      description: `本人確認書類を${files.length}件再アップロードしました`
                                    });
                                  } catch (error: unknown) {
                                    const err = error as Error;
                                    toast({ title: 'アップロード失敗', description: err?.message || 'エラーが発生しました', variant: 'destructive' });
                                  }
                                }
                              };
                              input.click();
                            }}
                          >
                            再アップロード
                          </Button>
                        </div>
                      ) : (
                        <div className="text-center">
                          <div className="p-3 bg-blue-100 rounded-full w-fit mx-auto mb-3">
                            <FileText className="h-5 w-5 text-blue-600" />
                          </div>
                          <div className="text-sm text-muted-foreground mb-4">
                            複数ファイルを選択するか、ここにドラッグ&ドロップしてください
                          </div>
                          <Button
                            variant="outline"
                            onClick={() => {
                              const input = document.createElement('input');
                              input.type = 'file';
                              input.multiple = true;
                              input.accept = settings?.allowedFileTypes.join(',') || 'image/*,application/pdf';
                              input.onchange = async (e) => {
                                const files = (e.target as HTMLInputElement).files;
                                if (files && files.length > 0) {
                                  try {
                                    for (let i = 0; i < files.length; i++) {
                                      await uploadDocument(files[i], 'identity');
                                    }
                                    toast({
                                      title: 'アップロード完了',
                                      description: `本人確認書類を${files.length}件アップロードしました`
                                    });
                                  } catch (error: unknown) {
                                    const err = error as Error;
                                    toast({ title: 'アップロード失敗', description: err?.message || 'エラーが発生しました', variant: 'destructive' });
                                  }
                                }
                              };
                              input.click();
                            }}
                          >
                            <FileText className="h-4 w-4 mr-2" />
                            ファイルを選択
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Address Document */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Label className="text-base font-medium">2. 住所確認書類</Label>
                      <span className="text-red-500 text-sm">*必須</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      現住所が確認できる書類をアップロードしてください（公共料金明細、住民票、銀行取引明細など、発行から3ヶ月以内のもの）
                    </p>
                    <div className="p-6 border-2 border-dashed border-muted-foreground/25 rounded-lg hover:border-primary/50 transition-colors">
                      {documents?.find(d => d.documentType === 'address') ? (
                        <div className="flex items-center gap-4">
                          <div className="p-2 bg-green-100 rounded-lg">
                            <CheckCircle className="h-5 w-5 text-green-600" />
                          </div>
                          <div className="flex-1">
                            <div className="font-medium">{documents.find(d => d.documentType === 'address')?.fileName}</div>
                            <div className="text-sm text-muted-foreground">
                              アップロード完了 • 状態: {
                                documents.find(d => d.documentType === 'address')?.status === 'approved' ? '✅ 承認済み' :
                                  documents.find(d => d.documentType === 'address')?.status === 'pending' ? '⏳ 審査中' :
                                    '❌ 要修正'
                              }
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const input = document.createElement('input');
                              input.type = 'file';
                              input.multiple = true;
                              input.accept = settings?.allowedFileTypes.join(',') || 'image/*,application/pdf';
                              input.onchange = async (e) => {
                                const files = (e.target as HTMLInputElement).files;
                                if (files && files.length > 0) {
                                  try {
                                    for (let i = 0; i < files.length; i++) {
                                      await uploadDocument(files[i], 'address');
                                    }
                                    toast({
                                      title: 'アップロード完了',
                                      description: `住所確認書類を${files.length}件再アップロードしました`
                                    });
                                  } catch (error: unknown) {
                                    const err = error as Error;
                                    toast({ title: 'アップロード失敗', description: err?.message || 'エラーが発生しました', variant: 'destructive' });
                                  }
                                }
                              };
                              input.click();
                            }}
                          >
                            再アップロード
                          </Button>
                        </div>
                      ) : (
                        <div className="text-center">
                          <div className="p-3 bg-blue-100 rounded-full w-fit mx-auto mb-3">
                            <MapPin className="h-5 w-5 text-blue-600" />
                          </div>
                          <div className="text-sm text-muted-foreground mb-4">
                            複数ファイルを選択するか、ここにドラッグ&ドロップしてください
                          </div>
                          <Button
                            variant="outline"
                            onClick={() => {
                              const input = document.createElement('input');
                              input.type = 'file';
                              input.multiple = true;
                              input.accept = settings?.allowedFileTypes.join(',') || 'image/*,application/pdf';
                              input.onchange = async (e) => {
                                const files = (e.target as HTMLInputElement).files;
                                if (files && files.length > 0) {
                                  try {
                                    for (let i = 0; i < files.length; i++) {
                                      await uploadDocument(files[i], 'address');
                                    }
                                    toast({
                                      title: 'アップロード完了',
                                      description: `住所確認書類を${files.length}件アップロードしました`
                                    });
                                  } catch (error: unknown) {
                                    const err = error as Error;
                                    toast({ title: 'アップロード失敗', description: err?.message || 'エラーが発生しました', variant: 'destructive' });
                                  }
                                }
                              };
                              input.click();
                            }}
                          >
                            <MapPin className="h-4 w-4 mr-2" />
                            ファイルを選択
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </LoadingState>

              {/* Submit Button */}
              {settings?.kycEnabled && documents && documents.length >= 2 && (kycInfo.status === 'none' || kycInfo.status === 'rejected') && personalInfoSaved && (
                <div className="mt-6 p-4 bg-green-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="font-medium text-green-900">
                      {kycInfo.status === 'rejected' ? '再提出準備完了' : '提出準備完了'}
                    </span>
                  </div>
                  <p className="text-sm text-green-800 mb-4">
                    {kycInfo.status === 'rejected'
                      ? '個人情報と必要書類の修正が完了しました。下記ボタンをクリックしてKYC申請を再提出してください。'
                      : '個人情報と必要書類のアップロードが完了しました。下記ボタンをクリックしてKYC申請を提出してください。'}
                  </p>
                  <Button
                    onClick={async () => {
                      try {
                        await submitKYCApplication();
                        toast({
                          title: kycInfo.status === 'rejected' ? '再申請完了' : '申請完了',
                          description: 'KYC申請を提出しました。審査結果をお待ちください。'
                        });
                      } catch (error: unknown) {
                        const err = error as Error;
                        toast({ title: '申請失敗', description: err?.message || 'エラーが発生しました', variant: 'destructive' });
                      }
                    }}
                    className="w-full"
                    size="lg"
                  >
                    <Shield className="h-4 w-4 mr-2" />
                    {kycInfo.status === 'rejected' ? '本人確認申請を再提出する' : '本人確認申請を提出する'}
                  </Button>
                </div>
              )}

              {/* Progress indicator */}
              {settings?.kycEnabled && kycInfo.status === 'none' && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium mb-3">📋 提出チェックリスト</h4>
                  <div className="space-y-2 text-sm">
                    <div className={`flex items-center gap-2 ${personalInfoSaved ? 'text-green-700' : 'text-gray-600'}`}>
                      {personalInfoSaved ? <CheckCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                      個人情報の入力
                    </div>
                    <div className={`flex items-center gap-2 ${documents?.find(d => d.documentType === 'identity') ? 'text-green-700' : 'text-gray-600'}`}>
                      {documents?.find(d => d.documentType === 'identity') ? <CheckCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                      本人確認書類のアップロード
                    </div>
                    <div className={`flex items-center gap-2 ${documents?.find(d => d.documentType === 'address') ? 'text-green-700' : 'text-gray-600'}`}>
                      {documents?.find(d => d.documentType === 'address') ? <CheckCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                      住所確認書類のアップロード
                    </div>
                  </div>
                  {(!personalInfoSaved || !documents?.find(d => d.documentType === 'identity') || !documents?.find(d => d.documentType === 'address')) && (
                    <p className="text-xs text-gray-600 mt-3">
                      すべての項目を完了すると申請を提出できます
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default KYC;
