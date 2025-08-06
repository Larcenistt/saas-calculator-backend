import { Router, Request, Response, NextFunction } from 'express';
import Stripe from 'stripe';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { AppError } from '../middleware/error.middleware';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia' as any
});

const router = Router();

// Create checkout session
router.post('/create-checkout', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { priceId, successUrl, cancelUrl } = req.body;

    if (!priceId) {
      throw new AppError('Price ID is required', 400);
    }

    // Get or create Stripe customer
    let stripeCustomerId = await getOrCreateStripeCustomer(req.user!.id, req.user!.email);

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1
      }],
      mode: 'subscription',
      success_url: successUrl || `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.FRONTEND_URL}/pricing`,
      metadata: {
        userId: req.user!.id
      }
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    next(error);
  }
});

// Create customer portal session
router.post('/customer-portal', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id }
    });

    if (!user?.stripeCustomerId) {
      throw new AppError('No billing account found', 404);
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL}/dashboard`
    });

    res.json({ url: session.url });
  } catch (error) {
    next(error);
  }
});

// Stripe webhook handler
router.post('/webhook', express.raw({ type: 'application/json' }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      throw new AppError('Webhook signature verification failed', 400);
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionCanceled(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    next(error);
  }
});

// Get subscription status
router.get('/subscription', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { userId: req.user!.id }
    });

    if (!subscription) {
      return res.json({
        plan: 'FREE',
        status: 'ACTIVE',
        limits: {
          calculations: { used: 0, limit: 3 },
          apiCalls: { used: 0, limit: 0 }
        }
      });
    }

    res.json({
      plan: subscription.plan,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      limits: {
        calculations: {
          used: subscription.calculationsUsed,
          limit: subscription.calculationsLimit
        },
        apiCalls: {
          used: subscription.apiCallsUsed,
          limit: subscription.apiCallsLimit
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Helper functions
async function getOrCreateStripeCustomer(userId: string, email: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (user?.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const customer = await stripe.customers.create({
    email,
    metadata: { userId }
  });

  await prisma.user.update({
    where: { id: userId },
    data: { stripeCustomerId: customer.id }
  });

  return customer.id;
}

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  if (!userId) return;

  const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
  
  await createOrUpdateSubscription(userId, subscription);
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const customer = await stripe.customers.retrieve(subscription.customer as string);
  const userId = (customer as any).metadata?.userId;
  
  if (!userId) return;

  await createOrUpdateSubscription(userId, subscription);
}

async function handleSubscriptionCanceled(subscription: Stripe.Subscription) {
  await prisma.subscription.update({
    where: { stripeSubscriptionId: subscription.id },
    data: { status: 'CANCELED' }
  });
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  if (!invoice.subscription) return;

  await prisma.subscription.update({
    where: { stripeSubscriptionId: invoice.subscription as string },
    data: { status: 'PAST_DUE' }
  });
}

async function createOrUpdateSubscription(userId: string, subscription: Stripe.Subscription) {
  const planMapping: { [key: string]: any } = {
    [process.env.STRIPE_PRICE_ID_PRO!]: { plan: 'PRO', calculationsLimit: 999999, apiCallsLimit: 1000 },
    [process.env.STRIPE_PRICE_ID_TEAM!]: { plan: 'TEAM', calculationsLimit: 999999, apiCallsLimit: 5000 },
    [process.env.STRIPE_PRICE_ID_ENTERPRISE!]: { plan: 'ENTERPRISE', calculationsLimit: 999999, apiCallsLimit: 999999 }
  };

  const priceId = subscription.items.data[0]?.price.id;
  const planConfig = planMapping[priceId] || { plan: 'PRO', calculationsLimit: 999999, apiCallsLimit: 1000 };

  await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      plan: planConfig.plan,
      status: subscription.status.toUpperCase() as any,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      calculationsLimit: planConfig.calculationsLimit,
      apiCallsLimit: planConfig.apiCallsLimit
    },
    update: {
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      plan: planConfig.plan,
      status: subscription.status.toUpperCase() as any,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      calculationsLimit: planConfig.calculationsLimit,
      apiCallsLimit: planConfig.apiCallsLimit
    }
  });
}

// Fix for express.raw middleware
import express from 'express';

export default router;