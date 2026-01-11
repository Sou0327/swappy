import { useTranslation } from "react-i18next";
import {
  Layers,
  KeyRound,
  Palette,
  Webhook,
  Shield,
  Globe,
  ArrowRight
} from "lucide-react";
import { GITHUB_URL } from "@/config/branding";

const FEATURES = [
  { key: 'multiChain', icon: Layers, color: 'bg-blue-100 text-blue-600' },
  { key: 'hdWallet', icon: KeyRound, color: 'bg-amber-100 text-amber-600' },
  { key: 'whiteLabel', icon: Palette, color: 'bg-purple-100 text-purple-600' },
  { key: 'realtime', icon: Webhook, color: 'bg-green-100 text-green-600' },
  { key: 'security', icon: Shield, color: 'bg-red-100 text-red-600' },
  { key: 'i18n', icon: Globe, color: 'bg-cyan-100 text-cyan-600' },
] as const;

export const FeaturesSection = () => {
  const { t } = useTranslation('landing');

  return (
    <section className="py-20 md:py-32 bg-gradient-to-b from-white to-gray-50">
      <div className="container mx-auto px-4 md:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 md:mb-20">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-light text-gray-900 leading-tight mb-6">
            {t('features.title')}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              {t('features.titleHighlight')}
            </span>
          </h2>
          <p className="text-lg md:text-xl text-gray-600 font-light">
            {t('features.subtitle')}
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 max-w-6xl mx-auto">
          {FEATURES.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.key}
                className={`group p-6 md:p-8 rounded-2xl bg-white border border-gray-100 hover:border-primary/20 transition-all duration-500 hover:shadow-xl hover:-translate-y-1 animate-fade-in-up animation-delay-${(index + 1) * 200}`}
              >
                {/* Icon */}
                <div className={`w-12 h-12 md:w-14 md:h-14 rounded-xl ${feature.color} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300`}>
                  <Icon className="w-6 h-6 md:w-7 md:h-7" />
                </div>

                {/* Content */}
                <h3 className="text-lg md:text-xl font-semibold text-gray-900 mb-3">
                  {t(`features.${feature.key}.title`)}
                </h3>
                <p className="text-gray-600 text-sm md:text-base leading-relaxed">
                  {t(`features.${feature.key}.description`)}
                </p>
              </div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-16 md:mt-20">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-primary hover:text-primary/80 font-medium transition-colors duration-300"
            aria-label={t('cta.docs')}
          >
            <span>{t('cta.docs')}</span>
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </section>
  );
};
