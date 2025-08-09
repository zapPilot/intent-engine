const errorHandler = require('../src/middleware/errorHandler');

describe('errorHandler middleware', () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };

  const req = {
    query: {},
    headers: {},
    method: 'GET',
    originalUrl: '/test',
    params: {},
    body: {},
    ip: '127.0.0.1',
    get: jest.fn().mockReturnValue('test-user-agent'),
  };

  beforeEach(() => {
    res.status.mockClear();
    res.json.mockClear();
    req.query = {};
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  it('handles axios errors', () => {
    const err = {
      response: { status: 404, data: { message: 'Not found' } },
      message: 'axios error',
      isAxiosError: true,
    };
    req.query = { provider: 'test' };
    errorHandler(err, req, res, () => {});
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'EXTERNAL_API_ERROR',
          message: expect.stringContaining('External API error'),
        }),
      })
    );
  });

  it('handles network errors', () => {
    const err = { request: {}, message: 'network error', isAxiosError: true };
    req.query = { provider: 'test' };
    errorHandler(err, req, res, () => {});
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'SERVICE_UNAVAILABLE',
          message: expect.stringContaining('No response received'),
        }),
      })
    );
  });

  it('handles application errors', () => {
    const err = { message: 'boom' };
    errorHandler(err, req, res, () => {});
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'INTERNAL_ERROR',
          message: 'boom',
        }),
      })
    );
  });
});
