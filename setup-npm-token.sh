#!/bin/bash

echo "🔐 NPM Token Setup for Headless Environment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "First, create an Access Token on npm:"
echo "1. Visit: https://www.npmjs.com/settings/YOUR_USERNAME/tokens"
echo "2. Click 'Generate New Token'"
echo "3. Select 'Automation' or 'Publish' type"
echo "4. Copy the generated token"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

read -p "Enter your npm access token: " NPM_TOKEN

if [ -z "$NPM_TOKEN" ]; then
    echo "❌ No token provided"
    exit 1
fi

# .npmrc 파일 생성
echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" > ~/.npmrc
chmod 600 ~/.npmrc

echo ""
echo "✅ Token configured in ~/.npmrc"
echo ""
echo "Testing authentication..."

if npm whoami > /dev/null 2>&1; then
    USERNAME=$(npm whoami)
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "✅ Successfully logged in as: $USERNAME"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "You can now publish packages:"
    echo "  cd /home/sb/sb-render"
    echo "  ./publish.sh"
    echo ""
else
    echo "❌ Authentication failed"
    echo "Please check your token and try again"
    rm ~/.npmrc
    exit 1
fi
