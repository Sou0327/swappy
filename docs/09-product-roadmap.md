# Product Roadmap (Exchange-Style Wallet: Public Demo → Phased Expansion)

This document outlines a phased roadmap for launching an "exchange-looking wallet (small team / manual operation)" as quickly as possible. Initially, no real trading will occur (paper trading), and deposits will be introduced chain by chain.

## Phase Overview

- P0: Security/Configuration Remediation (No key storage / Environment separation)
- P1: EVM Deposits (Individual deposit contracts → Manual sweep)
- P2: Trading UI Simulation (Pseudo-generation of orderbook/orders/history)
- P3: BTC Deposits (xpub distribution + PSBT generation)
- P4: XRP Deposits (Single address + Destination Tag)
- P5: API Keys/Signatures/Rate Limiting
- P6: 2FA/Withdrawal Protection (Enhanced protection even with manual operation)
- P7: KYC/AML (Optional / Phased introduction)
- P8: Observability/Operations (Audit logs, Metrics, Backup)
- P9: UX/Internationalization/Accessibility

---

## P0 Security/Configuration (Required - Priority)

- Purpose: Remediate secrets management and environment separation
- Tasks:
  - Environment variable configuration for Supabase keys (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) and key rotation
  - Audit of secrets and `.env.example` setup
  - Dependency vulnerability check/update policy
- Acceptance Criteria:
  - Build/startup is stable with environment variable dependencies, no hardcoded keys

## P1 All-Chain Deposits (Detection Only - No Key Storage)

- Purpose: Deliver "real deposits (detection only)" as quickly as possible (BTC/ETH/XRP/TRON/ADA/USDT)
- Tasks:
  - Issue user-specific receiving addresses per chain (ETH/TRON/ADA: HD, BTC: xpub, XRP: Fixed + Tag)
  - Deposit capture → Record in `deposits` → Status `confirmed` upon reaching required confirmations → Reflect in `user_assets`
  - Sweep/withdrawal handled manually during operational hours (audit logs recorded)
- Acceptance Criteria:
  - Small deposits on each chain are reflected in UI/history (ETH/USDT=12, BTC=3-6, XRP=1, TRON=19, ADA=15 confirmations as guidelines)
  - Chain acceptance switch and required confirmations configurable from admin panel

## P2 Trading UI Simulation

- Purpose: Complete the "exchange look" without real trading
- Tasks:
  - Express order lifecycle with pseudo data (new/open/partially_filled/filled/canceled)
  - Pseudo-generation and storage of orderbook/trade history
  - WS broadcast (pseudo): `ticker`, `trades`, `orderbook`
- Acceptance Criteria:
  - UI operates stably with pseudo data only, no contradiction with ledger (no asset movement)

## P3 BTC Deposits

- Purpose: Accept BTC deposits
- Tasks:
  - Address distribution from xpub, deposit detection, record in `deposits`
  - PSBT generation (manual signing) and audit logs
- Acceptance Criteria:
  - Small deposits reflected in UI/history, sweep aggregation operationally viable

## P4 XRP Deposits

- Purpose: Accept XRP deposits
- Tasks:
  - User identification via single address + Destination Tag
  - Deposit detection, record in `deposits`
- Acceptance Criteria:
  - Deposits reflected in UI/history, stable operation

## P5 API Keys/Signatures/Rate Limiting

- Tasks: API key issuance/revocation, HMAC signatures, clock skew verification, IP/key-based rate limiting
- Acceptance Criteria: Private APIs for orders/balances are production-ready

## P6 2FA/Withdrawal Protection

- Tasks: TOTP/backup codes/forced 2FA, address book, cooldown period
- Acceptance Criteria: Withdrawal protection is established

## P7 KYC/AML

- Tasks: Tiered KYC, PEP/sanctions screening, suspicious transaction monitoring (rules)
- Acceptance Criteria: Minimum compliance for major regions is met

## P8 Observability/Operations

- Tasks: Structured logs/traces, business metrics, backup/DR, admin audit logs (WORM)
- Acceptance Criteria: Root cause analysis and recovery procedures are operational during incidents

## P9 UX/Internationalization

- Tasks: Real-time UI, unified error/loading states, i18n, A11y, virtualization
- Acceptance Criteria: UX is consistent across major screens

---

## Sprint Example (First 3 Sprints)

- Sprint 1 (P0+P1): Environment variables, all-chain deposit detection (address distribution, capture, history display)
- Sprint 2 (P2): Trading UI simulation, pseudo WS broadcast, history storage
- Sprint 3 (P3): BTC deposits (xpub/PSBT) and audit logs

## Public Test Timeline

- Phase 1 (ETH+USDT deposit detection only): Ready for public testing in 5-7 business days

## Risks/Assumptions

- Server does not store private keys (signing handled by operational wallet)
- Chain integration is phased (EVM → BTC → XRP first, others later)
- For future automation or full trading functionality, define separately in SOW
