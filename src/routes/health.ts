import { Router } from 'express';
import { healthController } from '../controllers/HealthController';

const router = Router();

// Basic health check
router.get('/', healthController.getHealth.bind(healthController));

// Comprehensive system health
router.get('/system', healthController.getSystemHealth.bind(healthController));

// All providers health
router.get('/providers', healthController.getProvidersHealth.bind(healthController));

// Individual provider health
router.get('/providers/:provider', healthController.getProviderHealth.bind(healthController));

// Kubernetes/orchestration probes
router.get('/ready', healthController.getReadiness.bind(healthController));
router.get('/live', healthController.getLiveness.bind(healthController));

export default router;
