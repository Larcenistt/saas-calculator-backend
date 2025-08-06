import Stripe from 'stripe';
import { Request, Response } from 'express';

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-07-30.basil',
});

export class StripeService {
  // Create a checkout session for subscription
  static async createCheckoutSession(req: Request, res: Response) {
    try {
      const { priceId, userId, email } = req.body;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/pricing`,
        customer_email: email,
        metadata: {
          userId: userId || '',
        },
      });

      res.json({ sessionId: session.id, url: session.url });
    } catch (error) {
      console.error('Stripe checkout session error:', error);
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  }

  // Create a payment intent for one-time payment
  static async createPaymentIntent(req: Request, res: Response) {
    try {
      const { amount, currency = 'usd' } = req.body;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100, // Convert to cents
        currency,
        automatic_payment_methods: {
          enabled: true,
        },
      });

      res.json({
        clientSecret: paymentIntent.client_secret,
      });
    } catch (error) {
      console.error('Stripe payment intent error:', error);
      res.status(500).json({ error: 'Failed to create payment intent' });
    }
  }

  // Handle webhook events
  static async handleWebhook(req: Request, res: Response) {
    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        webhookSecret
      );
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('Checkout session completed:', session.id);
        // TODO: Update user subscription status in database
        break;

      case 'customer.subscription.created':
        const subscription = event.data.object as Stripe.Subscription;
        console.log('Subscription created:', subscription.id);
        // TODO: Store subscription details in database
        break;

      case 'customer.subscription.updated':
        const updatedSubscription = event.data.object as Stripe.Subscription;
        console.log('Subscription updated:', updatedSubscription.id);
        // TODO: Update subscription details in database
        break;

      case 'customer.subscription.deleted':
        const deletedSubscription = event.data.object as Stripe.Subscription;
        console.log('Subscription cancelled:', deletedSubscription.id);
        // TODO: Update user status in database
        break;

      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log('Payment succeeded:', paymentIntent.id);
        // TODO: Update payment status in database
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  }

  // Get subscription status
  static async getSubscriptionStatus(req: Request, res: Response) {
    try {
      const { subscriptionId } = req.params;

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      res.json({
        status: subscription.status,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      });
    } catch (error) {
      console.error('Error fetching subscription:', error);
      res.status(500).json({ error: 'Failed to fetch subscription status' });
    }
  }

  // Cancel subscription
  static async cancelSubscription(req: Request, res: Response) {
    try {
      const { subscriptionId } = req.params;

      const subscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });

      res.json({
        message: 'Subscription will be cancelled at period end',
        cancelAt: subscription.cancel_at,
      });
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      res.status(500).json({ error: 'Failed to cancel subscription' });
    }
  }

  // Create customer portal session
  static async createPortalSession(req: Request, res: Response) {
    try {
      const { customerId } = req.body;

      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard`,
      });

      res.json({ url: session.url });
    } catch (error) {
      console.error('Error creating portal session:', error);
      res.status(500).json({ error: 'Failed to create portal session' });
    }
  }
}

export default StripeService;