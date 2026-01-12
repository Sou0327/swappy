import { useAuth } from '@/contexts/AuthContext';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SERVICE_RESTRICTIONS } from '@/lib/service-restrictions';
import { AlertCircle, Home } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface AdminRouteProps {
  children: React.ReactNode;
}

const AdminRoute = ({ children }: AdminRouteProps) => {
  const { user, userRole, loading, roleLoading } = useAuth();
  const navigate = useNavigate();
  const { i18n } = useTranslation();

  if (loading || roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">読み込み中...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (userRole !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  // サービス制限チェック（管理者でもアクセスをブロック）
  if (!SERVICE_RESTRICTIONS.isAdminAccessEnabled()) {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center bg-gray-50">
        <div className="container mx-auto px-6 py-12 max-w-2xl">
          <Card className="bg-white border border-yellow-300 shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl font-semibold flex items-center gap-2 text-gray-900">
                <AlertCircle className="h-6 w-6 text-yellow-600" />
                管理画面へのアクセス制限
              </CardTitle>
              <CardDescription className="text-gray-600">
                現在、管理画面へのアクセスは一時的に制限されております
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">お知らせ</h4>
                  <div className="text-sm text-gray-700 space-y-2 whitespace-pre-line">
                    {i18n.language === 'en' ? SERVICE_RESTRICTIONS.getAdminRestrictionMessageEn() : SERVICE_RESTRICTIONS.getAdminRestrictionMessage()}
                  </div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">既存ユーザーの保護</h4>
                  <p className="text-sm text-gray-700">
                    エンドユーザーの資産と権利は完全に保護されています。
                    出金機能は通常通り稼働しており、ユーザーへの影響は最小限に抑えられております。
                  </p>
                </div>
                <div className="pt-2">
                  <Button
                    onClick={() => navigate('/dashboard')}
                    className="w-full"
                    variant="default"
                  >
                    <Home className="h-4 w-4 mr-2" />
                    ダッシュボードへ戻る
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default AdminRoute;