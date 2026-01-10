import { useTranslation } from "react-i18next";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnnouncements, AnnouncementCategory, AnnouncementImportance } from "@/hooks/use-announcements";
import {
  Wrench,
  Sparkles,
  AlertTriangle,
  Info,
  Calendar,
  Megaphone
} from "lucide-react";

const Announcements = () => {
  const { t } = useTranslation('announcements');
  const { announcements, loading, error } = useAnnouncements();

  // カテゴリ別のアイコン
  const getCategoryIcon = (category: AnnouncementCategory) => {
    switch (category) {
      case 'maintenance':
        return <Wrench className="h-5 w-5 text-orange-600" />;
      case 'feature':
        return <Sparkles className="h-5 w-5 text-blue-600" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-red-600" />;
      case 'info':
        return <Info className="h-5 w-5 text-gray-600" />;
      case 'event':
        return <Calendar className="h-5 w-5 text-purple-600" />;
      default:
        return <Megaphone className="h-5 w-5 text-gray-600" />;
    }
  };

  // カテゴリ別のラベル
  const getCategoryLabel = (category: AnnouncementCategory): string => {
    switch (category) {
      case 'maintenance':
        return t('categories.maintenance');
      case 'feature':
        return t('categories.feature');
      case 'warning':
        return t('categories.warning');
      case 'info':
        return t('categories.info');
      case 'event':
        return t('categories.event');
      default:
        return t('categories.announcement');
    }
  };

  // 重要度別のバッジスタイル
  const getImportanceBadge = (importance: AnnouncementImportance) => {
    // 重要度が「重要」(high)の時のみBadgeを表示
    if (importance === 'high') {
      return (
        <Badge variant="destructive" className="ml-auto">
          {t('importance.high')}
        </Badge>
      );
    }
    // 通常の場合はBadge非表示
    return null;
  };

  // 日時フォーマット
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* ページヘッダー */}
        <div>
          <h1 className="text-2xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Megaphone className="h-7 w-7" />
            {t('pageTitle')}
          </h1>
          <p className="text-sm md:text-sm text-gray-600 mt-2">
            {t('pageSubtitle')}
          </p>
        </div>

        {/* ローディング状態 */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-5/6" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* エラー状態 */}
        {error && !loading && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {t('error.description')}
            </AlertDescription>
          </Alert>
        )}

        {/* お知らせリスト */}
        {!loading && !error && announcements && announcements.length > 0 && (
          <div className="space-y-4">
            {announcements.map((announcement) => (
              <Card
                key={announcement.id}
                className={`
                  transition-shadow hover:shadow-md
                  ${announcement.importance === 'high' ? 'border-red-300 bg-red-50/50' : ''}
                `}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {getCategoryIcon(announcement.category)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">
                          {getCategoryLabel(announcement.category)}
                        </Badge>
                        {getImportanceBadge(announcement.importance)}
                      </div>
                      <CardTitle className="text-base md:text-base">
                        {announcement.title}
                      </CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm md:text-sm text-gray-700 whitespace-pre-wrap">
                    {announcement.content}
                  </p>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs text-gray-500 pt-2 border-t">
                    <span>{t('fields.publishDate')}: {formatDate(announcement.createdAt)}</span>
                    {announcement.expireAt && (
                      <>
                        <span className="hidden sm:inline">•</span>
                        <span>{t('fields.expireDate')}: {formatDate(announcement.expireAt)}</span>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* 空状態 */}
        {!loading && !error && (!announcements || announcements.length === 0) && (
          <Card>
            <CardContent className="py-12 text-center">
              <Megaphone className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600">{t('empty.title')}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Announcements;
