const { spawn } = require('child_process');
const path = require('path');

describe('Server Startup', () => {
  it('should start server when run directly', done => {
    // Run app.js directly as a child process
    const appPath = path.join(__dirname, '../src/app.js');
    const child = spawn('node', [appPath], {
      env: { ...process.env, PORT: '3002', NODE_ENV: 'test' },
      stdio: 'pipe',
    });

    let output = '';

    child.stdout.on('data', data => {
      output += data.toString();

      // Check if all expected console logs have been printed
      if (
        output.includes('🚀 Intent Engine Server running on port 3002') &&
        output.includes('Environment: test') &&
        output.includes(
          '📚 API Documentation: http://localhost:3002/api-docs'
        ) &&
        output.includes('❤️  Health Check: http://localhost:3002/health') &&
        output.includes('Supported DEX providers: 1inch, paraswap, 0x') &&
        output.includes('Supported intents: dustZap')
      ) {
        // Kill the child process
        child.kill();

        // Test passed
        done();
      }
    });

    child.stderr.on('data', data => {
      console.error('Error:', data.toString());
    });

    child.on('error', error => {
      done(error);
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      child.kill();
      done(new Error('Server startup test timed out'));
    }, 5000);
  });

  it('should use default port when PORT env is not set', done => {
    // Run app.js directly as a child process without PORT env
    const appPath = path.join(__dirname, '../src/app.js');
    const env = { ...process.env };
    delete env.PORT;

    const child = spawn('node', [appPath], {
      env: { ...env, NODE_ENV: 'test' },
      stdio: 'pipe',
    });

    let output = '';

    child.stdout.on('data', data => {
      output += data.toString();

      // Check if server started with default port
      if (output.includes('🚀 Intent Engine Server running on port 3002')) {
        // Kill the child process
        child.kill();

        // Test passed
        done();
      }
    });

    child.stderr.on('data', data => {
      console.error('Error:', data.toString());
    });

    child.on('error', error => {
      done(error);
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      child.kill();
      done(new Error('Server startup test timed out'));
    }, 5000);
  });
});
