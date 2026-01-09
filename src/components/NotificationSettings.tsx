import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  Smartphone,
  Clock,
  Shield,
  AlertTriangle,
  CheckCircle,
  Settings,
  TestTube,
  Activity
} from 'lucide-react';
import { useEnhancedToast } from '@/components/EnhancedToast';
import useNotifications, { type NotificationSettings as NotificationSettingsType, createDepositNotification } from '@/hooks/useNotifications';

// プロパティ定義
interface NotificationSettingsProps {
  className?: string;
  onSettingsChange?: (settings: NotificationSettingsType) => void;
}

// 設定セクションコンポーネント
interface SettingSectionProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

const SettingSection: React.FC<SettingSectionProps> = ({ title, description, icon, children }) => (
  <div className="space-y-4">
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
        {icon}
      </div>
      <div className="flex-1">
        <h3 className="font-medium text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
    <div className="ml-11 space-y-3">
      {children}
    </div>
  </div>
);

// 設定項目コンポーネント
interface SettingItemProps {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

const SettingItem: React.FC<SettingItemProps> = ({
  label,
  description,
  checked,
  onCheckedChange,
  disabled = false
}) => (
  <div className="flex items-center justify-between">
    <div className="flex-1">
      <Label htmlFor={label} className={`text-sm ${disabled ? 'text-muted-foreground' : ''}`}>
        {label}
      </Label>
      {description && (
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      )}
    </div>
    <Switch
      id={label}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
    />
  </div>
);

// 時間入力コンポーネント
interface TimeInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const TimeInput: React.FC<TimeInputProps> = ({ label, value, onChange, disabled = false }) => (
  <div className="flex items-center gap-2">
    <Label className="text-sm w-16">{label}</Label>
    <Input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-24"
    />
  </div>
);

/**
 * プッシュ通知設定管理コンポーネント
 * ユーザーが通知の詳細設定を行える包括的なUI
 */
export const NotificationSettings: React.FC<NotificationSettingsProps> = ({
  className = '',
  onSettingsChange
}) => {
  const toast = useEnhancedToast();
  const {
    permission,
    isSupported,
    settings,
    stats,
    requestPermission,
    updateSettings,
    testNotification,
    sendNotification
  } = useNotifications();

  const [isTestLoading, setIsTestLoading] = useState(false);

  // 権限要求処理
  const handleRequestPermission = async () => {
    try {
      const result = await requestPermission();

      if (result === 'granted') {
        toast.showSuccess('通知権限が許可されました', {
          description: 'プッシュ通知が有効になりました。',
          context: { operation: '通知権限設定' }
        });
      } else {
        toast.showWarning('通知権限が拒否されました', {
          description: 'ブラウザ設定から手動で通知を許可してください。',
          context: { operation: '通知権限設定' }
        });
      }
    } catch (error) {
      toast.showError('権限要求エラー', {
        description: '通知権限の要求中にエラーが発生しました。',
        context: { operation: '通知権限設定' }
      });
    }
  };

  // 設定更新ハンドラー
  const handleSettingsUpdate = (newSettings: Partial<NotificationSettingsType>) => {
    const updatedSettings = { ...settings, ...newSettings };
    updateSettings(newSettings);
    onSettingsChange?.(updatedSettings);

    toast.showSuccess('設定を更新しました', {
      description: '通知設定が正常に保存されました。',
      context: { operation: '通知設定更新' },
      duration: 3000
    });
  };

  // テスト通知送信
  const handleTestNotification = async () => {
    if (permission !== 'granted') {
      toast.showWarning('権限が必要です', {
        description: '通知のテストには権限の許可が必要です。',
        context: { operation: 'テスト通知' }
      });
      return;
    }

    setIsTestLoading(true);
    try {
      const success = await testNotification();

      if (success) {
        toast.showSuccess('テスト通知を送信しました', {
          description: '通知が正常に表示されるかご確認ください。',
          context: { operation: 'テスト通知' }
        });
      } else {
        toast.showWarning('テスト通知の送信に失敗しました', {
          description: '設定を確認してもう一度お試しください。',
          context: { operation: 'テスト通知' }
        });
      }
    } catch (error) {
      toast.showError('テスト通知エラー', {
        description: 'テスト通知の送信中にエラーが発生しました。',
        context: { operation: 'テスト通知' }
      });
    } finally {
      setIsTestLoading(false);
    }
  };

  // サンプル入金通知のテスト
  const handleTestDepositNotification = async () => {
    if (permission !== 'granted') {
      await handleRequestPermission();
      return;
    }

    const sampleNotification = createDepositNotification('detected', {
      amount: 0.1,
      asset: 'ETH',
      txHash: '0x1234567890abcdef...'
    });

    setIsTestLoading(true);
    try {
      const success = await sendNotification(sampleNotification);

      if (success) {
        toast.showSuccess('入金通知テストを送信しました', {
          description: 'サンプルの入金検知通知が表示されます。',
          context: { operation: 'サンプル通知テスト' }
        });
      }
    } catch (error) {
      toast.showError('サンプル通知エラー', {
        description: 'サンプル通知の送信に失敗しました。',
        context: { operation: 'サンプル通知テスト' }
      });
    } finally {
      setIsTestLoading(false);
    }
  };

  if (!isSupported) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              このブラウザはプッシュ通知をサポートしていません。
              最新版のChrome、Firefox、Safari、またはEdgeをご利用ください。
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          プッシュ通知設定
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* 権限と基本状態 */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">通知権限</h3>
              <p className="text-sm text-muted-foreground">
                ブラウザからの通知表示権限の状態
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={
                permission === 'granted' ? 'default' :
                  permission === 'denied' ? 'destructive' : 'secondary'
              }>
                {permission === 'granted' ? '許可済み' :
                  permission === 'denied' ? '拒否' : '未設定'}
              </Badge>
              {permission !== 'granted' && (
                <Button size="sm" onClick={handleRequestPermission}>
                  権限を要求
                </Button>
              )}
            </div>
          </div>

          {permission === 'granted' && (
            <div className="bg-green-50 border border-green-200 p-3 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-800">通知が有効です</span>
              </div>
              <p className="text-xs text-green-700 mt-1">
                重要な入金情報をリアルタイムで通知します。
              </p>
            </div>
          )}
        </div>

        <Separator />

        {/* メイン通知設定 */}
        <SettingSection
          title="通知機能"
          description="プッシュ通知のオン/オフを制御します"
          icon={<Bell className="h-4 w-4 text-primary" />}
        >
          <SettingItem
            label="プッシュ通知を有効にする"
            description="入金やシステムの重要な更新を通知します"
            checked={settings.enabled}
            onCheckedChange={(checked) => handleSettingsUpdate({ enabled: checked })}
            disabled={permission !== 'granted'}
          />
        </SettingSection>

        <Separator />

        {/* 入金通知設定 */}
        <SettingSection
          title="入金通知"
          description="暗号資産入金に関する通知設定"
          icon={<Activity className="h-4 w-4 text-green-600" />}
        >
          <SettingItem
            label="新規入金検知"
            description="入金トランザクションが検知された時に通知"
            checked={settings.deposits.newDeposit}
            onCheckedChange={(checked) =>
              handleSettingsUpdate({
                deposits: { ...settings.deposits, newDeposit: checked }
              })
            }
            disabled={!settings.enabled}
          />

          <SettingItem
            label="確認進行状況"
            description="ブロック確認の進行状況を通知"
            checked={settings.deposits.confirmationProgress}
            onCheckedChange={(checked) =>
              handleSettingsUpdate({
                deposits: { ...settings.deposits, confirmationProgress: checked }
              })
            }
            disabled={!settings.enabled}
          />

          <SettingItem
            label="入金完了"
            description="入金が完了し残高に反映された時に通知"
            checked={settings.deposits.completion}
            onCheckedChange={(checked) =>
              handleSettingsUpdate({
                deposits: { ...settings.deposits, completion: checked }
              })
            }
            disabled={!settings.enabled}
          />

          <SettingItem
            label="エラー・失敗"
            description="入金処理でエラーが発生した時に通知"
            checked={settings.deposits.failures}
            onCheckedChange={(checked) =>
              handleSettingsUpdate({
                deposits: { ...settings.deposits, failures: checked }
              })
            }
            disabled={!settings.enabled}
          />
        </SettingSection>

        <Separator />

        {/* システム通知設定 */}
        <SettingSection
          title="システム通知"
          description="サービスの稼働状況に関する通知"
          icon={<Shield className="h-4 w-4 text-blue-600" />}
        >
          <SettingItem
            label="接続問題"
            description="リアルタイム監視の接続問題を通知"
            checked={settings.system.connectionIssues}
            onCheckedChange={(checked) =>
              handleSettingsUpdate({
                system: { ...settings.system, connectionIssues: checked }
              })
            }
            disabled={!settings.enabled}
          />

          <SettingItem
            label="メンテナンス"
            description="定期メンテナンスの開始・終了を通知"
            checked={settings.system.maintenance}
            onCheckedChange={(checked) =>
              handleSettingsUpdate({
                system: { ...settings.system, maintenance: checked }
              })
            }
            disabled={!settings.enabled}
          />
        </SettingSection>

        <Separator />

        {/* 体感設定 */}
        <SettingSection
          title="体感フィードバック"
          description="音声とバイブレーションの設定"
          icon={<Volume2 className="h-4 w-4 text-purple-600" />}
        >
          <SettingItem
            label="通知音"
            description="通知時に音を再生します"
            checked={settings.sound}
            onCheckedChange={(checked) => handleSettingsUpdate({ sound: checked })}
            disabled={!settings.enabled}
          />

          <SettingItem
            label="バイブレーション"
            description="モバイルデバイスで振動します"
            checked={settings.vibration}
            onCheckedChange={(checked) => handleSettingsUpdate({ vibration: checked })}
            disabled={!settings.enabled}
          />
        </SettingSection>

        <Separator />

        {/* クワイエット時間設定 */}
        <SettingSection
          title="サイレント時間"
          description="指定した時間帯は通知を停止します"
          icon={<Clock className="h-4 w-4 text-amber-600" />}
        >
          <SettingItem
            label="サイレント時間を有効にする"
            description="指定した時間帯は通知を停止"
            checked={settings.quiet_hours.enabled}
            onCheckedChange={(checked) =>
              handleSettingsUpdate({
                quiet_hours: { ...settings.quiet_hours, enabled: checked }
              })
            }
            disabled={!settings.enabled}
          />

          {settings.quiet_hours.enabled && (
            <div className="flex items-center gap-4 mt-3">
              <TimeInput
                label="開始"
                value={settings.quiet_hours.start}
                onChange={(value) =>
                  handleSettingsUpdate({
                    quiet_hours: { ...settings.quiet_hours, start: value }
                  })
                }
                disabled={!settings.enabled}
              />
              <TimeInput
                label="終了"
                value={settings.quiet_hours.end}
                onChange={(value) =>
                  handleSettingsUpdate({
                    quiet_hours: { ...settings.quiet_hours, end: value }
                  })
                }
                disabled={!settings.enabled}
              />
            </div>
          )}
        </SettingSection>

        <Separator />

        {/* テストとデバッグ */}
        <div className="space-y-4">
          <h3 className="font-medium flex items-center gap-2">
            <TestTube className="h-4 w-4" />
            テストと統計
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button
              variant="outline"
              onClick={handleTestNotification}
              disabled={permission !== 'granted' || isTestLoading}
              className="w-full"
            >
              {isTestLoading ? 'テスト中...' : 'テスト通知を送信'}
            </Button>

            <Button
              variant="outline"
              onClick={handleTestDepositNotification}
              disabled={isTestLoading}
              className="w-full"
            >
              {isTestLoading ? 'テスト中...' : '入金通知のテスト'}
            </Button>
          </div>

          {/* 統計情報 */}
          <div className="bg-muted/50 p-4 rounded-lg">
            <h4 className="text-sm font-medium mb-3">通知統計</h4>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-lg font-semibold">{stats.sent}</div>
                <div className="text-xs text-muted-foreground">送信</div>
              </div>
              <div>
                <div className="text-lg font-semibold">{stats.clicked}</div>
                <div className="text-xs text-muted-foreground">クリック</div>
              </div>
              <div>
                <div className="text-lg font-semibold">{stats.dismissed}</div>
                <div className="text-xs text-muted-foreground">閉じた</div>
              </div>
            </div>
            {stats.lastSent && (
              <p className="text-xs text-muted-foreground mt-3 text-center">
                最終送信: {stats.lastSent.toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default NotificationSettings;