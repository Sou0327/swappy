import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Play, Github, Layers, KeyRound, Palette } from "lucide-react";
import { GITHUB_URL } from "@/config/branding";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";

export const HeroSection = () => {
  const navigate = useNavigate();
  const { isDemoMode, enterDemoMode } = useAuth();
  const { t } = useTranslation('landing');

  const handleTryDemo = () => {
    enterDemoMode();
    navigate("/dashboard");
  };

  return (
    <section className="relative pt-20 pb-16 md:pt-16 md:pb-24 min-h-screen flex items-center overflow-hidden bg-white">
      {/* Subtle Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-white via-gray-50/30 to-white"></div>
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[300px] h-[150px] md:w-[600px] md:h-[300px] bg-primary/5 rounded-full blur-3xl"></div>

      <div className="container mx-auto px-4 md:px-8 relative z-10">
        {/* Centered Content */}
        <div className="text-center space-y-8 md:space-y-12 max-w-4xl mx-auto">
          {/* Main Heading */}
          <div className="space-y-6 md:space-y-8">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-light text-gray-900 leading-tight tracking-tight px-2 animate-fade-in-up">
              <span className="block">{t('hero.title')}</span>
              <span className="block mt-1 md:mt-2 bg-gradient-to-r from-primary via-primary/80 to-accent bg-clip-text text-transparent">
                {t('hero.titleHighlight')}
              </span>
            </h1>

            <p className="text-base sm:text-lg md:text-xl text-gray-600 font-light max-w-xl mx-auto leading-relaxed tracking-wide px-4 animate-fade-in-up animation-delay-200">
              {t('hero.subtitle')}
              <br />
              {t('hero.subtitleSecond')}
            </p>
          </div>

          {/* Tech Badges */}
          <div className="flex flex-wrap items-center justify-center gap-3 md:gap-4 px-4 animate-fade-in-up animation-delay-300">
            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              {t('badges.license')}
            </span>
            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {t('badges.typescript')}
            </span>
            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-cyan-100 text-cyan-800">
              {t('badges.react')}
            </span>
            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
              {t('badges.supabase')}
            </span>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 md:gap-6 pt-4 md:pt-6 px-4 animate-fade-in-up animation-delay-400">
            {/* Primary CTA: Try Demo */}
            <Button
              size="xl"
              className="w-full sm:w-auto group relative overflow-hidden bg-gradient-to-r from-primary via-accent to-primary bg-[length:200%_100%] animate-[gradient-shift_3s_ease-in-out_infinite] text-white rounded-full px-10 md:px-12 py-4 md:py-5 text-lg font-semibold transition-all duration-500 hover:scale-[1.05] shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/40 border-0 active:scale-95"
              onClick={handleTryDemo}
            >
              <Play className="mr-2 md:mr-3 h-5 w-5 fill-current" />
              {t('hero.tryDemo')}
              <ArrowRight className="ml-2 md:ml-3 h-5 w-5 group-hover:translate-x-1 transition-transform duration-300" />
            </Button>

            {/* Secondary CTA: GitHub */}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto"
            >
              <Button
                variant="outline"
                size="xl"
                className="w-full group text-base font-medium text-gray-700 hover:text-gray-900 border-gray-200 hover:border-gray-300 hover:bg-gray-50 rounded-full px-8 md:px-10 py-3 md:py-4 transition-all duration-300 active:scale-95"
              >
                <Github className="mr-2 md:mr-3 h-5 w-5" />
                {t('hero.viewOnGithub')}
              </Button>
            </a>
          </div>

          {/* Get Started (for non-demo users) */}
          {!isDemoMode && (
            <div className="animate-fade-in-up animation-delay-500">
              <Button
                variant="ghost"
                size="lg"
                className="text-sm font-light text-gray-500 hover:text-gray-700 transition-all duration-300 hover:bg-transparent"
                onClick={() => navigate("/auth")}
              >
                {t('hero.getStarted')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Feature Cards - OSS Focused */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mt-16 md:mt-20 max-w-5xl mx-auto px-4">
          <div className="group p-4 md:p-6 rounded-2xl bg-white/80 backdrop-blur-sm border border-gray-100 hover:border-primary/30 transition-all duration-500 hover:shadow-lg hover:-translate-y-1 animate-fade-in-up animation-delay-600">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3 md:mb-4 group-hover:bg-primary/20 transition-colors">
              <Layers className="w-5 h-5 md:w-6 md:h-6 text-primary" />
            </div>
            <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-2 md:mb-3">
              {t('featureCards.multiChain.title')}
            </h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              {t('featureCards.multiChain.description')}
            </p>
          </div>

          <div className="group p-4 md:p-6 rounded-2xl bg-white/80 backdrop-blur-sm border border-gray-100 hover:border-primary/30 transition-all duration-500 hover:shadow-lg hover:-translate-y-1 animate-fade-in-up animation-delay-800">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3 md:mb-4 group-hover:bg-primary/20 transition-colors">
              <KeyRound className="w-5 h-5 md:w-6 md:h-6 text-primary" />
            </div>
            <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-2 md:mb-3">
              {t('featureCards.hdWallet.title')}
            </h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              {t('featureCards.hdWallet.description')}
            </p>
          </div>

          <div className="group p-4 md:p-6 rounded-2xl bg-white/80 backdrop-blur-sm border border-gray-100 hover:border-primary/30 transition-all duration-500 hover:shadow-lg hover:-translate-y-1 animate-fade-in-up animation-delay-1000">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3 md:mb-4 group-hover:bg-primary/20 transition-colors">
              <Palette className="w-5 h-5 md:w-6 md:h-6 text-primary" />
            </div>
            <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-2 md:mb-3">
              {t('featureCards.whiteLabel.title')}
            </h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              {t('featureCards.whiteLabel.description')}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
