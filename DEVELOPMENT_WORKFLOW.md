# Field Sync Development Workflow

> **Your complete guide to safely developing, testing, and deploying code.**

---

## Quick Reference

| What you want to do | Command / Action |
|---------------------|------------------|
| Start coding | `git checkout -b feature/your-feature` |
| Run app locally | `npm run dev` |
| Run tests | `npm test` |
| Run tests while coding (auto-reruns) | `npm run test:watch` |
| Build to check for errors | `npm run build` |
| Push code for review | `git push -u origin your-branch` |
| Create pull request | Go to GitHub → "Compare & pull request" |
| Deploy to production | Merge PR to `main` (only after tests pass) |

---

## The Big Picture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        YOUR DEVELOPMENT FLOW                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   1. CREATE BRANCH ──► 2. WRITE CODE ──► 3. TEST LOCALLY               │
│         │                    │                  │                       │
│         ▼                    ▼                  ▼                       │
│   git checkout -b      npm run dev        npm test                     │
│   feature/xyz                                                           │
│                                                                         │
│   4. PUSH TO GITHUB ──► 5. CI RUNS ──► 6. CREATE PR                    │
│         │                    │              │                           │
│         ▼                    ▼              ▼                           │
│   git push           GitHub Actions    Click "Create PR"               │
│                      runs tests        on GitHub                        │
│                                                                         │
│   7. VERCEL PREVIEW ──► 8. REVIEW ──► 9. MERGE TO MAIN                 │
│         │                   │               │                           │
│         ▼                   ▼               ▼                           │
│   Test on preview URL   Check it works   Click "Merge"                 │
│                                                                         │
│   10. AUTO DEPLOY TO PRODUCTION                                        │
│         │                                                               │
│         ▼                                                               │
│   Vercel deploys main branch automatically                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Workflow

### STEP 1: Create a Feature Branch

**Where:** Your terminal
**When:** Before starting any new work

```bash
# Make sure you're on main and up to date
git checkout main
git pull origin main

# Create a new branch for your feature
git checkout -b feature/your-feature-name

# Examples:
git checkout -b feature/add-export-button
git checkout -b fix/login-error
git checkout -b update/dashboard-layout
```

**Branch naming conventions:**
- `feature/` - New features
- `fix/` - Bug fixes
- `update/` - Updates to existing features
- `refactor/` - Code refactoring

---

### STEP 2: Write Your Code

**Where:** Your code editor
**When:** After creating your branch

```bash
# Start the development server
npm run dev
```

This runs the app at `http://localhost:5173`

**Tips:**
- Save frequently
- Test in the browser as you go
- Keep changes focused on one thing

---

### STEP 3: Test Your Code Locally

**Where:** Your terminal
**When:** Before pushing any code

```bash
# Run all tests once
npm test

# OR run tests in watch mode (auto-reruns when you save)
npm run test:watch
```

**What you should see (all tests passing):**
```
 ✓ src/test/utils.test.js > formatCurrency > formats positive amounts correctly
 ✓ src/test/utils.test.js > calculateProgress > returns 0 for empty areas
 ...

 Test Files  1 passed (1)
      Tests  14 passed (14)
```

**If tests fail:**
1. Read the error message carefully
2. Fix the issue in your code
3. Run tests again
4. Repeat until all tests pass

**Also run the build to catch errors:**
```bash
npm run build
```

---

### STEP 4: Commit and Push Your Code

**Where:** Your terminal
**When:** After tests pass

```bash
# See what files changed
git status

# Add your changes
git add .

# Commit with a descriptive message
git commit -m "Add export button to dashboard"

# Push to GitHub (first time for this branch)
git push -u origin feature/your-feature-name

# Subsequent pushes
git push
```

---

### STEP 5: CI Automatically Runs

**Where:** GitHub (automatic)
**When:** Immediately after you push

GitHub Actions will automatically:
1. Install dependencies
2. Run all tests
3. Build the app

**To check CI status:**
1. Go to https://github.com/AntV3/fieldsync
2. Click the "Actions" tab
3. Find your workflow run
4. Green ✓ = passed, Red ✗ = failed

**If CI fails:**
1. Click on the failed run
2. Read the error logs
3. Fix the issue locally
4. Run `npm test` to verify
5. Commit and push again

---

### STEP 6: Create a Pull Request (PR)

**Where:** GitHub website
**When:** After pushing your branch

1. Go to https://github.com/AntV3/fieldsync
2. You'll see a banner: "feature/your-branch had recent pushes"
3. Click **"Compare & pull request"**
4. Fill in:
   - **Title:** Brief description of changes
   - **Description:** What you changed and why
5. Click **"Create pull request"**

---

### STEP 7: Check the Vercel Preview

**Where:** Your PR on GitHub + Vercel preview URL
**When:** After creating the PR

Vercel automatically creates a preview deployment for every PR.

1. In your PR, look for the Vercel bot comment
2. Click the **"Preview"** link
3. Test your changes on this preview URL
4. This is YOUR CHANCE to catch issues before production

**What to test:**
- Does your new feature work?
- Did you break anything else?
- Does it look right on mobile?

---

### STEP 8: Review and Merge

**Where:** GitHub PR page
**When:** After CI passes and preview looks good

**Before merging, verify:**
- [ ] CI checks are green (tests passed)
- [ ] Preview deployment works correctly
- [ ] You've tested the main user flows

**To merge:**
1. Scroll to bottom of PR
2. Click **"Merge pull request"**
3. Click **"Confirm merge"**
4. Optionally, delete the branch

---

### STEP 9: Production Deploys Automatically

**Where:** Vercel (automatic)
**When:** Immediately after merging to main

Vercel watches the `main` branch and automatically deploys when it changes.

**To verify production:**
1. Wait ~1-2 minutes after merge
2. Go to your production URL
3. Verify your changes are live

---

## Where to Go for What

| I need to... | Go here |
|--------------|---------|
| Write/edit code | Your code editor (VS Code, etc.) |
| Run the app locally | Terminal: `npm run dev` → http://localhost:5173 |
| Run tests | Terminal: `npm test` |
| See my branches | Terminal: `git branch` |
| Push code | Terminal: `git push` |
| Create a PR | GitHub: https://github.com/AntV3/fieldsync/pulls |
| Check if CI passed | GitHub: Actions tab |
| Test preview deployment | Vercel preview URL (in PR comments) |
| See production | Your live Vercel URL |
| Check deployment status | Vercel dashboard: https://vercel.com/dashboard |

---

## Troubleshooting

### "Tests are failing"

```bash
# Run tests to see the error
npm test

# Common fixes:
# 1. You broke existing functionality - fix your code
# 2. You need to update the test - update the test file
# 3. Missing import - add the import
```

### "Build is failing"

```bash
# Run build locally to see the error
npm run build

# Common fixes:
# 1. TypeScript/syntax error - fix the syntax
# 2. Missing dependency - npm install <package>
# 3. Import error - check file paths
```

### "CI failed on GitHub"

1. Go to the Actions tab on GitHub
2. Click the failed run
3. Click the failed job
4. Read the error message
5. Fix locally, test, push again

### "I pushed to main by accident"

```bash
# If you haven't pushed yet, move to a branch:
git checkout -b feature/my-changes
git checkout main
git reset --hard origin/main

# If you already pushed, you'll need to revert:
git revert HEAD
git push
```

### "My preview URL shows old code"

1. Check Vercel dashboard for deployment status
2. Wait a minute - deployments take time
3. Hard refresh the browser (Cmd+Shift+R or Ctrl+Shift+R)
4. Clear browser cache

### "Production is broken!"

**Quick fix - revert the last merge:**
1. Go to the merged PR on GitHub
2. Click "Revert" button
3. Merge the revert PR immediately
4. This undoes your changes

**Then:**
1. Create a new branch
2. Fix the issue
3. Test thoroughly
4. Create new PR

---

## Writing Tests

### Test file location

Put tests in `src/test/` with `.test.js` extension:
```
src/
  test/
    utils.test.js      ← Tests for utils.js
    billing.test.js    ← Tests for billing functions
    setup.js           ← Test setup (already configured)
```

### Basic test structure

```javascript
import { describe, it, expect } from 'vitest'
import { myFunction } from '../lib/myFile'

describe('myFunction', () => {
  it('does something correctly', () => {
    const result = myFunction('input')
    expect(result).toBe('expected output')
  })

  it('handles edge cases', () => {
    expect(myFunction(null)).toBe(null)
  })
})
```

### Common assertions

```javascript
expect(value).toBe(exact)           // Exact match
expect(value).toEqual(object)       // Deep equality
expect(value).toBeTruthy()          // Is truthy
expect(value).toBeFalsy()           // Is falsy
expect(array).toContain(item)       // Array contains
expect(fn).toThrow()                // Function throws
```

---

## npm Commands Reference

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start local development server |
| `npm run build` | Build for production (catches errors) |
| `npm test` | Run all tests once |
| `npm run test:watch` | Run tests, re-run on file changes |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run preview` | Preview production build locally |

---

## Git Commands Reference

| Command | What it does |
|---------|--------------|
| `git status` | See changed files |
| `git branch` | List branches |
| `git checkout -b name` | Create new branch |
| `git checkout main` | Switch to main branch |
| `git add .` | Stage all changes |
| `git commit -m "msg"` | Commit with message |
| `git push` | Push to GitHub |
| `git pull origin main` | Get latest from main |
| `git log --oneline` | See commit history |

---

## Setting Up Branch Protection (One-Time Setup)

To prevent direct pushes to main, set up branch protection on GitHub:

1. Go to https://github.com/AntV3/fieldsync/settings/branches
2. Click "Add rule"
3. Branch name pattern: `main`
4. Enable:
   - [x] Require a pull request before merging
   - [x] Require status checks to pass before merging
   - [x] Require branches to be up to date before merging
5. Click "Create"

Now no one (including you) can push directly to main - everything goes through PRs.

---

## Summary: The Safe Deployment Checklist

Before any code reaches production, it must:

- [ ] Be on a feature branch (not main)
- [ ] Pass `npm test` locally
- [ ] Pass `npm run build` locally
- [ ] Be pushed to GitHub
- [ ] Pass CI checks (GitHub Actions)
- [ ] Have a pull request created
- [ ] Have Vercel preview tested
- [ ] Be merged to main (triggers production deploy)

**This ensures:** No untested code ever reaches production.
