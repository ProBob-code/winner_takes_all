#!/bin/bash
# patch-runtimes.sh
# Manually patches Vercel build output to force Edge runtime on stubborn routes

# Use provided argument or default to local .vercel/output/functions
FUNCTIONS_DIR="${1:-.vercel/output/functions}"

if [ ! -d "$FUNCTIONS_DIR" ]; then
  # Try one level up just in case
  FUNCTIONS_DIR="apps/web/.vercel/output/functions"
fi

if [ ! -d "$FUNCTIONS_DIR" ]; then
  echo "Error: Functions directory not found at $FUNCTIONS_DIR"
  exit 1
fi

echo "Patching runtimes in $FUNCTIONS_DIR..."

# Find all .vc-config.json files
find "$FUNCTIONS_DIR" -name ".vc-config.json" | while read -r config; do
  # Check if it contains nodejs
  if grep -iq "nodejs" "$config"; then
    echo "Patching $(dirname "$config") to edge..."
    # Replace nodejs runtime with edge
    sed -i 's/"runtime": "nodejs[^"]*"/"runtime": "edge"/g' "$config"
  fi
done

echo "Patching complete."
