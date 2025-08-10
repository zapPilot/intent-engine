const { RetryStrategies } = require('../src/utils/retry');

describe('RetryStrategies', () => {
  describe('oneInch', () => {
    it('skips retry on HTTP 400', () => {
      const error = {
        response: { status: 400, data: { error: 'Bad Request' } },
        message: 'Request failed with status code 400',
      };
      expect(RetryStrategies.oneInch(error)).toBe(false);
    });

    it('skips retry on HTTP 429', () => {
      const error = { response: { status: 429 }, message: 'Rate limited' };
      expect(RetryStrategies.oneInch(error)).toBe(false);
    });
  });

  describe('paraswap', () => {
    it('skips retry on HTTP 400', () => {
      const error = {
        response: { status: 400, data: { error: 'Huge price impact' } },
        message: 'Request failed with status code 400',
      };
      expect(RetryStrategies.paraswap(error)).toBe(false);
    });
    it('skips retry on HTTP 404', () => {
      const error = { response: { status: 404 }, message: 'No route found' };
      expect(RetryStrategies.paraswap(error)).toBe(false);
    });
  });

  describe('zeroX', () => {
    it('skips retry when liquidityAvailable=false flag present', () => {
      const error = {
        message: 'liquidityAvailable: false',
        liquidityAvailable: false,
      };
      expect(RetryStrategies.zeroX(error)).toBe(false);
    });
    it('skips retry on HTTP 400', () => {
      const error = { response: { status: 400 }, message: 'Bad Request' };
      expect(RetryStrategies.zeroX(error)).toBe(false);
    });
  });
});
