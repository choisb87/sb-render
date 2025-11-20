#!/usr/bin/env node

/**
 * Post-install script for n8n-nodes-sb-render
 *
 * This script:
 * 1. Tries to install system ffmpeg/ffprobe (Docker/Linux only)
 * 2. Sets execute permissions on npm-installed binaries
 * 3. Provides helpful guidance for manual setup
 */

const { chmodSync, existsSync, statSync } = require('fs');
const { execSync } = require('child_process');
const { resolve, join } = require('path');
const os = require('os');

// Detect current platform
const platform = os.platform();
const arch = os.arch();
const isDocker = existsSync('/.dockerenv') || existsSync('/run/.containerenv');

console.log(`🔍 Platform detected: ${platform}-${arch}`);
if (isDocker) {
  console.log('🐳 Docker/Container environment detected');
}

/**
 * Try to install system ffmpeg (Docker/Linux only)
 * Returns true if successful or already installed
 */
function tryInstallSystemFFmpeg() {
  if (platform !== 'linux' || process.getuid?.() !== 0) {
    return false; // Only try on Linux as root
  }

  try {
    // Check if already installed
    execSync('which ffmpeg', { stdio: 'ignore' });
    console.log('✅ System ffmpeg already installed');
    return true;
  } catch {
    // Not installed, try to install
    console.log('📦 Attempting to install system ffmpeg...');

    try {
      // Detect package manager and install
      if (existsSync('/usr/bin/apk')) {
        // Alpine (n8n official Docker image)
        execSync('apk add --no-cache ffmpeg', { stdio: 'inherit' });
        console.log('✅ Installed ffmpeg via apk (Alpine)');
        return true;
      } else if (existsSync('/usr/bin/apt-get')) {
        // Debian/Ubuntu
        execSync('apt-get update && apt-get install -y ffmpeg', { stdio: 'inherit' });
        console.log('✅ Installed ffmpeg via apt-get (Debian/Ubuntu)');
        return true;
      } else if (existsSync('/usr/bin/yum')) {
        // RedHat/CentOS
        execSync('yum install -y ffmpeg', { stdio: 'inherit' });
        console.log('✅ Installed ffmpeg via yum (RedHat/CentOS)');
        return true;
      }
    } catch (installError) {
      console.warn('⚠️  Could not auto-install ffmpeg:', installError.message);
      return false;
    }
  }

  return false;
}

// Try to install system ffmpeg in Docker environments
if (isDocker && platform === 'linux') {
  console.log('\n🚀 Auto-install attempt (Docker environment)...');
  const installed = tryInstallSystemFFmpeg();

  if (installed) {
    console.log('✨ System ffmpeg is ready! No additional setup needed.');
    console.log('   sb-render will automatically use system binaries.\n');
  } else {
    console.log('ℹ️  Auto-install not available (requires root or manual setup)');
    console.log('   Falling back to npm packages with permission fix...\n');
  }
}

console.log(`🔧 Setting up npm ffmpeg/ffprobe binaries...`);

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
console.log('\n📋 Post-install Summary:');

// Check if system ffmpeg is available
let hasSystemFFmpeg = false;
try {
  execSync('which ffmpeg', { stdio: 'ignore' });
  hasSystemFFmpeg = true;
} catch {
  hasSystemFFmpeg = false;
}

if (hasSystemFFmpeg) {
  console.log('🎉 Setup Complete - Ready to use!');
  console.log('   ✅ System ffmpeg/ffprobe detected');
  console.log('   ✅ sb-render will use system binaries (best option)');
  console.log('   ✅ No additional configuration needed\n');
} else if (successCount > 0) {
  console.log('✅ Setup Complete - npm binaries ready');
  console.log(`   ✅ Fixed permissions on ${successCount} binary(ies)`);
  console.log('   ⚠️  Using npm binaries (fallback option)');
  console.log('\n💡 For better performance in Docker/n8n:');
  console.log('   Install system ffmpeg: docker exec <container> apk add ffmpeg');
  console.log('   OR: docker exec <container> apt-get install -y ffmpeg\n');
} else if (successCount === 0 && errorCount === 0) {
  console.warn('⚠️  No ffmpeg binaries found');
  console.warn('   This is normal if optional dependencies failed to install.');
  console.warn('\n📦 Recommended setup for your environment:');

  if (isDocker || platform === 'linux') {
    console.warn('   1. Install system ffmpeg (recommended):');
    console.warn('      • Alpine: apk add ffmpeg');
    console.warn('      • Debian/Ubuntu: apt-get install -y ffmpeg');
    console.warn('      • RedHat/CentOS: yum install -y ffmpeg');
  } else {
    console.warn('   1. Install system ffmpeg:');
    console.warn('      • macOS: brew install ffmpeg');
    console.warn('      • Windows: choco install ffmpeg');
  }
  console.warn('   2. OR reinstall with: npm install --include=optional\n');
} else {
  console.error('❌ Permission fix failed');
  console.error('\n🔧 Manual setup required:');
  console.error('   Option 1 (Recommended): Install system ffmpeg');
  console.error('   Option 2: chmod +x node_modules/@ffprobe-installer/*/ffprobe');
  console.error('   Option 3: Use Docker with proper permissions\n');
}

console.log('📚 Documentation: https://github.com/choisb87/sb-render#prerequisites');
