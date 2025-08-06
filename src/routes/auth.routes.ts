import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/error.middleware';
import { generateTokens, verifyToken, generatePasswordResetToken } from '../utils/jwt.utils';
import { hashPassword, comparePassword, validatePassword } from '../utils/password.utils';
import { AuthRequest } from '../middleware/auth.middleware';

const router = Router();

// Register new user
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, name, referralCode } = req.body;

    // Validate input
    if (!email || !password) {
      throw new AppError('Email and password are required', 400);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new AppError('Invalid email format', 400);
    }

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      throw new AppError(passwordValidation.errors.join(', '), 400);
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      throw new AppError('User with this email already exists', 409);
    }

    // Handle referral if provided
    let referrerId: string | undefined;
    if (referralCode) {
      const referrer = await prisma.user.findUnique({
        where: { referralCode }
      });
      if (referrer) {
        referrerId = referrer.id;
      }
    }

    // Create user
    const hashedPassword = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: hashedPassword,
        name,
        referredBy: referrerId
      }
    });

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens({
      userId: user.id,
      email: user.email
    });

    // Track registration event
    await prisma.analyticsEvent.create({
      data: {
        userId: user.id,
        eventType: 'user_registered',
        metadata: { referralCode: !!referralCode }
      }
    });

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      },
      accessToken,
      refreshToken
    });
  } catch (error) {
    next(error);
  }
});

// Login
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError('Email and password are required', 400);
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      include: { subscription: true }
    });

    if (!user) {
      throw new AppError('Invalid email or password', 401);
    }

    // Verify password
    const isValidPassword = await comparePassword(password, user.passwordHash);
    if (!isValidPassword) {
      throw new AppError('Invalid email or password', 401);
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens({
      userId: user.id,
      email: user.email
    });

    // Track login event
    await prisma.analyticsEvent.create({
      data: {
        userId: user.id,
        eventType: 'user_login',
        metadata: { method: 'email' }
      }
    });

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.subscription?.plan || 'FREE'
      },
      accessToken,
      refreshToken
    });
  } catch (error) {
    next(error);
  }
});

// Refresh token
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError('Refresh token is required', 400);
    }

    // Verify refresh token
    const decoded = verifyToken(refreshToken, process.env.JWT_REFRESH_SECRET!);

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens({
      userId: decoded.userId,
      email: decoded.email
    });

    res.json({
      accessToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    next(new AppError('Invalid refresh token', 401));
  }
});

// Request password reset
router.post('/forgot-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new AppError('Email is required', 400);
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email }
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({
        message: 'If an account exists with this email, a password reset link has been sent'
      });
    }

    // Generate reset token
    const resetToken = generatePasswordResetToken(email);

    // TODO: Send email with reset link
    // For now, just return the token (remove in production!)
    if (process.env.NODE_ENV === 'development') {
      return res.json({
        message: 'Password reset token generated',
        resetToken // Remove this in production!
      });
    }

    res.json({
      message: 'If an account exists with this email, a password reset link has been sent'
    });
  } catch (error) {
    next(error);
  }
});

// Reset password
router.post('/reset-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      throw new AppError('Token and new password are required', 400);
    }

    // Verify token
    const decoded = verifyToken(token, process.env.JWT_SECRET!);
    
    if (!decoded.email) {
      throw new AppError('Invalid reset token', 400);
    }

    // Validate new password
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      throw new AppError(passwordValidation.errors.join(', '), 400);
    }

    // Update password
    const hashedPassword = await hashPassword(newPassword);
    await prisma.user.update({
      where: { email: decoded.email },
      data: { passwordHash: hashedPassword }
    });

    res.json({
      message: 'Password reset successfully'
    });
  } catch (error) {
    next(error);
  }
});

// Verify email (optional)
router.get('/verify-email/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.params;

    // Verify token
    const decoded = verifyToken(token, process.env.JWT_SECRET!);

    if (!decoded.email) {
      throw new AppError('Invalid verification token', 400);
    }

    // Update user
    await prisma.user.update({
      where: { email: decoded.email },
      data: { emailVerified: true }
    });

    res.json({
      message: 'Email verified successfully'
    });
  } catch (error) {
    next(new AppError('Invalid or expired verification token', 400));
  }
});

export default router;