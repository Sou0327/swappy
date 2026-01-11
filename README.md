<div align="center">

# Undefined

### Modern Multi-Chain Cryptocurrency Exchange Platform

[![Beta](https://img.shields.io/badge/status-beta-yellow.svg)](https://github.com/Sou0327/undefined-exchange)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178c6.svg)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Backend-3ecf8e.svg)](https://supabase.com/)

**A white-label ready crypto exchange platform built with React, TypeScript, and Supabase**

[Documentation](docs/) · [Report Bug](https://github.com/Sou0327/undefined-exchange/issues)

</div>

---

## 🌐 Live Demo

Try the demo at: **[https://undefined-exchange.pages.dev/](https://undefined-exchange.pages.dev/)**

> 💡 Use the "Try Demo" button to explore all features without registration!

### What You Can Try in Demo Mode

| Feature | Description |
|---------|-------------|
| 💰 **Dashboard** | Real-time portfolio overview with live market prices |
| 📥 **Deposit Flow** | Generate deposit addresses for multiple chains |
| 📤 **Withdrawal** | Experience the withdrawal request workflow |
| 💱 **Trading** | Place market orders with real-time order book (simulated) |
| 📊 **History** | View transaction and trading history |
| ⚙️ **Settings** | Explore user preferences and profile management |

---

## 🎯 Who It's For

### Target Users

| User Type | Use Case |
|-----------|----------|
| **Exchange Operators** | Launch a multi-chain crypto exchange quickly |
| **FinTech Teams** | Integrate deposit/withdrawal infrastructure |
| **Startups** | Build crypto services without blockchain expertise |
| **Developers** | Study modern exchange architecture patterns |

### Problems We Solve

- ⏰ **Time-to-Market**: Building exchange infrastructure from scratch takes months → Deploy in days
- 🔗 **Multi-Chain Complexity**: Managing multiple blockchains is complex → Unified API for all chains
- 🎨 **Branding Flexibility**: Most solutions are not customizable → Full white-label support
- 🛡️ **Security Baseline**: Security is expensive to get right → Built-in RLS, audit logging, role management

---

## ⚠️ Beta Software Notice

> **This project is currently in BETA.** The following features are incomplete or under active development:
>
> - 🔶 **Deposit Detection**: Partially working (webhook integration in progress)
> - 🔶 **Withdrawal Processing**: Manual intervention required
> - 🔶 **Email Notifications**: Template-based, not fully automated
>
> **This is a beta version.** We recommend using demo mode or testing with small amounts first.
> For production use, please conduct your own security audit.
>
> 📋 See [Beta Limitations & Roadmap](docs/08-beta-limitations.md) for full details.
>
> This software is provided "AS IS" without warranty. See [LICENSE](LICENSE) for details.

---

## ⚖️ Legal & Regulatory Notice

> **IMPORTANT: Operating a cryptocurrency exchange is a regulated activity in most jurisdictions.**
>
> ### Before Using This Software
>
> This software provides the complete infrastructure for operating a cryptocurrency exchange, including:
> - User deposit address allocation and management
> - Real-time deposit detection and processing
> - Fund aggregation (sweep) functionality
> - Trading and conversion features
> - User asset custody
>
> **These activities are subject to financial regulations in most countries.**
>
> ### Regulatory Requirements by Region
>
> | Region | Regulation | Registration/License Required |
> |--------|------------|-------------------------------|
> | **Japan** | Payment Services Act (資金決済法) | Crypto-Asset Exchange Service Provider Registration (暗号資産交換業登録) |
> | **USA** | FinCEN, State MTL | Money Services Business (MSB) Registration, State Money Transmitter Licenses |
> | **EU** | MiCA Regulation | Crypto-Asset Service Provider (CASP) Authorization |
> | **UK** | FCA | Crypto-Asset Registration |
> | **Singapore** | Payment Services Act | Major Payment Institution License |
>
> ### Your Responsibilities
>
> 1. **Compliance**: You are solely responsible for ensuring compliance with all applicable laws and regulations in your jurisdiction before operating any service using this software.
>
> 2. **Legal Advice**: We strongly recommend consulting with legal professionals specializing in financial regulations before deploying this software.
>
> 3. **No Legal Advice**: This notice and this software do not constitute legal advice. The authors and contributors are not responsible for any regulatory violations or legal consequences arising from the use of this software.
>
> ### Distribution vs. Operation
>
> - **Distributing this open-source software** does not require regulatory licenses.
> - **Operating a service** using this software typically requires appropriate licenses.
>
> **By using this software, you acknowledge that you have read and understood this notice and accept full responsibility for regulatory compliance.**

---

## ✨ Features

### Feature Availability

| Status | Feature | Description |
|:------:|---------|-------------|
| ✅ | **Multi-Chain Support** | Ethereum, Bitcoin, XRP, TRON, Polygon, BNB Chain |
| ✅ | **HD Wallet Architecture** | BIP-32/39/44 compliant key derivation |
| ✅ | **White-Label Ready** | Full branding customization via config |
| ✅ | **Admin Dashboard** | User/transaction/role management |
| ✅ | **i18n Support** | English & Japanese (extensible) |
| ✅ | **Demo Mode** | Try all features without registration |
| 🔶 | **Deposit Detection** | Webhook integration in progress |
| 🔶 | **Withdrawal Processing** | Semi-automated (manual approval) |
| 🔲 | **Advanced Trading** | Limit orders, charts (planned) |
| 🔲 | **2FA Authentication** | Coming in future release |

> **Legend**: ✅ Available | 🔶 In Progress | 🔲 Planned

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
<summary>🎨 White-Label Ready</summary>

- Fully customizable branding via `branding.ts`
- Environment variable based configuration
- No hardcoded values

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
git clone https://github.com/Sou0327/undefined-exchange.git
cd undefined-exchange
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

> 📷 **See it in action!** Try the [Live Demo](https://undefined-exchange.pages.dev/) to explore the full UI.

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
VITE_APP_NAME="Your Exchange Name"
VITE_APP_TAGLINE="Your tagline here"
VITE_APP_DOMAIN="yourexchange.com"
VITE_APP_TWITTER="your_twitter"
```

### Supported Chains

Configure chains in the admin dashboard at `/admin/chain-configs`.

---

## 🗺️ Roadmap

| Version | Status | Features |
|---------|--------|----------|
| v0.1.0-beta | ✅ Current | Basic trading, multi-chain deposits, admin dashboard |
| v0.2.0 | 🔲 Planned | Complete deposit detection system |
| v0.3.0 | 🔲 Planned | Automated withdrawal processing |
| v0.4.0 | 🔲 Planned | Advanced trading (limit orders, charts) |
| v1.0.0 | 🔲 Future | Production-ready release |

---

## 🔒 Security

### Reporting Vulnerabilities

If you discover a security vulnerability, please **do not** open a public issue.

**Report via GitHub Security Advisories:**
- 🔒 [Report a Vulnerability](https://github.com/Sou0327/undefined-exchange/security/advisories/new)

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
| **Issues** | [GitHub Issues](https://github.com/Sou0327/undefined-exchange/issues) |
| **Discussions** | [GitHub Discussions](https://github.com/Sou0327/undefined-exchange/discussions) |

### Getting Help

- 📖 **Documentation**: Check the [docs/](docs/) directory
- 💬 **Questions**: Open a [Discussion](https://github.com/Sou0327/undefined-exchange/discussions)
- 🐛 **Bug Reports**: File an [Issue](https://github.com/Sou0327/undefined-exchange/issues)
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

<div align="center">

**Built with ❤️ by the Undefined Team**

[Website](https://undefined.jp) · [Twitter](https://twitter.com/undefined_jp)

</div>
