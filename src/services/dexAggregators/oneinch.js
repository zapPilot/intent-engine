const BaseDexAggregator = require('./BaseDexAggregator');

/**
 * 1inch DEX Aggregator Service
 */
class OneInchService extends BaseDexAggregator {
  constructor() {
    super({
      name: '1inch',
      baseURL: 'https://api.1inch.dev/swap',
      apiKey: process.env.ONE_INCH_API_KEY,
      chainConfig: {
        // Chain ID to protocol name prefix mapping
        chainPrefixMap: {
          1: '', // Ethereum
          42161: 'ARBITRUM_', // Arbitrum
          8453: 'BASE_', // Base
          10: 'OPTIMISM_', // Optimism
          137: 'POLYGON_', // Polygon
        },
      },
    });
  }

  /**
   * Get swap data from 1inch API
   * @param {Object} params - Swap parameters
   * @returns {Promise<Object>} - Swap data response
   */
  async getSwapData(params) {
    const {
      chainId,
      fromTokenAddress,
      toTokenAddress,
      amount,
      fromAddress,
      slippage,
      ethPrice,
      toTokenPrice,
      toTokenDecimals,
    } = params;

    const chainPrefix = this.chainConfig.chainPrefixMap[chainId] || '';
    const excludedProtocols = [
      `${chainPrefix}ONE_INCH_LIMIT_ORDER_V3`,
      `${chainPrefix}ONE_INCH_LIMIT_ORDER_V4`,
    ];

    const apiUrl = `${this.baseURL}/v5.2/${chainId}/swap`;
    const requestConfig = {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      params: {
        src: fromTokenAddress,
        dst: toTokenAddress,
        amount: amount,
        from: fromAddress,
        slippage: slippage,
        disableEstimate: 'true',
        'liquidity-sources': excludedProtocols.join(','),
      },
    };

    const data = await this.makeRequest({
      method: 'GET',
      url: apiUrl,
      ...requestConfig,
    });

    const gasCostUSD = this.calculateGasCostUSD(
      data.tx.gas,
      data.tx.gasPrice,
      ethPrice
    );

    return {
      approve_to: data.tx.to,
      to: data.tx.to,
      toAmount: data.toAmount,
      minToAmount: this.getMinToAmount(data.toAmount, slippage),
      data: data.tx.data,
      gasCostUSD: gasCostUSD,
      gas: parseInt(data.tx.gasPrice),
      custom_slippage: slippage,
      toUsd: this.calculateTokenValueUSD(
        data.toAmount,
        toTokenPrice,
        toTokenDecimals
      ),
    };
  }
}

module.exports = OneInchService;
