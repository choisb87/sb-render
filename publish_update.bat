@echo off
echo [1/5] Staging changes...
git add .

echo [2/5] Committing fixes...
git commit -m "Fix: Improve BGM duration, fade-out logic, and syncToAudio behavior"

echo [3/5] Bumping patch version...
call npm version patch

echo [4/5] Pushing commits and tags...
git push
git push --tags

echo [5/5] Publishing to npm...
call npm publish

echo Done!
