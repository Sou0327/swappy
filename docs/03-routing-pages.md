# Routing and Page Specifications

## Route Configuration (`src/App.tsx`)

### Public Pages
| Path | Component | Description |
|------|-----------|-------------|
| `/` | `Index.tsx` | Landing page |
| `/auth` | `Auth.tsx` | Login / Sign up |
| `/redirect` | `AuthRedirect.tsx` | Role-based redirect after authentication |
| `/features` | `Features.tsx` | Feature introduction |
| `/about` | `About.tsx` | About us |
| `/markets` | `Markets.tsx` | Market information |
| `/trade` | `Trade.tsx` | Trading screen |
| `*` | `NotFound.tsx` | 404 error page |

### Authenticated Pages
| Path | Component | Description |
|------|-----------|-------------|
| `/dashboard` | `Dashboard.tsx` | User dashboard |
| `/wallet` | `WalletOverview.tsx` | Wallet overview |
| `/deposit` | `Deposit.tsx` | Deposit (Phase 1: Detection only. Supports BTC/ETH/TRC/XRP/USDT/ADA) |
| `/withdraw` | `Withdraw.tsx` | Withdrawal |
| `/convert` | `Convert.tsx` | Exchange |
| `/history` | `FinancialHistory.tsx` | Transaction history |
| `/security` | `SecuritySettings.tsx` | Security settings (2FA/phishing/recovery hidden. Password change and freeze only) |
| `/kyc` | `KYC.tsx` | KYC verification |
| `/my-account` | `MyAccount.tsx` | Account settings |
| `/support` | `Support.tsx` | Support |
| `/my-page` | `MyPage.tsx` | My page (redirects to `/dashboard`) |

### Admin-Only Pages
| Path | Component | Description | Protection |
|------|-----------|-------------|------------|
| `/admin` | `AdminDashboard.tsx` | Admin dashboard | Protected by `AdminRoute` |
| `/admin/deposits/settings` | `AdminDepositSettings.tsx` | Chain acceptance switch and confirmation settings | `AdminRoute` |

## Authentication Flow

### Authentication State Management
- `AuthContext` manages user state and role information
- `onAuthStateChange` monitors Supabase authentication state
- Role information is fetched from `user_roles` table

### Redirect Processing (`/redirect`)
1. **Admin (`admin`)**: Redirect to `/admin`
2. **Regular User**: Redirect to `/dashboard`
3. **Unauthenticated**: Redirect to `/auth`

### Route Protection
- `AdminRoute`: Non-admins are redirected to `/dashboard`
- Unauthenticated users are redirected to `/auth`

## Page Detailed Specifications

### Landing Page (`/`)
- **Components**: `Header`, `HeroSection`, `MarketTable`, `HowItWorks`, `Footer`
- **Features**: Product introduction, market data display, how-to guide

### Authentication Page (`/auth`)
- **Authentication Method**: Email + Password (Supabase Auth)
- **Features**: Login, sign up, validation
- **On Registration**: Saves `full_name` to metadata
- **On Success**: Navigate to `/redirect`

### Dashboard (`/dashboard`)
- **Features**:
  - User information display
  - Total assets display (`user_assets` aggregation)
  - Navigation to main features (deposit, trading, etc.)
  - Chain acceptance status badges (e.g., ETH: Enabled / BTC: Coming Soon)

### Admin Panel (`/admin`)
- **Tab Structure**:
  - User management (`profiles` + `user_roles`)
  - Deposit management (`deposits`)
  - Withdrawal management (`withdrawals`)
  - Asset management (`user_assets`)
  - Chain settings (`/admin/deposits/settings`)
- **Features**:
  - Approve/reject deposits and withdrawals
  - Inline balance editing
  - User role management

## Layout Components

### Common Header (`Header.tsx`)
- Navigation menu
- User authentication status display
- Responsive design

### Dashboard Layout (`DashboardLayout.tsx`)
- Sidebar navigation
- Top bar
- Sign out functionality
- Mobile support (collapsible sidebar)

### Footer (`Footer.tsx`)
- Link collection
- Company information
- Social media links

## Deposit Page Details (`/deposit`)

- Chain/Asset Selection: Displays `BTC`, `ETH`, `USDT(ERC-20/TRC-20)`, `TRX`, `XRP`, `ADA`.
- Receiving Address Display: User-specific address (EVM/TRON/ADA from HD derivation, BTC from xpub derivation, XRP is fixed address + Destination Tag) with QR code.
- Confirmation Count Display: Reflects `VITE_DEPOSIT_MIN_CONFIRMATIONS_*` from `.env` (e.g., ETH=12, BTC=3, XRP=1, TRON=19, ADA=15).
- Warnings/FAQ: Wrong chain transfer warning, XRP Tag requirement, TRON/ADA finality, estimated deposit reflection time.
- History: Fetches and displays own deposit history from `deposits`.

## Account Settings (`/my-account`)

- Basic Information: Only full name is editable (birthday and bio removed).
- Avatar: No image upload (static display).

## Security Settings (`/security`)

- 2FA/Anti-phishing Code/Recovery Keys: Out of scope for this phase (hidden in UI).
- Password: Supports login password change.
- Account Freeze: Provides freeze operation UI.

Recommended Minimum Deposit Amounts
- BTC: 0.0001-0.001 BTC (minimum 0.0001)
- ETH: 0.01-0.05 ETH (minimum 0.01)
- XRP: 20-50 XRP (minimum 20, Destination Tag required)
- TRON(TRX): 10-100 TRX (minimum 10, ~19 blocks for finality)
- ADA: 1-10 ADA (minimum 1, aggregation may vary due to UTXO)
