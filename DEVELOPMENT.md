# Development Guide

This document provides detailed information about the development toolchain and processes for the Intent Engine project.

## Development Toolchain Overview

The project uses a comprehensive development toolchain to ensure code quality, consistency, and reliability:

- **ESLint**: JavaScript linting and error detection
- **Prettier**: Code formatting and style consistency
- **Husky**: Git hooks management
- **lint-staged**: Run linters on staged files only
- **GitHub Actions**: Continuous integration and deployment

## Initial Setup

```bash
# Clone the repository
git clone <repository-url>
cd intent-engine

# Install dependencies (this will also setup Husky hooks)
npm install

# Verify setup
npm run quality
```

## Available Scripts

### Quality Commands

```bash
# Linting
npm run lint            # Check for linting errors
npm run lint:fix        # Fix linting errors automatically

# Formatting
npm run format          # Format all code with Prettier
npm run format:check    # Check if code is properly formatted

# Combined quality checks
npm run quality         # Run lint + format:check + tests
npm run quality:fix     # Run lint:fix + format + tests
```

### Testing Commands

```bash
npm test                # Run all tests
npm run test:watch      # Run tests in watch mode
npm run test:coverage   # Run tests with coverage report
```

### Development Commands

```bash
npm start               # Start production server
npm run dev             # Start development server with auto-reload
```

## Code Quality Standards

### ESLint Configuration

Our ESLint configuration includes:

- **Error Prevention**: Catches common JavaScript errors
- **Code Quality**: Enforces best practices and consistency
- **Node.js Specific**: Optimized for Node.js development
- **Security**: Includes security-focused rules
- **Prettier Integration**: Disables conflicting rules

### Prettier Configuration

Our Prettier configuration enforces:

- **Semicolons**: Required
- **Quotes**: Single quotes for strings
- **Trailing Commas**: ES5 style
- **Print Width**: 80 characters
- **Tab Width**: 2 spaces
- **Line Endings**: LF (Unix style)

## Git Workflow

### Pre-commit Hooks

The pre-commit hook automatically runs:

1. **lint-staged**: Runs ESLint and Prettier on staged files
2. **Tests**: Runs the full test suite

```bash
# This happens automatically on git commit
git add .
git commit -m "feat: add new feature"
```

### Hook Bypass (Emergency Only)

```bash
# Skip pre-commit hooks (use sparingly)
git commit -m "emergency fix" --no-verify
```

## GitHub Actions CI/CD

### Workflow Triggers

- **Push**: to `main` or `develop` branches
- **Pull Request**: to `main` or `develop` branches

### CI Jobs

1. **Quality Job**:
   - Runs on Node.js 18.x and 20.x
   - Executes linting, formatting checks, and tests
   - Uploads coverage reports

2. **Security Job**:
   - Runs security audits
   - Checks for vulnerabilities

3. **Build Job**:
   - Tests application startup
   - Verifies build process

## IDE Integration

### VS Code

Recommended extensions:

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-json"
  ]
}
```

Recommended settings:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "eslint.autoFixOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

## Troubleshooting

### Common Issues

1. **Husky hooks not running**:
   ```bash
   npx husky install
   chmod +x .husky/pre-commit
   ```

2. **ESLint errors on existing code**:
   ```bash
   npm run lint:fix
   ```

3. **Prettier formatting conflicts**:
   ```bash
   npm run format
   ```

4. **Test failures blocking commits**:
   ```bash
   npm test
   # Fix failing tests, then commit
   ```

### Performance Tips

- Use `lint-staged` to only check changed files
- Run tests in watch mode during development
- Use `npm run quality:fix` to fix all issues at once

## File Structure

```
intent-engine/
├── .eslintrc.js              # ESLint configuration
├── .prettierrc               # Prettier configuration
├── .prettierignore           # Prettier ignore patterns
├── .eslintignore             # ESLint ignore patterns
├── .husky/                   # Husky git hooks
│   └── pre-commit           # Pre-commit hook script
├── .github/workflows/        # GitHub Actions workflows
│   └── ci.yml               # CI/CD pipeline
└── package.json             # NPM scripts and dependencies
```

## Best Practices

1. **Always run quality checks before pushing**:
   ```bash
   npm run quality
   ```

2. **Use meaningful commit messages**:
   ```bash
   git commit -m "feat: add token price caching"
   git commit -m "fix: resolve rate limiting issue"
   git commit -m "docs: update API documentation"
   ```

3. **Keep dependencies updated**:
   ```bash
   npm audit
   npm update
   ```

4. **Write tests for new features**:
   - Unit tests for individual functions
   - Integration tests for API endpoints
   - Aim for high test coverage

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run quality` to ensure code quality
5. Commit your changes (pre-commit hooks will run)
6. Push to your fork
7. Create a pull request

The CI/CD pipeline will automatically run the same quality checks on your pull request.