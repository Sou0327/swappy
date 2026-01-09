# Release Checklist

> Pre-release verification checklist for Undefined Exchange OSS release.

---

## 🔐 Security Checks

### Secrets & Credentials

- [ ] **No API keys in source code**
  ```bash
  grep -rn "sk-" src/          # OpenAI
  grep -rn "ghp_" src/         # GitHub PAT
  grep -rn "AKIA" src/         # AWS
  ```

- [ ] **No hardcoded passwords**
  ```bash
  grep -rn "password" src/ --include="*.ts" --include="*.tsx" | grep -v "Password"
  ```

- [ ] **No private keys**
  ```bash
  grep -rn "PRIVATE" src/
  grep -rn "BEGIN.*KEY" .
  ```

- [ ] **.env files excluded**
  - `.env` - NOT in repository
  - `.env.local` - NOT in repository
  - `.env.*.local` - NOT in repository
  - `.env.example` - ✅ Included with placeholders

### Configuration Files

- [ ] **supabase/config.toml**
  - `project_id` is placeholder: `"YOUR_PROJECT_ID"`
  - No real project references

- [ ] **Environment variables**
  - All secrets use environment variables
  - No defaults contain real values

---

## 📄 Documentation Checks

### Required Files

- [ ] **README.md**
  - Project description accurate
  - Beta status clearly marked
  - Quick start guide works
  - Links are valid (or use placeholders)

- [ ] **CONTRIBUTING.md**
  - Development setup instructions
  - Code style guidelines
  - PR process documented

- [ ] **LICENSE**
  - MIT License
  - Year: 2024-2026
  - Copyright holder: Undefined Team

- [ ] **CHANGELOG.md**
  - v0.1.0-beta entry complete
  - Known issues documented
  - Format follows Keep a Changelog

### GitHub Files

- [ ] **.github/ISSUE_TEMPLATE/**
  - `bug_report.md` exists
  - `feature_request.md` exists

- [ ] **.github/PULL_REQUEST_TEMPLATE.md**
  - Checklist included
  - Clear instructions

- [ ] **.github/FUNDING.yml**
  - GitHub username set (or placeholder)

- [ ] **.github/workflows/ci.yml**
  - Build workflow defined
  - Test workflow defined

---

## 🚫 Exclusion Checks

### AI Development Artifacts

- [ ] **NOT included in release:**
  - `.claude/`
  - `.serena/`
  - `.claude-code-harness/`
  - `claudedocs/`
  - `Plans.md`
  - `AGENTS.md`
  - `*.session.json`
  - `*.jsonl`

### Other Exclusions

- [ ] **NOT included:**
  - `.git/` (fresh git init)
  - `node_modules/`
  - `dist/`
  - `.env` and `.env.local`
  - `external/`
  - `backups/`

---

## 🔨 Build Verification

### Local Build

```bash
# Clean install
rm -rf node_modules
npm install

# Type check
npm run build

# Lint
npm run lint
```

- [ ] **npm install** - No errors
- [ ] **npm run build** - Builds successfully
- [ ] **npm run lint** - No critical errors
- [ ] **npm run dev** - Starts without errors

### Environment Variables

Required for production:

```env
# Supabase (required)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# Blockchain APIs (required for deposit detection)
VITE_ALCHEMY_API_KEY=
TATUM_API_KEY=

# Branding (optional)
VITE_APP_NAME=
VITE_APP_TAGLINE=
VITE_APP_DOMAIN=
VITE_APP_TWITTER=

# Beta mode (optional)
VITE_BETA_MODE=true
```

---

## 📦 Repository Setup

### GitHub Repository

- [ ] **Repository created**
  - Name: `undefined-exchange`
  - Visibility: Public

- [ ] **Repository settings**
  - Description set
  - Topics added: `react`, `typescript`, `crypto`, `exchange`, `supabase`
  - Website URL (after demo deployment)

- [ ] **Branches**
  - Default branch: `main`
  - Branch protection rules (optional)

### Initial Commit

```bash
git init
git add .
git commit -m "Initial commit: Undefined Exchange v0.1.0-beta"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/undefined-exchange.git
git push -u origin main
```

- [ ] **Initial commit pushed**
- [ ] **No sensitive files in history**

### Release

```bash
gh release create v0.1.0-beta \
  --title "v0.1.0-beta: Initial Beta Release" \
  --notes-file CHANGELOG.md \
  --prerelease
```

- [ ] **Release created**
- [ ] **Release notes accurate**
- [ ] **Marked as pre-release**

---

## 🚀 Post-Release

### Verification

- [ ] **Clone test**
  ```bash
  git clone https://github.com/YOUR_USERNAME/undefined-exchange.git test-clone
  cd test-clone
  npm install
  npm run build
  ```

- [ ] **README instructions work**
- [ ] **No sensitive data exposed**

### Monitoring

- [ ] **Watch for issues**
  - Security reports
  - Bug reports
  - Questions

- [ ] **Star count tracking** (optional)
- [ ] **Fork activity** (optional)

---

## ✅ Final Sign-off

| Check | Status | Verified By | Date |
|-------|--------|-------------|------|
| Security | ⬜ | | |
| Documentation | ⬜ | | |
| Build | ⬜ | | |
| Repository | ⬜ | | |
| Post-Release | ⬜ | | |

**Release Approved:** ⬜ Yes / ⬜ No

**Notes:**
```
(Add any notes or exceptions here)
```

---

## Quick Commands

```bash
# Run all checks
./scripts/create-clean-copy.sh --check-secrets

# Create clean copy
./scripts/create-clean-copy.sh ../undefined-exchange

# Verify clean copy
cd ../undefined-exchange
npm install && npm run build
```
