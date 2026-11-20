# FoodAI API — Core Backend Service

Standalone Express 5 backend with Socket.io WebSockets, Neon.tech PostgreSQL (Prisma), Upstash Redis, and BullMQ queues.

## Features
- **Prisma Multi-Tenant Schema**: Scoped by `restaurantId` on all models
- **Socket.io Gateway**: Real-time kitchen ticket broadcast with Redis pub/sub adapter
- **5 UK Delivery Providers**: Uber Direct, Stuart, Deliveroo Express, Gophr, Shipday
- **Stripe Connect Express UK**: Marketplace fee split and automated weekly payouts
- **Twilio WhatsApp & SMS**: Order confirmation, status updates, and payment links
- **OpenAI GPT-4o Chat Ordering**: Menu-aware chat assistant with prompt-injection sanitizer
- **Dynamic Pricing Engine**: Redis-cached commission tiers controlled by Super Admin only
- **OWASP Top 10 Security**: Helmet CSP, strict CORS, Redis-backed rate limiting, AES-256-GCM encryption

## Deploying

### Option 1: Koyeb (Recommended Free Tier)
1. Push this folder to a GitHub repository: `foodai-api`.
2. Connect to Koyeb: Create App -> GitHub.
3. Select Dockerfile deployment.
4. Set Environment Variables from `.env.example`.
5. Health check path: `/api/v1/health`.
6. Port: `3001`.

### Option 2: Railway / Render / Fly.io
Deploy directly via GitHub repository with standard Dockerfile.

### Option 3: Docker VPS
```bash
docker build -t foodai-api .
docker run -p 3001:3001 --env-file .env foodai-api
```

## Local Development
```bash
npm install
npx prisma db push
npx tsx prisma/seed.ts
npm run dev
# Health check: http://localhost:3001/api/v1/health
```
