# Comprehensive Implementation Plan

## Overview

This document outlines a systematic plan to refactor the EEG Platform codebase to follow industry standards, improve code quality, and implement all recommendations from the codebase analysis.

**Target:** Production-ready, maintainable, scalable codebase suitable for public team collaboration.

---

## Phase 1: Project Structure Reorganization

### 1.1 Standard Node.js/Next.js Project Structure

**Current Issues:**
- Files scattered in root directory
- No clear separation of concerns
- Non-standard folder naming
- Mixed concerns (scripts, docs, configs in root)

**Target Structure:**
```
eeg-platform/
├── .github/                    # GitHub workflows, templates
├── docs/                       # All documentation (already created)
├── public/                     # Static assets
│   ├── assets/                # Images, logos
│   ├── questionnaires/        # Questionnaire JSON files
│   └── pyodide-packages/      # Custom Python wheels
├── src/                        # Source code (NEW - industry standard)
│   ├── app/                   # Next.js app directory
│   │   ├── components/        # React components
│   │   ├── lib/              # Shared utilities
│   │   ├── services/         # Business logic services
│   │   ├── types/            # TypeScript types
│   │   ├── hooks/             # Custom React hooks (NEW)
│   │   ├── styles/            # CSS, Tailwind config (NEW)
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── server/                # Server-side code (NEW)
│   │   └── api/              # API routes (if needed)
│   └── shared/                # Shared code (NEW)
│       ├── constants/         # Constants, configs
│       ├── utils/            # Utility functions
│       └── types/            # Shared types
├── scripts/                    # Build and utility scripts (NEW)
│   ├── create-test-edf.py
│   ├── generate-test-audio.py
│   └── setup.sh
├── backend/                    # Python backend (renamed from python-backend)
│   ├── src/                   # Python source code
│   │   └── main.py
│   ├── tests/                 # Python tests
│   ├── requirements.txt
│   └── README.md
├── packages/                   # Monorepo packages (if needed in future)
├── .env.example               # Environment variable template
├── .gitignore
├── package.json
├── tsconfig.json
├── next.config.ts             # Single config file
├── tailwind.config.ts         # TypeScript config
├── postcss.config.mjs         # Single config file
└── README.md
```

**Actions:**
1. Create `src/` directory structure
2. Move `app/` → `src/app/`
3. Create `src/app/hooks/` for custom hooks
4. Create `src/app/styles/` for CSS organization
5. Create `scripts/` directory and move Python scripts
6. Rename `python-backend/` → `backend/`
7. Create `.env.example` template
8. Consolidate config files (remove duplicates)

**Files to Move:**
- `app/` → `src/app/`
- `create_test_edf.py` → `scripts/create-test-edf.py`
- `generate_test_audio.py` → `scripts/generate-test-audio.py`
- `test_40hz_am_audio.wav` → `public/assets/test_40hz_am_audio.wav` or delete if not needed

**Files to Delete:**
- `next.config.js` (keep only `next.config.ts`)
- `postcss.config.js` (keep only `postcss.config.mjs`)
- `app/components/SSVEPAnalysisTool.tsx.backup`
- `questionnaires/` folder (duplicate of `public/questionnaires/`)

**Files to Consolidate:**
- Move all root-level markdown docs to `docs/`:
  - `CLIENT_SIDE_EDF_SOLUTION.md` → `docs/CLIENT_SIDE_EDF_SOLUTION.md`
  - `DEPLOYMENT_REPORT.md` → `docs/DEPLOYMENT_REPORT.md`
  - `EDF_INTEGRATION_README.md` → `docs/EDF_INTEGRATION_README.md`
  - `TESTING_GUIDE.md` → `docs/TESTING_GUIDE.md`

**Unused Components to Remove or Archive:**
- `app/components/LocalEDFUpload.tsx` (not imported anywhere)
- `app/components/LocalEDFAnalysis.tsx` (not imported anywhere)
- `app/components/EDFViewerTool.tsx` (disabled in UI, decide: remove or fix)
- `app/components/VercelEDFUpload.tsx` (legacy, check if used)
- `app/components/VercelEDFAnalysis.tsx` (legacy, check if used)

**Legacy API Folder:**
- `api/` folder contains Vercel serverless functions (likely unused)
- Decision needed: Remove or move to `src/server/api/` if still needed

**Resutil Folder:**
- `resutil/` at root - Decision needed:
  - Option A: Move to `packages/resutil/` if it's a local package
  - Option B: Publish to npm/pypi and install as dependency
  - Option C: Move to `backend/src/resutil/` if backend-only

---

## Phase 2: Component Refactoring

### 2.1 Split Large Components

**Priority: HIGH**

#### 2.1.1 PyodideEDFProcessor.tsx (4,287 lines → Multiple files)

**Current Structure:**
- Single massive component with mixed concerns

**Target Structure:**
```
src/app/components/edf-processor/
├── PyodideEDFProcessor.tsx          # Main component (orchestrator, ~200 lines)
├── hooks/
│   ├── usePyodide.ts                # Pyodide initialization and management
│   ├── useEDFFile.ts                # EDF file reading logic
│   ├── useAnalysis.ts                # Analysis execution logic
│   └── useVisualization.ts          # Visualization state management
├── components/
│   ├── FileUpload.tsx               # File upload UI
│   ├── MetadataDisplay.tsx           # Metadata display
│   ├── AnalysisControls.tsx         # Analysis parameter controls
│   ├── ResultsDisplay.tsx            # Results visualization
│   ├── ChannelSelector.tsx          # Channel selection UI
│   ├── AnnotationManager.tsx        # Annotation management
│   └── ReportGenerator.tsx           # PDF/DOCX generation UI
├── services/
│   ├── pyodideService.ts            # Pyodide wrapper service
│   ├── edfService.ts                # EDF reading service
│   ├── analysisService.ts           # Analysis execution service
│   └── visualizationService.ts     # Visualization generation
└── types/
    └── edfProcessor.ts              # Component-specific types
```

**Refactoring Steps:**
1. Extract Pyodide initialization → `usePyodide.ts` hook
2. Extract file reading logic → `useEDFFile.ts` hook
3. Extract analysis logic → `useAnalysis.ts` hook
4. Extract UI components (FileUpload, MetadataDisplay, etc.)
5. Extract services (pyodideService, edfService, etc.)
6. Update main component to use hooks and sub-components

**Estimated Lines per File:**
- Main component: ~200 lines
- Each hook: ~150-300 lines
- Each sub-component: ~100-200 lines
- Services: ~200-400 lines each

#### 2.1.2 SSVEPAnalysisTool.tsx (2,737 lines → Multiple files)

**Target Structure:**
```
src/app/components/ssvep-tool/
├── SSVEPAnalysisTool.tsx            # Main component (~200 lines)
├── hooks/
│   ├── useSSVEPPyodide.ts          # Pyodide for SSVEP
│   ├── useFilePairing.ts            # File pairing logic
│   ├── useSynchronization.ts       # Time synchronization
│   └── useSSVEPAnalysis.ts          # SSVEP analysis execution
├── components/
│   ├── FileUploadStep.tsx           # Step 1: File upload
│   ├── FilePairingStep.tsx          # Step 2: File pairing
│   ├── SynchronizationStep.tsx      # Step 3: Synchronization
│   ├── ManualAdjustStep.tsx         # Step 4: Manual adjustment
│   ├── AnalysisStep.tsx             # Step 5: Analysis
│   └── ResultsStep.tsx              # Step 6: Results
├── services/
│   ├── ssvepAnalysisService.ts     # SSVEP analysis service
│   ├── filePairingService.ts        # File pairing service
│   └── synchronizationService.ts   # Synchronization service
└── types/
    └── ssvep.ts                     # SSVEP-specific types
```

#### 2.1.3 page.tsx (997 lines → Multiple files)

**Target Structure:**
```
src/app/
├── page.tsx                         # Main page (~100 lines)
├── components/
│   ├── ModeSelector.tsx             # Mode selection UI
│   ├── DeveloperDashboard.tsx       # Developer mode content
│   ├── ExperimentDashboard.tsx       # Experiment mode content
│   └── ResultsDashboard.tsx          # Results display
└── hooks/
    └── useModeNavigation.ts          # Mode navigation logic
```

### 2.2 Component Organization

**Current:** All components in single `components/` folder

**Target:** Organized by feature/domain

```
src/app/components/
├── common/                          # Shared UI components
│   ├── Button.tsx
│   ├── Card.tsx
│   ├── Modal.tsx
│   └── LoadingSpinner.tsx
├── edf-processor/                   # EDF processing feature
│   └── [structure from 2.1.1]
├── ssvep-tool/                      # SSVEP analysis feature
│   └── [structure from 2.1.2]
├── experiments/                     # Experiment components
│   ├── P300Experiment.tsx
│   ├── AuditoryStimulus40Hz.tsx
│   └── QuestionnaireSystem.tsx
└── dashboard/                       # Dashboard components
    ├── ComprehensiveEDFDashboard.tsx
    └── [other dashboard components]
```

---

## Phase 3: Type Safety Improvements

### 3.1 Replace `any` Types

**Current Issues:**
- Extensive use of `any` types throughout codebase
- Pyodide types not properly defined
- Analysis result types inconsistent

**Actions:**

1. **Create Pyodide Type Definitions**
   - File: `src/app/types/pyodide.ts`
   ```typescript
   export interface PyodideInstance {
     runPython: (code: string) => any;
     runPythonAsync: (code: string) => Promise<any>;
     loadPackage: (packages: string[]) => Promise<void>;
     pyimport: (module: string) => any;
     globals: {
       set: (key: string, value: any) => void;
       get: (key: string) => any;
     };
   }
   
   export interface PyodideConfig {
     indexURL?: string;
   }
   
   declare global {
     interface Window {
       loadPyodide: (config?: PyodideConfig) => Promise<PyodideInstance>;
       pyodide?: PyodideInstance;
     }
   }
   ```

2. **Create Strict Analysis Result Types**
   - File: `src/app/types/analysis.ts`
   ```typescript
   export interface PSDResult {
     frequencies: number[];
     psd_values: number[];
     channel: string;
   }
   
   export interface SNRResult {
     frequencies: number[];
     snr_values: number[];
     channel: string;
     snr_db: number;
   }
   
   export interface SSVEPDetectionResult {
     peak_power: number;
     snr_db: number;
     target_frequency: number;
     detection_confidence: 'high' | 'medium' | 'low';
   }
   
   // ... more specific types
   ```

3. **Replace `any` in Components**
   - Systematically replace all `any` types
   - Use proper interfaces
   - Add type guards where needed

**Files to Update:**
- `src/app/components/**/*.tsx` (all component files)
- `src/app/hooks/**/*.ts` (all hook files)
- `src/app/services/**/*.ts` (all service files)

---

## Phase 4: Brand Design System

### 4.1 Update Color System

**Current Colors (app/globals.css):**
```css
--navy: #3E4B7A;
--navy-dark: #2A3354;
--navy-light: #5A6B9D;
--gold: #f59e0b;
--gold-light: #fbbf24;
```

**New Brand Colors (from eegbrand.sty):**
```css
--brand-navy: #002D5F;           /* BrandNavy - Professional, medical authority */
--brand-gold: #D4A439;           /* BrandGold - Innovation, progress */
--brand-light-gold: #E8C547;     /* BrandLightGold - Optimism */
--brand-white: #FFFFFF;          /* BrandWhite */
--brand-light-gray: #F9FAFB;     /* BrandLightGray */
--brand-med-gray: #6B7280;       /* BrandMedGray */
--brand-green: #10B981;          /* BrandGreen - Success */
--brand-red: #EF4444;            /* BrandRed - Error */
--brand-blue: #3B82F6;           /* BrandBlue */
```

**Implementation:**

1. **Update `src/app/styles/globals.css`** (moved from app/globals.css)
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
     
     /* Legacy aliases (for backward compatibility during migration) */
     --navy: var(--brand-navy);
     --gold: var(--brand-gold);
     --gold-light: var(--brand-light-gold);
     
     /* Dark mode colors */
     --dark-bg: #1a1a1a;
     --dark-bg-secondary: #2a2a2a;
     --dark-bg-tertiary: #333333;
     --dark-text: #e2e8f0;
     --dark-text-secondary: #94a3b8;
     --dark-border: #404040;
     --dark-card: #252525;
   }
   ```

2. **Update `tailwind.config.ts`**
   ```typescript
   export default {
     theme: {
       extend: {
         colors: {
           'brand': {
             'navy': 'var(--brand-navy)',
             'gold': 'var(--brand-gold)',
             'light-gold': 'var(--brand-light-gold)',
             'white': 'var(--brand-white)',
             'light-gray': 'var(--brand-light-gray)',
             'med-gray': 'var(--brand-med-gray)',
             'green': 'var(--brand-green)',
             'red': 'var(--brand-red)',
             'blue': 'var(--brand-blue)',
           },
           // Legacy support
           'navy': 'var(--brand-navy)',
           'gold': 'var(--brand-gold)',
         },
       },
     },
   };
   ```

3. **Create Design System Documentation**
   - File: `docs/DESIGN_SYSTEM.md`
   - Document all brand colors
   - Usage guidelines
   - Component color mappings

4. **Gradual Migration**
   - Phase 1: Add new colors alongside old ones
   - Phase 2: Update components to use new colors
   - Phase 3: Remove legacy color variables

**Files to Update:**
- `src/app/styles/globals.css` (color definitions)
- `tailwind.config.ts` (Tailwind color config)
- All component files using `var(--navy)`, `var(--gold)`, etc.

**Color Usage Locations:**
- `app/page.tsx` - Uses `var(--navy)`, `var(--gold)`, `var(--dark-*)`
- `app/components/PyodideEDFProcessor.tsx` - Uses various colors
- `app/components/ComprehensiveEDFDashboard.tsx` - Uses blue, green, etc.
- `app/components/SSVEPAnalysisTool.tsx` - Uses various colors
- `app/components/P300Experiment.tsx` - Uses `var(--gold)`, `var(--navy)`
- All other component files

---

## Phase 5: Code Quality Improvements

### 5.1 Error Handling

**Current Issues:**
- Inconsistent error handling patterns
- Some errors silently fail
- No centralized error handling

**Actions:**

1. **Create Error Handling Utilities**
   - File: `src/app/lib/errors.ts`
   ```typescript
   export class EDFProcessingError extends Error {
     constructor(message: string, public code: string, public details?: any) {
       super(message);
       this.name = 'EDFProcessingError';
     }
   }
   
   export class PyodideError extends Error {
     constructor(message: string, public details?: any) {
       super(message);
       this.name = 'PyodideError';
     }
   }
   
   export function handleError(error: unknown, context: string): void {
     // Centralized error logging and user notification
   }
   ```

2. **Create Error Boundary Component**
   - File: `src/app/components/common/ErrorBoundary.tsx`
   - Wrap main app sections

3. **Update All Components**
   - Replace try-catch with proper error handling
   - Use error utilities
   - Show user-friendly error messages

### 5.2 State Management

**Current Issues:**
- Many useState hooks in large components
- No state management library
- Potential synchronization issues

**Actions:**

1. **Evaluate State Management Solution**
   - Option A: Zustand (lightweight, recommended)
   - Option B: Redux Toolkit (if complex state needed)
   - Option C: React Context (for simple cases)

2. **Create Store Structure** (if using Zustand)
   ```
   src/app/stores/
   ├── useEDFStore.ts          # EDF file state
   ├── useAnalysisStore.ts     # Analysis state
   ├── usePyodideStore.ts      # Pyodide state
   └── useUIStore.ts           # UI state
   ```

3. **Migrate State**
   - Extract complex state to stores
   - Keep local state for component-specific UI

### 5.3 Code Duplication

**Current Issues:**
- Pyodide initialization duplicated
- File reading logic in multiple places
- Similar visualization code

**Actions:**

1. **Extract Common Hooks**
   - `usePyodide.ts` - Single source for Pyodide initialization
   - `useEDFReader.ts` - Single source for EDF reading

2. **Create Shared Services**
   - `pyodideService.ts` - Pyodide wrapper
   - `edfService.ts` - EDF operations
   - `visualizationService.ts` - Plot generation

3. **Create Shared Components**
   - `FileUpload.tsx` - Reusable file upload
   - `ChannelSelector.tsx` - Reusable channel selector
   - `AnalysisResults.tsx` - Reusable results display

---

## Phase 6: Testing Infrastructure

### 6.1 Setup Testing Framework

**Actions:**

1. **Install Testing Dependencies**
   ```json
   {
     "devDependencies": {
       "@testing-library/react": "^14.0.0",
       "@testing-library/jest-dom": "^6.1.0",
       "@testing-library/user-event": "^14.5.0",
       "jest": "^29.7.0",
       "jest-environment-jsdom": "^29.7.0",
       "@types/jest": "^29.5.0"
     }
   }
   ```

2. **Create Test Structure**
   ```
   src/
   ├── __tests__/              # Component tests
   │   ├── components/
   │   ├── hooks/
   │   └── services/
   └── app/
       └── [components with .test.tsx files]
   ```

3. **Create Test Utilities**
   - `src/__tests__/utils/testUtils.tsx`
   - Mock Pyodide
   - Mock EDF files
   - Test helpers

### 6.2 Write Critical Tests

**Priority Tests:**
1. Pyodide initialization
2. EDF file reading
3. Analysis execution
4. Error handling
5. Component rendering

---

## Phase 7: Documentation

### 7.1 Code Documentation

**Actions:**

1. **Add JSDoc Comments**
   - All public functions
   - All exported types
   - Complex algorithms

2. **Create Component Documentation**
   - Props documentation
   - Usage examples
   - State management notes

3. **Update README**
   - Project structure
   - Development setup
   - Contribution guidelines

### 7.2 Design System Documentation

**Actions:**

1. **Create `docs/DESIGN_SYSTEM.md`**
   - Brand colors
   - Typography
   - Component guidelines
   - Usage examples

---

## Phase 8: Performance Optimization

### 8.1 Code Splitting

**Actions:**

1. **Implement Dynamic Imports**
   - Lazy load Pyodide
   - Lazy load heavy components
   - Route-based code splitting

2. **Optimize Bundle Size**
   - Analyze bundle
   - Remove unused dependencies
   - Optimize imports

### 8.2 Memory Management

**Actions:**

1. **Implement File Chunking**
   - Process large files in chunks
   - Stream processing where possible

2. **Add Memory Monitoring**
   - Warn users about large files
   - Provide memory usage feedback

---

## Implementation Timeline

### Phase 1: Structure (Week 1-2)
- Reorganize project structure
- Move files to proper locations
- Remove duplicates
- Consolidate configs

### Phase 2: Component Refactoring (Week 3-5)
- Split large components
- Extract hooks and services
- Organize by feature

### Phase 3: Type Safety (Week 6-7)
- Create type definitions
- Replace `any` types
- Add type guards

### Phase 4: Brand Design (Week 8)
- Update color system
- Migrate components
- Create design docs

### Phase 5: Code Quality (Week 9-10)
- Error handling
- State management
- Remove duplication

### Phase 6: Testing (Week 11-12)
- Setup testing
- Write critical tests
- CI/CD integration

### Phase 7: Documentation (Week 13)
- Code documentation
- Design system docs
- Update README

### Phase 8: Performance (Week 14)
- Code splitting
- Memory optimization
- Bundle optimization

**Total Estimated Time:** 14 weeks (3.5 months)

---

## Risk Assessment

### High Risk
- **Component Refactoring**: Large components, many dependencies
  - **Mitigation**: Incremental refactoring, comprehensive testing
- **Type Safety**: Extensive `any` usage
  - **Mitigation**: Gradual migration, type guards

### Medium Risk
- **State Management**: Complex state interactions
  - **Mitigation**: Careful migration, state diagrams
- **Performance**: Large file processing
  - **Mitigation**: Benchmarking, optimization

### Low Risk
- **Brand Colors**: Simple CSS updates
- **Documentation**: Non-breaking changes

---

## Success Criteria

1. ✅ All components under 500 lines
2. ✅ Zero `any` types (except where necessary)
3. ✅ 80%+ test coverage for critical paths
4. ✅ All files in proper locations
5. ✅ Brand colors fully implemented
6. ✅ No duplicate files
7. ✅ Comprehensive documentation
8. ✅ Performance benchmarks met

---

## Questions for Clarification

Before starting implementation, please clarify:

1. **Resutil Folder**: Should `resutil/` be:
   - A) Moved to `packages/resutil/` as local package
   - B) Published to npm/pypi and installed as dependency
   - C) Moved to `backend/src/resutil/` if backend-only

2. **Legacy Components**: Should we:
   - A) Remove `LocalEDFUpload.tsx` and `LocalEDFAnalysis.tsx` (unused)
   - B) Keep for potential future use
   - C) Archive in `docs/legacy/`

3. **API Folder**: Should `api/` (Vercel serverless functions):
   - A) Be removed (if unused)
   - B) Be moved to `src/server/api/` (if still needed)
   - C) Be archived

4. **EDFViewerTool**: Currently disabled in UI:
   - A) Remove completely
   - B) Fix and re-enable
   - C) Archive

5. **Testing Priority**: Which should be tested first?
   - A) Critical user paths (file upload, analysis)
   - B) Complex algorithms (SSVEP detection)
   - C) All components equally

---

**Last Updated:** December 2024  
**Status:** Planning Phase - Awaiting Approval

