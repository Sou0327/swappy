# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Complete deposit detection system
- Automated withdrawal processing
- Advanced trading features (limit orders, charts)

---

## [0.1.0-beta] - 2026-01-09

### Added

#### Multi-Chain Wallet Support
- **Ethereum** (ETH + ERC-20 tokens like USDT, USDC)
- **Bitcoin** (BTC with native SegWit)
- **XRP** (Ripple with destination tag support)
- **TRON** (TRX + TRC-20 tokens)
- **Polygon** and **BNB Chain** (via EVM compatibility)

#### HD Wallet Architecture
- Hierarchical Deterministic wallets following BIP-32/39/44 standards
- Single master key generates unlimited addresses
- Secure key management with wallet roots
- Per-user address derivation

#### Deposit Detection System
- Tatum API integration for blockchain monitoring
- Webhook-based notification system
- Multi-asset support per address
- Real-time balance updates

#### White-Label Branding
- Fully customizable via `branding.ts`
- Environment variable based configuration
- No hardcoded platform names or URLs
- Easy theming with Tailwind CSS

#### User Features
- Dashboard with portfolio overview
- Deposit addresses for all supported chains
- Transaction history
- User referral system
- Notification system

#### Admin Dashboard
- User management
- Wallet administration
- HD Wallet management
- Sweep operations
- Token configuration
- Announcement management

#### Security
- Supabase Authentication
- Role-based access control (Admin/Moderator/User)
- Row Level Security (RLS) policies
- API key management
- Comprehensive audit logging

#### Developer Experience
- TypeScript 5.0 with strict mode
- Vite for fast development
- shadcn/ui component library
- TanStack Query for data fetching
- Comprehensive ESLint configuration

### Known Issues

> **This is a BETA release.** The following features are incomplete:

- **Deposit Detection**: Partially working - webhook integration in progress
- **Withdrawal Processing**: Requires manual intervention
- **Email Notifications**: Template-based, not fully automated
- **Limit Orders**: Monitor system needs optimization

### Security Notice

⚠️ **DO NOT use in production with real funds** without:
- Thorough testing
- Professional security audit
- Proper key management setup

This software is provided "AS IS" without warranty. The authors are not responsible for any financial losses.

---

## Version History

| Version | Date | Status |
|---------|------|--------|
| 0.1.0-beta | 2026-01-09 | Current |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to this project.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
