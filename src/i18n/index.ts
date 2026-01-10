import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// 翻訳リソースのインポート
import enCommon from '@/locales/en/common.json';
import enNavigation from '@/locales/en/navigation.json';
import enDashboard from '@/locales/en/dashboard.json';
import enWallet from '@/locales/en/wallet.json';
import enTrade from '@/locales/en/trade.json';
import enMessages from '@/locales/en/messages.json';
import enAuth from '@/locales/en/auth.json';
import enAccount from '@/locales/en/account.json';
import enEarn from '@/locales/en/earn.json';
import enMarkets from '@/locales/en/markets.json';
import enConvert from '@/locales/en/convert.json';
import enTransfer from '@/locales/en/transfer.json';
import enReferral from '@/locales/en/referral.json';
import enSupport from '@/locales/en/support.json';
import enHistory from '@/locales/en/history.json';
import enKyc from '@/locales/en/kyc.json';
import enSecurity from '@/locales/en/security.json';
import enAnnouncements from '@/locales/en/announcements.json';
import enDemo from '@/locales/en/demo.json';

import jaCommon from '@/locales/ja/common.json';
import jaNavigation from '@/locales/ja/navigation.json';
import jaDashboard from '@/locales/ja/dashboard.json';
import jaWallet from '@/locales/ja/wallet.json';
import jaTrade from '@/locales/ja/trade.json';
import jaMessages from '@/locales/ja/messages.json';
import jaAuth from '@/locales/ja/auth.json';
import jaAccount from '@/locales/ja/account.json';
import jaEarn from '@/locales/ja/earn.json';
import jaMarkets from '@/locales/ja/markets.json';
import jaConvert from '@/locales/ja/convert.json';
import jaTransfer from '@/locales/ja/transfer.json';
import jaReferral from '@/locales/ja/referral.json';
import jaSupport from '@/locales/ja/support.json';
import jaHistory from '@/locales/ja/history.json';
import jaKyc from '@/locales/ja/kyc.json';
import jaSecurity from '@/locales/ja/security.json';
import jaAnnouncements from '@/locales/ja/announcements.json';
import jaDemo from '@/locales/ja/demo.json';

// サポート言語
export const supportedLanguages = ['en', 'ja'] as const;
export type SupportedLanguage = typeof supportedLanguages[number];

// リソース定義
const resources = {
  en: {
    common: enCommon,
    navigation: enNavigation,
    dashboard: enDashboard,
    wallet: enWallet,
    trade: enTrade,
    messages: enMessages,
    auth: enAuth,
    account: enAccount,
    earn: enEarn,
    markets: enMarkets,
    convert: enConvert,
    transfer: enTransfer,
    referral: enReferral,
    support: enSupport,
    history: enHistory,
    kyc: enKyc,
    security: enSecurity,
    announcements: enAnnouncements,
    demo: enDemo,
  },
  ja: {
    common: jaCommon,
    navigation: jaNavigation,
    dashboard: jaDashboard,
    wallet: jaWallet,
    trade: jaTrade,
    messages: jaMessages,
    auth: jaAuth,
    account: jaAccount,
    earn: jaEarn,
    markets: jaMarkets,
    convert: jaConvert,
    transfer: jaTransfer,
    referral: jaReferral,
    support: jaSupport,
    history: jaHistory,
    kyc: jaKyc,
    security: jaSecurity,
    announcements: jaAnnouncements,
    demo: jaDemo,
  },
};

i18n
  // 言語検出プラグイン
  .use(LanguageDetector)
  // React との統合
  .use(initReactI18next)
  // 初期化設定
  .init({
    resources,
    // デフォルト言語
    fallbackLng: 'en',
    // サポート言語のリスト
    supportedLngs: supportedLanguages,
    // デフォルト名前空間
    defaultNS: 'common',
    // 名前空間のリスト
    ns: ['common', 'navigation', 'dashboard', 'wallet', 'trade', 'messages', 'auth', 'account', 'earn', 'markets', 'convert', 'transfer', 'referral', 'support', 'history', 'kyc', 'security', 'announcements', 'demo'],
    // 言語検出の設定
    detection: {
      // 検出順序: localStorage → navigator → デフォルト
      order: ['localStorage', 'navigator'],
      // キャッシュ先
      caches: ['localStorage'],
      // localStorage のキー
      lookupLocalStorage: 'i18nextLng',
    },
    // 補間設定
    interpolation: {
      // React は XSS 対策が組み込まれているので、エスケープ不要
      escapeValue: false,
    },
    // React Suspense との統合（非同期読み込み時）
    react: {
      useSuspense: false,
    },
  });

export default i18n;
