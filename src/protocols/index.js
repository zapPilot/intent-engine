/**
 * Protocols module exports
 * Centralized access to all protocol implementations and factory
 */

const BaseProtocolV2 = require('./BaseProtocolV2');
const AaveProtocol = require('./AaveProtocol');
const PendlePTProtocol = require('./PendlePTProtocol');
const VelodromeProtocol = require('./VelodromeProtocol');
const { ProtocolFactory, protocolFactory } = require('./ProtocolFactory');

module.exports = {
  // Base class
  BaseProtocolV2,

  // Protocol implementations
  AaveProtocol,
  PendlePTProtocol,
  VelodromeProtocol,

  // Factory
  ProtocolFactory,
  protocolFactory, // Singleton instance

  // Convenience exports
  protocols: {
    AaveProtocol,
    PendlePTProtocol,
    VelodromeProtocol,
  },
};
