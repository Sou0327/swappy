import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { createHtmlPlugin } from "vite-plugin-html";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // .env ファイルを読み込み（第3引数 '' で VITE_ 以外も読める）
  const env = loadEnv(mode, process.cwd(), '');

  return {
    server: {
      host: "::",
      port: 8080,
      proxy: {
        // Dev-only proxy to avoid CORS for local Supabase Function
        '/binance-proxy': {
          target: 'http://127.0.0.1:54321/functions/v1/binance-proxy',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/binance-proxy/, ''),
          secure: false,
        },
        // HDWallet Edge Functions proxy
        '/functions/v1': {
          target: 'http://127.0.0.1:54321',
          changeOrigin: true,
          secure: false,
        }
      }
    },
    plugins: [
      react(),
      mode === 'development' && componentTagger(),
      // ブランディング用HTML テンプレート処理
      createHtmlPlugin({
        inject: {
          data: {
            // loadEnv で読み込んだ環境変数を使用
            VITE_APP_NAME: env.VITE_APP_NAME || 'Swappy',
            VITE_APP_TAGLINE: env.VITE_APP_TAGLINE || '次世代暗号通貨取引プラットフォーム',
            VITE_APP_DOMAIN: env.VITE_APP_DOMAIN || 'swappy.example.com',
            VITE_APP_TWITTER: env.VITE_APP_TWITTER || 'swappy_official',
          },
        },
      }),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
