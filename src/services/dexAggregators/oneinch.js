const axios = require('axios');

/**
 * 1inch DEX Aggregator Service
 */
class OneInchService {
  constructor() {
    this.baseURL = 'https://api.1inch.dev/swap';
    this.apiKey = process.env.ONE_INCH_API_KEY;
    
    // Chain ID to protocol name prefix mapping
    this.chainPrefixMap = {
      '1': '',         // Ethereum
      '42161': 'ARBITRUM_',  // Arbitrum
      '8453': 'BASE_',       // Base
      '10': 'OPTIMISM_',     // Optimism
      '137': 'POLYGON_',     // Polygon
    };
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

    const chainPrefix = this.chainPrefixMap[chainId] || '';
    const excludedProtocols = [
      `${chainPrefix}ONE_INCH_LIMIT_ORDER_V3`,
      `${chainPrefix}ONE_INCH_LIMIT_ORDER_V4`,
    ];

    const apiUrl = `${this.baseURL}/v5.2/${chainId}/swap`;
    const requestConfig = {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
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

    const response = await axios.get(apiUrl, requestConfig);
    const data = response.data;

    const gasCostUSD = (
      (parseInt(data.tx.gas) * parseInt(data.tx.gasPrice)) / 
      Math.pow(10, 18) * 
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
      toUsd: (
        parseInt(data.toAmount) * 
        toTokenPrice / 
        Math.pow(10, toTokenDecimals) - 
        gasCostUSD
      ),
    };
  }

  /**
   * Calculate minimum amount considering slippage
   * @param {string} toAmount - Output amount
   * @param {number} slippage - Slippage percentage
   * @returns {number} - Minimum amount
   */
  getMinToAmount(toAmount, slippage) {
    return Math.floor(parseInt(toAmount) * (100 - parseFloat(slippage)) / 100);
  }
}

module.exports = OneInchService;