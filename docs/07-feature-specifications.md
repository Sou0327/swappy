# Feature Specifications

## Implemented Features

### 🔐 Authentication & User Management
**Current Implementation Level: Complete**

- **Sign Up/Login**: Email + Password
- **Role Management**: admin, moderator, user
- **Session Management**: Auto-refresh, persistence
- **Authentication State Monitoring**: Real-time updates

### 📊 Dashboard
**Current Implementation Level: Basic Complete**

- **Total Assets Display**: `user_assets` table aggregation
- **User Information**: Profile display
- **Quick Actions**: Navigation to deposit, trading, security
- **Responsive Layout**: Mobile & desktop support

### 💰 Wallet & Asset Management
**Current Implementation Level: UI Complete, Partial Functionality**

#### Wallet Overview (`/wallet`)
- ✅ Asset list display (from `user_assets`)
- ✅ Search & filtering
- ✅ Hide small balance option
- ✅ Show zero balance for major currencies

#### Deposit Feature (`/deposit`)
- ✅ Coin/network selection UI
- ✅ Receiving address display & QR code
- ✅ FAQ section
- 🔜 Phase 1 implementation: Ethereum ETH/USDT(ERC-20) deposit detection (balance reflected after required confirmations)
- 🔜 Receiving address: User-dedicated EOA (HD allocation assumed). Signing via operational wallet manually.
- ⏸ Sweep/withdrawal: Manual operation (not implemented this phase)
- ⏳ BTC/XRP/TRON: In preparation (sequential addition)

#### Withdrawal Feature (`/withdraw`)
- ✅ Destination address input & validation
- ✅ Amount input & percentage selection
- ✅ XRP tag required input support
- ❌ Actual transfer processing (UI only)
- ❌ Fee calculation

### 📈 Trading Features (Paper Trade Policy)
**Current Implementation Level: UI Complete, Dummy Data / No Real Trades This Phase**

#### Trading Screen (`/trade`)
- ✅ Price chart (Recharts)
- ✅ Order book display
- ✅ Buy/sell order form
- ❌ Real-time price data
- ❌ Actual order processing (simulation substitute this phase)

#### Markets (`/markets`)
- ✅ Asset list table
- ✅ Price & change rate display
- ❌ Real data integration

### 💎 Earn Features
**Current Implementation Level: UI Complete, Functionality Not Implemented**

#### Earn Landing (`/earn`)
- ✅ Staking options display
- ✅ APY & risk information
- ✅ Popular pools list
- ❌ Actual staking processing

#### Earn Overview (`/earn-overview`)
- ✅ Product introduction UI
- ✅ Rate badge display
- ❌ Real data integration

#### Earn History (`/earn-history`)
- ✅ History table UI
- ✅ Period filter
- ❌ Real data (placeholder only)

### 🔄 Convert Feature
**Current Implementation Level: UI Complete, Functionality Not Implemented**

#### Currency Convert (`/convert`)
- ✅ Currency selection & swap UI
- ✅ Rate display area
- ✅ Amount input form
- ❌ Actual rate retrieval
- ❌ Convert processing

### 👥 Referral Feature
**Current Implementation Level: UI Complete, Functionality Not Implemented**

#### Referral Program (`/referral`)
- ✅ Referral link & code display
- ✅ Copy functionality
- ✅ Referral history table (empty state)
- ❌ Referral code generation
- ❌ Reward calculation

### 📋 History & Transaction Records
**Current Implementation Level: UI Complete, Partial Implementation**

#### Financial History (`/history`)
- ✅ Tab interface (deposits, withdrawals, orders, etc.)
- ✅ Filter & search UI
- ❌ Real data display (placeholder)

### 🔒 Security
**Current Implementation Level: Simplified UI**

#### Security Settings (`/security`)
- ✅ Password change form (functional)
- ✅ Account freeze (UI)
- ⏸ 2FA/Anti-phishing code/Recovery keys: Out of scope this phase (UI hidden)

### 👤 Account Management
**Current Implementation Level: Basic Info Only**

#### My Account (`/my-account`)
- ✅ Full name edit (save functional)
- ⏸ Birthday/bio: Removed
- ⏸ Image upload: Not supported (static avatar)

### 🛠️ Admin Features
**Current Implementation Level: Complete**

#### Admin Dashboard (`/admin`)
- ✅ User management (`profiles` + `user_roles`)
- ✅ Deposit management (`deposits` approve/reject)
- ✅ Withdrawal management (`withdrawals` approve/reject)
- ✅ Asset management (`user_assets` inline edit)
- ✅ Role permission checks

## Not Implemented / Limitations (Current Policy Reflected)

### 🚫 Completely Not Implemented
- KYC feature: Optional (ON/OFF from admin panel. Initially OFF)
- Actual cryptocurrency processing: Phased by chain (EVM deposit only first)
- Real-time market data: No WebSocket integration
- Order matching engine: No real trades (simulation substitute)
- Fee calculation: Deposit/withdrawal/trading fees later phase
- Notification system: Email/push notifications
- API rate limiting: No DoS protection

### ⚠️ Partial Implementation / Needs Improvement
- **Environment variables unused**: Supabase client configuration
- **Error handling**: Unified error processing
- **Loading states**: UX improvement on some screens
- **Validation**: Form validation enhancement
- **Internationalization**: Japanese fixed (i18n not introduced)

### 🔄 Data Integration Needed
- **External API integration**: Price data, market information
- **Blockchain integration**: Wallet, transactions
- **Payment system integration**: Fiat deposits
- **KYC service integration**: Identity verification

## Next Development Priority (MVP Restructure: Exchange-Style Wallet)

Reference: See `docs/09-product-roadmap.md`, `docs/10-exchange-functional-spec.md` for details

### 🔴 Highest Priority (P0-P2)
1. Environment variable support/key non-retention: Security correction (P0)
2. EVM deposit introduction: Individual deposit contract → manual sweep operation (P1)
3. Trading UI simulation setup: Pseudo-generation/saving of order book/orders/history (P2)

### 🟠 High Priority (P3-P4)
1. BTC deposit: xpub allocation + PSBT generation (manual signing) (P3)
2. XRP deposit: Single address + Destination Tag (P4)
3. Unified error handling: Common policy for frontend/API

### 🟡 Medium Priority (P5-P7)
1. API keys/signatures/rate limiting (P5)
2. 2FA/withdrawal protection (enhanced protection even with manual operation) (P6)
3. KYC/AML (optional/phased introduction) (P7)

### 🟢 Low Priority (P8-P9)
1. **Observability/audit** (P8)
2. **Internationalization/UX setup** (P9)
3. **Earn/referral extensions**

## MVP Scope (Summary)

- Trading: Paper trade (no real execution). Limit/market/cancel/partial fill in UI expressed via pseudo-transitions
- Ledger: Immutable journal entries for deposits/withdrawals/adjustments, balance query view (no asset movement via trading)
- Deposits/Withdrawals: Phased by chain (P1: EVM, P3: BTC, P4: XRP). Approval/reflection/history manually operated from admin panel

## Single Market Operation
- Supports minimal configuration trading only one unlisted token.
- See `docs/11-single-market-setup.md` for procedures.
