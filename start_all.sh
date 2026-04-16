#!/bin/bash

# Start Docker containers
echo "🚀 Starting Docker containers (may ask for password)..."
sudo docker-compose up -d

# Start Localtunnels (Killed first to be safe)
pkill cloudflared

echo "🌐 Starting Cloudflare Tunnels..."
# Start Tunnels and capture URLs
cloudflared tunnel --url http://localhost:3000 > app_tunnel.log 2>&1 &
cloudflared tunnel --url http://localhost:3001 > website_tunnel.log 2>&1 &
cloudflared tunnel --url http://localhost:8000 > api_tunnel.log 2>&1 &

echo "⏳ Waiting for Cloudflare URLs (this can take 10-15 seconds)..."
while ! grep -qa "https://.*\.trycloudflare\.com" app_tunnel.log || ! grep -qa "https://.*\.trycloudflare\.com" website_tunnel.log || ! grep -qa "https://.*\.trycloudflare\.com" api_tunnel.log; do 
    sleep 1
done

# Capture IDs for restart later
WEBSITE_CONTAINER=$(sudo docker-compose ps -q website)
WEB_CONTAINER=$(sudo docker-compose ps -q web)

# Extract and clean URLs (using -a to force text mode)
APP_URL=$(grep -oaE "https://[a-zA-Z0-9.-]+\.trycloudflare\.com" app_tunnel.log | head -n 1 | tr -d '[:space:]')
WEB_URL=$(grep -oaE "https://[a-zA-Z0-9.-]+\.trycloudflare\.com" website_tunnel.log | head -n 1 | tr -d '[:space:]')
API_URL=$(grep -oaE "https://[a-zA-Z0-9.-]+\.trycloudflare\.com" api_tunnel.log | head -n 1 | tr -d '[:space:]')

# Verify we got them
if [ -z "$APP_URL" ] || [ -z "$WEB_URL" ]; then
    echo "❌ Failed to capture Cloudflare URLs. Please try running ./start_all.sh again."
    exit 1
fi

# Update the Marketing site links automatically
echo "🔗 Updating website links to: $APP_URL"
# Precise replacement for login, signup, and tournaments to avoid accidental overrides
sed -i "s|href=\"https://[^\"']*/login\"|href=\"${APP_URL}/login\"|g" apps/website/index.html
sed -i "s|href=\"https://[^\"']*/signup\"|href=\"${APP_URL}/signup\"|g" apps/website/index.html
sed -i "s|href=\"https://[^\"']*/tournaments\"|href=\"${APP_URL}/tournaments\"|g" apps/website/index.html

# Update the Web app environment variables
echo "📝 Updating gaming app environment..."
cat << EOF > apps/web/.env.local
NEXT_PUBLIC_LANDING_URL=${WEB_URL}
WTA_API_URL=${API_URL}
EOF

# Restart containers to pick up file changes (volumes) and environment
echo "🔄 Restarting containers to apply changes..."
sudo docker restart $WEBSITE_CONTAINER $WEB_CONTAINER

echo "✨ Full system is starting up!"
echo "------------------------------------------------"
echo "Check your tunnels at:"
echo "Marketing (Landing): $WEB_URL"
echo "Gaming App:          $APP_URL"
echo "API Backend:         $API_URL"
echo "------------------------------------------------"
echo "URL mapping updated in apps/website/index.html and apps/web/.env.local"
echo "Note: Cloudflare tunnels do NOT require an IP bypass page."
