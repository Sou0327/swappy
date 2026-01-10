# Hacker News Launch Template

> Use this template for your Show HN submission.

---

## Title Options

Choose one that fits the 80-character limit:

1. **Show HN: Undefined – Open-source multi-chain crypto exchange platform**
2. **Show HN: I built an open-source cryptocurrency exchange with React & Supabase**
3. **Show HN: Undefined – White-label crypto exchange with HD wallet support**

---

## Submission Text

```
Show HN: Undefined – Open-source multi-chain crypto exchange platform

I've been working on Undefined, an open-source cryptocurrency exchange platform. It's designed to be a foundation for building your own crypto trading platform.

GitHub: https://github.com/Sou0327/undefined-exchange

Key features:
- Multi-chain: ETH, BTC, XRP, TRON, Polygon, BNB
- HD Wallet: BIP-32/39/44 compliant, single master key for unlimited addresses
- White-label: Full branding customization via env vars
- Modern stack: React 18, TypeScript 5, Supabase, Tailwind

Tech stack details:
- Frontend: Vite + React + TypeScript + shadcn/ui
- Backend: Supabase (PostgreSQL + Edge Functions + Auth)
- Blockchain: Tatum API for monitoring, Alchemy for RPC

Current limitations (beta):
- Deposit detection is partially working (webhook integration in progress)
- Withdrawal requires manual processing
- Not production-ready for real funds

Why I built this:
Most crypto exchange codebases are either closed-source or overcomplicated. I wanted to create something that developers could actually understand, modify, and deploy without needing a team of blockchain engineers.

The architecture prioritizes simplicity:
- HD wallets eliminate the need to manage thousands of individual keys
- Supabase handles auth, database, and serverless functions
- Environment-based config makes white-labeling trivial

Would love feedback on:
1. Architecture decisions (HD wallet approach, Supabase choice)
2. Missing features that would make this useful for you
3. Security considerations I might have missed

Happy to answer any questions about the implementation.
```

---

## Alternative Shorter Version

```
Show HN: Open-source crypto exchange platform with multi-chain HD wallets

Built an open-source cryptocurrency exchange platform:
- GitHub: https://github.com/Sou0327/undefined-exchange

Multi-chain (ETH, BTC, XRP, TRON), HD wallet architecture (BIP-32/39/44), white-label ready.

Stack: React 18, TypeScript, Supabase, Tailwind, Tatum API.

Currently in beta - deposit detection works but needs polish, withdrawals are manual. Not for production use with real funds yet.

Feedback welcome, especially on architecture and security.
```

---

## Comment Preparation

### FAQ Responses

**Q: Why not use existing solutions like X?**
```
Existing solutions tend to be either:
1. Closed-source commercial products
2. Overly complex for learning/small projects
3. Focused on single chain (usually just EVM)

Undefined aims to be simple enough to understand while supporting multiple chains.
```

**Q: Why Supabase instead of traditional backend?**
```
A few reasons:
1. Auth, database, and serverless functions in one platform
2. Row Level Security for fine-grained access control
3. Real-time subscriptions for live updates
4. Free tier is generous for development/small deployments

The trade-off is vendor dependency, but the code could be migrated to self-hosted Supabase or another PostgreSQL backend.
```

**Q: Is this secure enough for production?**
```
Honest answer: not yet.

The security model is designed correctly (HD wallets, RLS, proper auth), but it hasn't been audited. The beta limitations (manual withdrawals, partial deposit detection) exist specifically because we're being cautious.

For production use, you'd need:
- Professional security audit
- Proper HSM for master key storage
- Monitoring and alerting infrastructure
- Legal/compliance review
```

**Q: How does HD wallet work here?**
```
Each chain has a "wallet root" (master key) stored encrypted in the database. When a user needs a deposit address, we derive it from the master key using BIP-44 paths.

Benefits:
- One backup = all addresses
- No per-address key management
- Deterministic address generation

The derivation happens in Edge Functions with the master key never exposed to the frontend.
```

**Q: What's the business model?**
```
Pure open source (MIT). No commercial plans currently.

If you want to support development:
- Contributions welcome
```

---

## Engagement Tips for HN

1. **Be humble** - HN appreciates honest assessment of limitations
2. **Technical depth** - Be ready to discuss architecture decisions in detail
3. **Respond quickly** - First few hours matter most
4. **Don't be defensive** - Accept criticism gracefully
5. **Avoid marketing speak** - Just facts and technical details

---

## Timing

**Best times to post:**
- Weekday mornings (US time zones)
- Tuesday-Thursday typically have more engagement
- Avoid weekends and holidays

**Post at:** Around 8-10 AM EST / 5-7 AM PST

---

## Metrics to Track

- Points (upvotes)
- Comments
- GitHub stars
- Demo site visits
- Clone/fork activity
