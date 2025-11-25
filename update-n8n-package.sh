#!/bin/bash
# SB Render n8n package update and deployment script
# This script handles: git commit, npm version bump, npm publish, and n8n update

set -e  # Exit on error

COMMIT_MSG=${1:-"Update package"}
N8N_API_KEY=${N8N_API_KEY:-"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2OTdiNGNkNy1iN2Y4LTQyNGUtYTJlNS1lNDY1YjcxN2I2Y2MiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzU5MzcwNDU4fQ.v5oYCuhc955xmpozYVafaB1fcK4DFmDMH3ixiOnuovk"}

echo "🚀 SB Render Deployment Pipeline"
echo "================================"

# Step 1: Check for uncommitted changes
echo ""
echo "📋 Step 1: Checking git status..."
if ! git diff-index --quiet HEAD --; then
  echo "📝 Uncommitted changes detected. Committing..."
  git add .
  git commit -m "$(cat <<EOF
$COMMIT_MSG

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
  echo "✅ Changes committed"
else
  echo "✅ No uncommitted changes"
fi

# Step 2: Build the package
echo ""
echo "🔨 Step 2: Building package..."
npm run build
echo "✅ Build complete"

# Step 3: Bump version and publish to npm
echo ""
echo "📦 Step 3: Publishing to npm..."
npm version patch --no-git-tag-version
NEW_VERSION=$(node -p "require('./package.json').version")
echo "📌 New version: ${NEW_VERSION}"

# Commit version bump (add files that exist and are not ignored)
if [ -f package-lock.json ]; then
  git add package.json package-lock.json
else
  git add package.json
fi
git commit -m "chore: bump version to ${NEW_VERSION}

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>" || echo "⚠️  No changes to commit for version bump"

npm publish --access public
echo "✅ Published to npm: n8n-nodes-sb-render@${NEW_VERSION}"

# Step 4: Push to git
echo ""
echo "📤 Step 4: Pushing to git..."
git push origin main
echo "✅ Pushed to git"

# Step 5: Update n8n containers
echo ""
echo "🔄 Step 5: Updating n8n containers..."

# Install in main container (all locations)
echo "📦 Installing in n8n main container..."
docker exec -u node n8n-n8n-1 sh -c "npm cache clean --force && npm install n8n-nodes-sb-render@${NEW_VERSION}"
docker exec -u node n8n-n8n-1 sh -c "cd /home/node/.n8n && npm install n8n-nodes-sb-render@${NEW_VERSION}"
docker exec -u node n8n-n8n-1 sh -c "cd /home/node/.n8n/nodes && npm install n8n-nodes-sb-render@${NEW_VERSION}"

# Install in worker container (all locations)
echo "📦 Installing in n8n worker container..."
docker exec -u node n8n-worker-1 sh -c "npm cache clean --force && npm install n8n-nodes-sb-render@${NEW_VERSION}"
docker exec -u node n8n-worker-1 sh -c "cd /home/node/.n8n && npm install n8n-nodes-sb-render@${NEW_VERSION}"
docker exec -u node n8n-worker-1 sh -c "cd /home/node/.n8n/nodes && npm install n8n-nodes-sb-render@${NEW_VERSION}"

# Fix ffprobe permissions
echo "🔧 Setting ffprobe permissions..."
docker exec -u node n8n-n8n-1 sh -c "chmod +x /home/node/.n8n/nodes/node_modules/n8n-nodes-sb-render/node_modules/@ffprobe-installer/ffprobe/node_modules/@ffprobe-installer/linux-x64/ffprobe 2>/dev/null || true"
docker exec -u node n8n-worker-1 sh -c "chmod +x /home/node/.n8n/nodes/node_modules/n8n-nodes-sb-render/node_modules/@ffprobe-installer/ffprobe/node_modules/@ffprobe-installer/linux-x64/ffprobe 2>/dev/null || true"

# Step 6: Update database
echo ""
echo "💾 Step 6: Updating database..."
docker exec n8n-postgres-1 psql -U n8nuser -d n8ndb -c "UPDATE installed_packages SET \"installedVersion\" = '${NEW_VERSION}' WHERE \"packageName\" = 'n8n-nodes-sb-render';"
echo "✅ Database updated"

# Step 7: Restart n8n
echo ""
echo "🔄 Step 7: Restarting n8n..."
docker restart n8n-n8n-1 n8n-worker-1
echo "✅ Containers restarted"

echo ""
echo "🎉 Deployment Complete!"
echo "================================"
echo "📌 Version: ${NEW_VERSION}"
echo "📦 NPM: https://www.npmjs.com/package/n8n-nodes-sb-render"
echo "⏳ Wait 10-20 seconds for n8n to fully start"
echo ""
