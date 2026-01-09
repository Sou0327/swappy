# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 重要：このプロジェクトでは日本語で返答してください
このコードベースは日本語圏のユーザー向けの金融取引プラットフォームです。UIテキストやコメント、エラーメッセージなどはすべて日本語で記述し、Claude Codeとの会話も日本語で行ってください。

## Essential Commands

### Development
- `npm run dev` - Start development server (runs on port 8080)
- `npm run build` - Production build
- `npm run build:dev` - Development mode build
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

### Package Management
- `npm i` - Install dependencies

### Supabase CLI
Supabase CLIはローカル開発環境の管理とデータベース操作に使用します。

#### ローカル開発環境
- `supabase start` - ローカルSupabase環境を起動（Docker必須）
- `supabase stop` - ローカル環境を停止
- `supabase status` - ローカル環境のステータス確認

#### データベース操作
- `supabase db reset` - データベースをリセット（seed.sql適用）
- `supabase db diff` - スキーマの差分を確認
- `supabase db push` - ローカルマイグレーションをリモートに適用

#### マイグレーション
- `supabase migration new <name>` - 新しいマイグレーションファイルを作成
- `supabase migration list` - マイグレーション一覧を表示
- `supabase migration up` - 未適用のマイグレーションを適用

#### Edge Functions
- `supabase functions serve` - 全Edge Functionsをローカルで実行
- `supabase functions serve <function-name>` - 特定のFunctionを実行
- `supabase functions deploy <function-name>` - Functionをデプロイ

#### 型生成
- `supabase gen types typescript --local > src/integrations/supabase/types.ts` - ローカルDBから型を生成
- `supabase gen types typescript --linked` - リンクされたプロジェクトから型を生成

#### プロジェクト管理
- `supabase link --project-ref <project-id>` - リモートプロジェクトにリンク
- `supabase projects list` - プロジェクト一覧を表示

#### 参考リンク
- [Supabase CLI公式ドキュメント](https://supabase.com/docs/guides/cli)
- [GitHub: supabase/cli](https://github.com/supabase/cli)

## Architecture Overview

This is a React-based trading/financial platform built with:

### Core Technologies
- **Vite** - Build tool and dev server
- **React 18** - Frontend framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui** - UI component library based on Radix UI
- **React Router** - Client-side routing

### Key Integrations
- **Supabase** - Backend as a service (auth, database, real-time)
- **TanStack Query** - Server state management
- **React Hook Form + Zod** - Form handling and validation
- **next-themes** - Dark/light mode support

### Project Structure

#### Core Directories
- `src/pages/` - Route components (dashboard, trading, auth, etc.)
- `src/components/` - Reusable components and layouts
- `src/components/ui/` - shadcn/ui components (buttons, cards, forms, etc.)
- `src/contexts/` - React context providers (AuthContext)
- `src/hooks/` - Custom React hooks
- `src/integrations/supabase/` - Supabase client and type definitions
- `src/lib/` - Utility functions

#### Authentication System
- Uses Supabase Auth with role-based access control
- `AuthContext` provides user state and role information
- `AdminRoute` component for protecting admin-only routes
- User roles: 'admin', 'moderator', 'user'

#### Layout Architecture
- `DashboardLayout` - Main authenticated layout with sidebar navigation
- Responsive design with mobile-first approach
- Fixed header with collapsible sidebar on mobile

#### Key Features
- Multi-currency trading platform
- Wallet management (deposits, withdrawals, conversions)
- Earning/staking functionality
- User referral system
- Admin dashboard for platform management
- Financial transaction history

## Configuration Notes

### TypeScript
- Relaxed configuration with `noImplicitAny: false` and `strictNullChecks: false`
- Path aliases configured: `@/` maps to `./src/`

### ESLint
- TypeScript ESLint with React hooks and refresh plugins
- `@typescript-eslint/no-unused-vars` disabled

### Styling
- Tailwind with custom theme extending shadcn/ui design system
- CSS variables for theming (`--primary`, `--background`, etc.)
- Dark mode support via class-based toggling

### Database Schema
- Supabase PostgreSQL database
- Key tables include: deposits, withdrawals, user_roles, transactions
- Migration files in `supabase/migrations/`

## Development Patterns

### Component Conventions
- Use functional components with hooks
- Implement responsive design with Tailwind breakpoints
- Follow shadcn/ui patterns for consistent styling
- Use React Hook Form for complex forms with Zod validation

### State Management
- TanStack Query for server state
- React Context for global app state (auth, theme)
- Local state with useState for component-specific data

### Routing
- All routes defined in `App.tsx`
- Protected routes use authentication guards
- Admin routes require specific role permissions

## コーディング原則

### YAGNI (You Aren't Gonna Need It)
- 将来使うかもしれない機能は実装しない
- 現在の要件に集中し、必要になった時点で機能を追加する
- 過度な抽象化や汎用化を避ける
- mcpのserenaツールを必ず使用して修正・調査を行ってください、ただしfind_symbolツールはうまく作動しないので使用しないでください

### DRY (Don't Repeat Yourself)
- 重複コードは必ず関数化・モジュール化する
- 共通ロジックはカスタムフックやユーティリティ関数に抽出
- コンポーネントの再利用可能性を重視する

### TDD (Test-Driven Development) - 必須実装方針
- **テストファースト開発の徹底**：すべての新機能・修正は必ずテストを先に作成してから実装する
- **TDD実装フロー**：
  1. 仕様を確認・理解する
  2. 仕様に基づいてテストを作成する
  3. テストを実行して失敗することを確認する（Red）
  4. テストが通るように実装を作成する（Green）
  5. テストが通ることを確認しながらコードをリファクタリングする（Refactor）
  6. すべてのテストが合格するまで3-5を繰り返す

- **テストファイルの配置ルール**：
  - ユニットテスト：`src/__tests__/unit/` 配下にディレクトリ構造を作成
    - hooks: `src/__tests__/unit/hooks/`
    - lib: `src/__tests__/unit/lib/`
  - コンポーネント・ページテスト：対象ファイルと同じディレクトリに配置
    - 例：`src/pages/Transfer.tsx` → `src/pages/Transfer.test.tsx`

- **使用ツール**：
  - テストランナー：Vitest
  - Reactコンポーネントテスト：@testing-library/react
  - ユーザーイベント：@testing-library/user-event
  - APIモック：MSW (Mock Service Worker)
  - E2Eテスト：Playwright

- **テスト実行コマンド**：
  - `npm test` - 開発モード（ウォッチモード）
  - `npm run test:run` - 一回実行（CI向け）
  - `npm run test:coverage` - カバレッジ取得
  - `npm run test:ui` - Vitest UIダッシュボード

- **テストの種類**：
  - ユニットテスト：関数、hooks、ユーティリティの単体テスト
  - 統合テスト：コンポーネント、複数モジュールの連携テスト
  - E2Eテスト：ユーザーフロー全体のテスト（Playwright）

##　返答原則
- 質問は日本語でお願いします。
- ログも日本語でください。
- プロジェクトの開発は日本語でお願いします。
- わからないことは推測で答えるのではなくわからないと答えてください

## 注意事項
- 勝手にDBやFuctionやGitをデプロイしないでください