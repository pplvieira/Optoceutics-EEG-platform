# Step-by-Step Git Merge Commands

## Current Situation
- **Remote has ~40+ commits** that you don't have locally
- **You have uncommitted local changes** (refactoring, reorganization)
- **Need to merge** remote changes with your local work

## ⚠️ IMPORTANT: Read This First

Your local changes include:
- Major refactoring (moving files to `src/` structure)
- New documentation
- Component updates
- Build fixes

The remote changes include:
- PSD comparison features
- FOOOF analysis
- Multi-file management
- Various bug fixes

**These will likely conflict!** Follow the steps carefully.

---

## Step 1: Create a Backup Branch (SAFETY FIRST)

```bash
# Create a backup of your current state
git branch backup-local-changes-$(date +%Y%m%d)
```

## Step 2: Commit Your Local Changes

```bash
# Stage all your changes
git add -A

# Commit with a descriptive message
git commit -m "Refactor: Reorganize project structure and update components

- Move components to src/app structure  
- Update color scheme to new brand colors
- Refactor PyodideEDFProcessor with hooks
- Add comprehensive documentation
- Fix build errors and linting issues
- Reorganize backend and scripts folders"
```

## Step 3: Check What Will Conflict

```bash
# See which files will likely conflict
git diff --name-only HEAD origin/master

# See detailed differences (optional, can be long)
git diff HEAD origin/master --stat
```

## Step 4: Attempt the Merge

```bash
# Pull and merge remote changes
git pull origin master
```

**If this succeeds without conflicts**, you're done! Skip to Step 6.

**If you see conflicts**, continue to Step 5.

## Step 5: Resolve Conflicts

### 5a. Identify Conflicted Files

```bash
# See which files have conflicts
git status
```

Files with conflicts will show as:
```
both modified:   <filename>
```

### 5b. View Conflicts in Each File

```bash
# Open each conflicted file and look for markers:
# <<<<<<< HEAD
# (your local changes)
# =======
# (remote changes)
# >>>>>>> origin/master
```

### 5c. Common Conflict Scenarios

#### Scenario 1: File Structure Changed
- **Local**: Moved `app/components/PyodideEDFProcessor.tsx` to `src/app/components/edf-processor/PyodideEDFProcessor.tsx`
- **Remote**: Modified `app/components/PyodideEDFProcessor.tsx`
- **Solution**: Keep your new location, manually apply remote changes to the new file

#### Scenario 2: Same File Modified Differently
- **Local**: Updated colors and refactored code
- **Remote**: Added new features (PSD comparison, FOOOF)
- **Solution**: Manually merge both changes, keeping both your refactoring AND remote features

#### Scenario 3: File Deleted Locally, Modified Remotely
- **Local**: Deleted `app/components/ComprehensiveEDFDashboard.tsx`
- **Remote**: Modified it
- **Solution**: Decide if you still need it. If yes, restore and merge. If no, keep deleted.

### 5d. Resolve Each Conflict

For each conflicted file:

1. **Open the file** in your editor
2. **Find conflict markers**:
   ```
   <<<<<<< HEAD
   Your local code
   =======
   Remote code
   >>>>>>> origin/master
   ```
3. **Edit to keep what you need**:
   - Keep your changes
   - Keep remote changes  
   - Combine both
   - Write something new
4. **Remove all conflict markers** (`<<<<<<<`, `=======`, `>>>>>>>`)
5. **Save the file**

### 5e. Mark Conflicts as Resolved

```bash
# After resolving conflicts in a file, stage it
git add <resolved-file>

# Repeat for all conflicted files
# Then complete the merge
git commit
```

## Step 6: Verify Everything Works

```bash
# Check status
git status

# Test your build (if possible)
# npm run build

# Check for any remaining issues
git log --oneline -5
```

## Step 7: Push Your Merged Changes

```bash
# Push to remote
git push origin master
```

---

## Alternative: Use Rebase (Cleaner History)

If you prefer a linear history:

```bash
# After committing your changes (Step 2)
git pull --rebase origin master

# If conflicts occur:
# 1. Resolve conflicts (same as Step 5)
# 2. Stage resolved files: git add <file>
# 3. Continue rebase: git rebase --continue
# 4. Repeat until rebase completes
```

---

## If Things Go Wrong

### Abort the Merge

```bash
# If merge hasn't been committed yet
git merge --abort

# Or if rebasing
git rebase --abort
```

### Restore from Backup

```bash
# Switch to your backup branch
git checkout backup-local-changes-YYYYMMDD

# Or reset current branch to backup
git reset --hard backup-local-changes-YYYYMMDD
```

### See What Changed

```bash
# Compare your branch with remote
git diff HEAD origin/master

# See commit history
git log --oneline --graph --all -20
```

---

## Quick Reference Commands

```bash
# Check status
git status

# See what's different
git diff HEAD origin/master

# See conflicted files
git diff --name-only --diff-filter=U

# Accept all remote changes for a file
git checkout --theirs <file>
git add <file>

# Accept all your local changes for a file
git checkout --ours <file>
git add <file>

# See merge progress
git log --oneline --graph --all -10
```

