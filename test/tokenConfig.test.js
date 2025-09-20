const {
  TOKEN_REGISTRY,
  CHAIN_METADATA,
  WETH_DEPOSIT_ABI,
  ERC20_TRANSFER_ABI,
  TokenConfigService,
} = require('../src/config/tokenConfig');

describe('TokenConfig', () => {
  describe('Constants', () => {
    it('should export WETH_DEPOSIT_ABI', () => {
      expect(WETH_DEPOSIT_ABI).toBeDefined();
      expect(WETH_DEPOSIT_ABI).toHaveLength(1);
      expect(WETH_DEPOSIT_ABI[0].name).toBe('deposit');
      expect(WETH_DEPOSIT_ABI[0].payable).toBe(true);
    });

    it('should export ERC20_TRANSFER_ABI', () => {
      expect(ERC20_TRANSFER_ABI).toBeDefined();
      expect(ERC20_TRANSFER_ABI).toHaveLength(1);
      expect(ERC20_TRANSFER_ABI[0].name).toBe('transfer');
      expect(ERC20_TRANSFER_ABI[0].inputs).toHaveLength(2);
    });

    it('should export TOKEN_REGISTRY with supported chains', () => {
      expect(TOKEN_REGISTRY).toBeDefined();

      const supportedChains = TokenConfigService.getSupportedChains();

      supportedChains.forEach(chainId => {
        expect(TOKEN_REGISTRY[chainId]).toBeDefined();
        expect(CHAIN_METADATA[chainId]).toBeDefined();
      });

      expect(new Set(supportedChains)).toEqual(
        new Set(Object.keys(TOKEN_REGISTRY).map(Number))
      );
    });

    it('should export CHAIN_METADATA', () => {
      expect(CHAIN_METADATA).toBeDefined();
      expect(CHAIN_METADATA[1].name).toBe('Ethereum');
      expect(CHAIN_METADATA[1].nativeToken).toBe('ETH');
    });
  });

  describe('TokenConfigService', () => {
    describe('getToken', () => {
      it('should return token metadata for valid chain and symbol', () => {
        const token = TokenConfigService.getToken(1, 'USDC');
        expect(token).toBeDefined();
        expect(token.symbol).toBe('USDC');
        expect(token.decimals).toBe(6);
        expect(token.type).toBe('erc20');
      });

      it('should handle case-insensitive symbol lookup', () => {
        const token1 = TokenConfigService.getToken(1, 'usdc');
        const token2 = TokenConfigService.getToken(1, 'USDC');
        expect(token1).toEqual(token2);
      });

      it('should return null for invalid chain', () => {
        const token = TokenConfigService.getToken(999999, 'USDC');
        expect(token).toBeNull();
      });

      it('should return null for invalid token symbol', () => {
        const token = TokenConfigService.getToken(1, 'INVALID');
        expect(token).toBeNull();
      });

      it('should return native token metadata', () => {
        const eth = TokenConfigService.getToken(1, 'ETH');
        expect(eth).toBeDefined();
        expect(eth.type).toBe('native');
        expect(eth.wrappedVersion).toBe('WETH');
      });

      it('should return wrapped token metadata', () => {
        const weth = TokenConfigService.getToken(1, 'WETH');
        expect(weth).toBeDefined();
        expect(weth.type).toBe('wrapped');
        expect(weth.hasDeposit).toBe(true);
        expect(weth.nativeVersion).toBe('ETH');
      });
    });

    describe('getWETHAddress', () => {
      it('should return WETH address for Ethereum', () => {
        const address = TokenConfigService.getWETHAddress(1);
        expect(address).toBe('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
      });

      it('should return WETH address for Arbitrum', () => {
        const address = TokenConfigService.getWETHAddress(42161);
        expect(address).toBe('0x82aF49447D8a07e3bd95BD0d56f35241523fBab1');
      });

      it('should return null for unsupported chain', () => {
        const address = TokenConfigService.getWETHAddress(999999);
        expect(address).toBeNull();
      });
    });

    describe('getNativeTokenSymbol', () => {
      it('should return native token symbol for each chain', () => {
        expect(TokenConfigService.getNativeTokenSymbol(1)).toBe('ETH');
        expect(TokenConfigService.getNativeTokenSymbol(42161)).toBe('ETH');
        expect(TokenConfigService.getNativeTokenSymbol(8453)).toBe('ETH');
      });

      it('should return null for unsupported chain', () => {
        expect(TokenConfigService.getNativeTokenSymbol(999999)).toBeNull();
      });
    });

    describe('hasDepositFunction', () => {
      it('should return true for wrapped native tokens', () => {
        expect(TokenConfigService.hasDepositFunction(1, 'WETH')).toBe(true);
      });

      it('should return false for non-wrapped tokens', () => {
        expect(TokenConfigService.hasDepositFunction(1, 'USDC')).toBe(false);
        expect(TokenConfigService.hasDepositFunction(1, 'ETH')).toBe(false);
      });

      it('should return false for invalid tokens', () => {
        expect(TokenConfigService.hasDepositFunction(1, 'INVALID')).toBe(false);
        expect(TokenConfigService.hasDepositFunction(999999, 'WETH')).toBe(
          false
        );
      });
    });

    describe('getChainTokens', () => {
      it('should return all tokens for a chain', () => {
        const tokens = TokenConfigService.getChainTokens(1);
        expect(tokens).toBeDefined();
        expect(tokens.ETH).toBeDefined();
        expect(tokens.WETH).toBeDefined();
        expect(tokens.USDC).toBeDefined();
        expect(tokens.USDT).toBeDefined();
      });

      it('should return null for unsupported chain', () => {
        const tokens = TokenConfigService.getChainTokens(999999);
        expect(tokens).toBeNull();
      });
    });

    describe('getSupportedChains', () => {
      it('should return array of supported chain IDs', () => {
        const chains = TokenConfigService.getSupportedChains();
        expect(chains).toBeInstanceOf(Array);
        expect(chains).toContain(1);
        expect(chains).toContain(42161);
        expect(chains).toContain(8453);
      });

      it('should return numbers, not strings', () => {
        const chains = TokenConfigService.getSupportedChains();
        chains.forEach(chain => {
          expect(typeof chain).toBe('number');
        });
      });
    });

    describe('isChainSupported', () => {
      it('should return true for supported chains', () => {
        expect(TokenConfigService.isChainSupported(1)).toBe(true);
        expect(TokenConfigService.isChainSupported(42161)).toBe(true);
        expect(TokenConfigService.isChainSupported(8453)).toBe(true);
      });

      it('should return false for unsupported chains', () => {
        expect(TokenConfigService.isChainSupported(999999)).toBe(false);
        expect(TokenConfigService.isChainSupported(0)).toBe(false);
      });
    });

    describe('getWrappedNativeToken', () => {
      it('should return wrapped native token for each chain', () => {
        const weth = TokenConfigService.getWrappedNativeToken(1);
        expect(weth).toBeDefined();
        expect(weth.symbol).toBe('WETH');
        expect(weth.type).toBe('wrapped');
      });

      it('should return null for unsupported chain', () => {
        const wrapped = TokenConfigService.getWrappedNativeToken(999999);
        expect(wrapped).toBeNull();
      });
    });
  });

  describe('Token Registry Structure', () => {
    it('should have consistent structure for all tokens', () => {
      Object.values(TOKEN_REGISTRY).forEach(chain => {
        Object.values(chain).forEach(token => {
          expect(token).toHaveProperty('type');
          expect(token).toHaveProperty('symbol');
          expect(token).toHaveProperty('name');
          expect(token).toHaveProperty('decimals');

          if (token.type === 'wrapped') {
            expect(token).toHaveProperty('address');
            expect(token).toHaveProperty('hasDeposit');
            expect(token).toHaveProperty('nativeVersion');
          }

          if (token.type === 'native') {
            expect(token).toHaveProperty('wrappedVersion');
          }

          if (token.type === 'erc20') {
            expect(token).toHaveProperty('address');
          }
        });
      });
    });
  });
});
