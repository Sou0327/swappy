/**
 * ブランディング設定（ホワイトラベル対応）
 *
 * このファイルは React コンポーネントから使用します。
 * 環境変数は .env ファイルで設定してください。
 *
 * 例:
 *   VITE_APP_NAME="Your Platform Name"
 *   VITE_APP_TAGLINE="あなたのプラットフォームの説明"
 *   VITE_APP_DOMAIN="yourdomain.com"       # スキーム（https://）なしで指定
 *   VITE_APP_TWITTER="your_twitter"        # @なしで指定
 */

export const BRAND = {
  /** プラットフォーム名 */
  name: import.meta.env.VITE_APP_NAME || 'Swappy',

  /** タグライン（キャッチコピー） */
  tagline: import.meta.env.VITE_APP_TAGLINE || '次世代暗号通貨取引プラットフォーム',

  /** ドメイン名（スキームなし） */
  domain: import.meta.env.VITE_APP_DOMAIN || 'swappy.example.com',

  /** Twitter ユーザー名（@なし） */
  twitter: import.meta.env.VITE_APP_TWITTER || 'swappy_official',

  /** フル URL（https:// 付き） */
  get url(): string {
    return `https://${this.domain}`;
  },

  /** Twitter URL */
  get twitterUrl(): string {
    return `https://twitter.com/${this.twitter}`;
  },

  /** Twitter ハンドル（@ 付き） */
  get twitterHandle(): string {
    return `@${this.twitter}`;
  },

  /** タイトル（SEO 用） */
  get title(): string {
    return `${this.name} - ${this.tagline}`;
  },

  /** 説明文（SEO 用） */
  get description(): string {
    return `${this.name}で暗号通貨を取引、運用、変換しましょう - ウォレット内蔵、リアルタイム流動性を備えた次世代取引プラットフォーム`;
  },
} as const;

// GitHub リポジトリ URL
export const GITHUB_URL = import.meta.env.VITE_GITHUB_URL || "https://github.com/Sou0327/swappy";

// 個別エクスポート（コンポーネントでの使いやすさのため）
export const PLATFORM_NAME = BRAND.name;
export const PLATFORM_TAGLINE = BRAND.tagline;
export const PLATFORM_DOMAIN = BRAND.domain;
export const PLATFORM_URL = BRAND.url;
export const PLATFORM_TWITTER = BRAND.twitter;
export const PLATFORM_TWITTER_URL = BRAND.twitterUrl;
export const PLATFORM_TWITTER_HANDLE = BRAND.twitterHandle;

export default BRAND;
