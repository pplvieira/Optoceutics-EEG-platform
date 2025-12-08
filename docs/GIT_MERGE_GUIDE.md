# Git Merge Conflict Resolution Guide

## Current Situation
- **Local branch**: `master` at commit `a8d1f0094a283ae3bbc2e9ffeef93589fd802df8`
- **Remote branch**: `origin/master` at commit `a8d1f0094a283ae3bbc2e9ffeef93589fd802df8`
- **Status**: Same commit hash, but you have many uncommitted local changes

## Step-by-Step Process

### Step 1: Save Your Current Work

You have two options:

#### Option A: Commit Your Changes (Recommended)
This preserves your work in Git history:

```bash
# Stage all changes (deletions, modifications, and new files)
git add -A

# Commit with a descriptive message
git commit -m "Refactor: Reorganize project structure and update components

- Move components to src/app structure
- Update color scheme to new brand colors
- Refactor PyodideEDFProcessor with hooks
- Add comprehensive documentation
- Fix build errors and linting issues"
```

#### Option B: Stash Your Changes (Temporary)
This saves your changes temporarily without committing:

```bash
# Stash all changes including untracked files
git stash push -u -m "WIP: Refactoring and reorganization"

# To see your stashes later
git stash list

# To restore after pulling
git stash pop
```

### Step 2: Fetch Latest Changes from Remote

```bash
# Fetch all updates from remote (doesn't modify your working directory)
git fetch origin

# Check if remote is actually ahead
git log HEAD..origin/master --oneline
```

### Step 3: Compare and Pull

```bash
# See what commits are on remote but not local
git log HEAD..origin/master --oneline

# See what commits are on local but not remote
git log origin/master..HEAD --oneline

# If remote has new commits, pull them
git pull origin master
```

### Step 4: Handle Merge Conflicts (If Any)

If `git pull` shows conflicts, Git will mark them. Here's how to resolve:

#### Identify Conflicted Files

```bash
# See which files have conflicts
git status

# Files with conflicts will show as:
#   both modified: <filename>
```

#### View Conflicts

```bash
# Open the file and look for conflict markers:
# <<<<<<< HEAD
# Your local changes
# =======
# Remote changes
# >>>>>>> origin/master
```

#### Resolve Conflicts

For each conflicted file:

1. **Open the file** in your editor
2. **Find conflict markers** (`<<<<<<<`, `=======`, `>>>>>>>`)
3. **Choose one of these options:**
   - Keep your changes (remove remote section)
   - Keep remote changes (remove your section)
   - Keep both (manually merge)
   - Write something new (combine both)

4. **Remove the conflict markers** (`<<<<<<<`, `=======`, `>>>>>>>`)

5. **Save the file**

#### Mark Conflicts as Resolved

```bash
# After resolving conflicts in a file, stage it
git add <resolved-file>

# Repeat for all conflicted files, then complete the merge
git commit
```

### Step 5: If You Used Stash (Option B)

```bash
# Restore your stashed changes
git stash pop

# If there are conflicts with stashed changes, resolve them the same way
# Then stage and commit
git add -A
git commit -m "Apply refactoring changes after merge"
```

## Alternative: Rebase Instead of Merge

If you want a cleaner history:

```bash
# After stashing or committing your changes
git pull --rebase origin master

# If conflicts occur during rebase:
# 1. Resolve conflicts in files
# 2. Stage resolved files: git add <file>
# 3. Continue rebase: git rebase --continue
# 4. If you want to abort: git rebase --abort
```

## Useful Commands for Conflict Resolution

```bash
# See differences between your version and remote
git diff HEAD origin/master

# See differences for a specific file
git diff HEAD origin/master -- <file>

# Accept all remote changes for a file
git checkout --theirs <file>
git add <file>

# Accept all your local changes for a file
git checkout --ours <file>
git add <file>

# See conflict resolution status
git status

# Abort merge if things go wrong
git merge --abort

# Abort rebase if things go wrong
git rebase --abort
```

## Recommended Workflow

1. **Commit your current work** (Option A above)
2. **Fetch and check** what's on remote
3. **Pull with merge** (or rebase if you prefer)
4. **Resolve any conflicts** carefully
5. **Test your code** after merging
6. **Push your changes** when ready

## After Successful Merge

```bash
# Verify everything is good
git status

# Test your application
npm run build  # or your test commands

# Push your merged changes
git push origin master
```

## Safety Tips

1. **Always commit or stash** before pulling
2. **Read conflict markers carefully** - understand what changed
3. **Test after resolving conflicts** - don't just accept one side blindly
4. **Use `git diff`** to understand what changed
5. **Keep backups** - consider creating a backup branch before merging:
   ```bash
   git branch backup-before-merge
   ```

## If Something Goes Wrong

```bash
# Reset to before the merge (if you haven't committed the merge yet)
git merge --abort

# Or reset to a specific commit (CAREFUL - this discards changes)
git reset --hard HEAD~1

# Or restore from your backup branch
git checkout backup-before-merge
```

