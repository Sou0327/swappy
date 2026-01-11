# Beta Limitations and Development Roadmap

This document explains the current Beta version limitations and future development plans.

## 📋 Beta Limitations

### 1. Security Configuration

#### Environment Variables ✅ Addressed
The Supabase client uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from `.env`.
When not configured, appropriate errors are displayed at startup.

```ts
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
```

## 🔄 Features Under Development

### 1. Routing Structure

#### Earn Page Structure
Current implementation:
- `/earn` → Staking landing page
- `/earn-overview` → Product overview
- `/earn-history` → History

### 2. Data Sources

#### Gradual Migration to Real Data
- Some features fetch from the actual database
- Trading screen price data is being gradually migrated to real data
- APY data will be transitioned to market-linked data

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
