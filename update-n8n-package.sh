#!/bin/bash
# SB Render n8n package update script

VERSION=$1

if [ -z "$VERSION" ]; then
  echo "Usage: ./update-n8n-package.sh <version>"
  echo "Example: ./update-n8n-package.sh 1.0.24"
  exit 1
fi

echo "📦 Installing n8n-nodes-sb-render@${VERSION}..."
docker exec -u node n8n-n8n-1 sh -c "npm cache clean --force && npm install n8n-nodes-sb-render@${VERSION}"

echo "🔄 Restarting n8n main and worker..."
docker restart n8n-n8n-1 n8n-worker-1

echo "✅ Done! Wait 10-20 seconds for n8n to fully start."
