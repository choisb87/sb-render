#!/usr/bin/env node

/**
 * Automatically set execute permissions on ffprobe binary after npm install
 * This is required for @ffprobe-installer package to work correctly
 */

const { chmodSync, existsSync } = require('fs');
const { resolve, join } = require('path');

// Try multiple possible paths where ffprobe might be installed
const possiblePaths = [
  // Direct dependency path
  resolve(__dirname, '../node_modules/@ffprobe-installer/linux-x64/ffprobe'),
  // Nested dependency path (when installed as part of another package)
  resolve(__dirname, '../node_modules/@ffprobe-installer/ffprobe/node_modules/@ffprobe-installer/linux-x64/ffprobe'),
  // Platform-agnostic approach - check all platform binaries
  resolve(__dirname, '../node_modules/@ffprobe-installer/darwin-x64/ffprobe'),
  resolve(__dirname, '../node_modules/@ffprobe-installer/darwin-arm64/ffprobe'),
  resolve(__dirname, '../node_modules/@ffprobe-installer/win32-x64/ffprobe.exe'),
];

let successCount = 0;
let errorCount = 0;

console.log('🔧 Fixing ffprobe permissions...');

for (const ffprobePath of possiblePaths) {
  if (existsSync(ffprobePath)) {
    try {
      // Set execute permissions (755 = rwxr-xr-x)
      chmodSync(ffprobePath, 0o755);
      console.log(`   ✅ Set permissions: ${ffprobePath}`);
      successCount++;
    } catch (error) {
      console.warn(`   ⚠️  Could not set permissions for ${ffprobePath}:`, error.message);
      errorCount++;
    }
  }
}

if (successCount === 0 && errorCount === 0) {
  console.warn('⚠️  No ffprobe binaries found. This is normal if @ffprobe-installer is not yet installed.');
  console.warn('   If you encounter "EACCES" errors when running SB Render, try:');
  console.warn('   chmod +x node_modules/@ffprobe-installer/linux-x64/ffprobe');
} else if (successCount > 0) {
  console.log(`✅ Successfully set permissions on ${successCount} ffprobe binary(ies)`);
} else {
  console.error('❌ Failed to set permissions on any ffprobe binaries');
  console.error('   You may need to manually run:');
  console.error('   chmod +x node_modules/@ffprobe-installer/linux-x64/ffprobe');
}
