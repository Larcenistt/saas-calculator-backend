import { Router } from 'express';
import { StripeService } from '../services/stripe.service';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Public webhook endpoint (no auth needed)
router.post('/webhook', StripeService.handleWebhook);

// Protected endpoints
router.post('/checkout-session', authMiddleware, StripeService.createCheckoutSession);
router.post('/payment-intent', authMiddleware, StripeService.createPaymentIntent);
router.get('/subscription/:subscriptionId', authMiddleware, StripeService.getSubscriptionStatus);
router.post('/subscription/:subscriptionId/cancel', authMiddleware, StripeService.cancelSubscription);
router.post('/portal-session', authMiddleware, StripeService.createPortalSession);

export default router;