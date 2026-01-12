import { AlertTriangle, Shield, Clock, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SERVICE_RESTRICTIONS } from "@/lib/service-restrictions";
import { PLATFORM_NAME } from "@/config/branding";

/**
 * メンテナンスページ
 *
 * fullモード時に表示される全画面メンテナンス通知
 * - ユーザーに対してサービス停止中であることを明確に伝える
 * - 資産の安全性を保証するメッセージを表示
 * - サポートへの連絡方法を案内
 */
export function MaintenancePage() {
  const { i18n } = useTranslation();
  const message = i18n.language === 'en' ? SERVICE_RESTRICTIONS.getFullRestrictionMessageEn() : SERVICE_RESTRICTIONS.getFullRestrictionMessage();

  return (
    <main
      role="main"
      className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center p-4"
    >
      <div className="max-w-lg w-full">
        {/* メインカード */}
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          {/* メンテナンスアイコン */}
          <div
            data-testid="maintenance-icon"
            className="mx-auto w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mb-6"
          >
            <AlertTriangle className="w-10 h-10 text-amber-600" />
          </div>

          {/* タイトル */}
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            システムメンテナンス中
          </h1>

          {/* メッセージセクション */}
          <div className="space-y-4 text-left">
            {/* お知らせ */}
            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
              <Clock className="w-5 h-5 text-gray-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-gray-900">お知らせ</p>
                <p className="text-sm text-gray-600 mt-1">
                  すべてのサービスを一時的に停止しております。
                  ご不便をおかけして申し訳ございません。
                </p>
              </div>
            </div>

            {/* 資産の安全性 */}
            <div className="flex items-start gap-3 p-4 bg-green-50 rounded-lg">
              <Shield className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-gray-900">お客様の資産について</p>
                <p className="text-sm text-gray-600 mt-1">
                  お客様の資産は安全に保管されております。
                  メンテナンス完了後、すべての機能をご利用いただけます。
                </p>
              </div>
            </div>

            {/* サポート情報 */}
            <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg">
              <Mail className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-gray-900">お問い合わせ</p>
                <p className="text-sm text-gray-600 mt-1">
                  お問い合わせは運営までご連絡ください。
                </p>
              </div>
            </div>
          </div>

          {/* フッター */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-500">
             
            </p>
          </div>
        </div>

        {/* ロゴ/ブランド */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-400">{PLATFORM_NAME}</p>
        </div>
      </div>
    </main>
  );
}

export default MaintenancePage;
