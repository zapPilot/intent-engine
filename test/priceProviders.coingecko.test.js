jest.mock('axios');
const axios = require('axios');

// Use actual config for token id mapping
const { getTokenId } = require('../src/config/priceConfig');

describe('CoinGeckoProvider', () => {
  let CoinGeckoProvider;

  beforeEach(() => {
    CoinGeckoProvider = require('../src/services/priceProviders/coingecko');
    jest.clearAllMocks();
  });

  it('getPrice returns parsed result for supported token', async () => {
    const coinId = getTokenId('coingecko', 'btc');

    axios.mockResolvedValueOnce({
      data: {
        [coinId]: {
          usd: 12345.67,
          usd_market_cap: 100,
          usd_24h_vol: 200,
          usd_24h_change: 3.21,
        },
      },
    });

    const provider = new CoinGeckoProvider();
    const res = await provider.getPrice('btc');

    expect(res).toEqual(
      expect.objectContaining({
        success: true,
        price: 12345.67,
        symbol: 'btc',
        provider: 'coingecko',
      })
    );
    expect(new Date(res.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('getPrice throws when token unsupported', async () => {
    const provider = new CoinGeckoProvider();
    await expect(provider.getPrice('notatoken')).rejects.toThrow(
      'Token notatoken not supported by coingecko'
    );
  });

  it('getPrice throws when API returns no data', async () => {
    const coinId = getTokenId('coingecko', 'eth');
    axios.mockResolvedValueOnce({ data: { [coinId]: undefined } });
    const provider = new CoinGeckoProvider();
    await expect(provider.getPrice('eth')).rejects.toThrow(
      'Price data not found for token eth'
    );
  });

  it('getPrice handles API error response', async () => {
    axios.mockRejectedValueOnce({
      response: { data: { error: 'rate limited' } },
    });
    const provider = new CoinGeckoProvider();
    await expect(provider.getPrice('btc')).rejects.toThrow(
      'CoinGecko API error: rate limited'
    );
  });

  it('getPrice handles network error', async () => {
    axios.mockRejectedValueOnce({ request: {}, message: 'network down' });
    const provider = new CoinGeckoProvider();
    await expect(provider.getPrice('btc')).rejects.toThrow(
      'CoinGecko network error: network down'
    );
  });

  it('getPrice handles generic error', async () => {
    axios.mockRejectedValueOnce(new Error('boom'));
    const provider = new CoinGeckoProvider();
    await expect(provider.getPrice('btc')).rejects.toThrow(
      'CoinGecko error: boom'
    );
  });

  it('getBulkPrices returns results and errors', async () => {
    const btcId = getTokenId('coingecko', 'btc');
    const data = {
      [btcId]: { usd: 1, usd_market_cap: 1, usd_24h_vol: 1, usd_24h_change: 1 },
    };
    axios.mockResolvedValueOnce({ data });

    const provider = new CoinGeckoProvider();
    const res = await provider.getBulkPrices(['btc', 'unknown']);

    expect(res.results.btc).toEqual(
      expect.objectContaining({
        success: true,
        price: 1,
        symbol: 'btc',
        provider: 'coingecko',
      })
    );
    expect(res.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ symbol: 'unknown', provider: 'coingecko' }),
      ])
    );
  });

  it('getBulkPrices throws when no supported tokens', async () => {
    const provider = new CoinGeckoProvider();
    await expect(provider.getBulkPrices(['foo', 'bar'])).rejects.toThrow(
      'No supported tokens found for CoinGecko'
    );
  });

  it('getBulkPrices handles API error response', async () => {
    axios.mockRejectedValueOnce({
      response: { data: { error: 'bad request' } },
    });
    const provider = new CoinGeckoProvider();
    await expect(provider.getBulkPrices(['btc'])).rejects.toThrow(
      'CoinGecko API error: bad request'
    );
  });

  it('getPriceByAddress returns parsed result', async () => {
    axios.mockResolvedValueOnce({
      data: {
        data: {
          attributes: {
            token_prices: { '0xabc': '123.45' },
          },
        },
      },
    });

    const provider = new CoinGeckoProvider();
    const res = await provider.getPriceByAddress('ethereum', '0xAbC');
    expect(res).toEqual(
      expect.objectContaining({
        success: true,
        price: 123.45,
        symbol: 'ethereum:0xAbC',
      })
    );
  });

  it('getPriceByAddress throws when no price data found', async () => {
    axios.mockResolvedValueOnce({
      data: { data: { attributes: { token_prices: {} } } },
    });
    const provider = new CoinGeckoProvider();
    await expect(
      provider.getPriceByAddress('ethereum', '0xabc')
    ).rejects.toThrow(
      'Price data not found for token at address 0xabc on ethereum'
    );
  });

  it('isAvailable and getStatus reflect availability', () => {
    const provider = new CoinGeckoProvider();
    expect(provider.isAvailable()).toBe(true);
    expect(provider.getStatus()).toEqual(
      expect.objectContaining({
        name: 'coingecko',
        available: true,
        requiresApiKey: false,
      })
    );
  });
});
