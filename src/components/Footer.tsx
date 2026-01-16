import { Link } from "react-router-dom";
import { PLATFORM_NAME, GITHUB_URL } from "@/config/branding";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";

export const Footer = () => {
  const { t } = useTranslation();
  const { isDemoMode } = useAuth();

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
              {t('footer.description')}
            </p>
          </div>

          {/* Products */}
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-900">{t('footer.products')}</h4>
            <div className="space-y-2">
              <Link to="/markets" className="block text-gray-600 hover:text-gray-900 transition-colors">
                {t('footer.spotTrading')}
              </Link>
            </div>
          </div>

          {/* Support */}
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-900">{t('footer.support')}</h4>
            <div className="space-y-2">
              {isDemoMode ? (
                <a
                  href={`${GITHUB_URL}/issues`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-gray-600 hover:text-gray-900 transition-colors"
                >
                  {t('footer.contact')}
                </a>
              ) : (
                <Link to="/support" className="block text-gray-600 hover:text-gray-900 transition-colors">
                  {t('footer.contact')}
                </Link>
              )}
            </div>
          </div>

          {/* Legal */}
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-900">{t('footer.legal')}</h4>
            <div className="space-y-2">
              <Link to="/privacy-policy" className="block text-gray-600 hover:text-gray-900 transition-colors">
                {t('footer.privacyPolicy')}
              </Link>
              <Link to="/terms-of-service" className="block text-gray-600 hover:text-gray-900 transition-colors">
                {t('footer.termsOfService')}
              </Link>
              <Link to="/risk-disclosure" className="block text-gray-600 hover:text-gray-900 transition-colors">
                {t('footer.riskDisclosure')}
              </Link>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 mt-12 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-gray-500 text-sm">
              © 2025 {PLATFORM_NAME} Exchange. {t('footer.copyright')}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};
