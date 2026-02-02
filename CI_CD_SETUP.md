# CI/CD Pipeline Setup

This project includes a CI/CD pipeline that automatically runs builds and prevents code from being pushed or merged if there are any errors.

## 🚀 GitHub Actions Workflow

The CI/CD pipeline is configured in `.github/workflows/ci.yml` and automatically runs on:

- **Push to main/master branch**
- **Pull requests to main/master branch**

### What the Pipeline Does

1. ✅ **Checks out code** from the repository
2. ✅ **Sets up Node.js** (version 20)
3. ✅ **Installs dependencies** using `npm ci`
4. ✅ **Runs linter** (`npm run lint`)
5. ✅ **Type checks** TypeScript code (`npm run type-check`)
6. ✅ **Builds application** (`npm run build`)

### If Any Step Fails

- ❌ The pipeline will **fail** and show an error
- ❌ **Pull requests cannot be merged** until errors are fixed
- ❌ **Pushes to main** will be blocked (if branch protection is enabled)

## 🔧 Local Pre-Push Hook (Optional)

For additional protection, you can set up a local Git hook that runs builds before pushing:

### Setup (One-time)

**On Windows (PowerShell):**
```powershell
# Make scripts executable (if using Git Bash)
chmod +x scripts/pre-push.sh
chmod +x scripts/setup-git-hooks.sh

# Copy hook to .git/hooks
Copy-Item scripts/pre-push.sh .git/hooks/pre-push
```

**On Mac/Linux:**
```bash
chmod +x scripts/setup-git-hooks.sh
./scripts/setup-git-hooks.sh
```

### How It Works

- Before every `git push`, the hook automatically runs `npm run build`
- If the build fails, the push is **blocked**
- You must fix errors locally before pushing

### Skip Hook (Emergency Only)

If you need to skip the hook (not recommended):
```bash
git push --no-verify
```

## 📋 Branch Protection (Recommended)

To fully protect your main branch, enable branch protection in GitHub:

1. Go to **Settings** → **Branches**
2. Add a branch protection rule for `main`
3. Enable:
   - ✅ **Require status checks to pass before merging**
   - ✅ Select the `build-and-test` check
   - ✅ **Require branches to be up to date before merging**

This ensures that:
- All PRs must pass CI checks before merging
- Direct pushes to main are blocked (if configured)
- Code quality is maintained

## 🐛 Troubleshooting

### Build Fails Locally

1. Run `npm run build` to see the exact error
2. Fix TypeScript errors, linting issues, or missing dependencies
3. Test locally before pushing

### CI Fails on GitHub

1. Check the **Actions** tab in GitHub
2. Click on the failed workflow run
3. Review the error logs
4. Fix issues locally and push again

### TypeScript Errors

Run type checking locally:
```bash
npm run type-check
```

### Linting Errors

Run linter locally:
```bash
npm run lint
```

## 📝 Summary

- ✅ **GitHub Actions** automatically runs on every push/PR
- ✅ **Build errors prevent merging** to main branch
- ✅ **Optional pre-push hook** for local protection
- ✅ **Type checking and linting** included in pipeline

Your code is now protected! 🛡️
