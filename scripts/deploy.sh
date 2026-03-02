#!/bin/bash

# Deployment script for AWS EC2
# Usage: ./scripts/deploy.sh

set -e

echo "🚀 Starting deployment..."

# Pull latest code
echo "📥 Pulling latest code..."
git pull origin main

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --only=production

# Build TypeScript
echo "🔨 Building application..."
npm run build

# Restart PM2
echo "🔄 Restarting application..."
pm2 restart rideshare-backend || pm2 start dist/index.js --name rideshare-backend

# Save PM2 configuration
pm2 save

echo "✅ Deployment completed successfully!"
echo "📊 Application status:"
pm2 status
