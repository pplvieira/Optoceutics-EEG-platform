#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Pre-Deployment Validation Script
 * Runs TypeScript check and Next.js build to ensure deployment will succeed
 */

const { execSync } = require('child_process');

console.log('\n========================================');
console.log('   PRE-DEPLOYMENT VALIDATION CHECK');
console.log('========================================\n');

let hasErrors = false;

// Step 1: Check for uncommitted changes
console.log('[1/4] Checking for uncommitted changes...');
try {
  const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' });
  if (gitStatus.trim()) {
    console.log('⚠️  Warning: You have uncommitted changes');
    console.log(gitStatus);
  } else {
    console.log('✓ No uncommitted changes\n');
  }
} catch (error) {
  console.log('⚠️  Could not check git status\n');
  console.error(error);
}

// Step 2: Install dependencies
console.log('[2/4] Installing dependencies...');
try {
  execSync('npm install', { stdio: 'inherit' });
  console.log('✓ Dependencies installed\n');
} catch (error) {
  console.error('✗ npm install failed');
  console.error(error);
  process.exit(1);
}

// Step 3: TypeScript check
console.log('[3/4] Running TypeScript type check...');
try {
  execSync('npx tsc --noEmit', { stdio: 'inherit' });
  console.log('✓ TypeScript check passed\n');
} catch (error) {
  console.error('✗ TypeScript check failed');
  console.error('Fix the TypeScript errors above before deploying\n');
  console.error(error);
  hasErrors = true;
}

// Step 4: Production build
console.log('[4/4] Running production build...');
try {
  execSync('npm run build', { stdio: 'inherit' });
  console.log('✓ Build successful\n');
} catch (error) {
  console.error('✗ Build failed');
  console.error('Fix the build errors above before deploying\n');
  console.error(error);
  hasErrors = true;
}

// Summary
if (hasErrors) {
  console.log('========================================');
  console.log('   ✗ VALIDATION FAILED');
  console.log('========================================\n');
  console.log('Please fix the errors above before deploying.\n');
  process.exit(1);
} else {
  console.log('========================================');
  console.log('   ✓ ALL CHECKS PASSED');
  console.log('========================================\n');
  console.log('Your code is ready to deploy!');
  console.log('You can now safely run: git push origin master\n');
  process.exit(0);
}

