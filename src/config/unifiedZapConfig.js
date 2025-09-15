/**
 * Unified Zap Configuration - Strategy Categories and Protocol Mappings
 * Based on V1 vault configurations but restructured for V2 multi-strategy system
 */

const UNIFIED_ZAP_CONFIG = {
  // Strategy categories with protocol mappings and weights
  STRATEGY_CATEGORIES: {
    "stablecoin": {
      displayName: "Stablecoins",
      description: "Diversified stablecoin yield strategies across multiple chains",
      targetAssets: ["USDC", "USDT", "DAI", "EURC"],
      chains: ["arbitrum", "base", "optimism"],
      protocols: [
        // Aave lending on Base
        {
          id: "aave-usdc-base",
          name: "Aave USDC (Base)",
          implementation: "AaveProtocol",
          chain: "base",
          chainId: 8453,
          weight: 20,
          enabled: true,
          config: {
            mode: "single",
            symbolOfBestTokenToZapInOut: "usdc",
            zapInOutTokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            assetAddress: "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB",
            protocolAddress: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
            assetDecimals: 6
          }
        },
        // Pendle PT gUSDC on Arbitrum
        {
          id: "pendle-pt-gusdc-arbitrum",
          name: "Pendle PT gUSDC (Arbitrum)",
          implementation: "PendlePTProtocol",
          chain: "arbitrum",
          chainId: 42161,
          weight: 25,
          enabled: true,
          config: {
            mode: "single",
            marketAddress: "0x18ffb61c6d223bd91ec15acc248bb7e670abcc48",
            assetAddress: "0x247f150C90c9EEb7d733219bfA36D189C76D5Ec5",
            ytAddress: "0x59e4e0FE7981E31Eb1283ff9aDc5F851FE9A216D",
            assetDecimals: 6,
            symbolOfBestTokenToZapOut: "usdc",
            bestTokenAddressToZapOut: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
            decimalOfBestTokenToZapOut: 6
          }
        },
        // Velodrome BOLD/USDC LP on Base
        {
          id: "velodrome-bold-usdc-base",
          name: "Velodrome BOLD/USDC LP (Base)",
          implementation: "VelodromeProtocol",
          chain: "base",
          chainId: 8453,
          weight: 30,
          enabled: true,
          config: {
            mode: "LP",
            protocolName: "aerodrome",
            protocolVersion: "0",
            assetAddress: "0x2De3fE21d32319a1550264dA37846737885Ad7A1",
            assetDecimals: 18,
            routerAddress: "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43",
            guageAddress: "0x7fDCBc8C442C667D41a1041bdc6e588393cEb6fe",
            lpTokens: [
              ["bold", "0x03569CC076654F82679C4BA2124D64774781B01D", 18],
              ["usdc", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", 6]
            ],
            rewards: [
              {
                symbol: "aero",
                address: "0x940181a94a35a4569e4529a3cdfb74e38fd98631",
                decimals: 18
              }
            ]
          }
        },
        // Velodrome USDC/sUSD LP on Optimism
        {
          id: "velodrome-usdc-susd-optimism",
          name: "Velodrome USDC/sUSD LP (Optimism)",
          implementation: "VelodromeProtocol",
          chain: "optimism",
          chainId: 10,
          weight: 25,
          enabled: true,
          config: {
            mode: "LP",
            protocolName: "velodrome",
            protocolVersion: "v2",
            assetAddress: "0xbC26519f936A90E78fe2C9aA2A03CC208f041234",
            assetDecimals: 18,
            routerAddress: "0xa062aE8A9c5e11aaA026fc2670B0D65cCc8B2858",
            guageAddress: "0x0E4c56B4a766968b12c286f67aE341b11eDD8b8d",
            lpTokens: [
              ["usdc", "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", 6],
              ["susd", "0x8c6f28f2F1A3C87F0f938b96d27520d9751ec8d9", 18]
            ],
            rewards: [
              {
                symbol: "velo",
                address: "0x9560e827af36c94d2ac33a39bce1fe78631088db",
                decimals: 18
              }
            ]
          }
        }
      ]
    },

    "eth": {
      displayName: "Ethereum Strategies",
      description: "ETH staking and yield strategies",
      targetAssets: ["ETH", "WETH", "stETH"],
      chains: ["ethereum", "arbitrum", "base"],
      protocols: [
        // Lido Staked ETH
        {
          id: "lido-steth-ethereum",
          name: "Lido Staked ETH",
          implementation: "LidoProtocol",
          chain: "ethereum",
          chainId: 1,
          weight: 60,
          enabled: true,
          config: {
            mode: "single",
            symbolOfBestTokenToZapInOut: "eth",
            zapInOutTokenAddress: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
            assetAddress: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
            protocolAddress: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
            assetDecimals: 18
          }
        },
        // Rocket Pool ETH
        {
          id: "rocketpool-reth-ethereum",
          name: "Rocket Pool ETH",
          implementation: "RocketPoolProtocol",
          chain: "ethereum",
          chainId: 1,
          weight: 40,
          enabled: true,
          config: {
            mode: "single",
            symbolOfBestTokenToZapInOut: "eth",
            zapInOutTokenAddress: "0xae78736Cd615f374D3085123A210448E74Fc6393",
            assetAddress: "0xae78736Cd615f374D3085123A210448E74Fc6393",
            protocolAddress: "0xae78736Cd615f374D3085123A210448E74Fc6393",
            assetDecimals: 18
          }
        }
      ]
    },

    "btc": {
      displayName: "Bitcoin Strategies",
      description: "WBTC yield farming strategies",
      targetAssets: ["WBTC", "BTC"],
      chains: ["ethereum", "arbitrum"],
      protocols: [
        // Aave WBTC on Arbitrum
        {
          id: "aave-wbtc-arbitrum",
          name: "Aave WBTC (Arbitrum)",
          implementation: "AaveProtocol",
          chain: "arbitrum",
          chainId: 42161,
          weight: 100,
          enabled: true,
          config: {
            mode: "single",
            symbolOfBestTokenToZapInOut: "wbtc",
            zapInOutTokenAddress: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
            assetAddress: "0x078f358208685046a11C85e8ad32895DED33A249",
            protocolAddress: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
            assetDecimals: 8
          }
        }
      ]
    }
  },

  // SSE streaming configuration
  // Controls progress streaming behavior for better UX during multi-strategy operations
  SSE_STREAMING: {
    /**
     * Enable SSE streaming for unified zap operations
     */
    ENABLED: true,

    /**
     * Stream granularity: process and stream each strategy individually
     * This provides smooth progress feedback to users across multiple protocols
     */
    STREAM_BATCH_SIZE: 1,

    /**
     * SSE connection timeout in milliseconds
     */
    CONNECTION_TIMEOUT: 300000, // 5 minutes

    /**
     * Maximum concurrent SSE connections per user
     */
    MAX_CONCURRENT_STREAMS: 3,

    /**
     * Stream cleanup interval in milliseconds
     */
    CLEANUP_INTERVAL: 60000, // 1 minute
  },

  // Configuration constants
  DEFAULT_SLIPPAGE: 0.5,
  DEFAULT_BATCH_SIZE: 5,
  MIN_ALLOCATION_PERCENTAGE: 1, // 1%
  MAX_ALLOCATION_PERCENTAGE: 100, // 100%

  // Chain configuration
  SUPPORTED_CHAINS: {
    ethereum: {
      chainId: 1,
      name: "Ethereum",
      nativeCurrency: "ETH",
      rpcUrl: "https://mainnet.infura.io/v3/",
      blockExplorerUrl: "https://etherscan.io"
    },
    arbitrum: {
      chainId: 42161,
      name: "Arbitrum One",
      nativeCurrency: "ETH",
      rpcUrl: "https://arb1.arbitrum.io/rpc",
      blockExplorerUrl: "https://arbiscan.io"
    },
    base: {
      chainId: 8453,
      name: "Base",
      nativeCurrency: "ETH",
      rpcUrl: "https://mainnet.base.org",
      blockExplorerUrl: "https://basescan.org"
    },
    optimism: {
      chainId: 10,
      name: "Optimism",
      nativeCurrency: "ETH",
      rpcUrl: "https://mainnet.optimism.io",
      blockExplorerUrl: "https://optimistic.etherscan.io"
    }
  },

  // Common token addresses across chains
  COMMON_TOKENS: {
    arbitrum: {
      usdc: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
      usdt: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
      wbtc: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
      weth: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1"
    },
    base: {
      usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      weth: "0x4200000000000000000000000000000000000006"
    },
    optimism: {
      usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
      weth: "0x4200000000000000000000000000000000000006"
    }
  },

  // Fee configuration
  FEE_CONFIG: {
    protocolFeePercentage: 0.1, // 0.1%
    gasBuffer: 1.2, // 20% gas buffer
    maxGasPrice: 50, // 50 gwei max
  },

  // Validation rules
  VALIDATION: {
    minInputAmount: 1, // $1 minimum
    maxProtocolsPerStrategy: 10,
    maxStrategiesPerRequest: 5,
    allocationSumTolerance: 0.001 // 0.1% tolerance for allocation sum
  }
};

module.exports = UNIFIED_ZAP_CONFIG;