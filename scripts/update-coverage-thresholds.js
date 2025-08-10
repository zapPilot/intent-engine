/*
 * Updates Jest coverage thresholds in jest.config.js based on the latest
 * coverage/coverage-summary.json. Intended to be run after `npm run test:coverage`.
 */

const fs = require('fs');
const path = require('path');

const coverageSummaryPath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
const jestConfigPath = path.join(process.cwd(), 'jest.config.js');

function readCoverage() {
  if (!fs.existsSync(coverageSummaryPath)) {
    console.error('❌ coverage/coverage-summary.json not found. Run `npm run test:coverage` first.');
    process.exit(1);
  }
  const json = JSON.parse(fs.readFileSync(coverageSummaryPath, 'utf8'));
  const total = json.total;
  if (!total) {
    console.error('❌ Invalid coverage summary: missing `total` section.');
    process.exit(1);
  }
  return {
    statements: Math.floor(total.statements.pct || 0),
    lines: Math.floor(total.lines.pct || 0),
    functions: Math.floor(total.functions.pct || 0),
    branches: Math.floor(total.branches.pct || 0),
  };
}

function updateJestConfig(thresholds) {
  if (!fs.existsSync(jestConfigPath)) {
    console.error('❌ jest.config.js not found at project root.');
    process.exit(1);
  }
  let content = fs.readFileSync(jestConfigPath, 'utf8');

  const replaceNumber = (label, value) => {
    const re = new RegExp(`(coverageThreshold\\s*:\\s*{[\\s\\S]*?global\\s*:\\s*{[\\s\\S]*?${label}\\s*:\\s*)(\\d+)`);
    if (!re.test(content)) {
      console.warn(`⚠️ Could not find ${label} in coverageThreshold.global. Skipping.`);
    } else {
      content = content.replace(re, `$1${value}`);
    }
  };

  replaceNumber('branches', thresholds.branches > 0 ? thresholds.branches - 1 : 0);
  replaceNumber('functions', thresholds.functions > 0 ? thresholds.functions - 1 : 0);
  replaceNumber('lines', thresholds.lines > 0 ? thresholds.lines - 1 : 0);
  replaceNumber('statements', thresholds.statements > 0 ? thresholds.statements - 1 : 0);

  fs.writeFileSync(jestConfigPath, content);
}

function main() {
  const t = readCoverage();
  console.log('🧮 Detected coverage:', t);
  updateJestConfig(t);
  console.log('✅ Updated jest.config.js coverageThreshold.global to match current coverage');
}

main();

