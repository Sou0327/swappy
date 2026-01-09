import { useEffect, useRef } from 'react';

interface Props {
  symbol: string; // 例: BTCUSDT, ETHUSDT など
  interval?: string; // 1, 15, 60, 240, D など
  theme?: 'light' | 'dark';
  autosize?: boolean;
  height?: number;
}

declare global {
  interface Window { 
    TradingView?: {
      widget: new (config: unknown) => void;
    }
  }
}

export default function TradingViewWidget({ symbol, interval = '60', theme = 'light', autosize = true, height = 800 }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const containerIdRef = useRef<string>();

  // containerIdを一度だけ生成し、固定する
  if (!containerIdRef.current) {
    containerIdRef.current = `tradingview_${symbol.replace(':', '_')}_${Date.now()}`;
  }
  const containerId = containerIdRef.current;

  useEffect(() => {
    let isComponentMounted = true;
    let widgetInstance: { remove?: () => void } | null = null;

    const initWidget = () => {
      if (!window.TradingView || !container.current || !isComponentMounted) {
        console.log('🔄 [TradingView] 初期化条件が揃っていません', {
          TradingView: !!window.TradingView,
          container: !!container.current,
          mounted: isComponentMounted
        });
        return;
      }

      try {
        // DOM要素が完全にレンダリングされるまで待機
        requestAnimationFrame(() => {
          if (!container.current || !isComponentMounted) return;

          console.log('🎯 [TradingView] ウィジェット初期化開始', { symbol, containerId });

          // 既存のウィジェットを安全にクリア
          const containerElement = container.current;
          if (containerElement) {
            containerElement.innerHTML = '';

            // DOM要素のID設定を確実にする
            containerElement.id = containerId;

            // DOMが完全に準備されることを確実にする追加の待機
            setTimeout(() => {
              if (!isComponentMounted || !container.current) return;

              // document.getElementById でも取得できることを確認
              const domElement = document.getElementById(containerId);
              if (!domElement) {
                console.error('❌ [TradingView] container_idで要素が見つかりません:', containerId);
                return;
              }

              // parentNode の存在確認
              if (!domElement.parentNode) {
                console.error('❌ [TradingView] DOM要素のparentNodeがnullです');
                return;
              }

              console.log('✅ [TradingView] DOM要素検証完了', {
                elementFound: !!domElement,
                hasParentNode: !!domElement.parentNode,
                isConnected: domElement.isConnected,
                tagName: domElement.tagName
              });

              try {
                widgetInstance = new window.TradingView.widget({
                  symbol,
                  interval,
                  theme,
                  width: '100%',
                  height: height,
                  container_id: containerId,
                  timezone: 'Etc/UTC',
                  hide_top_toolbar: false,
                  withdateranges: true,
                  hide_side_toolbar: false,
                  allow_symbol_change: true,
                  studies: [],
                  locale: 'ja',
                  save_image: false,
                  toolbar_bg: '#f1f3f6',
                  enable_publishing: false,
                  hide_legend: false,
                  autosize: false,
                  fullscreen: false,
                  show_popup_button: false,
                });
                console.log('✅ [TradingView] ウィジェット作成成功', { symbol, containerId });
              } catch (widgetError) {
                console.error('❌ [TradingView] ウィジェット作成エラー:', widgetError);
                console.error('❌ [TradingView] エラー詳細:', {
                  message: widgetError.message,
                  stack: widgetError.stack,
                  containerId,
                  domElement: !!domElement,
                  parentNode: !!domElement?.parentNode
                });
              }
            }, 100); // 待機時間を短縮
          }
        });
      } catch (error) {
        console.error('❌ [TradingView] 初期化エラー:', error);
      }
    };

    const loadScript = () => {
      if (!document.getElementById('tradingview-widget-script')) {
        console.log('📦 [TradingView] スクリプト読み込み開始');
        const script = document.createElement('script');
        script.id = 'tradingview-widget-script';
        script.src = 'https://s3.tradingview.com/tv.js';
        script.type = 'text/javascript';
        script.onload = () => {
          console.log('📥 [TradingView] スクリプト読み込み完了');
          setTimeout(initWidget, 50);
        };
        script.onerror = (error) => {
          console.error('❌ [TradingView] スクリプト読み込みエラー:', error);
        };
        document.body.appendChild(script);
      } else {
        console.log('📋 [TradingView] スクリプト既に読み込み済み');
        setTimeout(initWidget, 10);
      }
    };

    loadScript();

    // クリーンアップ関数
    return () => {
      isComponentMounted = false;
      console.log('🧹 [TradingView] コンポーネント クリーンアップ', { symbol, containerId });

      // ウィジェットインスタンスの明示的なクリーンアップ
      if (widgetInstance && typeof widgetInstance.remove === 'function') {
        try {
          widgetInstance.remove();
          console.log('✅ [TradingView] ウィジェットインスタンス削除完了');
        } catch (error) {
          console.warn('⚠️ [TradingView] ウィジェット削除時エラー:', error);
        }
      }

      // DOM要素のクリア
      if (container.current) {
        container.current.innerHTML = '';
      }
    };
  }, [symbol]); // 依存配列を symbol のみに最適化

  return <div id={containerId} ref={container} style={{ width: '100%', height: height, minHeight: height, position: 'relative' }} />;
}

