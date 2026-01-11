# Development Environment and Setup

## Requirements
- Node.js (recommended: 18 or higher)
- npm or yarn

## Development Commands

### Basic Commands
```bash
# Install dependencies
npm install

# Start development server (http://localhost:8080)
npm run dev

# Production build
npm run build

# Development mode build
npm run build:dev

# Preview production build
npm run preview

# ESLint code check
npm run lint
```

## Development Configuration

### Vite Configuration (`vite.config.ts`)
- Development server port: 8080
- Path alias: `@` → `./src`
- Plugins: React SWC, Lovable Tagger (dev mode only)

### ESLint Configuration (`eslint.config.js`)
- TypeScript ESLint
- React Hooks rules
- React Refresh plugin
- `@typescript-eslint/no-unused-vars` disabled

### TypeScript Configuration
- Strictness: Moderate (`noImplicitAny: false`, `strictNullChecks: false`)
- Path alias: `@/*` → `./src/*`

### Tailwind CSS Configuration (`tailwind.config.ts`)
- shadcn/ui extended theme
- Custom color variables
- Animation extensions
- Responsive breakpoints

## Environment Variables

### Configuration File (`.env`)
```
# Supabase (Required)
VITE_SUPABASE_PROJECT_ID="your-project-id"
VITE_SUPABASE_PUBLISHABLE_KEY="[public key]"
VITE_SUPABASE_URL="https://your-project-id.supabase.co"

# Phase 1: All-chain deposit detection (detection only)
# EVM (either one is OK)
VITE_ALCHEMY_API_KEY="[optional]"
VITE_INFURA_PROJECT_ID="[optional]"

# Network/Confirmations/Feature toggles (for frontend display control)
VITE_ETHEREUM_NETWORK="mainnet"   # e.g.: sepolia, mainnet
VITE_DEPOSIT_MIN_CONFIRMATIONS_ETH=12
VITE_DEPOSIT_MIN_CONFIRMATIONS_BTC=3
VITE_DEPOSIT_MIN_CONFIRMATIONS_XRP=1
VITE_DEPOSIT_MIN_CONFIRMATIONS_TRON=19
VITE_DEPOSIT_MIN_CONFIRMATIONS_ADA=15

VITE_DEPOSIT_ENABLED_ETH=true
VITE_DEPOSIT_ENABLED_BTC=true
VITE_DEPOSIT_ENABLED_XRP=true
VITE_DEPOSIT_ENABLED_TRON=true
VITE_DEPOSIT_ENABLED_ADA=true

# KYC optional flag (for UI/route control)
VITE_FEATURE_KYC_OPTIONAL=true
```

### Notes
✅ The Supabase client uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from `.env`. See `.env.example` for a template.

## Directory Structure
```
src/
├── components/          # Shared components
│   └── ui/             # shadcn/ui primitives
├── pages/              # Page components
├── hooks/              # Custom hooks
├── contexts/           # React Context
├── integrations/       # External service integrations
│   └── supabase/      # Supabase related
├── lib/               # Utility functions
└── ...
```

## Deposit Detection (Phase 1: All Chains)

- Implementation Approach: Deliver "deposit detection only" as quickly as possible. Aggregation transfers (sweep) and withdrawals are manual/separate phase.
- Monitoring Implementation Location: Assumed to be in Supabase Edge Functions or lightweight Node worker (outside this repository).
- Integration Method: Deposit detection → Record in Supabase `deposits` as `pending` → Update to `confirmed` when required confirmations are reached.
- Frontend: References `VITE_DEPOSIT_ENABLED_*` and `VITE_DEPOSIT_MIN_CONFIRMATIONS_*` to switch UI display/warnings.

## UI Simplification (Current Release Configuration)

- Navigation: "Earn" and "Referral" routes are removed entirely.
- Dashboard: Security level display and access history are hidden.
- My Account: No birthday, bio, or image upload (full name only).
- Security Settings: 2FA/anti-phishing code/recovery keys are hidden. Only password change and freeze are provided.

## Development Workflow
1. Confirm feature requirements
2. Create/update type definitions
3. Component development (using shadcn/ui)
4. Testing (manual)
5. ESLint check
6. Build verification
