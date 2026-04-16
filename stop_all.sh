#!/bin/bash

# Stop Docker containers
echo "🛑 Stopping Docker containers (may ask for password)..."
sudo docker-compose down

# Kill all Cloudflare Tunnel processes
echo "🔌 Stopping Cloudflare Tunnels..."
pkill -f cloudflared

echo "✅ Full system stopped."
