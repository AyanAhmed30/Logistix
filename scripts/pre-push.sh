#!/bin/sh

# Pre-push hook to run build before allowing push
# Install this hook by running: chmod +x scripts/pre-push.sh && cp scripts/pre-push.sh .git/hooks/pre-push

echo "🔍 Running pre-push checks..."

# Run build
echo "📦 Building application..."
npm run build

if [ $? -ne 0 ]; then
  echo "❌ Build failed! Push aborted."
  echo "Please fix build errors before pushing."
  exit 1
fi

echo "✅ Pre-push checks passed!"
exit 0
