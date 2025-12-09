# Pre-Deployment Validation Script
# Run this before every Git push to ensure Vercel deployment will succeed

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   PRE-DEPLOYMENT VALIDATION CHECK" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check for uncommitted changes
Write-Host "[1/5] Checking for uncommitted changes..." -ForegroundColor Yellow
$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Host "Warning: You have uncommitted changes" -ForegroundColor Red
    git status --short
    Write-Host ""
    $continue = Read-Host "Continue anyway? (y/n)"
    if ($continue -ne "y") {
        exit 1
    }
} else {
    Write-Host "No uncommitted changes" -ForegroundColor Green
}
Write-Host ""

# Step 2: Install dependencies
Write-Host "[2/5] Installing dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "npm install failed" -ForegroundColor Red
    exit 1
}
Write-Host "Dependencies installed" -ForegroundColor Green
Write-Host ""

# Step 3: Run TypeScript check
Write-Host "[3/5] Running TypeScript type check..." -ForegroundColor Yellow
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) {
    Write-Host "TypeScript check failed" -ForegroundColor Red
    Write-Host "Fix the TypeScript errors above before deploying" -ForegroundColor Red
    exit 1
}
Write-Host "TypeScript check passed" -ForegroundColor Green
Write-Host ""

# Step 4: Run Next.js build
Write-Host "[4/5] Running production build..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed" -ForegroundColor Red
    Write-Host "Fix the build errors above before deploying" -ForegroundColor Red
    exit 1
}
Write-Host "Build successful" -ForegroundColor Green
Write-Host ""

# Step 5: Summary
Write-Host "========================================" -ForegroundColor Green
Write-Host "   ALL CHECKS PASSED" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Your code is ready to deploy!" -ForegroundColor Green
Write-Host "You can now safely run: git push origin master" -ForegroundColor Cyan
Write-Host ""
