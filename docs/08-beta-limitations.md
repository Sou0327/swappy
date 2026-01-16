# Beta Limitations and Development Roadmap

This document explains current Beta version limitations and future development plans.

## ✅ Core Functionality (Working)

### 1. Self-Custody Wallet Management
- ✅ Generate HD wallet addresses across 5 blockchains (BTC, ETH, XRP, TRX, ADA)
- ✅ BIP-32/39/44 compliant key derivation
- ✅ Secure key management with encrypted wallet roots (client-side only)
- ✅ Role-based access control (Admin/User)
- ✅ **Self-custody architecture**: Users sign transactions in-browser, server never has access to private keys

### 2. Real-time Deposit Detection
- ✅ Blockchain RPC scanning for instant deposit detection
- ✅ Support for Ethereum (ETH + ERC-20), Bitcoin, XRP, TRON, Cardano
- ✅ Automatic confirmation tracking (pending → confirmed)
- ✅ Database recording of all deposits
- ✅ Separate `chain_progress` tracking for ETH and ERC20 tokens

### 3. Withdrawal Flow (Client-Side)
- ✅ Users construct and sign transactions in-browser
- ✅ Transaction broadcasting via browser RPC or wallet extension
- ✅ Server validates and records withdrawals (no signing)
- ✅ Fee estimation and optimization (client-side)
- ✅ **No hot wallet on server**: Users maintain full control

### 4. Price Display
- ✅ Real-time crypto prices via CoinGecko API
- ✅ Multi-asset price tracking (BTC, ETH, USDT, USDC, XRP, TRX, ADA)
- ✅ USD/JPY rate calculation
- ✅ Cached price data to respect rate limits

## 📋 Beta Limitations

### 1. Security Configuration

#### Environment Variables ✅ Addressed
The Supabase client uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from `.env`.
When not configured, appropriate errors are displayed at startup.

```ts
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
```

### 2. Webhook Integration

#### Notification Methods 🔶 In Progress
- Email notifications: Template system implemented, automation in progress
- SMS notifications: Planned
- Push notifications: Planned

## 🔄 Features Under Development

### 1. Additional Notification Channels
- Email template optimization
- SMS integration for withdrawal confirmations
- Push notification support for mobile devices

## 🎨 Planned UX Improvements

### 1. Unified Loading States
- Display during authentication state verification
- Skeleton display during data fetching
- State display during form submission

### 2. Enhanced Error Handling
- Unified display for network errors
- Improved form validation errors
- Enhanced guidance for permission errors

## ⚡ Performance Optimization

### 1. Bundle Size
- Tree-shaking optimization planned
- Load only necessary components

### 2. Rendering Optimization
- Context re-rendering optimization
- Virtualization support for large lists

## 📱 Responsive Design

### 1. Table Display
- Planned improvement for table display on small screens
- Mobile-friendly layouts

### 2. Modals and Dialogs
- Modal size optimization for small screens
- Layout improvements when keyboard is displayed

## 🚫 Current Phase Specifications

### 1. Trading Features
- Provides trading experience in demo mode
- Order and trade data uses demo data
- Balance changes via deposits, withdrawals, and adjustments

### 2. Deposit/Withdrawal Features
- Phased introduction by chain (EVM → BTC → XRP)
- Some chains clearly marked as "Coming Soon"

### 3. Security Features
- 2FA: Planned for future version
- Session timeout: Implementation planned

## 📅 Development Roadmap

### High Priority (Next Release)
1. Unified error handling
2. Unified loading states
3. Responsive table improvements

### Medium Priority (Future Releases)
1. Test framework introduction
2. Performance optimization
3. Routing restructure

### Future Features
1. Complete trading functionality
2. Advanced optimization
3. Scale support

## 📊 Quality Metrics

### Performance
- Bundle size monitoring
- Page load time measurement
- Responsive performance testing

### User Experience
- Improved operation completion rate
- Improved mobile usage rate
- Reduced error rate
