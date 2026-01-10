import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowRight, TrendingUp, Shield, Zap, Play } from "lucide-react";
import { PLATFORM_NAME } from "@/config/branding";
import { useAuth } from "@/contexts/AuthContext";

export const HeroSection = () => {
  const navigate = useNavigate();
  const { isDemoMode } = useAuth();

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
              <span className="block">美しい取引体験を</span>
              <span className="block mt-1 md:mt-2 bg-gradient-to-r from-primary via-primary/80 to-accent bg-clip-text text-transparent">
                {PLATFORM_NAME}で
              </span>
            </h1>

            <p className="text-base sm:text-lg md:text-xl text-gray-600 font-light max-w-xl mx-auto leading-relaxed tracking-wide px-4 animate-fade-in-up animation-delay-200">
              シンプルで直感的。安全で高速。
              <br />
              暗号通貨取引の新しいスタンダード
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 md:gap-6 pt-4 md:pt-6 px-4 animate-fade-in-up animation-delay-400">
            {/* ショーケースモード時は登録ボタンを非表示 */}
            {!isDemoMode && (
              <Button
                size="xl"
                className="w-full sm:w-auto group bg-gray-900 text-white hover:bg-gray-800 rounded-full px-8 md:px-10 py-3 md:py-4 text-base font-medium transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl hover:shadow-gray-900/20 border-0 active:scale-95"
                onClick={() => navigate("/auth")}
              >
                今すぐ始める
                <ArrowRight className="ml-2 md:ml-3 h-4 w-4 group-hover:translate-x-0.5 transition-transform duration-300" />
              </Button>
            )}
            {isDemoMode ? (
              <Button
                size="xl"
                className="w-full sm:w-auto group relative overflow-hidden bg-gradient-to-r from-primary via-accent to-primary bg-[length:200%_100%] animate-[gradient-shift_3s_ease-in-out_infinite] text-white rounded-full px-10 md:px-12 py-4 md:py-5 text-lg font-semibold transition-all duration-500 hover:scale-[1.05] shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/40 border-0 active:scale-95"
                onClick={() => navigate("/dashboard")}
              >
                <Play className="mr-2 md:mr-3 h-5 w-5 fill-current" />
                デモを試す
                <ArrowRight className="ml-2 md:ml-3 h-5 w-5 group-hover:translate-x-1 transition-transform duration-300" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="xl"
                className="w-full sm:w-auto text-base font-light text-gray-600 hover:text-gray-900 transition-all duration-300 hover:bg-transparent rounded-full px-8 md:px-10 py-3 md:py-4 active:scale-95"
                onClick={() => navigate("/markets")}
              >
                マーケットを探索
              </Button>
            )}
          </div>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mt-16 md:mt-20 max-w-5xl mx-auto px-4">
          <div className="group p-4 md:p-6 rounded-2xl bg-white/80 backdrop-blur-sm border border-gray-100 hover:border-primary/30 transition-all duration-500 hover:shadow-lg hover:-translate-y-1 animate-fade-in-up animation-delay-600">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3 md:mb-4 group-hover:bg-primary/20 transition-colors">
              <TrendingUp className="w-5 h-5 md:w-6 md:h-6 text-primary" />
            </div>
            <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-2 md:mb-3">高度な取引ツール</h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              プロレベルのチャート分析から自動取引まで、すべてのツールを一つのプラットフォームで。
            </p>
          </div>

          <div className="group p-4 md:p-6 rounded-2xl bg-white/80 backdrop-blur-sm border border-gray-100 hover:border-primary/30 transition-all duration-500 hover:shadow-lg hover:-translate-y-1 animate-fade-in-up animation-delay-800">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3 md:mb-4 group-hover:bg-primary/20 transition-colors">
              <Shield className="w-5 h-5 md:w-6 md:h-6 text-primary" />
            </div>
            <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-2 md:mb-3">最高水準のセキュリティ</h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              銀行レベルの暗号化と多層防御システムで、あなたの資産を完全に保護します。
            </p>
          </div>

          <div className="group p-4 md:p-6 rounded-2xl bg-white/80 backdrop-blur-sm border border-gray-100 hover:border-primary/30 transition-all duration-500 hover:shadow-lg hover:-translate-y-1 animate-fade-in-up animation-delay-1000">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3 md:mb-4 group-hover:bg-primary/20 transition-colors">
              <Zap className="w-5 h-5 md:w-6 md:h-6 text-primary" />
            </div>
            <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-2 md:mb-3">瞬時の取引実行</h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              最先端のマッチングエンジンにより、ミリ秒単位での高速取引を実現。
            </p>
          </div>
        </div>

      </div>
    </section>
  );
};
