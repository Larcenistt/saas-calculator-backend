# SaaS Calculator Backend API

## Overview
Full-featured backend API for the SaaS Pricing Calculator, built with Node.js, Express, TypeScript, and PostgreSQL.

## Features
- JWT Authentication with refresh tokens
- User management and profiles
- Calculation CRUD operations
- Subscription management with Stripe
- Rate limiting and security
- Email capture and analytics
- Referral tracking system

## Tech Stack
- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT
- **Payments**: Stripe
- **Security**: Helmet, CORS, bcrypt

## Setup

### Prerequisites
- Node.js 18+
- PostgreSQL database
- Stripe account

### Installation
```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database and Stripe credentials

# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate

# Start development server
npm run dev
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create new account
- `POST /api/auth/login` - Login with email/password
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token

### User Management
- `GET /api/users/profile` - Get current user profile
- `PUT /api/users/profile` - Update profile
- `POST /api/users/change-password` - Change password
- `GET /api/users/stats` - Get user statistics
- `DELETE /api/users/account` - Delete account

### Calculations
- `GET /api/calculations` - List user's calculations
- `GET /api/calculations/:id` - Get specific calculation
- `POST /api/calculations` - Create new calculation
- `PUT /api/calculations/:id` - Update calculation
- `DELETE /api/calculations/:id` - Delete calculation
- `POST /api/calculations/:id/share` - Share calculation
- `GET /api/calculations/shared/:shareId` - Get shared calculation

### Billing
- `POST /api/billing/create-checkout` - Create Stripe checkout session
- `POST /api/billing/customer-portal` - Get customer portal link
- `GET /api/billing/subscription` - Get subscription status
- `POST /api/billing/webhook` - Stripe webhook handler

## Database Schema

### Users
- Authentication credentials
- Profile information
- Stripe customer ID
- Referral tracking

### Calculations
- Input parameters (JSON)
- Results (JSON)
- Sharing settings
- Version history

### Subscriptions
- Plan type (FREE, PRO, TEAM, ENTERPRISE)
- Usage limits
- Billing status

## Environment Variables
```env
# Server
PORT=3001
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/saas_calculator

# JWT
JWT_SECRET=your-secret
JWT_REFRESH_SECRET=your-refresh-secret

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Frontend
FRONTEND_URL=http://localhost:5173
```

## Deployment

### Railway/Render
1. Connect GitHub repository
2. Set environment variables
3. Deploy with one click

### Manual Deployment
```bash
# Build TypeScript
npm run build

# Start production server
npm start
```

## Security
- Helmet.js for security headers
- CORS protection
- Rate limiting
- Input validation
- SQL injection prevention via Prisma
- Password hashing with bcrypt

## Testing
```bash
# Run tests (to be implemented)
npm test
```

## License
MIT