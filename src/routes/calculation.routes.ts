import { Router, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { authenticate, optionalAuth, AuthRequest, requirePlan } from '../middleware/auth.middleware';
import { AppError } from '../middleware/error.middleware';

const router = Router();

// Get all calculations for authenticated user
router.get('/', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 10, search, sortBy = 'createdAt', order = 'desc' } = req.query;
    
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = { userId: req.user!.id };
    
    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { notes: { contains: String(search), mode: 'insensitive' } }
      ];
    }

    const [calculations, total] = await Promise.all([
      prisma.calculation.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { [String(sortBy)]: order },
        select: {
          id: true,
          name: true,
          inputs: true,
          results: true,
          notes: true,
          shareId: true,
          isPublic: true,
          viewCount: true,
          createdAt: true,
          updatedAt: true
        }
      }),
      prisma.calculation.count({ where })
    ]);

    res.json({
      calculations,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get single calculation
router.get('/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const calculation = await prisma.calculation.findFirst({
      where: {
        id,
        userId: req.user!.id
      }
    });

    if (!calculation) {
      throw new AppError('Calculation not found', 404);
    }

    res.json(calculation);
  } catch (error) {
    next(error);
  }
});

// Create new calculation
router.post('/', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, inputs, results, notes } = req.body;

    if (!inputs || !results) {
      throw new AppError('Inputs and results are required', 400);
    }

    // Check usage limits for free users
    if (req.user!.plan === 'FREE') {
      const subscription = await prisma.subscription.findUnique({
        where: { userId: req.user!.id }
      });

      if (subscription) {
        const currentMonth = new Date().getMonth();
        const periodStart = new Date(subscription.currentPeriodStart).getMonth();
        
        // Reset usage if new month
        if (currentMonth !== periodStart) {
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: {
              calculationsUsed: 0,
              currentPeriodStart: new Date()
            }
          });
        } else if (subscription.calculationsUsed >= subscription.calculationsLimit) {
          throw new AppError('Monthly calculation limit reached. Please upgrade your plan', 403);
        }

        // Increment usage
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { calculationsUsed: { increment: 1 } }
        });
      }
    }

    const calculation = await prisma.calculation.create({
      data: {
        userId: req.user!.id,
        name,
        inputs,
        results,
        notes
      }
    });

    // Track event
    await prisma.analyticsEvent.create({
      data: {
        userId: req.user!.id,
        eventType: 'calculation_created',
        metadata: { calculationId: calculation.id }
      }
    });

    res.status(201).json(calculation);
  } catch (error) {
    next(error);
  }
});

// Update calculation
router.put('/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { name, inputs, results, notes } = req.body;

    // Verify ownership
    const existing = await prisma.calculation.findFirst({
      where: {
        id,
        userId: req.user!.id
      }
    });

    if (!existing) {
      throw new AppError('Calculation not found', 404);
    }

    const updated = await prisma.calculation.update({
      where: { id },
      data: {
        name,
        inputs,
        results,
        notes,
        version: { increment: 1 }
      }
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// Delete calculation
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const calculation = await prisma.calculation.findFirst({
      where: {
        id,
        userId: req.user!.id
      }
    });

    if (!calculation) {
      throw new AppError('Calculation not found', 404);
    }

    await prisma.calculation.delete({
      where: { id }
    });

    res.json({ message: 'Calculation deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Share calculation
router.post('/:id/share', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { isPublic = true } = req.body;

    // Verify ownership
    const calculation = await prisma.calculation.findFirst({
      where: {
        id,
        userId: req.user!.id
      }
    });

    if (!calculation) {
      throw new AppError('Calculation not found', 404);
    }

    const updated = await prisma.calculation.update({
      where: { id },
      data: {
        isPublic,
        sharedAt: new Date()
      }
    });

    const shareUrl = `${process.env.FRONTEND_URL}/shared/${updated.shareId}`;

    res.json({
      shareId: updated.shareId,
      shareUrl,
      isPublic: updated.isPublic
    });
  } catch (error) {
    next(error);
  }
});

// Get shared calculation (public)
router.get('/shared/:shareId', optionalAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { shareId } = req.params;

    const calculation = await prisma.calculation.findUnique({
      where: { shareId },
      include: {
        user: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    if (!calculation) {
      throw new AppError('Shared calculation not found', 404);
    }

    if (!calculation.isPublic && calculation.userId !== req.user?.id) {
      throw new AppError('This calculation is private', 403);
    }

    // Increment view count
    await prisma.calculation.update({
      where: { shareId },
      data: { viewCount: { increment: 1 } }
    });

    res.json({
      id: calculation.id,
      name: calculation.name,
      inputs: calculation.inputs,
      results: calculation.results,
      notes: calculation.notes,
      createdAt: calculation.createdAt,
      author: calculation.user.name || 'Anonymous',
      viewCount: calculation.viewCount
    });
  } catch (error) {
    next(error);
  }
});

// Clone shared calculation
router.post('/shared/:shareId/clone', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { shareId } = req.params;

    const original = await prisma.calculation.findUnique({
      where: { shareId }
    });

    if (!original || !original.isPublic) {
      throw new AppError('Shared calculation not found', 404);
    }

    const cloned = await prisma.calculation.create({
      data: {
        userId: req.user!.id,
        name: `Copy of ${original.name || 'Untitled'}`,
        inputs: original.inputs,
        results: original.results,
        notes: original.notes,
        parentId: original.id
      }
    });

    res.status(201).json(cloned);
  } catch (error) {
    next(error);
  }
});

export default router;