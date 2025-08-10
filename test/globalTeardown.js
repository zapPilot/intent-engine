/**
 * Global Test Teardown
 * Cleans up resources that might prevent Jest from exiting cleanly
 */

module.exports = async () => {
  // Track cleanup attempts to avoid duplicates
  let cleanupCount = 0;

  // Try to cleanup all IntentService instances from cached modules
  try {
    // Get all cached modules
    const moduleCache = Object.keys(require.cache);
    const intentServiceModules = moduleCache.filter(
      key => key.includes('routes/intents') && !key.includes('node_modules')
    );

    for (const moduleKey of intentServiceModules) {
      try {
        const intentRoutes = require.cache[moduleKey]?.exports;
        if (
          intentRoutes &&
          intentRoutes.intentService &&
          typeof intentRoutes.intentService.cleanup === 'function'
        ) {
          intentRoutes.intentService.cleanup();
          cleanupCount++;
        }
      } catch (moduleError) {
        console.warn(
          `⚠️  Could not cleanup IntentService from ${moduleKey}:`,
          moduleError.message
        );
      }
    }

    // Also try direct cleanup from current module
    const intentRoutes = require('../src/routes/intents');
    if (
      intentRoutes.intentService &&
      typeof intentRoutes.intentService.cleanup === 'function'
    ) {
      intentRoutes.intentService.cleanup();
      cleanupCount++;
    }

    if (cleanupCount > 0) {
      console.log(`✅ Cleaned up ${cleanupCount} IntentService timer(s)`);
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

  // Allow some time for cleanup to complete
  await new Promise(resolve => setTimeout(resolve, 100));

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
};
