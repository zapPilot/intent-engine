const BaseDexAggregator = require('./BaseDexAggregator');

/**
 * 0x Protocol DEX Aggregator Service
 */
class ZeroXService extends BaseDexAggregator {
  constructor() {
    super({
      name: 'zerox',
      baseURL: 'https://api.0x.org/swap/allowance-holder/quote',
      apiKey: process.env.ZEROX_API_KEY,
    });
  }

  /**
   * Get swap data from 0x API
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

    // Convert slippage to basis points
    const customSlippage = this.slippageToBasisPoints(slippage);

    const requestConfig = {
      headers: {
        '0x-api-key': this.apiKey,
        '0x-version': 'v2',
      },
      params: {
        chainId: chainId,
        sellToken: fromTokenAddress,
        buyToken: toTokenAddress,
        sellAmount: amount,
        slippageBps: customSlippage,
        taker: fromAddress,
      },
    };

    const data = await this.makeRequest({
      method: 'GET',
      url: this.baseURL,
      ...requestConfig
    });
    
    // Check liquidity availability - 0x specific check
    if (data.liquidityAvailable === false) {
      const err = new Error('liquidityAvailable: false');
      err.liquidityAvailable = false; // Custom property for retry strategy
      throw err;
    }

    const gasCostUSD = this.calculateGasCostUSD(
      data.transaction.gas,
      data.transaction.gasPrice,
      ethPrice
    );

    return {
      toAmount: data.buyAmount,
      minToAmount: this.getMinToAmount(data.buyAmount, slippage),
      data: data.transaction.data,
      to: data.transaction.to,
      approve_to: data.transaction.to,
      gasCostUSD: gasCostUSD,
      gas: parseInt(data.transaction.gas),
      custom_slippage: customSlippage,
      toUsd: this.calculateTokenValueUSD(
        data.buyAmount,
        toTokenPrice,
        toTokenDecimals
      ),
    };
  }
}

module.exports = ZeroXService;
