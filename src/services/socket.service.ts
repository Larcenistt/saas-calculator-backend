import { Server as SocketServer, Socket } from 'socket.io';
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
}

class SocketService {
  private io: SocketServer | null = null;
  private userSockets: Map<string, string[]> = new Map(); // userId -> socketIds[]

  initialize(server: Server) {
    this.io = new SocketServer(server, {
      cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
        credentials: true
      }
    });

    // Authentication middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token;
        
        if (!token) {
          return next(new Error('Authentication error'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        socket.userId = decoded.userId;
        socket.userEmail = decoded.email;
        
        next();
      } catch (err) {
        next(new Error('Authentication error'));
      }
    });

    this.io.on('connection', (socket: AuthenticatedSocket) => {
      console.log(`User ${socket.userEmail} connected`);
      
      // Track user's socket connections
      if (socket.userId) {
        this.addUserSocket(socket.userId, socket.id);
        
        // Join user's personal room
        socket.join(`user:${socket.userId}`);
      }

      // Handle joining calculation rooms for collaboration
      socket.on('join:calculation', async (calculationId: string) => {
        // Verify user has access to this calculation
        const hasAccess = await this.verifyCalculationAccess(socket.userId!, calculationId);
        
        if (hasAccess) {
          socket.join(`calculation:${calculationId}`);
          
          // Notify others in the room
          socket.to(`calculation:${calculationId}`).emit('user:joined', {
            userId: socket.userId,
            email: socket.userEmail,
            calculationId
          });
        }
      });

      // Handle leaving calculation rooms
      socket.on('leave:calculation', (calculationId: string) => {
        socket.leave(`calculation:${calculationId}`);
        
        // Notify others in the room
        socket.to(`calculation:${calculationId}`).emit('user:left', {
          userId: socket.userId,
          email: socket.userEmail,
          calculationId
        });
      });

      // Handle real-time calculation updates
      socket.on('calculation:update', async (data: {
        calculationId: string;
        inputs: any;
        results: any;
      }) => {
        // Broadcast to all users in the calculation room
        socket.to(`calculation:${data.calculationId}`).emit('calculation:updated', {
          ...data,
          updatedBy: socket.userEmail,
          timestamp: new Date()
        });
      });

      // Handle cursor position for collaborative editing
      socket.on('cursor:move', (data: {
        calculationId: string;
        field: string;
        position: number;
      }) => {
        socket.to(`calculation:${data.calculationId}`).emit('cursor:moved', {
          ...data,
          userId: socket.userId,
          email: socket.userEmail
        });
      });

      // Handle typing indicators
      socket.on('typing:start', (calculationId: string) => {
        socket.to(`calculation:${calculationId}`).emit('user:typing', {
          userId: socket.userId,
          email: socket.userEmail,
          isTyping: true
        });
      });

      socket.on('typing:stop', (calculationId: string) => {
        socket.to(`calculation:${calculationId}`).emit('user:typing', {
          userId: socket.userId,
          email: socket.userEmail,
          isTyping: false
        });
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        console.log(`User ${socket.userEmail} disconnected`);
        
        if (socket.userId) {
          this.removeUserSocket(socket.userId, socket.id);
        }
      });
    });
  }

  private addUserSocket(userId: string, socketId: string) {
    const sockets = this.userSockets.get(userId) || [];
    sockets.push(socketId);
    this.userSockets.set(userId, sockets);
  }

  private removeUserSocket(userId: string, socketId: string) {
    const sockets = this.userSockets.get(userId) || [];
    const filtered = sockets.filter(id => id !== socketId);
    
    if (filtered.length > 0) {
      this.userSockets.set(userId, filtered);
    } else {
      this.userSockets.delete(userId);
    }
  }

  private async verifyCalculationAccess(userId: string, calculationId: string): Promise<boolean> {
    try {
      const calculation = await prisma.calculation.findFirst({
        where: {
          id: calculationId,
          OR: [
            { userId }, // Owner
            { sharedWith: { some: { id: userId } } } // Shared with user
          ]
        }
      });
      
      return !!calculation;
    } catch (error) {
      console.error('Error verifying calculation access:', error);
      return false;
    }
  }

  // Send notification to specific user
  sendToUser(userId: string, event: string, data: any) {
    if (this.io) {
      this.io.to(`user:${userId}`).emit(event, data);
    }
  }

  // Send notification to calculation room
  sendToCalculation(calculationId: string, event: string, data: any) {
    if (this.io) {
      this.io.to(`calculation:${calculationId}`).emit(event, data);
    }
  }

  // Broadcast to all connected users
  broadcast(event: string, data: any) {
    if (this.io) {
      this.io.emit(event, data);
    }
  }

  // Send live activity feed updates
  sendActivityUpdate(activity: {
    type: 'calculation' | 'subscription' | 'user';
    action: string;
    userId: string;
    details: any;
  }) {
    this.broadcast('activity:update', activity);
  }

  // Send pricing calculation metrics (for live dashboard)
  sendMetricsUpdate(metrics: {
    totalCalculations: number;
    activeUsers: number;
    averagePrice: number;
  }) {
    this.broadcast('metrics:update', metrics);
  }
}

export default new SocketService();