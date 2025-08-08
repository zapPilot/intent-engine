#!/bin/bash

# Script to check test coverage
echo "🧪 Running test coverage check..."

# Run tests with coverage
npm run test:coverage

# Check exit code
if [ $? -eq 0 ]; then
    echo "✅ Test coverage check passed!"
else
    echo "❌ Test coverage check failed!"
    echo "Please improve test coverage to meet the minimum thresholds."
    exit 1
fi