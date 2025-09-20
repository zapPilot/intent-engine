const express = require('express');
const { TokenConfigService } = require('../config/tokenConfig');

const router = express.Router();

/**
 * @swagger
 * /tokens/zap/{chainId}:
 *   get:
 *     tags:
 *       - Tokens
 *     summary: Get zap-enabled tokens for a chain
 *     description: Returns all tokens available for zap operations on the specified blockchain network. Provides static metadata including contract addresses, decimals, and token types.
 *     parameters:
 *       - in: path
 *         name: chainId
 *         required: true
 *         schema:
 *           type: integer
 *           example: 1
 *         description: Blockchain network ID (1=Ethereum, 42161=Arbitrum, 8453=Base)
 *     responses:
 *       200:
 *         description: Zap-enabled tokens retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [chainId, chainName, nativeToken, tokens]
 *               properties:
 *                 chainId:
 *                   type: integer
 *                   example: 1
 *                 chainName:
 *                   type: string
 *                   example: "ethereum"
 *                 nativeToken:
 *                   type: string
 *                   example: "ETH"
 *                 tokens:
 *                   type: array
 *                   items:
 *                     type: object
 *                     required: [symbol, name, address, decimals, type]
 *                     properties:
 *                       symbol:
 *                         type: string
 *                         example: "USDC"
 *                       name:
 *                         type: string
 *                         example: "USD Coin"
 *                       address:
 *                         type: string
 *                         example: "0xA0b86a33E6441a8C8C5d56Aa14E4e66E8e6B9E2"
 *                       decimals:
 *                         type: integer
 *                         example: 6
 *                       type:
 *                         type: string
 *                         enum: [native, wrapped, erc20]
 *                         example: "erc20"
 *                       wrappedVersion:
 *                         type: string
 *                         example: "WETH"
 *                       nativeVersion:
 *                         type: string
 *                         example: "ETH"
 *                       hasDeposit:
 *                         type: boolean
 *                         example: true
 *             examples:
 *               ethereumTokens:
 *                 summary: Ethereum mainnet zap tokens
 *                 value:
 *                   chainId: 1
 *                   chainName: "ethereum"
 *                   nativeToken: "ETH"
 *                   tokens:
 *                     - symbol: "ETH"
 *                       name: "Ethereum"
 *                       address: "native"
 *                       decimals: 18
 *                       type: "native"
 *                       wrappedVersion: "WETH"
 *                     - symbol: "USDC"
 *                       name: "USD Coin"
 *                       address: "0xA0b86a33E6441a8C8C5d56Aa14E4e66E8e6B9E2"
 *                       decimals: 6
 *                       type: "erc20"
 *                     - symbol: "WETH"
 *                       name: "Wrapped Ethereum"
 *                       address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
 *                       decimals: 18
 *                       type: "wrapped"
 *                       nativeVersion: "ETH"
 *                       hasDeposit: true
 *       400:
 *         description: Invalid chain ID
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Invalid chain ID"
 *                 message:
 *                   type: string
 *                   example: "Chain ID must be a valid integer"
 *       404:
 *         description: Chain not supported
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Chain not supported"
 *                 message:
 *                   type: string
 *                   example: "Chain ID 999 is not supported"
 *                 supportedChains:
 *                   type: array
 *                   items:
 *                     type: integer
 *                   example: [1, 42161, 8453]
 */
router.get('/zap/:chainId', (req, res) => {
  try {
    const { chainId } = req.params;

    // Validate chain ID is a number
    const parsedChainId = parseInt(chainId);
    if (isNaN(parsedChainId)) {
      return res.status(400).json({
        error: 'Invalid chain ID',
        message: 'Chain ID must be a valid integer',
      });
    }

    // Get zap tokens for the chain
    const zapTokens = TokenConfigService.getZapTokens(parsedChainId);

    if (!zapTokens) {
      return res.status(404).json({
        error: 'Chain not supported',
        message: `Chain ID ${parsedChainId} is not supported`,
        supportedChains: TokenConfigService.getSupportedChains(),
      });
    }

    res.json(zapTokens);
  } catch (_error) {
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve zap tokens',
    });
  }
});

/**
 * @swagger
 * /tokens/chains:
 *   get:
 *     tags:
 *       - Tokens
 *     summary: Get supported blockchain networks
 *     description: Returns a list of all supported blockchain network IDs where zap operations are available
 *     responses:
 *       200:
 *         description: Supported chains retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [chains]
 *               properties:
 *                 chains:
 *                   type: array
 *                   items:
 *                     type: integer
 *                   example: [1, 42161, 8453]
 *             examples:
 *               supportedChains:
 *                 summary: Currently supported chains
 *                 value:
 *                   chains: [1, 42161, 8453]
 */
router.get('/chains', (req, res) => {
  try {
    const supportedChains = TokenConfigService.getSupportedChains();
    res.json({ chains: supportedChains });
  } catch (_error) {
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve supported chains',
    });
  }
});

module.exports = router;
