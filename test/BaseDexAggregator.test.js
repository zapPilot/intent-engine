const BaseDexAggregator = require('../src/services/dexAggregators/baseDexAggregator');

describe('BaseDexAggregator', () => {
  let base;
  beforeEach(() => {
    base = new BaseDexAggregator();
  });

  describe('getMinToAmount', () => {
    it('computes min amount with integer percent slippage', () => {
      // 1000 with 1% slippage => 990
      expect(base.getMinToAmount('1000', 1)).toBe(990);
      expect(base.getMinToAmount(1000, '1')).toBe(990);
    });

    it('handles decimal slippage', () => {
      // 1000 with 0.5% => floor(995)
      expect(base.getMinToAmount('1000', 0.5)).toBe(995);
    });

    it('returns 0 on invalid input', () => {
      expect(base.getMinToAmount('abc', 1)).toBe(0);
      expect(base.getMinToAmount('1000', 'x')).toBe(0);
    });
  });

  describe('slippageToBps', () => {
    it('converts percent to bps', () => {
      expect(base.slippageToBps(1)).toBe(100);
      expect(base.slippageToBps('0.25')).toBe(25);
    });

    it('returns 0 for invalid input', () => {
      expect(base.slippageToBps('foo')).toBe(0);
    });
  });

  describe('calcGasCostUSDFromTx', () => {
    it('computes gas cost usd from gas and gasPrice', () => {
      const tx = { gas: '150000', gasPrice: '20000000000' }; // 150k * 20 gwei
      // gas * gasPrice = 3e15 wei => 0.003 ETH; 0.003 * $3000 = $9
      expect(base.calcGasCostUSDFromTx(tx, 3000)).toBeCloseTo(9, 6);
    });

    it('returns 0 for invalid tx', () => {
      expect(base.calcGasCostUSDFromTx(null, 3000)).toBe(0);
      expect(base.calcGasCostUSDFromTx({ gas: 'x', gasPrice: 1 }, 3000)).toBe(
        0
      );
    });
  });

  describe('toUsd', () => {
    it('converts smallest units to USD', () => {
      // 1e18 at $3000, 18 decimals => $3000
      expect(base.toUsd('1000000000000000000', 3000, 18)).toBe(3000);
    });

    it('returns 0 on invalid input', () => {
      expect(base.toUsd('abc', 1, 18)).toBe(0);
      expect(base.toUsd('1', 'x', 18)).toBe(0);
    });
  });
});
