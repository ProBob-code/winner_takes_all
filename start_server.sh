#!/bin/bash
# WTA Local Development Server Startup Script

echo "🏆 Starting Winner Takes All Control Room..."
echo "🧹 Cleaning active port allocations (5050/tcp, 3000/tcp)..."
fuser -k 5050/tcp || true
fuser -k 3000/tcp || true

echo "🚀 Booting development servers..."
pnpm dev
