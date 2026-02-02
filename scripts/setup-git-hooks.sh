#!/bin/sh

# Setup script to install Git hooks
# Run this once: chmod +x scripts/setup-git-hooks.sh && ./scripts/setup-git-hooks.sh

echo "🔧 Setting up Git hooks..."

# Make pre-push hook executable
chmod +x scripts/pre-push.sh

# Copy pre-push hook to .git/hooks
cp scripts/pre-push.sh .git/hooks/pre-push
chmod +x .git/hooks/pre-push

echo "✅ Git hooks installed successfully!"
echo "The pre-push hook will now run builds before allowing pushes."
