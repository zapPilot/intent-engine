class VaultController {
  /**
   * Get all available vaults
   * GET /api/v1/vaults
   */
  static getAllVaults(req, res) {
    try {
      // TODO: Load vault configurations from frontend vault classes or database
      const vaults = [
        {
          id: 'stablecoin-vault',
          name: 'Stablecoin Vault',
          description: 'Low-risk yield generation with stablecoins',
          riskLevel: 'low',
          expectedAPR: { min: 5, max: 15 },
          supportedChains: [1, 42161, 8453, 10],
          totalTVL: 0, // TODO: Calculate from rebalance_backend
          status: 'active',
        },
        {
          id: 'btc-vault',
          name: 'BTC Vault',
          description: 'Bitcoin-focused investment strategy',
          riskLevel: 'medium',
          expectedAPR: { min: 8, max: 25 },
          supportedChains: [8453], // Base
          totalTVL: 0,
          status: 'active',
        },
        {
          id: 'eth-vault',
          name: 'ETH Vault',
          description: 'Ethereum liquid staking and yield strategies',
          riskLevel: 'medium',
          expectedAPR: { min: 6, max: 20 },
          supportedChains: [42161, 8453], // Arbitrum, Base
          totalTVL: 0,
          status: 'active',
        },
        {
          id: 'index500-vault',
          name: 'Index 500 Vault',
          description: 'S&P500-like index fund strategy for crypto markets',
          riskLevel: 'medium-high',
          expectedAPR: { min: 10, max: 30 },
          supportedChains: [42161, 8453],
          totalTVL: 0,
          status: 'active',
        },
      ];

      res.json({
        success: true,
        vaults,
        total: vaults.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error fetching vaults:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch vault information',
        },
      });
    }
  }

  /**
   * Get vault strategy configuration
   * GET /api/v1/vaults/:vaultId/strategy
   */
  static getVaultStrategy(req, res) {
    try {
      const { vaultId } = req.params;

      // TODO: Load actual vault strategy from frontend vault classes
      const mockStrategies = {
        'stablecoin-vault': {
          description:
            'Diversified stablecoin yield farming across multiple protocols',
          weightMapping: {
            stablecoins: 1.0,
          },
          protocols: [
            {
              protocol: 'aave',
              chain: 'arbitrum',
              weight: 0.4,
              tokens: ['USDC', 'USDT'],
              type: 'lending',
            },
            {
              protocol: 'convex',
              chain: 'arbitrum',
              weight: 0.6,
              tokens: ['USDC', 'USDT'],
              type: 'LP',
            },
          ],
          rebalanceThreshold: 0.05,
          constraints: {
            maxSingleProtocolWeight: 0.7,
            minAPRThreshold: 3.0,
          },
        },
        'btc-vault': {
          description: 'Bitcoin-focused strategy with BTC-denominated yields',
          weightMapping: {
            btc: 1.0,
          },
          protocols: [
            {
              protocol: 'aerodrome',
              chain: 'base',
              weight: 0.8,
              tokens: ['tBTC', 'cbBTC'],
              type: 'LP',
            },
            {
              protocol: 'equilibria',
              chain: 'base',
              weight: 0.2,
              tokens: ['cbBTC'],
              type: 'single',
            },
          ],
          rebalanceThreshold: 0.05,
        },
        'eth-vault': {
          description: 'Ethereum liquid staking and yield strategies',
          weightMapping: {
            long_term_bond: 1.0,
          },
          protocols: [
            {
              protocol: 'pendle',
              chain: 'arbitrum',
              weight: 0.54,
              tokens: ['wstETH', 'eETH'],
              type: 'PT',
            },
            {
              protocol: 'aave',
              chain: 'base',
              weight: 0.24,
              tokens: ['WETH'],
              type: 'lending',
            },
            {
              protocol: 'aerodrome',
              chain: 'base',
              weight: 0.22,
              tokens: ['WETH', 'msETH'],
              type: 'LP',
            },
          ],
          rebalanceThreshold: 0.05,
        },
        'index500-vault': {
          description: 'Diversified crypto index with BTC and ETH focus',
          weightMapping: {
            btc: 0.841,
            eth: 0.159,
          },
          protocols: [
            // BTC portion (84.1%)
            {
              protocol: 'aerodrome',
              chain: 'base',
              weight: 0.673, // 0.8 * 0.841
              tokens: ['tBTC', 'cbBTC'],
              type: 'LP',
            },
            {
              protocol: 'equilibria',
              chain: 'base',
              weight: 0.168, // 0.2 * 0.841
              tokens: ['cbBTC'],
              type: 'single',
            },
            // ETH portion (15.9%)
            {
              protocol: 'pendle',
              chain: 'arbitrum',
              weight: 0.086, // 0.54 * 0.159
              tokens: ['wstETH', 'eETH'],
              type: 'PT',
            },
            {
              protocol: 'aave',
              chain: 'base',
              weight: 0.038, // 0.24 * 0.159
              tokens: ['WETH'],
              type: 'lending',
            },
            {
              protocol: 'aerodrome',
              chain: 'base',
              weight: 0.035, // 0.22 * 0.159
              tokens: ['WETH', 'msETH'],
              type: 'LP',
            },
          ],
          rebalanceThreshold: 0.05,
        },
      };

      const strategy = mockStrategies[vaultId];
      if (!strategy) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'VAULT_NOT_FOUND',
            message: `Vault '${vaultId}' not found`,
            availableVaults: Object.keys(mockStrategies),
          },
        });
      }

      res.json({
        success: true,
        vaultId,
        strategy,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error fetching vault strategy:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch vault strategy',
        },
      });
    }
  }
}

module.exports = VaultController;
