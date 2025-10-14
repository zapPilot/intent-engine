/**
 * RPC Provider Utility
 * Centralized RPC provider management with Alchemy primary and public fallbacks
 */

const { ethers } = require('ethers');
const UNIFIED_ZAP_CONFIG = require('../config/unifiedZapConfig');

// Provider cache keyed by chainId
const PROVIDER_CACHE = new Map();

/**
 * Build Alchemy RPC URL for a given chain
 * @param {number} chainId - Chain ID
 * @returns {string|null} - Alchemy URL or null if not configured
 */
function getAlchemyUrl(chainId) {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) {
    return null;
  }

  const chainConfig = Object.values(
    UNIFIED_ZAP_CONFIG.SUPPORTED_CHAINS || {}
  ).find(config => config.chainId === chainId);

  if (!chainConfig?.alchemyPrefix) {
    return null;
  }

  return `https://${chainConfig.alchemyPrefix}-mainnet.g.alchemy.com/v2/${apiKey}`;
}

/**
 * Get public fallback RPC URLs for a chain
 * @param {number} chainId - Chain ID
 * @returns {string[]} - Array of public RPC URLs
 */
function getPublicRpcUrls(chainId) {
  const chainConfig = Object.values(
    UNIFIED_ZAP_CONFIG.SUPPORTED_CHAINS || {}
  ).find(config => config.chainId === chainId);

  return chainConfig?.publicRpcUrls || [];
}

/**
 * Resolve RPC URL for a chain (Alchemy first, then fallbacks)
 * @param {number} chainId - Chain ID
 * @returns {string|null} - RPC URL or null if none available
 */
function resolveRpcUrl(chainId) {
  if (!chainId) {
    return null;
  }

  // Try Alchemy first
  const alchemyUrl = getAlchemyUrl(chainId);
  if (alchemyUrl) {
    return alchemyUrl;
  }

  // Fall back to public RPCs
  const publicUrls = getPublicRpcUrls(chainId);
  if (publicUrls.length > 0) {
    return publicUrls[0]; // Use first public RPC as fallback
  }

  return null;
}

/**
 * Get or create an RPC provider for a given chain
 * @param {number} chainId - Chain ID
 * @returns {ethers.JsonRpcProvider} - Ethers JSON RPC provider
 * @throws {Error} - If no RPC URL is configured for the chain
 */
function getRpcProvider(chainId) {
  // Return cached provider if exists
  if (chainId && PROVIDER_CACHE.has(chainId)) {
    return PROVIDER_CACHE.get(chainId);
  }

  const rpcUrl = resolveRpcUrl(chainId);

  if (!rpcUrl) {
    throw new Error(`No RPC URL configured for chainId ${chainId ?? 'n/a'}`);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);

  if (chainId) {
    PROVIDER_CACHE.set(chainId, provider);
  }

  return provider;
}

/**
 * Clear provider cache (useful for testing or refreshing connections)
 */
function clearProviderCache() {
  PROVIDER_CACHE.clear();
}

module.exports = {
  getRpcProvider,
  getAlchemyUrl,
  getPublicRpcUrls,
  resolveRpcUrl,
  clearProviderCache,
};
