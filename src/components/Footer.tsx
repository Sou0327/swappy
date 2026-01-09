import { Link } from "react-router-dom";
import { PLATFORM_NAME } from "@/config/branding";

export const Footer = () => {
  return (
    <footer className="border-t border-gray-200 bg-gray-50">
      <div className="container mx-auto px-6 py-12">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="space-y-4">
            <div className="text-2xl font-bold text-gray-900">
              {PLATFORM_NAME}
            </div>
            <p className="text-gray-600">
              すべての人のために構築された次世代の暗号通貨取引プラットフォーム。
            </p>
          </div>

          {/* Products */}
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-900">プロダクト</h4>
            <div className="space-y-2">
              <a href="#" className="block text-gray-600 hover:text-gray-900 transition-colors">
                現物取引
              </a>
            </div>
          </div>

          {/* Support */}
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-900">サポート</h4>
            <div className="space-y-2">
              <a href="#" className="block text-gray-600 hover:text-gray-900 transition-colors">
                お問い合わせ
              </a>
            </div>
          </div>

          {/* Legal */}
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-900">法的情報</h4>
            <div className="space-y-2">
              <Link to="/privacy-policy" className="block text-gray-600 hover:text-gray-900 transition-colors">
                プライバシーポリシー
              </Link>
              <Link to="/terms-of-service" className="block text-gray-600 hover:text-gray-900 transition-colors">
                利用規約
              </Link>
              <Link to="/risk-disclosure" className="block text-gray-600 hover:text-gray-900 transition-colors">
                リスク開示
              </Link>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 mt-12 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-gray-500 text-sm">
              © 2025 {PLATFORM_NAME} Exchange. 全権利所有。
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};