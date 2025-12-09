# Pre-Deployment Checklist

## ⚠️ IMPORTANT: Run this checklist BEFORE every `git push` to ensure Vercel deployment success!

---

## Quick Start

### Windows (PowerShell)
```powershell
# 1. Fix PowerShell execution policy (one-time setup)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# 2. Run the validation script
.\pre-deploy-check.ps1
```

### Manual Validation (if script fails)

Run these commands in order:

```bash
# 1. Install dependencies
npm install

# 2. Type check
npx tsc --noEmit

# 3. Production build test
npm run build

# 4. Check for uncommitted files
git status
```

---

## What Each Step Checks

### 1. **Git Status**
- Ensures you don't have uncommitted changes
- Verifies your working tree is clean

### 2. **Dependencies**
- Ensures `package-lock.json` is in sync with `package.json`
- Installs any missing packages

### 3. **TypeScript Check**
- Validates all TypeScript files compile without errors
- Catches type errors that would break the build

### 4. **Production Build**
- Runs the same build process Vercel will use
- Catches any build-time errors before deployment

---

## If Build Fails

### Common Issues

#### 1. **TypeScript Errors**
```bash
# Check specific file for errors
npx tsc --noEmit | grep "error TS"

# Restart TypeScript server in VS Code
# Press: Ctrl+Shift+P → "TypeScript: Restart TS Server"
```

#### 2. **Module Not Found**
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

#### 3. **Next.js Build Errors**
```bash
# Clear Next.js cache
rm -rf .next
npm run build
```

#### 4. **Out of Memory**
```bash
# Increase Node.js memory limit
$env:NODE_OPTIONS="--max-old-space-size=4096"
npm run build
```

---

## After Successful Validation

✅ Once all checks pass, you can safely push:

```bash
git add .
git commit -m "Your commit message"
git push origin master
```

Vercel will automatically deploy your changes!

> Note: We removed the custom `functions` pattern in `vercel.json` (it was pointing to `api/**/*.py` that does not exist). Vercel now uses its defaults, so deployments will not fail on missing serverless functions. If you add Vercel functions later, update `vercel.json` accordingly.

---

## Automation (Optional)

### Git Pre-Push Hook

Create `.git/hooks/pre-push`:

```bash
#!/bin/sh
# Run pre-deployment checks before push

echo "Running pre-deployment validation..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Push aborted."
    echo "Fix the errors and try again."
    exit 1
fi

echo "✅ Build successful. Proceeding with push..."
exit 0
```

Make it executable:
```bash
chmod +x .git/hooks/pre-push
```

---

## Troubleshooting

### PowerShell Execution Policy Error

If you see:
```
File cannot be loaded because running scripts is disabled on this system
```

**Solution:**
```powershell
# Run PowerShell as Administrator
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Vercel Build Logs

If deployment still fails on Vercel:

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click on your project
3. Click on the failed deployment
4. Check the "Building" tab for error details
5. Compare with your local build output

---

## Contact

If you encounter persistent build issues, check:
- Vercel build logs
- Next.js documentation
- TypeScript documentation

