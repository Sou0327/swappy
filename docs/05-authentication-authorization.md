# Authentication & Authorization System

## Authentication System Overview
- **Provider**: Supabase Auth
- **Method**: Email + Password
- **Session Management**: localStorage + auto-refresh

## Authentication Components

### AuthContext (`src/contexts/AuthContext.tsx`)
Manages application-wide authentication state

**Provided Values:**
```typescript
interface AuthContextType {
  user: User | null;           // Supabase user object
  session: Session | null;     // Authentication session
  loading: boolean;            // Loading authentication state
  userRole: string;           // User role ('admin' | 'moderator' | 'user')
  roleLoading: boolean;       // Loading role
  signOut: () => Promise<void>; // Sign out function
}
```

**Features:**
- Real-time authentication state monitoring via `onAuthStateChange`
- Automatic role retrieval (from `user_roles` table)
- Default role: `user` (on retrieval failure)

### Authentication Flow

#### 1. Sign Up
- Email + Password + Full Name
- `full_name` saved to user metadata
- Confirmation email sent
- On success: Navigate to `/redirect`

#### 2. Login
- Email + Password
- Session auto-created
- On success: Navigate to `/redirect`

#### 3. Redirect Processing (`/redirect`)
```typescript
// AuthRedirect.tsx processing flow
if (loading || roleLoading) return <LoadingSpinner />
if (!user) return <Navigate to="/auth" />

switch (userRole) {
  case 'admin':
    return <Navigate to="/admin" />
  default:
    return <Navigate to="/dashboard" />
}
```

## Authorization System

### Role Definitions
```sql
CREATE TYPE app_role AS ENUM ('admin', 'moderator', 'user');
```

| Role | Permissions | Accessible Areas |
|------|-------------|------------------|
| `admin` | All features + admin functions | All pages + `/admin` |
| `moderator` | General features + some admin | General pages (planned) |
| `user` | General features only | General pages |

## KYC (Optional - Phased Introduction)

### Policy
- Current phase is "KYC optional". When enabled, can restrict withdrawals and some features.
- In deposit detection-only phase, KYC incomplete users can still view deposit page/receive address allocation (adjustable by operation policy).

### DDL (Proposed)
```sql
CREATE TYPE kyc_status AS ENUM ('none','pending','verified','rejected');

ALTER TABLE profiles
  ADD COLUMN kyc_status kyc_status NOT NULL DEFAULT 'none',
  ADD COLUMN kyc_level integer NOT NULL DEFAULT 0; -- 0:none, 1:basic, 2:extended etc.
```

### Route/Feature Gate
- When `.env` `VITE_FEATURE_KYC_OPTIONAL=true`:
  - Deposit: Always allowed (UI shows "KYC Optional").
  - Withdrawal: Only allowed when `kyc_status='verified'` (UI shows guard).
- Future: Auto-update `kyc_status` via KYC provider integration.

### Route Protection

#### AdminRoute (`src/components/AdminRoute.tsx`)
Protection for admin-only pages

```typescript
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, userRole, loading, roleLoading } = useAuth();

  if (loading || roleLoading) return <LoadingSpinner />
  if (!user) return <Navigate to="/auth" />
  if (userRole !== 'admin') return <Navigate to="/dashboard" />

  return <>{children}</>;
};
```

**Protected Routes:**
- `/admin` - Admin dashboard

#### General Authentication Protection
Currently no explicit protection component (future implementation candidate)

## Security Features - Current Scope

- 2FA/Anti-phishing code/Recovery keys: Out of scope for this phase (UI hidden)
- Password change: Available from `/security`
- Account freeze: UI provided in `/security` (functionality adjustable by operation decision)

## Security Features

### Frontend
- Route-level authentication checks
- Role-based UI display control
- Automatic session management

### Backend (Supabase RLS)
- Strict access control via Row Level Security
- Table-level authorization
- Admin privilege verification

### Session Management
```typescript
// client.ts configuration
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,        // Session persistence
    persistSession: true,         // Session maintenance
    autoRefreshToken: true,       // Auto token refresh
  }
});
```

## Custom Hooks

### useUserRole
```typescript
// Implemented in hooks/ (see hooks documentation for details)
const { userRole, loading } = useUserRole();
```

## Security Considerations

### Current Implementation
✅ Data protection via RLS
✅ Frontend route protection
✅ Automatic session management

### Areas for Improvement
⚠️ Password reset not implemented
⚠️ 2FA is UI only (implementation incomplete)
⚠️ No session timeout settings
⚠️ No login attempt rate limiting

### Future Extensions
- OAuth provider support
- 2FA (TOTP) implementation
- Password reset functionality
- Enhanced session management
