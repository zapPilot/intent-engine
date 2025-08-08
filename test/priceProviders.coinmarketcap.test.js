jest.mock('axios');
const axios = require('axios');

describe('CoinMarketCapProvider', () => {
  let CoinMarketCapProvider;
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, COINMARKETCAP_API_KEY: 'k1,k2' };
    CoinMarketCapProvider = require('../src/services/priceProviders/coinmarketcap');
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('getPrice returns parsed result for supported token', async () => {
    const provider = new CoinMarketCapProvider();

    axios.mockResolvedValueOnce({
      data: {
        status: { error_code: 0 },
        data: {
          1: {
            quote: {
              USD: {
                price: 111,
                market_cap: 1,
                volume_24h: 2,
                percent_change_24h: 3,
              },
            },
          },
        },
      },
    });

    const res = await provider.getPrice('btc');
    expect(res).toEqual(
      expect.objectContaining({
        success: true,
        price: 111,
        symbol: 'btc',
        provider: 'coinmarketcap',
      })
    );
  });

  it('rotates API keys between calls', async () => {
    const provider = new CoinMarketCapProvider();

    axios
      .mockResolvedValueOnce({
        data: {
          status: { error_code: 0 },
          data: { 1: { quote: { USD: {} } } },
        },
      })
      .mockResolvedValueOnce({
        data: {
          status: { error_code: 0 },
          data: { 1: { quote: { USD: {} } } },
        },
      });

    await provider.getPrice('btc');
    await provider.getPrice('btc');

    const calls = axios.mock.calls;
    const firstHeaders = calls[0][0].headers;
    const secondHeaders = calls[1][0].headers;
    expect(firstHeaders['X-CMC_PRO_API_KEY']).not.toEqual(
      secondHeaders['X-CMC_PRO_API_KEY']
    );
  });

  it('throws when token unsupported', async () => {
    const provider = new CoinMarketCapProvider();
    await expect(provider.getPrice('nope')).rejects.toThrow(
      'Token nope not supported by coinmarketcap'
    );
  });

  it('throws when no API key available', async () => {
    process.env.COINMARKETCAP_API_KEY = '';
    const ProviderReloaded = require('../src/services/priceProviders/coinmarketcap');
    const provider = new ProviderReloaded();
    await expect(provider.getPrice('btc')).rejects.toThrow(
      'No CoinMarketCap API key available'
    );
  });

  it('handles API error response', async () => {
    const provider = new CoinMarketCapProvider();
    axios.mockResolvedValueOnce({
      data: { status: { error_code: 1001, error_message: 'oops' } },
    });
    await expect(provider.getPrice('btc')).rejects.toThrow(
      'CoinMarketCap API error: oops'
    );
  });

  it('handles network error', async () => {
    const provider = new CoinMarketCapProvider();
    axios.mockRejectedValueOnce({ request: {}, message: 'down' });
    await expect(provider.getPrice('btc')).rejects.toThrow(
      'CoinMarketCap network error: down'
    );
  });

  it('handles generic error', async () => {
    const provider = new CoinMarketCapProvider();
    axios.mockRejectedValueOnce(new Error('boom'));
    await expect(provider.getPrice('btc')).rejects.toThrow(
      'CoinMarketCap error: boom'
    );
  });

  it('getBulkPrices returns results and unsupported errors', async () => {
    const provider = new CoinMarketCapProvider();

    axios.mockResolvedValueOnce({
      data: {
        status: { error_code: 0 },
        data: {
          1: {
            quote: {
              USD: {
                price: 10,
                market_cap: 1,
                volume_24h: 1,
                percent_change_24h: 1,
              },
            },
          },
        },
      },
    });

    const res = await provider.getBulkPrices(['btc', 'unknown']);
    expect(res.results.btc).toEqual(
      expect.objectContaining({
        success: true,
        price: 10,
        symbol: 'btc',
        provider: 'coinmarketcap',
      })
    );
    expect(res.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          symbol: 'unknown',
          provider: 'coinmarketcap',
        }),
      ])
    );
  });

  it('getBulkPrices throws when no supported tokens', async () => {
    const provider = new CoinMarketCapProvider();
    await expect(provider.getBulkPrices(['foo'])).rejects.toThrow(
      'No supported tokens found for CoinMarketCap'
    );
  });
});
