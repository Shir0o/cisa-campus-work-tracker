# Multi-stage Dockerfile for CISA Campus Work Tracker (React + Express Full-Stack App)
# Optimized for Google Cloud Run (Serverless Container Platform)

# ==========================================
# Phase 1: Heavyweight Build Environment
# ==========================================
FROM node:20-alpine AS builder
WORKDIR /app

# Install standard dependencies
COPY package*.json ./
RUN npm ci

# Copy full source and compile assets
COPY . .
RUN npm run build

# ==========================================
# Phase 2: Lightweight Production Runner
# ==========================================
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install light-weight runtime production dependencies (Express, Firebase Admin, Gemini SDK, etc.)
COPY package*.json ./
RUN npm ci --only=production

# Copy built React frontend assets and the bundled Express CommonJS server
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/firebase-applet-config.json* ./

# Standardize Cloud Run port binding
EXPOSE 3000
ENV PORT=3000

# Execute server bundle
CMD ["npm", "start"]
