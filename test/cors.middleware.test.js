const corsMiddleware = require('../src/middleware/cors');

describe('CORS middleware', () => {
  const makeRes = () => {
    const headers = {};
    return {
      setHeader: (k, v) => {
        headers[k.toLowerCase()] = v;
      },
      getHeader: k => headers[k.toLowerCase()],
      end: () => {},
      statusCode: 200,
    };
  };

  it('sets Access-Control-Allow-Origin to *', done => {
    const req = { method: 'GET', headers: {} };
    const res = makeRes();

    corsMiddleware(req, res, () => {
      expect(res.getHeader('Access-Control-Allow-Origin')).toBe('*');
      done();
    });
  });

  it('calls next() for non-OPTIONS requests', done => {
    const req = { method: 'POST', headers: {} };
    const res = makeRes();

    let called = false;
    corsMiddleware(req, res, () => {
      called = true;
      expect(called).toBe(true);
      done();
    });
  });
});
