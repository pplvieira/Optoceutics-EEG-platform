# Design System Documentation

## Brand Colors

This document defines the brand color system for the EEG Platform, based on the official brand guidelines from `eegbrand.sty`.

### Primary Colors

#### Brand Navy (`--brand-navy: #002D5F`)
- **Usage**: Primary brand color, professional and medical authority
- **Use for**: Headers, primary buttons, navigation, important UI elements
- **Accessibility**: High contrast on white backgrounds
- **CSS Variable**: `var(--brand-navy)`
- **Tailwind**: `bg-brand-navy`, `text-brand-navy`, `border-brand-navy`

#### Brand Gold (`--brand-gold: #D4A439`)
- **Usage**: Innovation and progress, accent color
- **Use for**: Highlights, active states, call-to-action buttons, important information
- **Accessibility**: Good contrast on navy backgrounds
- **CSS Variable**: `var(--brand-gold)`
- **Tailwind**: `bg-brand-gold`, `text-brand-gold`, `border-brand-gold`

#### Brand Light Gold (`--brand-light-gold: #E8C547`)
- **Usage**: Optimism, lighter accent
- **Use for**: Hover states, secondary highlights, optimistic messaging
- **CSS Variable**: `var(--brand-light-gold)`
- **Tailwind**: `bg-brand-light-gold`, `text-brand-light-gold`

#### Brand White (`--brand-white: #FFFFFF`)
- **Usage**: Backgrounds, text on dark backgrounds
- **CSS Variable**: `var(--brand-white)`
- **Tailwind**: `bg-brand-white`, `text-brand-white`

### Supporting Colors

#### Brand Light Gray (`--brand-light-gray: #F9FAFB`)
- **Usage**: Subtle backgrounds, card backgrounds
- **CSS Variable**: `var(--brand-light-gray)`
- **Tailwind**: `bg-brand-light-gray`

#### Brand Medium Gray (`--brand-med-gray: #6B7280`)
- **Usage**: Secondary text, borders, disabled states
- **CSS Variable**: `var(--brand-med-gray)`
- **Tailwind**: `bg-brand-med-gray`, `text-brand-med-gray`

#### Brand Green (`--brand-green: #10B981`)
- **Usage**: Success states, positive feedback, completed actions
- **CSS Variable**: `var(--brand-green)`
- **Tailwind**: `bg-brand-green`, `text-brand-green`

#### Brand Red (`--brand-red: #EF4444`)
- **Usage**: Error states, warnings, destructive actions
- **CSS Variable**: `var(--brand-red)`
- **Tailwind**: `bg-brand-red`, `text-brand-red`

#### Brand Blue (`--brand-blue: #3B82F6`)
- **Usage**: Information, links, secondary actions
- **CSS Variable**: `var(--brand-blue)`
- **Tailwind**: `bg-brand-blue`, `text-brand-blue`

## Color Usage Guidelines

### Primary Actions
- **Primary Buttons**: `bg-brand-navy` with `text-brand-white`
- **Active States**: `bg-brand-gold` with `text-brand-navy`
- **Hover States**: `bg-brand-light-gold` with `text-brand-navy`

### Status Colors
- **Success**: `bg-brand-green` / `text-brand-green`
- **Error**: `bg-brand-red` / `text-brand-red`
- **Information**: `bg-brand-blue` / `text-brand-blue`

### Text Colors
- **Primary Text**: `text-gray-900` or `text-foreground`
- **Secondary Text**: `text-brand-med-gray`
- **On Dark Backgrounds**: `text-brand-white`

### Background Colors
- **Page Background**: `bg-background` or `bg-brand-light-gray`
- **Card Backgrounds**: `bg-brand-white`
- **Dark Mode**: Use dark mode variables (`--dark-bg`, etc.)

## Migration Guide

### Current State
The codebase currently uses legacy color variables:
- `--navy` → Maps to `--brand-navy`
- `--gold` → Maps to `--brand-gold`
- `--gold-light` → Maps to `--brand-light-gold`

### Migration Steps
1. **Phase 1** (Current): Legacy variables map to new brand colors
2. **Phase 2**: Update components to use `brand-*` Tailwind classes
3. **Phase 3**: Remove legacy variables

### Example Migration

**Before:**
```tsx
<div className="bg-[var(--navy)] text-white">
  <button className="bg-[var(--gold)] text-[var(--navy)]">
    Click me
  </button>
</div>
```

**After:**
```tsx
<div className="bg-brand-navy text-brand-white">
  <button className="bg-brand-gold text-brand-navy">
    Click me
  </button>
</div>
```

## Typography

### Font Family
- **Primary**: 'Inter', system-ui, sans-serif
- Defined in `globals.css` body styles

### Font Sizes
Use Tailwind's default typography scale:
- `text-xs` - 0.75rem (12px)
- `text-sm` - 0.875rem (14px)
- `text-base` - 1rem (16px)
- `text-lg` - 1.125rem (18px)
- `text-xl` - 1.25rem (20px)
- `text-2xl` - 1.5rem (24px)
- `text-3xl` - 1.875rem (30px)

## Spacing

Use Tailwind's spacing scale (multiples of 0.25rem):
- `p-1` - 0.25rem (4px)
- `p-2` - 0.5rem (8px)
- `p-4` - 1rem (16px)
- `p-6` - 1.5rem (24px)
- `p-8` - 2rem (32px)

## Component Guidelines

### Buttons

**Primary Button:**
```tsx
<button className="bg-brand-navy text-brand-white px-6 py-3 rounded-lg font-medium hover:bg-opacity-90 transition-colors">
  Primary Action
</button>
```

**Secondary Button:**
```tsx
<button className="bg-brand-gold text-brand-navy px-6 py-3 rounded-lg font-medium hover:bg-brand-light-gold transition-colors">
  Secondary Action
</button>
```

**Success Button:**
```tsx
<button className="bg-brand-green text-white px-6 py-3 rounded-lg font-medium hover:bg-opacity-90 transition-colors">
  Success Action
</button>
```

**Error Button:**
```tsx
<button className="bg-brand-red text-white px-6 py-3 rounded-lg font-medium hover:bg-opacity-90 transition-colors">
  Error Action
</button>
```

### Cards

```tsx
<div className="bg-brand-white border border-gray-200 rounded-lg p-6 shadow-md">
  {/* Card content */}
</div>
```

### Navigation

```tsx
<nav className="bg-brand-navy text-brand-white">
  {/* Navigation items */}
</nav>
```

## Dark Mode

Dark mode uses separate color variables:
- `--dark-bg`: Main dark background
- `--dark-bg-secondary`: Secondary dark background
- `--dark-text`: Primary text on dark
- `--dark-text-secondary`: Secondary text on dark

**Usage:**
```tsx
<div className="bg-[var(--dark-bg)] text-[var(--dark-text)]">
  {/* Dark mode content */}
</div>
```

## Accessibility

### Contrast Ratios
- **Brand Navy on White**: 12.6:1 (AAA)
- **Brand Gold on Navy**: 4.5:1 (AA)
- **Brand White on Navy**: 12.6:1 (AAA)

### Color Blindness
- Avoid relying solely on color to convey information
- Use icons, text labels, and patterns in addition to color
- Test with color blindness simulators

## Implementation Status

- ✅ Brand colors defined in CSS variables
- ✅ Tailwind config updated with brand colors
- ⏳ Component migration in progress
- ⏳ Legacy variable removal pending

---

**Last Updated:** December 2024

