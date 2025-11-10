#!/bin/bash

echo "🚀 Publishing n8n-nodes-sb-render to npm..."
echo ""

# 로그인 확인
if ! npm whoami > /dev/null 2>&1; then
    echo "❌ Not logged in to npm"
    echo "Please run: npm login"
    echo ""
    exit 1
fi

echo "✅ Logged in as: $(npm whoami)"
echo ""

# 빌드
echo "📦 Building..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi
echo "✅ Build successful"
echo ""

# 린트
echo "🔍 Linting..."
npm run lint
if [ $? -ne 0 ]; then
    echo "❌ Lint failed"
    exit 1
fi
echo "✅ Lint passed"
echo ""

# Dry run
echo "🧪 Dry run (checking what will be published)..."
npm pack --dry-run
echo ""

# 퍼블리시 확인
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Package: n8n-nodes-sb-render"
echo "📌 Version: $(node -p "require('./package.json').version")"
echo "👤 Publisher: $(npm whoami)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

read -p "Ready to publish? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
    echo "🚀 Publishing..."
    npm publish --access public

    if [ $? -eq 0 ]; then
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "✅ Published successfully!"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo "📦 Package: https://www.npmjs.com/package/n8n-nodes-sb-render"
        echo "📖 Docs: https://github.com/choisb87/sb-render"
        echo ""
        echo "Installation:"
        echo "  npm install n8n-nodes-sb-render"
        echo ""
        echo "Or in n8n UI:"
        echo "  Settings → Community Nodes → Install → n8n-nodes-sb-render"
        echo ""
    else
        echo "❌ Publish failed"
        exit 1
    fi
else
    echo "Cancelled."
fi
