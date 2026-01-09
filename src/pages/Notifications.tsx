import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/hooks/use-notifications";
import {
  Bell,
  CheckCircle,
  Shield,
  AlertTriangle,
  XCircle,
  Loader2
} from "lucide-react";

const Notifications = () => {
  const { notifications, loading, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [processingId, setProcessingId] = useState<string | null>(null);

  // 通知タイプに応じたアイコンと色
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'kyc':
        return <Shield className="h-4 w-4 text-blue-600" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Bell className="h-4 w-4 text-gray-600" />;
    }
  };

  // 日時フォーマット（Apple風に簡潔）
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    // 1分未満
    if (diffInSeconds < 60) return 'たった今';

    // 1時間未満
    if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes}分前`;
    }

    // 24時間未満
    if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours}時間前`;
    }

    // 7日未満
    if (diffInSeconds < 604800) {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days}日前`;
    }

    // それ以上は日付表示
    return date.toLocaleDateString('ja-JP', {
      month: 'short',
      day: 'numeric'
    });
  };

  // 通知をタップした時の処理
  const handleNotificationClick = async (notificationId: string, isRead: boolean) => {
    if (!isRead) {
      setProcessingId(notificationId);
      try {
        await markAsRead(notificationId);
      } finally {
        setProcessingId(null);
      }
    }
  };

  // すべて既読にする処理
  const handleMarkAllAsRead = async () => {
    if (unreadCount === 0) return;
    await markAllAsRead();
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-base font-bold text-gray-900">
              通知
            </h1>
            {unreadCount > 0 && (
              <p className="text-sm text-gray-600 mt-0.5">
                {unreadCount}件の未読通知
              </p>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllAsRead}
              className="text-primary hover:text-primary/80 font-medium h-8 text-sm"
            >
              すべて既読
            </Button>
          )}
        </div>

        {/* ローディング状態 */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}

        {/* 通知リスト */}
        {!loading && notifications && notifications.length > 0 && (
          <div className="space-y-1">
            {notifications.map((notification) => (
              <button
                key={notification.id}
                onClick={() => handleNotificationClick(notification.id, notification.read)}
                className={`
                  w-full text-left
                  ${!notification.read ? 'bg-blue-50/50' : 'bg-white'}
                  rounded-md shadow-sm border border-gray-100
                  hover:shadow-md hover:border-gray-200
                  transition-all duration-200
                  active:scale-[0.98]
                  p-2
                `}
              >
                <div className="flex items-start gap-2">
                  {/* アイコン */}
                  <div className="flex-shrink-0 mt-0.5">
                    {getNotificationIcon(notification.type)}
                  </div>

                  {/* 通知内容 */}
                  <div className="flex-1 min-w-0">
                    {/* タイトルと未読インジケーター */}
                    <div className="flex items-start justify-between gap-2 mb-0.5">
                      <h3 className="font-semibold text-gray-900 text-sm leading-tight">
                        {notification.title}
                      </h3>
                      {!notification.read && (
                        <div className="flex-shrink-0 w-2 h-2 bg-blue-600 rounded-full mt-1" />
                      )}
                    </div>

                    {/* メッセージ */}
                    <p className="text-gray-700 text-sm mb-0.5">
                      {notification.message}
                    </p>

                    {/* タイムスタンプ */}
                    <p className="text-xs text-gray-500">
                      {formatDate(notification.createdAt)}
                    </p>
                  </div>

                  {/* 処理中インジケーター */}
                  {processingId === notification.id && (
                    <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* 空状態 */}
        {!loading && (!notifications || notifications.length === 0) && (
          <div className="flex flex-col items-center justify-center py-4">
            <div className="bg-gray-100 rounded-full p-2 mb-2">
              <Bell className="h-5 w-5 text-gray-400" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 mb-1">
              通知はありません
            </h2>
            <p className="text-sm text-gray-600 text-center max-w-sm">
              新しい通知が届くとここに表示されます
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Notifications;
