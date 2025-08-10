#!/bin/bash
set -e  # Exit on any error

echo "🚀 Running Quant Engine Auto-Commit Workflow..."
echo ""

# Step 1: Run auto-fixing hooks (format, lint fixes, whitespace, file endings)
echo "🎨 Step 1: Running auto-fixing hooks..."
echo "  🔧 Auto-formatting and fixing issues..."
if ! uv run pre-commit run --all-files; then
    echo "  ⚠️  Some hooks made fixes, continuing..."
else
    echo "  ✅ All auto-fix hooks passed!"
fi
echo ""

# Step 2: Stage all changes (including newly formatted files)
echo "📥 Step 2: Staging all changes..."
git add .
echo "  ✅ All changes staged!"
echo ""

# Step 3: Run validation hooks (read-only checks)
echo "🔍 Step 3: Running validation checks..."
if ! uv run pre-commit run --all-files --hook-stage manual; then
    echo "❌ Validation failed. Please fix the issues and try again."
    exit 1
fi

echo "  ✅ All validation checks passed!"
echo ""

# Step 4: Generate commit message using codex (if available)
echo "🤖 Step 4: Generating commit message..."
if command -v codex &> /dev/null; then
    suggestion=$(git diff --cached | codex exec "Generate ONLY a Conventional Commits style commit message:
    - Start with type: feat/fix/docs/style/refactor/test/chore/perf
    - Optional scope in parentheses
    - Imperative mood description
    - Example: 'feat(auth): add OAuth2 authentication'
    Return ONLY the message, nothing else." | tail -n 2 | head -n 1)

    if [ -n "$suggestion" ] && [ "$suggestion" != "" ]; then
        echo "  🤖 Generated message: $suggestion"
        commit_message="$suggestion"
    else
        echo "  ⚠️  Codex didn't generate a message, using default..."
        commit_message="chore: automated commit with formatting and linting"
    fi
else
    echo "  ⚠️  Codex not available, using default message..."
    commit_message="chore: automated commit with formatting and linting"
fi

echo ""

# Step 5: Commit with generated message (skip pre-commit hooks since we already validated)
echo "📝 Step 5: Creating commit..."
git commit -m "$commit_message" --no-verify

echo ""
echo "🎉 Success! Changes committed with message: '$commit_message'"
echo "✨ Workflow completed successfully!"
