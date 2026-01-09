# UIデザインシステム

## デザインシステム概要
- **ベース**: shadcn/ui + Radix UI
- **スタイリング**: Tailwind CSS
- **テーマ**: CSS Variables による動的テーマ切り替え
- **レスポンシブ**: モバイルファースト設計

## コンポーネントライブラリ

### shadcn/ui コンポーネント (`src/components/ui/`)
Radix UIベースの高品質なプリミティブコンポーネント

**主要コンポーネント:**
- **Button** - プライマリ、セカンダリ、デストラクティブ等のバリアント
- **Card** - コンテンツカード（Header, Content, Footer）
- **Table** - データテーブル
- **Form** - React Hook Form統合フォーム
- **Dialog** - モーダルダイアログ
- **Select, Input, Textarea** - フォーム要素
- **Badge** - ステータス表示
- **Progress** - プログレスバー
- **Tabs** - タブナビゲーション
- **Alert** - 通知・警告表示

### カスタムコンポーネント
**レイアウト:**
- `Header.tsx` - グローバルヘッダー
- `Footer.tsx` - グローバルフッター
- `DashboardLayout.tsx` - ダッシュボードレイアウト

**機能別:**
- `HeroSection.tsx` - ランディングページヒーロー
- `MarketTable.tsx` - 市場データテーブル
- `HowItWorks.tsx` - 使い方説明セクション

## テーマシステム

### 設定ファイル (`tailwind.config.ts`)
```typescript
theme: {
  extend: {
    colors: {
      // CSS Variables による動的カラー
      primary: "hsl(var(--primary))",
      secondary: "hsl(var(--secondary))",
      background: "hsl(var(--background))",
      foreground: "hsl(var(--foreground))",
      // ... その他のカラー定義
    }
  }
}
```

### CSS Variables (`src/index.css`)
```css
:root {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --primary: 210 40% 98%;
  --primary-foreground: 222.2 84% 4.9%;
  /* ... */
}

[data-theme="light"] {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  /* ... */
}
```

### テーマ切り替え
- **ライブラリ**: `next-themes`
- **方式**: `class` ベースの切り替え
- **保存**: localStorage に設定保持

## 取引所特化デザイン

### カスタムCSSクラス (`src/index.css`)
```css
/* 取引カード用のグラデーション */
.trading-card {
  @apply border-border/50 bg-card/50 backdrop-blur-sm;
}

/* ヒーローボタンのアニメーション */
.hero-button {
  @apply relative overflow-hidden bg-primary text-primary-foreground;
}

/* 暗号資産のグロー効果 */
.crypto-glow {
  @apply shadow-lg shadow-primary/20;
}
```

### 取引所UIパターン
- **価格表示**: 上昇緑、下降赤の統一カラー
- **グラデーション**: カードとボタンの微細なグラデーション
- **バックドロップフィルター**: 半透明効果でプレミアム感演出

## レスポンシブデザイン

### ブレークポイント
```css
sm: '640px'   /* スマートフォン横向き */
md: '768px'   /* タブレット */
lg: '1024px'  /* デスクトップ */
xl: '1280px'  /* 大画面デスクトップ */
2xl: '1536px' /* 超大画面 */
```

### モバイルファースト設計
- 基本サイズはモバイル
- `md:`, `lg:` 等で大画面対応
- タッチフレンドリーなサイズ設計

### ダッシュボードレスポンシブ
- **モバイル**: サイドバー折りたたみ
- **デスクトップ**: 固定サイドバー
- **テーブル**: 水平スクロール対応

## 入金UIパターン（フェーズ1）

- チェーンバッジ: BTC/ETH/TRC/XRP/USDT/ADA の有効・準備中をバッジで明示。
- アドレス表示: モノスペース、コピー用アイコン、QRコード。長押しコピーに最適化。
- 確認数: 必要確認数の注記（例: ETH 12 confirmations）。
- 警告/注意: 誤チェーン送付、メモ/タグ必須（XRP/TRON など）、反映までの目安時間。
- 空状態: まだ入金がない場合のイラスト/ガイダンス。

## アイコンシステム

### Lucide React
```typescript
import { 
  Wallet, TrendingUp, Shield, User, 
  Settings, LogOut, Menu, X 
} from "lucide-react";
```

**特徴:**
- 軽量で一貫したデザイン
- 完全にカスタマイズ可能
- TypeScript 完全対応

## グラフ・チャート

### Recharts統合
```typescript
import { 
  AreaChart, Area, XAxis, YAxis, 
  CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
```

**用途:**
- 価格チャート（`/trade`）
- 統計グラフ（ダッシュボード）
- 資産推移グラフ

## フォームデザイン

### React Hook Form + Zod
```typescript
const form = useForm<FormData>({
  resolver: zodResolver(formSchema),
  defaultValues: { /* ... */ }
});
```

**統一パターン:**
- Label + Input の組み合わせ
- エラー表示の統一スタイル
- ローディング状態の表示
- 送信ボタンの無効化制御

## アニメーション

### Tailwind CSS Animate
```css
/* 設定済みアニメーション */
animate-spin, animate-pulse, animate-bounce
animate-fade-in, animate-slide-up /* カスタム */
```

### インタラクション
- ホバーエフェクト
- クリックフィードバック
- ローディングアニメーション
- スムーズトランジション

## アクセシビリティ

### Radix UI の恩恵
- キーボードナビゲーション
- スクリーンリーダー対応
- ARIA属性の自動設定
- フォーカス管理

### 追加考慮事項
- 色のコントラスト比
- フォントサイズの調整可能性  
- タッチターゲットサイズ
