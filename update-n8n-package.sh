#!/bin/bash

# 에러 발생 시 스크립트 중단
set -e

echo "🚀 Starting update and publish process..."

# 1. 버전 업데이트 (Patch)
echo "📦 Bumping version (patch)..."
npm version patch --no-git-tag-version

# 새 버전 가져오기
NEW_VERSION=$(node -p "require('./package.json').version")
echo "✨ New version: $NEW_VERSION"

# 2. Git 커밋 및 푸시
echo "💾 Committing and pushing to Git..."
git add .
git commit -m "chore: release version $NEW_VERSION"
git push

# 3. NPM 배포
echo "🚀 Publishing to NPM..."
# publish.sh가 있으면 활용, 없으면 직접 실행
if [ -f "./publish.sh" ]; then
    # publish.sh는 사용자 입력을 기다리므로, 입력을 자동으로 넘겨주거나 직접 명령어를 실행해야 함
    # 여기서는 직접 명령어를 실행하여 자동화
    npm run build
    npm run lint
    npm publish --access public
else
    npm publish --access public
fi

echo "✅ Successfully updated and published version $NEW_VERSION"
