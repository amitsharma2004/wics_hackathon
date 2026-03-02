#!/usr/bin/env node

/**
 * Generate random secrets for production deployment
 * 
 * Usage: node scripts/generate-secrets.js
 */

import crypto from 'crypto';

function generateSecret(length = 64) {
  return crypto.randomBytes(length).toString('base64');
}

console.log('='.repeat(80));
console.log('PRODUCTION SECRETS - COPY THESE TO RENDER ENVIRONMENT VARIABLES');
console.log('='.repeat(80));
console.log('');

console.log('JWT_SECRET=');
console.log(generateSecret());
console.log('');

console.log('JWT_REFRESH_SECRET=');
console.log(generateSecret());
console.log('');

console.log('SESSION_SECRET=');
console.log(generateSecret());
console.log('');

console.log('='.repeat(80));
console.log('IMPORTANT: Store these secrets securely and never commit them to Git!');
console.log('='.repeat(80));
