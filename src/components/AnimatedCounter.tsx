import { useEffect, useRef, useCallback } from "react";

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

// easeOutExpo: 最初は速く、終わりに向かって減速
const easeOutExpo = (t: number): number => {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
};

export const AnimatedCounter = ({
  value,
  duration = 2000,
  decimals = 0,
  prefix = "",
  suffix = "",
  className = ""
}: AnimatedCounterProps) => {
  const counterRef = useRef<HTMLSpanElement>(null);
  const animationRef = useRef<number | null>(null);

  const formatValue = useCallback((num: number) => {
    return num.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }, [decimals]);

  useEffect(() => {
    if (!counterRef.current) return;

    // 前のアニメーションをキャンセル
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    const startTime = performance.now();
    const startValue = 0;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // イージング関数を適用
      const easedProgress = easeOutExpo(progress);
      const currentValue = startValue + (value - startValue) * easedProgress;

      if (counterRef.current) {
        counterRef.current.textContent = `${prefix}${formatValue(currentValue)}${suffix}`;
      }

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [value, duration, prefix, suffix, formatValue]);

  return <span ref={counterRef} className={className}>{`${prefix}${formatValue(0)}${suffix}`}</span>;
};

export default AnimatedCounter;
