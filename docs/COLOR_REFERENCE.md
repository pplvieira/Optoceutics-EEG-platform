# Color Reference Guide

This document provides a quick reference for where colors are defined and how they're used in the codebase.

## Color Definition Locations

### Primary Location: `src/app/styles/globals.css`

All CSS color variables are defined in the `:root` selector:

```css
:root {
  /* Brand Colors - Primary */
  --brand-navy: #002D5F;
  --brand-gold: #D4A439;
  --brand-light-gold: #E8C547;
  --brand-white: #FFFFFF;
  
  /* Brand Colors - Supporting */
  --brand-light-gray: #F9FAFB;
  --brand-med-gray: #6B7280;
  --brand-green: #10B981;
  --brand-red: #EF4444;
  --brand-blue: #3B82F6;
  
  /* Legacy aliases (backward compatibility) */
  --navy: var(--brand-navy);
  --gold: var(--brand-gold);
  --gold-light: var(--brand-light-gold);
  /* ... */
}
```

### Tailwind Configuration: `tailwind.config.js`

Colors are exposed to Tailwind CSS:

```javascript
colors: {
  'brand': {
    'navy': 'var(--brand-navy)',
    'gold': 'var(--brand-gold)',
    // ...
  },
  // Legacy support
  'navy': 'var(--brand-navy)',
  'gold': 'var(--brand-gold)',
}
```

## Current Color Usage

### Primary Brand Colors

1. **Brand Navy (`--brand-navy: #002D5F`)**
   - Used in: Headers, navigation, primary buttons
   - Files: `src/app/page.tsx`, various components
   - Tailwind: `bg-brand-navy`, `text-brand-navy`

2. **Brand Gold (`--brand-gold: #D4A439`)**
   - Used in: Accent elements, active states, CTAs
   - Files: `src/app/page.tsx`, button components
   - Tailwind: `bg-brand-gold`, `text-brand-gold`

3. **Brand Light Gold (`--brand-light-gold: #E8C547`)**
   - Used in: Hover states, secondary highlights
   - Tailwind: `bg-brand-light-gold`

### Supporting Colors

- **Brand Green (`--brand-green: #10B981`)**: Success states
- **Brand Red (`--brand-red: #EF4444`)**: Error states
- **Brand Blue (`--brand-blue: #3B82F6`)**: Information, links
- **Brand Light Gray (`--brand-light-gray: #F9FAFB`)**: Backgrounds
- **Brand Med Gray (`--brand-med-gray: #6B7280`)**: Secondary text

## Migration Status

### ✅ Completed
- Brand colors defined in CSS variables
- Tailwind config updated
- Design system documentation created
- Legacy color variables maintained for compatibility

### ⏳ In Progress
- Component-by-component migration to new brand colors
- Removal of inline color values in favor of CSS variables

### 📋 Remaining
- Full migration of all components to use `brand-*` Tailwind classes
- Removal of legacy color variables (after full migration)

## Usage Examples

### Using CSS Variables Directly
```tsx
<div style={{ backgroundColor: 'var(--brand-navy)' }}>
```

### Using Tailwind Classes (Recommended)
```tsx
<div className="bg-brand-navy text-brand-white">
```

### Legacy Support (Still Works)
```tsx
<div className="bg-[var(--navy)]">
```

## Files That Use Colors

1. **`src/app/page.tsx`** - Main page with mode switching
2. **`src/app/components/common/Button.tsx`** - Button component with brand variants
3. **`src/app/components/common/Card.tsx`** - Card component
4. **`src/app/components/edf-processor/PyodideEDFProcessor.tsx`** - Main EDF processor
5. **`src/app/components/dashboard/ComprehensiveEDFDashboard.tsx`** - Dashboard
6. **`src/app/components/experiments/P300Experiment.tsx`** - P300 experiment
7. **All other component files** - Various UI elements

## Color Source

Colors are sourced from `eegbrand.sty` LaTeX styling document:
- BrandNavy: `#002D5F`
- BrandGold: `#D4A439`
- BrandLightGold: `#E8C547`

See `docs/DESIGN_SYSTEM.md` for complete design guidelines.

---

**Last Updated:** December 2024

