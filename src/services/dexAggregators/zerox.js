const axios = require('axios');
const BaseDexAggregator = require('./baseDexAggregator');

/**
 * 0x Protocol DEX Aggregator Service
 */
class ZeroXService extends BaseDexAggregator {
  constructor() {
    super();
    this.baseURL = 'https://api.0x.org/swap/allowance-holder/quote';
    this.apiKey = process.env.ZEROX_API_KEY;
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

    // Convert slippage to basis points (1% = 100 basis points)
    const customSlippage = this.slippageToBps(slippage);

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

    const response = await axios.get(this.baseURL, requestConfig);
    if (response.data.liquidityAvailable === false) {
      const err = new Error('liquidityAvailable: false');
      err.liquidityAvailable = false; // Custom property for retry strategy
      throw err;
    }
    const data = response.data;

    const gasCostUSD = this.calcGasCostUSDFromTx(data.transaction, ethPrice);

    return {
      toAmount: data.buyAmount,
      minToAmount: this.getMinToAmount(data.buyAmount, slippage),
      data: data.transaction.data,
      to: data.transaction.to,
      approve_to: data.transaction.to,
      gasCostUSD: gasCostUSD,
      gas: parseInt(data.transaction.gas),
      custom_slippage: customSlippage,
      toUsd: this.toUsd(data.buyAmount, toTokenPrice, toTokenDecimals),
    };
  }

  /**
   * Calculate minimum amount considering slippage
   * @param {string} toAmount - Output amount
   * @param {number} slippage - Slippage percentage
   * @returns {number} - Minimum amount
   */
  // min amount helper provided by base class
}

module.exports = ZeroXService;
