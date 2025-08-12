const app = require('../src/app');

describe('Server Startup', () => {
  let server;

  afterEach(done => {
    if (server) {
      server.close(() => {
        done();
      });
    } else {
      done();
    }
  });

  it('should start server when run directly (ephemeral port)', done => {
    // Use port 0 to have the OS assign an available ephemeral port
    server = app.listen(0, () => {
      const { port } = server.address();
      expect(port).toBeGreaterThan(0);
      done();
    });
  });

  it('should start when PORT env is not set (no conflict)', done => {
    const originalPort = process.env.PORT;
    delete process.env.PORT;

    // Bind to 0 to avoid conflicts with any running dev server
    server = app.listen(0, () => {
      const { port } = server.address();
      expect(port).toBeGreaterThan(0);
      // Restore env for any subsequent tests
      if (originalPort !== undefined) {
        process.env.PORT = originalPort;
      }
      done();
    });
  });
});
