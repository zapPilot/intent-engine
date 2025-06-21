import { Router } from 'express';
import { IntentController } from '../controllers/IntentController';
import { QuoteController } from '../controllers/QuoteController';
import { validateRequest, intentRequestSchema } from '../middleware/validation';

const router = Router();
const intentController = new IntentController();
const quoteController = new QuoteController();

// Core endpoint: Build transactions for wallet execution
router.post(
  '/intent/build',
  validateRequest(intentRequestSchema),
  intentController.executeIntent // TODO: Rename method to buildTransactions
);

// Quote endpoint (consider moving to rebalance_backend)
router.get('/quote', quoteController.getQuote);

// Enhanced swap endpoint that matches rebalance_backend functionality
router.get('/swap/enhanced', quoteController.getEnhancedSwapData);

export default router;
