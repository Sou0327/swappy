import { useEffect, useRef } from "react";

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export const AnimatedCounter = ({ 
  value, 
  duration = 2000, 
  decimals = 0, 
  prefix = "", 
  suffix = "",
  className = "" 
}: AnimatedCounterProps) => {
  const counterRef = useRef<HTMLSpanElement>(null);
  const animationRef = useRef<{ pause: () => void } | null>(null);

  useEffect(() => {
    const loadAnime = async () => {
      if (!counterRef.current) return;

      try {
        const mod = await import('animejs');
        const anime = mod.default || mod;

        // animeが関数かチェック
        if (typeof anime !== 'function') {
          throw new Error('anime is not a function');
        }

        // 前のアニメーションを停止
        if (animationRef.current) {
          animationRef.current.pause();
        }

        const obj = { count: 0 };

        animationRef.current = anime({
          targets: obj,
          count: value,
          duration,
          easing: 'easeOutExpo',
          round: 1,
          update: () => {
            if (counterRef.current) {
              const displayValue = decimals > 0
                ? obj.count.toFixed(decimals)
                : Math.floor(obj.count).toLocaleString();
              counterRef.current.textContent = `${prefix}${displayValue}${suffix}`;
            }
          }
        });
      } catch (error) {
        console.warn('Animation library failed, using direct display:', error);
        // アニメーションが失敗した場合は直接値を表示
        if (counterRef.current) {
          const displayValue = decimals > 0
            ? value.toFixed(decimals)
            : Math.floor(value).toLocaleString();
          counterRef.current.textContent = `${prefix}${displayValue}${suffix}`;
        }
      }
    };

    loadAnime();

    return () => {
      if (animationRef.current) {
        animationRef.current.pause();
      }
    };
  }, [value, duration, decimals, prefix, suffix]);

  return <span ref={counterRef} className={className}>0</span>;
};

export default AnimatedCounter;