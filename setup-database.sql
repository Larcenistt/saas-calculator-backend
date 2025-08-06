-- Create tables for SaaS Calculator
-- Run this in Supabase SQL Editor

-- Create User table
CREATE TABLE IF NOT EXISTS "User" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    email TEXT UNIQUE NOT NULL,
    "passwordHash" TEXT NOT NULL,
    name TEXT,
    "avatarUrl" TEXT,
    "emailVerified" BOOLEAN DEFAULT false,
    "stripeCustomerId" TEXT UNIQUE,
    "referralCode" TEXT UNIQUE DEFAULT gen_random_uuid()::text,
    "referredBy" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP WITH TIME ZONE
);

-- Create indexes for User
CREATE INDEX idx_user_email ON "User"(email);
CREATE INDEX idx_user_stripe ON "User"("stripeCustomerId");

-- Create Plan enum
CREATE TYPE "Plan" AS ENUM ('FREE', 'PRO', 'TEAM', 'ENTERPRISE');

-- Create Status enum
CREATE TYPE "Status" AS ENUM ('ACTIVE', 'CANCELED', 'CANCELLED', 'CANCELLING', 'PAST_DUE', 'UNPAID', 'TRIALING', 'INACTIVE');

-- Create Subscription table
CREATE TABLE IF NOT EXISTS "Subscription" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "userId" TEXT UNIQUE NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    "stripeSubscriptionId" TEXT UNIQUE NOT NULL,
    "stripePriceId" TEXT NOT NULL,
    plan "Plan" DEFAULT 'FREE',
    status "Status" DEFAULT 'ACTIVE',
    "currentPeriodStart" TIMESTAMP WITH TIME ZONE NOT NULL,
    "currentPeriodEnd" TIMESTAMP WITH TIME ZONE NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN DEFAULT false,
    "calculationsUsed" INTEGER DEFAULT 0,
    "calculationsLimit" INTEGER DEFAULT 3,
    "apiCallsUsed" INTEGER DEFAULT 0,
    "apiCallsLimit" INTEGER DEFAULT 0,
    "canceledAt" TIMESTAMP WITH TIME ZONE,
    "lastPaymentAt" TIMESTAMP WITH TIME ZONE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for Subscription
CREATE INDEX idx_subscription_stripe ON "Subscription"("stripeSubscriptionId");
CREATE INDEX idx_subscription_status ON "Subscription"(status);

-- Create Calculation table
CREATE TABLE IF NOT EXISTS "Calculation" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    name TEXT,
    inputs JSONB NOT NULL,
    results JSONB NOT NULL,
    notes TEXT,
    "shareId" TEXT UNIQUE DEFAULT gen_random_uuid()::text,
    "isPublic" BOOLEAN DEFAULT false,
    "sharedAt" TIMESTAMP WITH TIME ZONE,
    "viewCount" INTEGER DEFAULT 0,
    version INTEGER DEFAULT 1,
    "parentId" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for Calculation
CREATE INDEX idx_calculation_user ON "Calculation"("userId");
CREATE INDEX idx_calculation_share ON "Calculation"("shareId");
CREATE INDEX idx_calculation_created ON "Calculation"("createdAt");

-- Create SharedCalculations join table
CREATE TABLE IF NOT EXISTS "_SharedCalculations" (
    "A" TEXT NOT NULL REFERENCES "Calculation"(id) ON DELETE CASCADE,
    "B" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    UNIQUE("A", "B")
);

-- Create ApiKey table
CREATE TABLE IF NOT EXISTS "ApiKey" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key TEXT UNIQUE NOT NULL,
    "lastUsedAt" TIMESTAMP WITH TIME ZONE,
    "expiresAt" TIMESTAMP WITH TIME ZONE,
    scopes TEXT[] DEFAULT ARRAY['read:calculations', 'write:calculations'],
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for ApiKey
CREATE INDEX idx_apikey_key ON "ApiKey"(key);
CREATE INDEX idx_apikey_user ON "ApiKey"("userId");

-- Create AnalyticsEvent table
CREATE TABLE IF NOT EXISTS "AnalyticsEvent" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "userId" TEXT,
    "eventName" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventData" JSONB,
    metadata JSONB,
    variant TEXT,
    "sessionId" TEXT,
    ip TEXT,
    "userAgent" TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for AnalyticsEvent
CREATE INDEX idx_analytics_user ON "AnalyticsEvent"("userId");
CREATE INDEX idx_analytics_type ON "AnalyticsEvent"("eventType");
CREATE INDEX idx_analytics_created ON "AnalyticsEvent"("createdAt");

-- Create EmailCapture table
CREATE TABLE IF NOT EXISTS "EmailCapture" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    email TEXT UNIQUE NOT NULL,
    source TEXT NOT NULL,
    converted BOOLEAN DEFAULT false,
    "convertedAt" TIMESTAMP WITH TIME ZONE,
    "userId" TEXT,
    subscribed BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for EmailCapture
CREATE INDEX idx_emailcapture_email ON "EmailCapture"(email);
CREATE INDEX idx_emailcapture_source ON "EmailCapture"(source);

-- Enable Row Level Security (RLS)
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Calculation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiKey" ENABLE ROW LEVEL SECURITY;

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updatedAt
CREATE TRIGGER update_user_updated_at BEFORE UPDATE ON "User"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscription_updated_at BEFORE UPDATE ON "Subscription"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_calculation_updated_at BEFORE UPDATE ON "Calculation"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_apikey_updated_at BEFORE UPDATE ON "ApiKey"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions (adjust as needed)
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;

-- Success message
SELECT 'Database setup completed successfully!' as message;