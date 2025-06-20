import { Router } from 'express';
import { IntentController } from '../controllers/IntentController';
import { QuoteController } from '../controllers/QuoteController';
import { validateRequest, intentRequestSchema } from '../middleware/validation';

const router = Router();
const intentController = new IntentController();
const quoteController = new QuoteController();

router.post(
  '/intent/execute',
  validateRequest(intentRequestSchema),
  intentController.executeIntent
);

router.get(
  '/intent/quote',
  quoteController.getQuote
);

router.post(
  '/intent/optimize',
  intentController.optimizeTransactions
);

router.get(
  '/intent/status/:intentId',
  intentController.getIntentStatus
);

export default router;