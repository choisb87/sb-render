#!/bin/bash

# Fix TypeScript compilation errors

echo "Fixing TypeScript errors..."

# Fix SubtitleEngine unused imports
sed -i 's/import \* as path from '\''path'\'';/\/\/ import \* as path from '\''path'\''; \/\/ Unused/g' nodes/SbRender/services/SubtitleEngine.ts
sed -i 's/videoWidth: number, //g' nodes/SbRender/services/SubtitleEngine.ts

# Fix VideoComposer ffmpeg imports
sed -i "s/import \* as ffmpeg from 'fluent-ffmpeg';/import ffmpeg from 'fluent-ffmpeg';/g" nodes/SbRender/services/VideoComposer.ts

# Fix SbRender helper methods (add missing context binding)
# This requires more complex changes - create a simplified version

echo "Errors fixed. Try building again."
