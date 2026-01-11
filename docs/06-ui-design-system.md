# UI Design System

## Design System Overview
- **Base**: shadcn/ui + Radix UI
- **Styling**: Tailwind CSS
- **Theme**: Dynamic theme switching via CSS Variables
- **Responsive**: Mobile-first design

## Component Library

### shadcn/ui Components (`src/components/ui/`)
High-quality primitive components based on Radix UI

**Key Components:**
- **Button** - Variants: primary, secondary, destructive, etc.
- **Card** - Content card (Header, Content, Footer)
- **Table** - Data table
- **Form** - React Hook Form integrated form
- **Dialog** - Modal dialog
- **Select, Input, Textarea** - Form elements
- **Badge** - Status display
- **Progress** - Progress bar
- **Tabs** - Tab navigation
- **Alert** - Notification and warning display

### Custom Components
**Layout:**
- `Header.tsx` - Global header
- `Footer.tsx` - Global footer
- `DashboardLayout.tsx` - Dashboard layout

**Feature-Specific:**
- `HeroSection.tsx` - Landing page hero
- `MarketTable.tsx` - Market data table
- `HowItWorks.tsx` - How-to section

## Theme System

### Configuration File (`tailwind.config.ts`)
```typescript
theme: {
  extend: {
    colors: {
      // Dynamic colors via CSS Variables
      primary: "hsl(var(--primary))",
      secondary: "hsl(var(--secondary))",
      background: "hsl(var(--background))",
      foreground: "hsl(var(--foreground))",
      // ... other color definitions
    }
  }
}
```

### CSS Variables (`src/index.css`)
```css
:root {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --primary: 210 40% 98%;
  --primary-foreground: 222.2 84% 4.9%;
  /* ... */
}

[data-theme="light"] {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  /* ... */
}
```

### Theme Switching
- **Library**: `next-themes`
- **Method**: `class`-based switching
- **Persistence**: Settings saved in localStorage

## Exchange-Specific Design

### Custom CSS Classes (`src/index.css`)
```css
/* Gradient for trading cards */
.trading-card {
  @apply border-border/50 bg-card/50 backdrop-blur-sm;
}

/* Hero button animation */
.hero-button {
  @apply relative overflow-hidden bg-primary text-primary-foreground;
}

/* Cryptocurrency glow effect */
.crypto-glow {
  @apply shadow-lg shadow-primary/20;
}
```

### Exchange UI Patterns
- **Price Display**: Unified colors - green for up, red for down
- **Gradients**: Subtle gradients on cards and buttons
- **Backdrop Filter**: Semi-transparent effects for premium feel

## Responsive Design

### Breakpoints
```css
sm: '640px'   /* Smartphone landscape */
md: '768px'   /* Tablet */
lg: '1024px'  /* Desktop */
xl: '1280px'  /* Large desktop */
2xl: '1536px' /* Extra large */
```

### Mobile-First Design
- Base size is mobile
- Scale up with `md:`, `lg:`, etc.
- Touch-friendly sizing

### Dashboard Responsive
- **Mobile**: Collapsible sidebar
- **Desktop**: Fixed sidebar
- **Tables**: Horizontal scroll support

## Deposit UI Patterns (Phase 1)

- Chain Badges: Clearly indicate enabled/coming soon status for BTC/ETH/TRC/XRP/USDT/ADA.
- Address Display: Monospace font, copy icon, QR code. Optimized for long-press copy.
- Confirmation Count: Notes on required confirmations (e.g., ETH 12 confirmations).
- Warnings/Notes: Wrong chain transfer, memo/tag requirements (XRP/TRON, etc.), estimated reflection time.
- Empty State: Illustration/guidance when no deposits exist yet.

## Icon System

### Lucide React
```typescript
import {
  Wallet, TrendingUp, Shield, User,
  Settings, LogOut, Menu, X
} from "lucide-react";
```

**Features:**
- Lightweight and consistent design
- Fully customizable
- Full TypeScript support

## Charts & Graphs

### Recharts Integration
```typescript
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
```

**Use Cases:**
- Price charts (`/trade`)
- Statistics graphs (dashboard)
- Asset trend graphs

## Form Design

### React Hook Form + Zod
```typescript
const form = useForm<FormData>({
  resolver: zodResolver(formSchema),
  defaultValues: { /* ... */ }
});
```

**Unified Patterns:**
- Label + Input combination
- Unified error display style
- Loading state display
- Submit button disable control

## Animations

### Tailwind CSS Animate
```css
/* Pre-configured animations */
animate-spin, animate-pulse, animate-bounce
animate-fade-in, animate-slide-up /* Custom */
```

### Interactions
- Hover effects
- Click feedback
- Loading animations
- Smooth transitions

## Accessibility

### Benefits from Radix UI
- Keyboard navigation
- Screen reader support
- Automatic ARIA attributes
- Focus management

### Additional Considerations
- Color contrast ratios
- Adjustable font sizes
- Touch target sizes
