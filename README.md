# Swappy

**Self-Hosted Multi-Chain Wallet Platform**

[![CI](https://github.com/Sou0327/swappy/actions/workflows/ci.yml/badge.svg)](https://github.com/Sou0327/swappy/actions/workflows/ci.yml)
[![Beta](https://img.shields.io/badge/status-beta-yellow.svg)](https://github.com/Sou0327/swappy)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178c6.svg)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Backend-3ecf8e.svg)](https://supabase.com/)

> Self-host your own wallet infrastructure. Manage multi-chain addresses, detect deposits, and process withdrawals with full control of your keys.

📖 [Documentation](docs/) · 🐛 [Report Bug](https://github.com/Sou0327/swappy/issues)

---

## 🌐 Live Demo

Try the demo at: **[https://swappy.tokyo/](https://swappy.tokyo/)**

> 💡 Use the "Try Demo" button to explore all features without registration!

### What You Can Try in Demo Mode

| Feature | Description |
|---------|-------------|
| 💰 **Dashboard** | Real-time portfolio overview with live market prices |
| 📥 **Deposit Flow** | Generate deposit addresses for multiple chains |
| 📤 **Withdrawal** | Experience withdrawal request workflow |
| 📊 **History** | View transaction history |
| ⚙️ **Settings** | Explore user preferences and profile management |

---

## 🎯 Who It's For

### Target Users

| User Type | Use Case |
|-----------|----------|
| **Privacy-Conscious Users** | Full control over your keys and funds without third-party custody |
| **Power Users** | Manage assets across Many chains from a single, self-hosted dashboard |
| **Self-Hosters** | Run your own wallet infrastructure with complete data sovereignty |
| **Developers** | Build on top of a modern, open-source wallet platform |

### Problems We Solve

- 🔐 **Third-Party Trust**: Trusting exchanges with your crypto → Self-custody with your own server
- 🕵️ **Privacy Concerns**: Exchanges track your transactions → Your data stays on your server
- 🔗 **Multi-Chain Complexity**: Managing wallets across chains is fragmented → Unified interface for Many chains
- 🔍 **Auditability**: Closed-source wallets are black boxes → Fully open-source, verify every line of code

---

## ⚠️ Beta Software Notice

> **This project is currently in BETA.** Core functionality is working, with some features under development:
>
> ✅ **Multi-Chain Wallet Management**: Generate and manage addresses across 6 blockchains
> 🔶 **Wallet Setup (BIP39)**: HD wallet creation with mnemonic phrase generation **- UNDER ACTIVE DEVELOPMENT**
> 🔶 **Deposit Detection**: Real-time blockchain RPC scanning for instant deposit detection **- UNDER ACTIVE DEVELOPMENT**
> 🔶 **Withdrawal Processing**: Automatic transaction signing and broadcasting to blockchain **- UNDER ACTIVE DEVELOPMENT**
> ✅ **Price Display**: Real-time crypto prices via CoinGecko API
>
> 🔶 **Webhook Integration**: Additional notification methods (email, SMS) in progress
>
> ### ⚠️ Important Notice - Features Under Adjustment
>
> **The following features are currently under active development and adjustment:**
>
> - **🔶 Wallet Setup (BIP39 HD Wallets)**: User-specific HD wallet creation with BIP39 mnemonic phrases
>   - Security enhancements are being implemented
>   - May undergo significant changes
>   - Use with caution in production environments
>
> - **🔶 Deposit Detection**: Blockchain monitoring and automatic deposit processing
>   - Currently being refined for better reliability
>   - Some edge cases may still exist
>   - Report any issues immediately
>
> - **🔶 Withdrawal Processing**: Automatic transaction signing and blockchain broadcasting
>   - Currently under active development and testing
>   - Security and reliability improvements in progress
>   - Use with extreme caution in production environments
>
> **This is infrastructure software.** We recommend testing with small amounts first.
> For production use, please conduct your own security audit.
>
> 📋 See [Beta Limitations & Roadmap](docs/08-beta-limitations.md) for full details.
>
> This software is provided "AS IS" without warranty. See [LICENSE](LICENSE) for details.

---

## ⚖️ Legal & Regulatory Notice

> ### Personal Use vs. Commercial Service
>
> **Self-custody for personal use**: Using this software to manage your own cryptocurrency is generally not a regulated activity. You're simply managing your own assets.
>
> **Operating a service for others**: If you use this software to provide custodial services for other users (holding their funds), this becomes a regulated activity in most jurisdictions.
>
> | Usage Type | Regulatory Status |
> |------------|-------------------|
> | **Personal wallet** (self-custody) | Generally unregulated |
> | **Multi-user service** (custodial) | Typically requires licensing |
>
> ### Your Responsibilities
>
> 1. **Self-Custody**: When using for personal purposes, ensure you understand the risks of managing your own keys
> 2. **Commercial Use**: If operating as a service for others, consult legal professionals regarding licensing requirements
> 3. **No Legal Advice**: This notice does not constitute legal advice
>
> **By using this software, you acknowledge that you are responsible for understanding and complying with applicable laws in your jurisdiction.**

---

## ✨ Features

### Feature Availability

| Status | Feature | Description |
|:------:|---------|-------------|
| ✅ | **Multi-Chain Support** | Ethereum, Bitcoin, XRP, TRON, Polygon, BNB Chain |
| ✅ | **HD Wallet Architecture** | BIP-32/39/44 compliant key derivation |
| 🔶 | **Wallet Setup (BIP39)** | User-specific HD wallet creation with mnemonic phrase **- Under Development** |
| 🔶 | **Real-time Deposit Detection** | Blockchain RPC scanning for instant deposit detection **- Under Refinement** |
| 🔶 | **Automated Withdrawal Processing** | Automatic transaction signing and broadcasting **- Under Development** |
| ✅ | **Price Display** | Real-time crypto prices via CoinGecko API |
| ✅ | **Self-Hostable** | Deploy on your own server with Docker or 1-click deploy |
| ✅ | **Personal Dashboard** | Manage your wallets, transactions, and settings |
| ✅ | **i18n Support** | English & Japanese (extensible) |
| ✅ | **Demo Mode** | Try all features without registration |
| 🔶 | **Webhook Integration** | Additional notification methods (email, SMS) in progress |
| 🔲 | **Advanced Trading** | Limit orders, charts (planned) |
| 🔲 | **2FA Authentication** | Coming in future release |

> **Legend**: ✅ Available | 🔶 In Progress | 🔲 Planned
>
> ⚠️ **Note**: Features marked with 🔶 are under active development. See [Beta Software Notice](#-beta-software-notice) above for details.

### Core Capabilities

<details>
<summary>🔗 Multi-Chain Support</summary>

- **Ethereum** (ETH + ERC-20 tokens like USDT)
- **Bitcoin** (BTC)
- **XRP** (Ripple)
- **TRON** (TRX + TRC-20 tokens)
- **Polygon**, **BNB Chain** (via EVM compatibility)

</details>

<details>
<summary>🔐 HD Wallet Architecture</summary>

- Hierarchical Deterministic wallets (BIP-32/39/44)
- Single master key → unlimited addresses
- Secure key management with wallet roots

</details>

<details>
<summary>📊 Deposit Detection</summary>

- Tatum API integration for blockchain monitoring
- Webhook-based instant notifications
- Multi-asset support per address

</details>

<details>
<summary>🏠 Self-Hostable</summary>

- Deploy anywhere: Docker, VPS, or cloud platforms
- Environment variable based configuration
- 1-click deploy options (Cloudflare Pages, Vercel, Netlify)
- Full control over your data and infrastructure

</details>

<details>
<summary>🛡️ Security Features</summary>

- Role-based access control (Admin/Moderator/User)
- Supabase Row Level Security (RLS)
- Comprehensive audit logging
- API key management

</details>

---

## 🛠️ Tech Stack

| Category | Technologies |
|----------|-------------|
| **Frontend** | React 18, TypeScript 5, Vite, Tailwind CSS |
| **UI Components** | shadcn/ui, Radix UI, Lucide Icons |
| **State Management** | TanStack Query, React Context |
| **Backend** | Supabase (PostgreSQL, Auth, Edge Functions) |
| **Blockchain APIs** | Tatum, Alchemy, TronGrid, Blockfrost |
| **Deployment** | Cloudflare Pages, Supabase Cloud |

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Docker Desktop (for local Supabase)
- Supabase CLI

### 1. Clone & Install

```bash
git clone https://github.com/Sou0327/swappy.git
cd swappy
npm install
```

### 2. Start Local Supabase

```bash
npx supabase start
npx supabase db push --local
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your API keys:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key

# Blockchain APIs (get from providers)
VITE_ALCHEMY_API_KEY=your_alchemy_key
TATUM_API_KEY=your_tatum_key

# Branding (optional)
VITE_APP_NAME="Your Exchange Name"
```

### 4. Run Development Server

```bash
npm run dev
```

Open http://localhost:8080 🎉

---

## 📸 Screenshots

> 📷 **See it in action!** Try the [Live Demo](https://swappy.tokyo/) to explore the full UI.

---

## 📁 Project Structure

```
src/
├── components/          # Reusable UI components
│   └── ui/             # shadcn/ui components
├── config/
│   └── branding.ts     # White-label branding config
├── contexts/           # React Context providers
├── hooks/              # Custom React hooks
├── integrations/       # External service integrations
│   └── supabase/       # Supabase client & types
├── lib/                # Utilities & blockchain detection
├── pages/              # Route components
└── App.tsx             # Main application

supabase/
├── functions/          # Edge Functions (webhooks, allocator)
├── migrations/         # Database migrations
└── config.toml         # Supabase configuration
```

---

## 🎨 Customization

### Branding

Edit `src/config/branding.ts` or use environment variables:

```env
VITE_APP_NAME="My Wallet"
VITE_APP_TAGLINE="Your tagline here"
VITE_APP_DOMAIN="mywallet.example.com"
VITE_APP_TWITTER="your_twitter"
```

### Supported Chains

Configure chains in the settings dashboard at `/admin/chain-configs`.

---

## 🗺️ Roadmap

| Version | Status | Features |
|---------|--------|----------|
| v0.1.0-beta | ✅ Current | Multi-chain wallet management, deposits, personal dashboard |
| v0.2.0 | 🔲 Planned | Complete deposit detection system |
| v0.3.0 | 🔲 Planned | Automated withdrawal processing |
| v0.4.0 | 🔲 Planned | Portfolio analytics and insights |
| v1.0.0 | 🔲 Future | Production-ready release |

---

## 🔒 Security

### Reporting Vulnerabilities

If you discover a security vulnerability, please **do not** open a public issue.

**Report via GitHub Security Advisories:**
- 🔒 [Report a Vulnerability](https://github.com/Sou0327/swappy/security/advisories/new)

We will acknowledge receipt within 48 hours and provide a detailed response within 7 days.

### Security Best Practices

When deploying this software:

- ✅ Use environment variables for all secrets
- ✅ Enable Supabase Row Level Security (RLS)
- ✅ Rotate API keys regularly
- ✅ Conduct security audits before production use
- ✅ Keep dependencies updated

---

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before getting started.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👥 Maintainers

| Role | Contact |
|------|---------|
| **Lead Maintainer** | [@Sou0327](https://github.com/Sou0327) |
| **Issues** | [GitHub Issues](https://github.com/Sou0327/swappy/issues) |
| **Discussions** | [GitHub Discussions](https://github.com/Sou0327/swappy/discussions) |

### Getting Help

- 📖 **Documentation**: Check the [docs/](docs/) directory
- 💬 **Questions**: Open a [Discussion](https://github.com/Sou0327/swappy/discussions)
- 🐛 **Bug Reports**: File an [Issue](https://github.com/Sou0327/swappy/issues)
- 🔒 **Security**: See [Security](#-security) section above

---

## 💖 Support

If you find this project useful, please consider:

- ⭐ Starring the repository
- 🐛 Reporting bugs and issues
- 💡 Suggesting new features
- 🤝 Contributing code

---

## 📚 Documentation

- [Setup Guide](docs/01-overview.md)
- [Development Setup](docs/02-development-setup.md)
- [Database Schema](docs/04-database-schema.md)
- [Authentication & Authorization](docs/05-authentication-authorization.md)

---

**Built with ❤️ by the Swappy Team**
