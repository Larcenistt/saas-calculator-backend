# Backend Deployment Instructions

## Critical Fix Applied
✅ TypeScript configuration has been fixed to support Vercel deployment
- Updated `tsconfig.json` to include `/api` directory
- Build now completes successfully

## To Deploy the Backend to Vercel:

### Option 1: Using Vercel CLI (Recommended)
1. Open terminal in: `C:\Users\growl\.claude\saas-calculator-backend`
2. Run: `vercel login` and authenticate with GitHub
3. Run: `vercel --prod` to deploy to production
4. Copy the production URL (will be something like: https://saas-calculator-backend.vercel.app)

### Option 2: Using Vercel Dashboard
1. Go to https://vercel.com/new
2. Import the backend project (select the saas-calculator-backend folder)
3. Use these settings:
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`
4. Add these environment variables in Vercel:
   ```
   DATABASE_URL=your_postgres_connection_string
   JWT_SECRET=your_jwt_secret
   STRIPE_SECRET_KEY=your_stripe_secret_key
   STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
   NODE_ENV=production
   ```
5. Deploy

## After Backend Deployment:
1. Update frontend `.env` file with the new backend URL
2. Rebuild and redeploy the frontend
3. Test the complete flow

## Current Status:
- ✅ TypeScript configuration fixed
- ✅ Build succeeds locally
- ⏳ Awaiting Vercel deployment
- ⏳ Frontend needs backend URL update