import { Router, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { AppError } from '../middleware/error.middleware';
import { hashPassword } from '../utils/password.utils';

const router = Router();

// Get current user profile
router.get('/profile', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: {
        subscription: true,
        _count: {
          select: { calculations: true }
        }
      }
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified,
      referralCode: user.referralCode,
      subscription: user.subscription,
      calculationsCount: user._count.calculations,
      createdAt: user.createdAt
    });
  } catch (error) {
    next(error);
  }
});

// Update user profile
router.put('/profile', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, avatarUrl } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        name,
        avatarUrl
      }
    });

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        avatarUrl: updatedUser.avatarUrl
      }
    });
  } catch (error) {
    next(error);
  }
});

// Change password
router.post('/change-password', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw new AppError('Current password and new password are required', 400);
    }

    // Get user with password hash
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id }
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Verify current password
    const bcrypt = require('bcryptjs');
    const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    
    if (!isValidPassword) {
      throw new AppError('Current password is incorrect', 401);
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { passwordHash: hashedPassword }
    });

    res.json({
      message: 'Password changed successfully'
    });
  } catch (error) {
    next(error);
  }
});

// Get user stats
router.get('/stats', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    // Get calculation stats
    const totalCalculations = await prisma.calculation.count({
      where: { userId }
    });

    const sharedCalculations = await prisma.calculation.count({
      where: { userId, isPublic: true }
    });

    // Get referral stats
    const referrals = await prisma.user.count({
      where: { referredBy: userId }
    });

    // Get recent activity
    const recentCalculations = await prisma.calculation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        name: true,
        createdAt: true
      }
    });

    res.json({
      totalCalculations,
      sharedCalculations,
      referrals,
      recentCalculations
    });
  } catch (error) {
    next(error);
  }
});

// Delete account
router.delete('/account', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { password } = req.body;

    if (!password) {
      throw new AppError('Password is required to delete account', 400);
    }

    // Get user with password hash
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id }
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Verify password
    const bcrypt = require('bcryptjs');
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    
    if (!isValidPassword) {
      throw new AppError('Incorrect password', 401);
    }

    // Delete user (cascades to related records)
    await prisma.user.delete({
      where: { id: req.user!.id }
    });

    res.json({
      message: 'Account deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

export default router;