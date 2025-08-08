const errorHandler = require('../src/middleware/errorHandler');

describe('errorHandler middleware', () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };

  beforeEach(() => {
    res.status.mockClear();
    res.json.mockClear();
  });

  it('handles axios errors', () => {
    const err = {
      response: { status: 404, data: { message: 'Not found' } },
      message: 'axios error',
    };
    errorHandler(err, { query: { provider: 'test' } }, res, () => {});
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'External API error',
      message: 'Not found',
      provider: 'test',
    });
  });

  it('handles network errors', () => {
    const err = { request: {}, message: 'network error' };
    errorHandler(err, { query: { provider: 'test' } }, res, () => {});
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Network error',
      message: 'Unable to connect to external service',
      provider: 'test',
    });
  });

  it('handles application errors', () => {
    const err = { message: 'boom' };
    errorHandler(err, { query: {} }, res, () => {});
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Internal server error',
      message: 'boom',
      provider: 'unknown',
    });
  });
});
