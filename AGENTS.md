# Repository Guidelines

## Project Structure & Module Organization

- `src/`: Express app (`app.js`), routes, middleware, services, utils, config.
  - `services/`: `dexAggregators/`, `priceProviders/`, `rateLimiting/` core logic.
  - `intents/`, `handlers/`, `managers/`, `valueObjects/`: intent orchestration.
  - `config/`: `priceConfig.js`, `swaggerConfig.js`.
- `test/`: Jest + Supertest tests matching `test/**/*.test.js`.
- `docs/http-examples/`: ready-to-run `.http` requests for local testing.
- Entry points: `server.js` (runtime), `src/app.js` (app wiring).

## Build, Test, and Development Commands

- `npm run dev`: Start server with nodemon on `:3002`.
- `npm start`: Start server in production mode.
- `npm test`: Run Jest test suite.
- `npm run test:coverage`: Run tests with coverage and open handle checks.
- `npm run lint` / `lint:fix`: Lint JS in `src/` and `test/` (ESLint).
- `npm run format` / `format:check`: Format or verify code style (Prettier).
- `npm run quality` / `quality:fix`: Compose lint + format + tests.
- `npm run docs:generate` / `docs:serve`: Build or serve Swagger from `swaggerConfig`.

## Coding Style & Naming Conventions

- Formatting: Prettier (2-space indent, single quotes, 80 cols).
- Linting: ESLint with `node`, `security`, `unused-imports` plugins.
- Naming: `camelCase` for vars/functions, `PascalCase` for classes, `UPPER_SNAKE_CASE` for constants. File names: modules like `priceService.js`, routes like `swap.js`.
- Practices: `eqeqeq`, `prefer-const`, no unused imports/vars, avoid `console` except in startup/error paths.

## Testing Guidelines

- Frameworks: Jest + Supertest; tests live in `test/` and end with `.test.js`.
- Coverage thresholds (global minimum): Statements/Lines 75%, Functions 75%, Branches 60; higher for some subfolders per `jest.config.js`.
- Run focused tests: `jest path/to/file.test.js` or `npm run test:watch`.
- Debug tests: `npm run test:debug` or set `DEBUG_TESTS=true`.

## Commit & Pull Request Guidelines

- Commits: Conventional Commits style (e.g., `feat: add swap route`). Keep changes atomic.
- Before pushing: `npm run quality` and ensure coverage passes (CI enforces thresholds).
- PRs: clear description, link issues, outline behavior/edge cases, include tests, update docs (`docs:generate`) for API changes, and screenshots of Swagger or `.http` examples when relevant.

## Security & Configuration Tips

- Copy `.env.example` to `.env`; never commit secrets. Required keys: DEX and price provider APIs.
- Respect rate limits; prefer service abstractions over direct HTTP calls.
- Node `>=12.9.0`. Start locally: `cp .env.example .env && npm i && npm run dev`.
