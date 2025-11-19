#!/usr/bin/env node

/**
 * Automatically set execute permissions on ffprobe binary after npm install
 * This is required for @ffprobe-installer package to work correctly
 */

const { chmodSync, existsSync, statSync } = require('fs');
const { resolve, join } = require('path');
const os = require('os');

// Detect current platform
const platform = os.platform();
const arch = os.arch();

console.log(`🔍 Platform detected: ${platform}-${arch}`);

// Platform-specific binary paths
const getPlatformPath = () => {
  const basePath = resolve(__dirname, '../node_modules/@ffprobe-installer');
  
  if (platform === 'win32') {
    return join(basePath, 'win32-x64/ffprobe.exe');
  } else if (platform === 'darwin') {
    if (arch === 'arm64') {
      return join(basePath, 'darwin-arm64/ffprobe');
    }
    return join(basePath, 'darwin-x64/ffprobe');
  } else if (platform === 'linux') {
    if (arch === 'arm64') {
      return join(basePath, 'linux-arm64/ffprobe');
    }
    return join(basePath, 'linux-x64/ffprobe');
  }
  
  return null;
};

// Try multiple possible paths where ffprobe might be installed
const possiblePaths = [
  // Platform-specific path (primary)
  getPlatformPath(),
  // Fallback paths for different installations
  resolve(__dirname, '../node_modules/@ffprobe-installer/linux-x64/ffprobe'),
  resolve(__dirname, '../node_modules/@ffprobe-installer/darwin-x64/ffprobe'),
  resolve(__dirname, '../node_modules/@ffprobe-installer/darwin-arm64/ffprobe'),
  resolve(__dirname, '../node_modules/@ffprobe-installer/win32-x64/ffprobe.exe'),
  // Nested dependency paths
  resolve(__dirname, '../node_modules/@ffprobe-installer/ffprobe/node_modules/@ffprobe-installer/linux-x64/ffprobe'),
].filter(Boolean); // Remove null values

let successCount = 0;
let errorCount = 0;

console.log('🔧 Fixing ffprobe permissions...');

for (const ffprobePath of possiblePaths) {
  if (existsSync(ffprobePath)) {
    try {
      const stats = statSync(ffprobePath);
      const currentMode = stats.mode;
      
      console.log(`   📁 Found: ${ffprobePath}`);
      console.log(`   📊 Current mode: ${(currentMode & parseInt('777', 8)).toString(8)}`);
      
      // Set execute permissions (755 = rwxr-xr-x)
      if (platform !== 'win32') {
        chmodSync(ffprobePath, 0o755);
        console.log(`   ✅ Set permissions to 755: ${ffprobePath}`);
      } else {
        console.log(`   ℹ️  Windows detected, permissions already OK: ${ffprobePath}`);
      }
      successCount++;
    } catch (error) {
      console.warn(`   ⚠️  Could not set permissions for ${ffprobePath}:`, error.message);
      
      // Check if it's a permission error we can diagnose
      if (error.code === 'EACCES') {
        console.warn('   💡 Suggestion: Try running as root/administrator or in Docker with proper permissions');
      } else if (error.code === 'ENOENT') {
        console.warn('   💡 Suggestion: File may have been moved or deleted during installation');
      }
      
      errorCount++;
    }
  } else {
    console.log(`   ❌ Not found: ${ffprobePath}`);
  }
}

// Summary and recommendations
console.log('\n📋 Summary:');
if (successCount === 0 && errorCount === 0) {
  console.warn('⚠️  No ffprobe binaries found. This is normal if @ffprobe-installer is not yet installed.');
  console.warn('\n💡 If you encounter "EACCES" or "ENOENT" errors when running SB Render:');
  console.warn('   1. Ensure @ffprobe-installer is installed: npm ls @ffprobe-installer');
  console.warn('   2. For Linux/Docker: chmod +x node_modules/@ffprobe-installer/*/ffprobe');
  console.warn('   3. For n8n Cloud: Consider using system ffprobe instead');
} else if (successCount > 0) {
  console.log(`✅ Successfully processed ${successCount} ffprobe binary(ies)`);
  
  if (process.env.NODE_ENV === 'production' || process.env.N8N_CONFIG_FILES) {
    console.log('\n🐳 Docker/n8n environment detected. Additional tips:');
    console.log('   - Ensure container has execute permissions on /tmp and node_modules');
    console.log('   - Consider adding ffmpeg/ffprobe to your Docker image');
    console.log('   - For n8n Cloud: System-level ffprobe may be required');
  }
} else {
  console.error('❌ Failed to set permissions on any ffprobe binaries');
  console.error('\n🔧 Manual fix options:');
  console.error('   1. chmod +x node_modules/@ffprobe-installer/*/ffprobe');
  console.error('   2. Install system ffmpeg: apt-get install ffmpeg (Linux)');
  console.error('   3. Use Docker with proper --privileged or volume mounts');
}
