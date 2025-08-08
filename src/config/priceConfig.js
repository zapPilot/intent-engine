/**
 * Price Provider Configuration
 * Defines provider priorities, rate limits, and settings
 */

const priceConfig = {
  // Provider configurations in priority order
  providers: {
    coinmarketcap: {
      priority: 1,
      rateLimit: {
        rate: 30 / 60, // 30 requests per minute = 0.5 requests per second
        capacity: 30,
      },
      timeout: 5000,
      baseUrl: 'https://pro-api.coinmarketcap.com/v2/cryptocurrency',
      requiresApiKey: true,
      apiKeyHeader: 'X-CMC_PRO_API_KEY',
    },
    coingecko: {
      priority: 2,
      rateLimit: {
        rate: 100 / 60, // 100 requests per minute = 1.67 requests per second
        capacity: 100,
      },
      timeout: 5000,
      baseUrl: 'https://api.geckoterminal.com/api/v2/simple',
      requiresApiKey: false,
    },
    static: {
      priority: 3,
      rateLimit: {
        rate: Infinity,
        capacity: Infinity,
      },
      timeout: 0,
      requiresApiKey: false,
    },
    // Future providers can be added here
    cryptocompare: {
      priority: 4,
      rateLimit: {
        rate: 50 / 60, // 50 requests per minute
        capacity: 50,
      },
      timeout: 5000,
      baseUrl: 'https://min-api.cryptocompare.com/data',
      requiresApiKey: false,
      enabled: false, // Disabled for now
    },
  },

  // Cache configuration
  cache: {
    ttl: 180, // 3 minutes (same as Python implementation)
  },

  // Default settings
  defaults: {
    timeout: 5000,
    retries: 2,
    retryDelay: 1000,
  },

  // Token symbol mappings for different providers
  tokenMappings: {
    coinmarketcap: {
      // CoinMarketCap uses numeric IDs
      btc: '1',
      eth: '1027',
      usdc: '3408',
      usdt: '825',
      bnb: '1839',
      ada: '2010',
      sol: '5426',
      xrp: '52',
      dot: '6636',
      doge: '74',
      avax: '5805',
      shib: '5994',
      matic: '3890',
      ltc: '2',
      link: '1975',
      uni: '7083',
      atom: '3794',
      etc: '1321',
      xlm: '512',
      algo: '4030',
      vet: '3077',
      icp: '8916',
      fil: '2280',
      trx: '1958',
      eos: '1765',
      aave: '7278',
      mkr: '1518',
      comp: '5692',
      sushi: '6758',
      snx: '2586',
      crv: '6538',
      yfi: '5864',
      '1inch': '8104',
      bal: '5728',
      lrc: '1934',
      zrx: '1896',
      knc: '1982',
      ren: '2539',
      storj: '1772',
      gnt: '1455',
      bat: '1697',
      zil: '2469',
      icx: '2099',
      qtum: '1684',
      omg: '1808',
      lsk: '1214',
      ark: '1586',
      strat: '1343',
      waves: '1274',
      dcr: '1168',
      sc: '1042',
      dgb: '109',
      sys: '541',
      pivx: '1169',
      nxt: '66',
      maid: '291',
      gbyte: '1492',
      rep: '1104',
      fct: '1087',
      game: '1027',
      bts: '463',
      steem: '1230',
      exp: '1070',
      amp: '6945',
      lpt: '3640',
      rpl: '2943',
      enj: '2130',
      mana: '1966',
      sand: '6210',
      axs: '6783',
      gala: '7080',
      chz: '4066',
      flow: '4558',
      imx: '10603',
      apt: '21794',
      sui: '20947',
      arb: '21711',
      op: '11840',
      blur: '23121',
      pepe: '24478',
      floki: '23229',
    },
    coingecko: {
      // CoinGecko uses chain/address format or coin IDs
      // For major coins, we can use coin IDs directly
      btc: 'bitcoin',
      eth: 'ethereum',
      usdc: 'usd-coin',
      usdt: 'tether',
      bnb: 'binancecoin',
      ada: 'cardano',
      sol: 'solana',
      xrp: 'ripple',
      dot: 'polkadot',
      doge: 'dogecoin',
      avax: 'avalanche-2',
      shib: 'shiba-inu',
      matic: 'matic-network',
      ltc: 'litecoin',
      link: 'chainlink',
      uni: 'uniswap',
      atom: 'cosmos',
      etc: 'ethereum-classic',
      xlm: 'stellar',
      algo: 'algorand',
      vet: 'vechain',
      icp: 'internet-computer',
      fil: 'filecoin',
      trx: 'tron',
      eos: 'eos',
      aave: 'aave',
      mkr: 'maker',
      comp: 'compound-governance-token',
      sushi: 'sushi',
      snx: 'havven',
      crv: 'curve-dao-token',
      yfi: 'yearn-finance',
      '1inch': '1inch',
      bal: 'balancer',
      lrc: 'loopring',
      zrx: '0x',
      knc: 'kyber-network-crystal',
      ren: 'republic-protocol',
      storj: 'storj',
      gnt: 'golem',
      bat: 'basic-attention-token',
      zil: 'zilliqa',
      icx: 'icon',
      qtum: 'qtum',
      omg: 'omisego',
      lsk: 'lisk',
      ark: 'ark',
      strat: 'stratis',
      waves: 'waves',
      dcr: 'decred',
      sc: 'siacoin',
      dgb: 'digibyte',
      sys: 'syscoin',
      pivx: 'pivx',
      nxt: 'nxt',
      maid: 'maidsafecoin',
      gbyte: 'byteball',
      rep: 'augur',
      fct: 'factom',
      game: 'gamecredits',
      bts: 'bitshares',
      steem: 'steem',
      exp: 'expanse',
      amp: 'amp-token',
      lpt: 'livepeer',
      rpl: 'rocket-pool',
      enj: 'enjincoin',
      mana: 'decentraland',
      sand: 'the-sandbox',
      axs: 'axie-infinity',
      gala: 'gala',
      chz: 'chiliz',
      flow: 'flow',
      imx: 'immutable-x',
      apt: 'aptos',
      sui: 'sui',
      arb: 'arbitrum',
      op: 'optimism',
      blur: 'blur',
      pepe: 'pepe',
      floki: 'floki',
    },
  },
};

/**
 * Get providers sorted by priority
 * @returns {Array} - Array of provider names sorted by priority
 */
function getProvidersByPriority() {
  return Object.entries(priceConfig.providers)
    .filter(([, config]) => config.enabled !== false)
    .sort((a, b) => a[1].priority - b[1].priority)
    .map(([name]) => name);
}

/**
 * Get configuration for a specific provider
 * @param {string} provider - Provider name
 * @returns {Object|null} - Provider configuration or null if not found
 */
function getProviderConfig(provider) {
  return priceConfig.providers[provider] || null;
}

/**
 * Get token identifier for a specific provider
 * @param {string} provider - Provider name
 * @param {string} symbol - Token symbol (e.g., 'btc', 'eth')
 * @returns {string|null} - Provider-specific token identifier
 */
function getTokenId(provider, symbol) {
  const mapping = priceConfig.tokenMappings[provider];
  if (!mapping) {
    return null;
  }
  return mapping[symbol.toLowerCase()] || null;
}

module.exports = {
  priceConfig,
  getProvidersByPriority,
  getProviderConfig,
  getTokenId,
};
