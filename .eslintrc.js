module.exports = {
  env: {
    browser: false,
    node: true,
    es2021: true,
    jest: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:node/recommended',
    'plugin:security/recommended',
    'prettier', // This disables ESLint rules that conflict with Prettier
  ],
  plugins: ['node', 'security', 'unused-imports'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    // Error prevention
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-debugger': 'error',
    // Unused imports and variables detection (enhanced)
    'no-unused-vars': 'off', // Replaced by unused-imports/no-unused-vars for better functionality
    'unused-imports/no-unused-imports': 'error',
    'unused-imports/no-unused-vars': [
      'error',
      {
        vars: 'all',
        varsIgnorePattern: '^_',
        args: 'after-used',
        argsIgnorePattern: '^_',
        caughtErrors: 'all',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    'no-undef': 'error',
    'no-unreachable': 'error',
    'no-duplicate-imports': 'error',
    'no-var': 'error',
    'prefer-const': 'error',
    'prefer-arrow-callback': 'error',
    'prefer-template': 'error',

    // Code quality
    eqeqeq: ['error', 'always'],
    curly: ['error', 'all'],
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-new-object': 'error',
    'no-new-wrappers': 'error',
    'no-throw-literal': 'error',
    'no-return-assign': 'error',
    'no-return-await': 'error',
    'require-await': 'error',
    'no-async-promise-executor': 'error',

    // Node.js specific
    'node/no-unpublished-require': 'off', // Allow dev dependencies in test files
    'node/no-missing-import': 'off', // Handle ES modules correctly
    'node/no-unsupported-features/es-syntax': 'off', // Allow modern ES syntax
    'node/prefer-global/buffer': ['error', 'always'],
    'node/prefer-global/console': ['error', 'always'],
    'node/prefer-global/process': ['error', 'always'],
    'node/prefer-global/url-search-params': ['error', 'always'],
    'node/prefer-global/url': ['error', 'always'],

    // Security
    'security/detect-object-injection': 'off', // Too many false positives with bracket notation
    'security/detect-non-literal-regexp': 'warn',
    'security/detect-non-literal-fs-filename': 'warn',
    'security/detect-eval-with-expression': 'error',
    'security/detect-no-csrf-before-method-override': 'error',
  },
  overrides: [
    {
      files: ['test/**/*.js', '**/*.test.js', '**/*.spec.js'],
      rules: {
        'no-console': 'off',
        'node/no-unpublished-require': 'off',
        'security/detect-non-literal-fs-filename': 'off',
      },
    },
    {
      files: ['server.js', 'src/app.js', 'src/middleware/errorHandler.js'],
      rules: {
        'no-console': 'off', // Allow console in server startup and error handling
      },
    },
  ],
};
