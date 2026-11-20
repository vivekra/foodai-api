-- ====================================================================
-- FoodAI Platform — Supabase / PostgreSQL Complete DDL Script
-- Run this in the Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ====================================================================

-- 1. Enable Useful Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. Create Enums
DO $$ BEGIN
    CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_STAFF', 'CUSTOMER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'STARTER', 'PRO', 'ENTERPRISE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "StaffRole" AS ENUM ('OWNER', 'MANAGER', 'STAFF', 'KITCHEN');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "OrderType" AS ENUM ('QR_TABLE', 'COUNTER', 'DELIVERY', 'COLLECTION', 'VOICE', 'AI_CHAT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIAL_REFUND');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SEARCHING', 'DRIVER_ASSIGNED', 'PICKED_UP', 'DELIVERED', 'FAILED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "NotificationType" AS ENUM ('ORDER_PLACED', 'ORDER_ACCEPTED', 'ORDER_REJECTED', 'ORDER_READY', 'ORDER_OUT_FOR_DELIVERY', 'ORDER_DELIVERED', 'PAYMENT_RECEIVED', 'PAYMENT_LINK_SENT', 'NEW_REVIEW', 'LOW_STOCK', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. Users Table (better-auth compatible)
CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "email" TEXT UNIQUE NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "phone" TEXT,
    "whatsappPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users"("email");

-- 4. Sessions & Accounts (better-auth)
CREATE TABLE IF NOT EXISTS "sessions" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "token" TEXT UNIQUE NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "sessions_token_idx" ON "sessions"("token");
CREATE INDEX IF NOT EXISTS "sessions_userId_idx" ON "sessions"("userId");

CREATE TABLE IF NOT EXISTS "accounts" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "accounts_provider_account_unique" UNIQUE ("providerId", "accountId")
);

CREATE TABLE IF NOT EXISTS "verifications" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "verifications_identifier_idx" ON "verifications"("identifier");

-- 5. Restaurants Table
CREATE TABLE IF NOT EXISTS "restaurants" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "slug" TEXT UNIQUE NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "coverImageUrl" TEXT,
    "cuisineType" TEXT[] NOT NULL DEFAULT '{}',
    "phone" TEXT,
    "whatsappNumber" TEXT,
    "email" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "postcode" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'GB',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    
    "subscriptionPlan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
    "subscriptionEndsAt" TIMESTAMP(3),
    "stripeAccountId" TEXT,
    "stripeOnboarded" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    
    "openingHours" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "minimumOrderAmount" DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    "deliveryRadius" DOUBLE PRECISION,
    "avgPrepTimeMinutes" INTEGER NOT NULL DEFAULT 20,
    
    "aiVoiceAgentEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiVoiceAgentPhone" TEXT,
    "aiVoiceAgentPersona" TEXT,
    
    "qrMenuEnabled" BOOLEAN NOT NULL DEFAULT true,
    
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "restaurants_slug_idx" ON "restaurants"("slug");
CREATE INDEX IF NOT EXISTS "restaurants_city_active_idx" ON "restaurants"("city", "isActive");
CREATE INDEX IF NOT EXISTS "restaurants_postcode_idx" ON "restaurants"("postcode");

-- 6. Restaurant Users (Multi-tenant staff & owners)
CREATE TABLE IF NOT EXISTS "restaurant_users" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "restaurantId" TEXT NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
    "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "role" "StaffRole" NOT NULL DEFAULT 'STAFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "restaurant_users_unique" UNIQUE ("restaurantId", "userId")
);

-- 7. Restaurant Tables (QR Dine-in)
CREATE TABLE IF NOT EXISTS "restaurant_tables" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "restaurantId" TEXT NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
    "tableNumber" TEXT NOT NULL,
    "qrCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "restaurant_tables_unique" UNIQUE ("restaurantId", "tableNumber")
);

-- 8. Menu Categories & Items
CREATE TABLE IF NOT EXISTS "menu_categories" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "restaurantId" TEXT NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "menu_categories_res_active_idx" ON "menu_categories"("restaurantId", "isActive");

CREATE TABLE IF NOT EXISTS "menu_items" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "restaurantId" TEXT NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
    "categoryId" TEXT NOT NULL REFERENCES "menu_categories"("id"),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "basePrice" DECIMAL(10, 2) NOT NULL,
    "imageUrl" TEXT,
    "sizes" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "addons" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "calories" INTEGER,
    "ingredients" TEXT[] NOT NULL DEFAULT '{}',
    "dietary" TEXT[] NOT NULL DEFAULT '{}',
    "spiceLevel" INTEGER NOT NULL DEFAULT 0,
    "allergens" TEXT[] NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "menu_items_res_active_idx" ON "menu_items"("restaurantId", "isActive");
CREATE INDEX IF NOT EXISTS "menu_items_category_idx" ON "menu_items"("categoryId");

-- 9. Orders & Order Items
CREATE TABLE IF NOT EXISTS "orders" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "restaurantId" TEXT NOT NULL REFERENCES "restaurants"("id"),
    "userId" TEXT REFERENCES "users"("id"),
    "tableId" TEXT REFERENCES "restaurant_tables"("id"),
    "orderNumber" TEXT UNIQUE NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "orderType" "OrderType" NOT NULL DEFAULT 'COUNTER',
    
    "subtotal" DECIMAL(10, 2) NOT NULL,
    "deliveryFee" DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    "platformFee" DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    "voiceSurcharge" DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    "total" DECIMAL(10, 2) NOT NULL,
    
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentIntentId" TEXT,
    "paymentMethod" TEXT,
    "paymentLinkUrl" TEXT,
    
    "deliveryProvider" TEXT,
    "deliveryTrackingUrl" TEXT,
    "deliveryQuoteId" TEXT,
    "estimatedDeliveryAt" TIMESTAMP(3),
    "deliveryAddress" JSONB,
    
    "placedByAI" BOOLEAN NOT NULL DEFAULT false,
    "aiChannel" TEXT,
    
    "notifiedViaWhatsApp" BOOLEAN NOT NULL DEFAULT false,
    "notifiedViaSms" BOOLEAN NOT NULL DEFAULT false,
    
    "estimatedPrepTime" INTEGER,
    "acceptedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "specialInstructions" TEXT,
    
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "orders_res_status_idx" ON "orders"("restaurantId", "status");
CREATE INDEX IF NOT EXISTS "orders_res_created_idx" ON "orders"("restaurantId", "createdAt");
CREATE INDEX IF NOT EXISTS "orders_userId_idx" ON "orders"("userId");
CREATE INDEX IF NOT EXISTS "orders_orderNumber_idx" ON "orders"("orderNumber");

CREATE TABLE IF NOT EXISTS "order_items" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "orderId" TEXT NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
    "menuItemId" TEXT NOT NULL REFERENCES "menu_items"("id"),
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10, 2) NOT NULL,
    "total" DECIMAL(10, 2) NOT NULL,
    "selectedSize" JSONB,
    "selectedAddons" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "order_items_orderId_idx" ON "order_items"("orderId");

-- 10. AI Call Logs (Twilio + LiveKit + OpenAI)
CREATE TABLE IF NOT EXISTS "ai_call_logs" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "restaurantId" TEXT NOT NULL REFERENCES "restaurants"("id"),
    "orderId" TEXT UNIQUE REFERENCES "orders"("id"),
    "callSid" TEXT UNIQUE NOT NULL,
    "callerPhone" TEXT,
    "durationSec" INTEGER,
    "transcript" TEXT,
    "intentData" JSONB,
    "outcome" TEXT,
    "errorMessage" TEXT,
    "livekitRoomId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ai_call_logs_res_created_idx" ON "ai_call_logs"("restaurantId", "createdAt");

-- 11. Deliveries & Courier Configurations (Uber Direct, Deliveroo, Stuart, etc.)
CREATE TABLE IF NOT EXISTS "deliveries" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "orderId" TEXT NOT NULL REFERENCES "orders"("id"),
    "provider" TEXT NOT NULL,
    "providerJobId" TEXT,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "trackingUrl" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "driverLocation" JSONB,
    "quotedPrice" DECIMAL(10, 2),
    "actualPrice" DECIMAL(10, 2),
    "estimatedPickupAt" TIMESTAMP(3),
    "estimatedDropoffAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "webhookPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "deliveries_orderId_idx" ON "deliveries"("orderId");

CREATE TABLE IF NOT EXISTS "restaurant_delivery_configs" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "restaurantId" TEXT NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
    "provider" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mode" TEXT NOT NULL DEFAULT 'platform',
    "encryptedConfig" TEXT,
    "uberChildOrgId" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "res_delivery_unique" UNIQUE ("restaurantId", "provider")
);

-- 12. Dynamic Pricing Engine (Super Admin Only)
CREATE TABLE IF NOT EXISTS "platform_pricing_configs" (
    "id" TEXT PRIMARY KEY DEFAULT 'default',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "freeCommissionRate" DECIMAL(5, 2) NOT NULL DEFAULT 15.00,
    "starterCommissionRate" DECIMAL(5, 2) NOT NULL DEFAULT 8.00,
    "proCommissionRate" DECIMAL(5, 2) NOT NULL DEFAULT 5.00,
    "enterpriseCommissionRate" DECIMAL(5, 2) NOT NULL DEFAULT 2.00,
    "voiceSurchargeRate" DECIMAL(5, 2) NOT NULL DEFAULT 2.00,
    "starterMonthlyGbp" DECIMAL(10, 2) NOT NULL DEFAULT 29.00,
    "proMonthlyGbp" DECIMAL(10, 2) NOT NULL DEFAULT 79.00,
    "enterpriseMonthlyGbp" DECIMAL(10, 2) NOT NULL DEFAULT 199.00,
    "updatedBy" TEXT NOT NULL,
    "changeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "restaurant_pricing_overrides" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "restaurantId" TEXT UNIQUE NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
    "commissionRate" DECIMAL(5, 2) NOT NULL,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 13. Customer Reviews & Ratings
CREATE TABLE IF NOT EXISTS "reviews" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "restaurantId" TEXT NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
    "userId" TEXT NOT NULL REFERENCES "users"("id"),
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "images" TEXT[] NOT NULL DEFAULT '{}',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reviews_unique" UNIQUE ("restaurantId", "userId", "orderId")
);
CREATE INDEX IF NOT EXISTS "reviews_restaurantId_idx" ON "reviews"("restaurantId");

-- 14. Notifications & Audit Logs
CREATE TABLE IF NOT EXISTS "notifications" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "restaurantId" TEXT REFERENCES "restaurants"("id"),
    "userId" TEXT REFERENCES "users"("id"),
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "channel" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "notifications_user_read_idx" ON "notifications"("userId", "isRead");
CREATE INDEX IF NOT EXISTS "notifications_res_created_idx" ON "notifications"("restaurantId", "createdAt");

CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "audit_logs_actorId_idx" ON "audit_logs"("actorId");
CREATE INDEX IF NOT EXISTS "audit_logs_resource_idx" ON "audit_logs"("resource", "resourceId");
CREATE INDEX IF NOT EXISTS "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- 15. Initial Seed Data (Default Platform Commission Rates)
INSERT INTO "platform_pricing_configs" (
    "id",
    "version",
    "isActive",
    "freeCommissionRate",
    "starterCommissionRate",
    "proCommissionRate",
    "enterpriseCommissionRate",
    "voiceSurchargeRate",
    "starterMonthlyGbp",
    "proMonthlyGbp",
    "enterpriseMonthlyGbp",
    "updatedBy",
    "changeReason"
) VALUES (
    'default',
    1,
    true,
    15.00,
    8.00,
    5.00,
    2.00,
    2.00,
    29.00,
    79.00,
    199.00,
    'system_seed',
    'Initial default platform pricing rates'
) ON CONFLICT ("id") DO NOTHING;
