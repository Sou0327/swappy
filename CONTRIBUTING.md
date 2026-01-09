# Contributing to Undefined

Thank you for your interest in contributing to **Undefined**, a cryptocurrency exchange platform. This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Code Style Guidelines](#code-style-guidelines)
- [Commit Message Convention](#commit-message-convention)
- [Pull Request Process](#pull-request-process)
- [Code of Conduct](#code-of-conduct)

---

## How to Contribute

### Reporting Issues

1. **Search existing issues** before creating a new one to avoid duplicates.
2. **Use the issue template** if available, or provide:
   - Clear and descriptive title
   - Steps to reproduce (for bugs)
   - Expected vs. actual behavior
   - Screenshots or logs if applicable
   - Environment details (browser, OS, Node.js version)

3. **Label appropriately**: bug, feature request, documentation, etc.

### Suggesting Features

1. Open an issue with the `feature request` label.
2. Describe the problem your feature would solve.
3. Propose your solution and any alternatives considered.
4. Be open to discussion and feedback.

### Contributing Code

1. Fork the repository.
2. Create a feature branch from `main`.
3. Make your changes following our code style guidelines.
4. Write or update tests as needed.
5. Submit a pull request.

---

## Development Setup

### Prerequisites

- **Node.js** 18.x or higher
- **npm** 9.x or higher
- **Docker** (required for local Supabase)
- **Supabase CLI**

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/your-org/layer-x-forked.git
   cd layer-x-forked
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   ```bash
   cp .env.example .env
   ```

   Update `.env` with your local configuration.

4. **Start Supabase locally**

   ```bash
   supabase start
   ```

   This will start the local Supabase environment with PostgreSQL, Auth, and Edge Functions.

5. **Run database migrations**

   ```bash
   supabase db reset
   ```

6. **Start the development server**

   ```bash
   npm run dev
   ```

   The application will be available at `http://localhost:8080`.

### Useful Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run tests in watch mode |
| `npm run test:run` | Run tests once (CI mode) |
| `npm run test:coverage` | Run tests with coverage |
| `supabase functions serve` | Run Edge Functions locally |
| `supabase db diff` | Check schema differences |

---

## Code Style Guidelines

### General Principles

- **YAGNI**: Only implement what is currently needed.
- **DRY**: Extract common logic into reusable functions/hooks.
- **TDD**: Write tests before implementation when possible.

### TypeScript

- Use TypeScript for all new code.
- Prefer explicit types over `any`.
- Use interfaces for object shapes and types for unions/primitives.
- Path aliases are configured: use `@/` instead of relative paths.

```typescript
// Good
import { Button } from "@/components/ui/button";

// Avoid
import { Button } from "../../../components/ui/button";
```

### React

- Use functional components with hooks.
- Follow React Hook Form + Zod patterns for forms.
- Use TanStack Query for server state management.
- Components should be in PascalCase.

```typescript
// Component structure
const MyComponent: React.FC<Props> = ({ prop1, prop2 }) => {
  // hooks first
  const [state, setState] = useState();

  // derived values
  const computed = useMemo(() => ..., [deps]);

  // handlers
  const handleClick = () => { ... };

  // render
  return <div>...</div>;
};
```

### Styling

- Use Tailwind CSS utility classes.
- Follow shadcn/ui patterns for component styling.
- Use CSS variables for theming (`--primary`, `--background`, etc.).
- Mobile-first responsive design with Tailwind breakpoints.

### ESLint

Run ESLint before committing:

```bash
npm run lint
```

The project uses TypeScript ESLint with React hooks and refresh plugins.

### Language

- **UI text, comments, and error messages**: Japanese
- **Code (variables, functions, classes)**: English
- **Documentation**: English (this file) or Japanese (user-facing docs)

---

## Commit Message Convention

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `refactor` | Code refactoring (no feature/fix) |
| `test` | Adding or updating tests |
| `chore` | Build, tooling, or dependency updates |
| `style` | Code style changes (formatting, etc.) |
| `perf` | Performance improvements |
| `ci` | CI/CD configuration changes |

### Examples

```bash
# Feature
feat(auth): add two-factor authentication support

# Bug fix
fix(wallet): correct balance calculation for JPY

# Documentation
docs(readme): update development setup instructions

# Refactor
refactor(api): extract common error handling logic

# Test
test(deposit): add unit tests for deposit validation

# Chore
chore(deps): update React to v18.3.0
```

### Rules

1. Use lowercase for type and scope.
2. Keep subject line under 72 characters.
3. Use imperative mood ("add" not "added" or "adds").
4. Reference issue numbers in the footer when applicable.

---

## Pull Request Process

### Before Submitting

1. **Ensure your code builds**: `npm run build`
2. **Run linting**: `npm run lint`
3. **Run tests**: `npm run test:run`
4. **Update documentation** if needed.

### PR Guidelines

1. **Create a descriptive title** following commit conventions.
2. **Fill out the PR template** with:
   - Summary of changes
   - Related issue numbers
   - Testing performed
   - Screenshots (for UI changes)

3. **Keep PRs focused**: One feature/fix per PR.
4. **Request reviews** from appropriate team members.

### Review Process

1. At least one approval is required.
2. All CI checks must pass.
3. Resolve all review comments.
4. Squash commits if requested.

### After Merge

- Delete your feature branch.
- Verify the deployment (if applicable).
- Close related issues.

---

## Code of Conduct

We are committed to providing a welcoming and inclusive environment for all contributors.

### Our Standards

- Be respectful and considerate.
- Welcome newcomers and help them get started.
- Accept constructive criticism gracefully.
- Focus on what is best for the community.

### Unacceptable Behavior

- Harassment, discrimination, or offensive comments.
- Personal attacks or trolling.
- Publishing others' private information.
- Any conduct that could be considered inappropriate in a professional setting.

### Reporting

If you experience or witness unacceptable behavior, please report it to the project maintainers. All reports will be handled confidentially.

---

## Questions?

If you have questions about contributing, feel free to:

1. Open a discussion in the repository.
2. Ask in the project's communication channels.
3. Review existing issues and pull requests.

Thank you for contributing to Undefined!
