import { IntentController } from '../src/controllers/IntentController';
import { QuoteController } from '../src/controllers/QuoteController';

describe('Controller Basic Tests', () => {
  describe('IntentController', () => {
    it('should instantiate IntentController', () => {
      const controller = new IntentController();
      expect(controller).toBeInstanceOf(IntentController);
    });

    it('should have executeIntent method', () => {
      const controller = new IntentController();
      expect(typeof controller.executeIntent).toBe('function');
    });

    it('should have getIntentStatus method', () => {
      const controller = new IntentController();
      expect(typeof controller.getIntentStatus).toBe('function');
    });

    it('should have optimizeTransactions method', () => {
      const controller = new IntentController();
      expect(typeof controller.optimizeTransactions).toBe('function');
    });
  });

  describe('QuoteController', () => {
    it('should instantiate QuoteController', () => {
      const controller = new QuoteController();
      expect(controller).toBeInstanceOf(QuoteController);
    });

    it('should have getQuote method', () => {
      const controller = new QuoteController();
      expect(typeof controller.getQuote).toBe('function');
    });
  });
});