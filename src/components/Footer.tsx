import { Link } from "react-router-dom";
import { PLATFORM_NAME, GITHUB_URL } from "@/config/branding";
import { useTranslation } from "react-i18next";

// X (Twitter) アイコン - 公式ロゴに基づく
const XIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

// 公式 X/Twitter リンク（所有権確認用）
const OFFICIAL_X_URL = "https://x.com/gensou_ongaku";

export const Footer = () => {
  const { t } = useTranslation();

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
            {/* Social Links */}
            <div className="flex items-center gap-4">
              <a
                href={OFFICIAL_X_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-gray-900 transition-colors"
                aria-label="X (Twitter)"
              >
                <XIcon className="w-5 h-5" />
              </a>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-gray-900 transition-colors"
                aria-label="GitHub"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
              </a>
            </div>
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
              <a
                href={`${GITHUB_URL}/issues`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-gray-600 hover:text-gray-900 transition-colors"
              >
                GitHub Issues
              </a>
              <a
                href={OFFICIAL_X_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-gray-600 hover:text-gray-900 transition-colors"
              >
                X (Twitter)
              </a>
              <a
                href="mailto:h.client.walletapp@gmail.com"
                className="block text-gray-600 hover:text-gray-900 transition-colors"
              >
                h.client.walletapp@gmail.com
              </a>
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
            {/* Orynth Featured Badge */}
            <a
              href="https://orynth.dev/projects/swappy-9949"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-opacity hover:opacity-80"
            >
              <img
                src="https://orynth.dev/api/badge/swappy-9949?theme=light&style=default"
                alt="Featured on Orynth"
                width={260}
                height={80}
                loading="lazy"
                className="h-auto"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
