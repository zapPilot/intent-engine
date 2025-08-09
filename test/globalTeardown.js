/**
 * Global Test Teardown
 * Cleans up resources that might prevent Jest from exiting cleanly
 */

module.exports = () => {
  // Try to cleanup the IntentService instance created by routes/intents.js
  try {
    const intentRoutes = require('../src/routes/intents');
    if (
      intentRoutes.intentService &&
      typeof intentRoutes.intentService.cleanup === 'function'
    ) {
      intentRoutes.intentService.cleanup();
      console.log('✅ Cleaned up IntentService timers');
    }
  } catch (error) {
    console.warn('⚠️  Could not cleanup IntentService:', error.message);
  }

  // Clear the module cache to ensure fresh imports in future tests
  try {
    delete require.cache[require.resolve('../src/routes/intents')];
    delete require.cache[require.resolve('../src/app')];
    delete require.cache[require.resolve('../src/intents/IntentService')];
    delete require.cache[
      require.resolve('../src/intents/DustZapIntentHandler')
    ];
    delete require.cache[
      require.resolve('../src/managers/ExecutionContextManager')
    ];
  } catch (_error) {
    // Ignore errors during cache cleanup
  }

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
};
