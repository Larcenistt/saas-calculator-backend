# GitHub Actions Deployment Setup

## Quick Setup (5 minutes)

### Step 1: Get Vercel Token
1. Go to: https://vercel.com/account/tokens
2. Click "Create Token"
3. Name it: "GitHub Actions Deploy"
4. Copy the token

### Step 2: Get Vercel IDs
1. Install Vercel CLI locally: `npm i -g vercel`
2. Run: `vercel login`
3. In the backend folder, run: `vercel link`
4. Choose/create project "saas-calculator-backend"
5. Find the IDs in `.vercel/project.json`:
   - `orgId` → VERCEL_ORG_ID
   - `projectId` → VERCEL_PROJECT_ID

### Step 3: Add GitHub Secrets
Go to: https://github.com/Larcenistt/saas-calculator-backend/settings/secrets/actions

Add these secrets:
- `VERCEL_TOKEN` → Your token from Step 1
- `VERCEL_ORG_ID` → Your org ID from Step 2
- `VERCEL_PROJECT_ID` → Your project ID from Step 2

### Step 4: Trigger Deployment
1. Push the workflow file:
   ```bash
   cd saas-calculator-backend
   git add .github/workflows/deploy.yml
   git commit -m "Add GitHub Actions deployment"
   git push
   ```

2. Or trigger manually:
   - Go to: https://github.com/Larcenistt/saas-calculator-backend/actions
   - Click "Deploy to Vercel"
   - Click "Run workflow"

### Step 5: Get Your Backend URL
After deployment, your backend will be live at:
- Production: `https://saas-calculator-backend.vercel.app`
- Or check Actions log for the exact URL

## Environment Variables Needed on Vercel

Add these in Vercel Dashboard → Project Settings → Environment Variables:

```
DATABASE_URL=your_postgres_connection_string
JWT_SECRET=your_jwt_secret_here
STRIPE_SECRET_KEY=sk_live_your_stripe_secret
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
NODE_ENV=production
```

## After Deployment

Run the batch file in the parent directory:
```bash
update-frontend-backend-url.bat
```

Enter your backend URL when prompted to automatically update and redeploy the frontend!