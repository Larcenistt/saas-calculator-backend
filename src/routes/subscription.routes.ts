import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia' as any
});

// Plans configuration
const PLANS = {
  FREE: {
    name: 'Free',
    price: 0,
    features: [
      '5 calculations per month',
      'Basic analytics',
      'PDF export'
    ],
    limits: {
      calculations: 5,
      apiCalls: 0
    }
  },
  PROFESSIONAL: {
    name: 'Professional',
    price: 79,
    stripePriceId: process.env.STRIPE_PROFESSIONAL_PRICE_ID,
    features: [
      'Unlimited calculations',
      'Advanced analytics',
      'Priority support',
      'API access (1000 calls/month)',
      'Custom branding',
      'Team collaboration'
    ],
    limits: {
      calculations: -1, // unlimited
      apiCalls: 1000
    }
  },
  ENTERPRISE: {
    name: 'Enterprise',
    price: 299,
    stripePriceId: process.env.STRIPE_ENTERPRISE_PRICE_ID,
    features: [
      'Everything in Professional',
      'Unlimited API calls',
      'White-label options',
      'Dedicated support',
      'Custom integrations',
      'SLA guarantee'
    ],
    limits: {
      calculations: -1,
      apiCalls: -1
    }
  }
};

// Get current subscription
router.get('/current', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.userId;

    const subscription = await prisma.subscription.findUnique({
      where: { userId }
    });

    const plan = subscription?.plan || 'FREE';
    const planDetails = PLANS[plan as keyof typeof PLANS];

    res.json({
      subscription,
      plan,
      planDetails
    });
  } catch (error) {
    next(error);
  }
});

// Create checkout session
const createCheckoutSchema = z.object({
  plan: z.enum(['PROFESSIONAL', 'ENTERPRISE']),
  successUrl: z.string().url(),
  cancelUrl: z.string().url()
});

router.post('/create-checkout', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { plan, successUrl, cancelUrl } = createCheckoutSchema.parse(req.body);
    const userId = (req as any).user.userId;
    
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const planDetails = PLANS[plan];
    if (!planDetails.stripePriceId) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    // Create or retrieve Stripe customer
    let customerId = user.stripeCustomerId;
    
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          userId: user.id
        }
      });
      
      customerId = customer.id;
      
      await prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId: customerId }
      });
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{
        price: planDetails.stripePriceId,
        quantity: 1
      }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId,
        plan
      }
    });

    res.json({ 
      checkoutUrl: session.url,
      sessionId: session.id 
    });
  } catch (error) {
    next(error);
  }
});

// Cancel subscription
router.post('/cancel', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.userId;

    const subscription = await prisma.subscription.findUnique({
      where: { userId }
    });

    if (!subscription || !subscription.stripeSubscriptionId) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    // Cancel in Stripe
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true
    });

    // Update database
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'CANCELLING',
        canceledAt: new Date()
      }
    });

    res.json({ message: 'Subscription will be cancelled at the end of the billing period' });
  } catch (error) {
    next(error);
  }
});

// Resume cancelled subscription
router.post('/resume', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.userId;

    const subscription = await prisma.subscription.findUnique({
      where: { userId }
    });

    if (!subscription || !subscription.stripeSubscriptionId) {
      return res.status(404).json({ error: 'No subscription found' });
    }

    if (subscription.status !== 'CANCELLING') {
      return res.status(400).json({ error: 'Subscription is not set to cancel' });
    }

    // Resume in Stripe
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: false
    });

    // Update database
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'ACTIVE',
        canceledAt: null
      }
    });

    res.json({ message: 'Subscription resumed successfully' });
  } catch (error) {
    next(error);
  }
});

// Update payment method
router.post('/update-payment', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || !user.stripeCustomerId) {
      return res.status(404).json({ error: 'No customer found' });
    }

    // Create setup intent for updating payment method
    const setupIntent = await stripe.setupIntents.create({
      customer: user.stripeCustomerId,
      payment_method_types: ['card'],
      metadata: {
        userId
      }
    });

    res.json({ 
      clientSecret: setupIntent.client_secret 
    });
  } catch (error) {
    next(error);
  }
});

// Get usage statistics
router.get('/usage', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.userId;

    const subscription = await prisma.subscription.findUnique({
      where: { userId }
    });

    const plan = subscription?.plan || 'FREE';
    const planLimits = PLANS[plan as keyof typeof PLANS].limits;

    // Get current month usage
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const calculations = await prisma.calculation.count({
      where: {
        userId,
        createdAt: {
          gte: startOfMonth
        }
      }
    });

    const apiCalls = await prisma.analyticsEvent.count({
      where: {
        userId,
        eventName: 'api_call',
        timestamp: {
          gte: startOfMonth
        }
      }
    });

    res.json({
      plan,
      usage: {
        calculations,
        apiCalls
      },
      limits: planLimits,
      remaining: {
        calculations: planLimits.calculations === -1 ? 'unlimited' : 
                     Math.max(0, planLimits.calculations - calculations),
        apiCalls: planLimits.apiCalls === -1 ? 'unlimited' : 
                  Math.max(0, planLimits.apiCalls - apiCalls)
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get invoice history
router.get('/invoices', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || !user.stripeCustomerId) {
      return res.json({ invoices: [] });
    }

    const invoices = await stripe.invoices.list({
      customer: user.stripeCustomerId,
      limit: 10
    });

    const formattedInvoices = invoices.data.map(invoice => ({
      id: invoice.id,
      date: new Date(invoice.created * 1000).toISOString(),
      amount: invoice.amount_paid / 100,
      currency: invoice.currency,
      status: invoice.status,
      pdfUrl: invoice.invoice_pdf,
      hostedUrl: invoice.hosted_invoice_url
    }));

    res.json({ invoices: formattedInvoices });
  } catch (error) {
    next(error);
  }
});

export default router;