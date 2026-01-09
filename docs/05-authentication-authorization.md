# 認証・認可システム

## 認証システム概要
- **プロバイダー**: Supabase Auth
- **方式**: Email + Password
- **セッション管理**: localStorage + 自動リフレッシュ

## 認証コンポーネント

### AuthContext (`src/contexts/AuthContext.tsx`)
アプリケーション全体の認証状態を管理

**提供する値:**
```typescript
interface AuthContextType {
  user: User | null;           // Supabaseユーザーオブジェクト
  session: Session | null;     // 認証セッション
  loading: boolean;            // 認証状態のロード中
  userRole: string;           // ユーザーのロール ('admin' | 'moderator' | 'user')
  roleLoading: boolean;       // ロール取得中
  signOut: () => Promise<void>; // サインアウト関数
}
```

**機能:**
- `onAuthStateChange` でリアルタイム認証状態監視
- ロール情報の自動取得（`user_roles` テーブル）
- デフォルトロール: `user`（取得失敗時）

### 認証フロー

#### 1. サインアップ
- メール + パスワード + フルネーム
- `full_name` をユーザーメタデータに保存
- メール確認リンク送信
- 成功後: `/redirect` に遷移

#### 2. ログイン
- メール + パスワード
- セッション自動作成
- 成功後: `/redirect` に遷移

#### 3. リダイレクト処理 (`/redirect`)
```typescript
// AuthRedirect.tsx の処理フロー
if (loading || roleLoading) return <LoadingSpinner />
if (!user) return <Navigate to="/auth" />

switch (userRole) {
  case 'admin':
    return <Navigate to="/admin" />
  default:
    return <Navigate to="/dashboard" />
}
```

## 認可システム

### ロール定義
```sql
CREATE TYPE app_role AS ENUM ('admin', 'moderator', 'user');
```

| ロール | 権限 | アクセス可能エリア |
|-------|------|-------------------|
| `admin` | 全機能 + 管理機能 | 全ページ + `/admin` |
| `moderator` | 一般機能 + 一部管理 | 一般ページ（実装予定） |
| `user` | 一般機能のみ | 一般ページ |

## KYC（任意・段階導入）

### 方針
- 現フェーズは「KYC任意」。ONにすると出金や一部機能を制限可能。
- 入金検知のみのフェーズでは、KYC未完了でも入金ページの閲覧/アドレス発行は許可（運用ポリシーで変更可）。

### DDL（提案）
```sql
CREATE TYPE kyc_status AS ENUM ('none','pending','verified','rejected');

ALTER TABLE profiles
  ADD COLUMN kyc_status kyc_status NOT NULL DEFAULT 'none',
  ADD COLUMN kyc_level integer NOT NULL DEFAULT 0; -- 0:未, 1:基本, 2:拡張 等
```

### ルート/機能ゲート
- `.env` の `VITE_FEATURE_KYC_OPTIONAL=true` の場合:
  - 入金: 常に許可（UIに「KYC任意」表示）。
  - 出金: `kyc_status='verified'` のみ許可（UIはガード表示）。
- 将来: KYCプロバイダ連携で `kyc_status` を自動更新。

### ルート保護

#### AdminRoute (`src/components/AdminRoute.tsx`)
管理者専用ページの保護

```typescript
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, userRole, loading, roleLoading } = useAuth();
  
  if (loading || roleLoading) return <LoadingSpinner />
  if (!user) return <Navigate to="/auth" />
  if (userRole !== 'admin') return <Navigate to="/dashboard" />
  
  return <>{children}</>;
};
```

**保護対象:**
- `/admin` - 管理ダッシュボード

#### 一般認証保護
現在は明示的な保護コンポーネントなし（今後の実装候補）

## セキュリティ機能の現在範囲

- 2FA/フィッシング対策コード/回復キー: 本フェーズ対象外（UI非表示）
- パスワード変更: `/security` から実行可能
- アカウント凍結: `/security` にUIを提供（運用判断で機能調整）

## セキュリティ機能

### フロントエンド
- ルートレベルでの認証チェック
- ロールベースのUI表示制御
- 自動セッション管理

### バックエンド (Supabase RLS)
- Row Level Security による厳密なアクセス制御
- テーブルレベルでの認可
- 管理者権限の検証

### セッション管理
```typescript
// client.ts の設定
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,        // セッション永続化
    persistSession: true,         // セッション維持
    autoRefreshToken: true,       // 自動トークンリフレッシュ
  }
});
```

## カスタムフック

### useUserRole
```typescript
// hooks/ で実装（詳細は hooks ドキュメント参照）
const { userRole, loading } = useUserRole();
```

## セキュリティ考慮事項

### 現在の実装
✅ RLSによるデータ保護
✅ フロントエンドでのルート保護  
✅ 自動セッション管理

### 改善点
⚠️ パスワードリセット機能未実装
⚠️ 2FA機能は UI のみ（実装未完了）  
⚠️ セッションタイムアウト設定なし
⚠️ ログイン試行回数制限なし

### 将来の拡張
- OAuth プロバイダー対応
- 2FA (TOTP) 実装
- パスワードリセット機能
- セッション管理の強化
