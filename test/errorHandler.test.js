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
      error: expect.objectContaining({
        code: 'INTERNAL_ERROR',
        message: 'axios error',
        statusCode: 500,
        timestamp: expect.any(String),
      }),
    });
  });

  it('handles network errors', () => {
    const err = { request: {}, message: 'network error' };
    errorHandler(err, { query: { provider: 'test' } }, res, () => {});
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: expect.objectContaining({
        code: 'INTERNAL_ERROR',
        message: 'network error',
        statusCode: 500,
        timestamp: expect.any(String),
      }),
    });
  });

  it('handles application errors', () => {
    const err = { message: 'boom' };
    errorHandler(err, { query: {} }, res, () => {});
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: expect.objectContaining({
        code: 'INTERNAL_ERROR',
        message: 'boom',
        statusCode: 500,
        timestamp: expect.any(String),
      }),
    });
  });
});
