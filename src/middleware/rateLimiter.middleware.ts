import { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

// Simple in-memory rate limiter (use Redis in production)
export const rateLimiter = (req: Request, res: Response, next: NextFunction) => {
  const identifier = req.ip || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 100; // 100 requests per minute

  if (!store[identifier] || store[identifier].resetTime < now) {
    store[identifier] = {
      count: 1,
      resetTime: now + windowMs
    };
    return next();
  }

  store[identifier].count++;

  if (store[identifier].count > maxRequests) {
    return res.status(429).json({
      error: 'Too many requests',
      message: 'Please try again later'
    });
  }

  next();
};

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  Object.keys(store).forEach(key => {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  });
}, 5 * 60 * 1000);