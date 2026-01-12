# Swappy Project Overview

## Product Overview
Swappy is a React-based SPA frontend application that provides cryptocurrency "trading, earning, and exchange" experiences.

## Technology Stack

### Frontend
- **React 18** + **TypeScript** - Main framework
- **Vite 5** - Build tool and development server (port 8080)
- **React Router v6** - Client-side routing
- **Tailwind CSS** - Utility-first CSS
- **shadcn/ui** - Radix UI-based component library
- **Lucide React** - Icon library

### State Management & Data Fetching
- **TanStack Query (@tanstack/react-query)** - Server state management
- **React Context** - Authentication state management
- **React Hook Form + Zod** - Form handling and validation

### Backend & Authentication
- **Supabase** - BaaS (Authentication, Database, Real-time)
- **PostgreSQL** - Database (Supabase hosted)
- **Row Level Security (RLS)** - Data access control

### Other Key Libraries
- **Recharts** - Charts and graphs
- **date-fns** - Date processing
- **next-themes** - Dark/light mode support

## Architecture Characteristics
- **SPA Architecture**: Fast user experience
- **Component-Based**: Reusable UI design
- **Type Safety**: Strict type checking with TypeScript + Zod
- **Modular Design**: Feature-separated structure
- **Responsive Design**: Mobile-first approach

## Operation Mode (Current Approach)
- **Exchange-Style Wallet (Public Demo)**: No real trading; orders/fills are simulated (paper trading).
- **Phase 1 (Deposit Detection Only)**: Real deposits are "detection only". Sweep/withdrawal is not implemented or manually operated. Server does not store private keys (assumes manual signing).
- **Target Chains (Initial)**: Supports BTC / ETH / TRC / XRP / USDT (ERC-20/TRC-20) / ADA (deposit detection).
- **Public Test Timeline**: Phase 1 (all-chain deposit detection only) can be released in 2-3 weeks (including parallel verification).
- **KYC is Optional**: Can be toggled ON/OFF from admin panel. Initially OFF (phased introduction planned).
- **Security Configuration Scope**: 2FA/anti-phishing code/recovery keys are out of scope for this phase. Only password change and account freeze are provided.

## Phase Plan (Summary)
- P1: EVM (Ethereum) deposit detection only (EOA/HD distribution, manual sweep)
- P2: Enhanced trading UI simulation (orderbook/trade history/pseudo WS)
- P3: BTC deposits (xpub distribution, PSBT generation → manual signing)
- P4: XRP deposits (single address + Destination Tag)
- P5+: TRON and other chains, 2FA, API keys, KYC enhancement, etc.

## Development Principles
- **YAGNI (You Aren't Gonna Need It)** - Don't implement features until needed
- **DRY (Don't Repeat Yourself)** - Avoid code duplication
- **Component Reuse** - Unified UI based on shadcn/ui
- **Type Safety Focus** - Runtime type checking with TypeScript and Zod
