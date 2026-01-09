import { UserPlus, Wallet, TrendingUp } from "lucide-react";
import { useEffect, useRef } from "react";

export const HowItWorks = () => {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Intersection Observer でスクロールイン時にアニメーション
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(async (entry) => {
          if (entry.isIntersecting) {
            const animeModule = await import('animejs') as { default?: typeof import('animejs') };
            const anime = animeModule.default || animeModule;

            // 初期状態を設定
            anime.set(['.step-header', '.step-card'], {
              opacity: 0,
              translateY: 60,
            });

            // タイムライン作成
            const timeline = anime.timeline({
              easing: 'easeOutExpo',
            });

            timeline
              .add({
                targets: '.step-header',
                opacity: 1,
                translateY: 0,
                duration: 1000,
              })
              .add({
                targets: '.step-card',
                opacity: 1,
                translateY: 0,
                duration: 800,
                delay: (anime as typeof import('animejs')).stagger(300),
              }, '-=600');

            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);
  const steps = [
    {
      icon: UserPlus,
      title: "アカウント作成",
      description: "メールアドレスだけで数分でサインアップ"
    },
    {
      icon: Wallet,
      title: "ウォレットに入金",
      description: "暗号通貨を入金するかクレジットカードで購入"
    },
    {
      icon: TrendingUp,
      title: "取引を開始",
      description: "リアルタイムマーケットで瞬時に取引実行"
    },
  ];

  return (
    <section ref={sectionRef} className="py-16 md:py-24 bg-white">
      <div className="container mx-auto px-4 md:px-8">
        <div className="step-header text-center mb-12 md:mb-20">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-light text-gray-900 mb-4 md:mb-6 tracking-tight px-2">
            シンプルな
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent font-medium">
              3ステップ
            </span>
          </h2>
          <p className="text-base md:text-lg text-gray-600 font-light max-w-2xl mx-auto leading-relaxed px-4">
            暗号通貨取引を始めて、収益を生み出すまでの流れをご紹介します
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8 max-w-6xl mx-auto">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={index} className="step-card relative text-center group">
                <div className="relative">
                  {/* Step Number */}
                  <div className="absolute -top-3 -right-3 w-8 h-8 bg-primary text-white text-sm font-medium rounded-full flex items-center justify-center z-10">
                    {index + 1}
                  </div>

                  {/* Card */}
                  <div className="bg-white rounded-3xl p-6 md:p-8 border border-gray-100 hover:border-primary/20 transition-all duration-500 hover:shadow-xl hover:-translate-y-2 group-hover:bg-gradient-to-b group-hover:from-white group-hover:to-gray-50/30">

                    {/* Icon */}
                    <div className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-4 md:mb-6 bg-gradient-to-br from-primary/10 to-accent/10 rounded-2xl flex items-center justify-center group-hover:from-primary/20 group-hover:to-accent/20 transition-all duration-500">
                      <Icon className="w-6 h-6 md:w-8 md:h-8 text-primary group-hover:scale-110 transition-transform duration-300" />
                    </div>

                    {/* Content */}
                    <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-2 md:mb-3">
                      {step.title}
                    </h3>
                    <p className="text-gray-600 text-sm leading-relaxed font-light">
                      {step.description}
                    </p>
                  </div>

                  {/* Connection Arrow */}
                  {index < steps.length - 1 && (
                    <div className="hidden lg:block absolute top-1/2 -right-4 w-8 h-8 z-20">
                      <div className="w-full h-0.5 bg-gradient-to-r from-primary/60 to-transparent"></div>
                      <div className="absolute right-0 top-1/2 w-2 h-2 bg-primary rounded-full transform -translate-y-1/2"></div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Call to Action */}
        <div className="text-center mt-12 md:mt-16 px-4">
          {/* Desktop Layout */}
          <div className="hidden md:inline-flex items-center gap-6 bg-gradient-to-r from-gray-50 to-white rounded-2xl p-6 border border-gray-100">
            <div className="flex items-center gap-3 text-sm text-gray-700">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="font-medium">KYC不要で即開始</span>
            </div>
            <div className="w-px h-4 bg-gray-200"></div>
            <div className="flex items-center gap-3 text-sm text-gray-700">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              <span className="font-medium">24時間365日サポート</span>
            </div>
            <div className="w-px h-4 bg-gray-200"></div>
            <div className="flex items-center gap-3 text-sm text-gray-700">
              <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
              <span className="font-medium">即時入出金</span>
            </div>
          </div>

          {/* Mobile Layout */}
          <div className="md:hidden bg-gradient-to-r from-gray-50 to-white rounded-2xl p-4 border border-gray-100 space-y-3">
            <div className="flex items-center gap-3 text-sm text-gray-700 justify-center">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="font-medium">KYC不要で即開始</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-700 justify-center">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              <span className="font-medium">24時間365日サポート</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-700 justify-center">
              <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
              <span className="font-medium">即時入出金</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};