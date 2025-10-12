/**
 * Swagger Configuration Module Index
 * Aggregates all domain-specific swagger definitions
 */

const common = require('./common');
const intents = require('./intents');
const swaps = require('./swaps');
const tokens = require('./tokens');
const balances = require('./balances');
const health = require('./health');
const vaults = require('./vaults');

/**
 * Merge all schemas from domain modules
 * @returns {Object} Combined schemas object
 */
function mergeSchemas() {
  return {
    ...common.schemas,
    ...intents.schemas,
    ...swaps.schemas,
    ...tokens.schemas,
    ...balances.schemas,
    ...vaults.schemas,
    ...health.schemas,
  };
}

/**
 * Collect all tags from domain modules
 * @returns {Array} Array of tag definitions
 */
function collectTags() {
  return [
    intents.tag,
    swaps.tag,
    tokens.tag,
    balances.tag,
    vaults.tag,
    health.tag,
  ];
}

module.exports = {
  schemas: mergeSchemas(),
  responses: common.responses,
  tags: collectTags(),
};
