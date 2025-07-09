const app = require('./src/app');

const PORT = process.env.PORT || 3002;

app.listen(PORT, () => {
  console.log(`🚀 Swap API Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Supported providers: 1inch, paraswap, 0x`);
});