const BaseDexAggregator = require('./BaseDexAggregator');

/**
 * Paraswap DEX Aggregator Service
 */
class ParaswapService extends BaseDexAggregator {
  constructor() {
    super({
      name: 'paraswap',
      baseURL: 'https://api.paraswap.io/swap',
      apiKey: null, // Paraswap doesn't require an API key
      chainConfig: {
        // Chain ID to Paraswap proxy address mapping
        chainProxyMap: {
          1: '0x216b4b4ba9f3e719726886d34a177484278bfcae',
          10: '0x216b4b4ba9f3e719726886d34a177484278bfcae',
          56: '0x216b4b4ba9f3e719726886d34a177484278bfcae',
          137: '0x216b4b4ba9f3e719726886d34a177484278bfcae',
          1101: '0x216b4b4ba9f3e719726886d34a177484278bfcae',
          8453: '0x93aAAe79a53759cD164340E4C8766E4Db5331cD7',
          42161: '0x216B4B4Ba9F3e719726886d34a177484278Bfcae',
          43114: '0x216b4b4ba9f3e719726886d34a177484278bfcae',
        }
      }
    });
  }

  /**
   * Get swap data from Paraswap API
   * @param {Object} params - Swap parameters
   * @returns {Promise<Object>} - Swap data response
   */
  async getSwapData(params) {
    const {
      chainId,
      fromTokenAddress,
      fromTokenDecimals,
      toTokenAddress,
      toTokenDecimals,
      amount,
      fromAddress,
      slippage,
      toTokenPrice,
    } = params;

    // Convert slippage to basis points
    const customSlippage = this.slippageToBasisPoints(slippage);

    const requestConfig = {
      headers: {
        'Content-Type': 'application/json',
      },
      params: {
        srcToken: fromTokenAddress,
        srcDecimals: fromTokenDecimals,
        destToken: toTokenAddress,
        destDecimals: toTokenDecimals,
        amount: amount,
        side: 'SELL',
        network: chainId,
        slippage: customSlippage,
        userAddress: fromAddress,
        excludeDEXS: 'AugustusRFQ',
      },
    };
    
    const data = await this.makeRequest({
      method: 'GET',
      url: this.baseURL,
      ...requestConfig
    });

    const gasCostUSD = parseFloat(data.priceRoute.gasCostUSD);

    return {
      approve_to: this.chainConfig.chainProxyMap[chainId],
      to: data.txParams.to,
      toAmount: data.priceRoute.destAmount,
      minToAmount: this.getMinToAmount(data.priceRoute.destAmount, slippage),
      data: data.txParams.data,
      gasCostUSD: gasCostUSD,
      gas: data.priceRoute.gasCost,
      custom_slippage: customSlippage,
      toUsd: this.calculateTokenValueUSD(
        data.priceRoute.destAmount,
        toTokenPrice,
        toTokenDecimals
      ),
    };
  }
}

module.exports = ParaswapService;
