const axios = require('axios');

/**
 * 0x Protocol DEX Aggregator Service
 */
class ZeroXService {
  constructor() {
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
    const customSlippage = parseInt(parseFloat(slippage) * 100);

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

    const gasCostUSD =
      ((parseInt(data.transaction.gas) * parseInt(data.transaction.gasPrice)) /
        Math.pow(10, 18)) *
      ethPrice;

    return {
      toAmount: data.buyAmount,
      minToAmount: this.getMinToAmount(data.buyAmount, slippage),
      data: data.transaction.data,
      to: data.transaction.to,
      approve_to: data.transaction.to,
      gasCostUSD: gasCostUSD,
      gas: parseInt(data.transaction.gas),
      custom_slippage: customSlippage,
      toUsd:
        (parseInt(data.buyAmount) * toTokenPrice) /
          Math.pow(10, toTokenDecimals) -
        gasCostUSD,
    };
  }

  /**
   * Calculate minimum amount considering slippage
   * @param {string} toAmount - Output amount
   * @param {number} slippage - Slippage percentage
   * @returns {number} - Minimum amount
   */
  getMinToAmount(toAmount, slippage) {
    return Math.floor(
      (parseInt(toAmount) * (100 - parseFloat(slippage))) / 100
    );
  }
}

module.exports = ZeroXService;
