const { VideoComposer } = require('./dist/nodes/SbRender/services/VideoComposer');
const { FileManager } = require('./dist/nodes/SbRender/services/FileManager');
const fs = require('fs').promises;
const path = require('path');

async function testHalfFrameRate() {
  console.log('🎬 Testing Half Frame Rate Feature...\n');

  const fileManager = new FileManager();
  const videoComposer = new VideoComposer();

  // Use first video from test-data.json
  const testData = require('./test-data.json');
  const videoUrl = testData[0].video_url;

  console.log(`📹 Test video: ${videoUrl.split('/').pop()}`);
  console.log('');

  try {
    // Download video
    console.log('⬇️  Downloading video...');
    const videoPath = await fileManager.downloadFile(videoUrl);
    console.log('✅ Downloaded\n');

    // Get original metadata
    console.log('🔍 Analyzing original video...');
    const originalMetadata = await videoComposer.getVideoMetadata(videoPath);
    console.log(`  Duration: ${originalMetadata.duration.toFixed(2)}s`);
    console.log(`  Resolution: ${originalMetadata.width}x${originalMetadata.height}`);
    console.log('');

    // Test 1: Normal speed (no half frame rate)
    console.log('🎥 Test 1: Normal speed rendering...');
    const normalOutputPath = path.join(__dirname, 'test-normal-speed.mp4');
    const startNormal = Date.now();

    await videoComposer.composeWithAudioMix(
      videoPath,
      null, // no BGM
      null, // no narration
      null, // no subtitle
      '',   // no audio filter
      normalOutputPath,
      {
        resource: 'Video',
        operation: 'Render',
        halfFrameRate: false,
        outputFormat: 'mp4',
        videoCodec: 'libx264',
        quality: 'high',
      }
    );

    const normalDuration = ((Date.now() - startNormal) / 1000).toFixed(1);
    const normalStats = await fs.stat(normalOutputPath);
    const normalMetadata = await videoComposer.getVideoMetadata(normalOutputPath);

    console.log(`  ✅ Completed in ${normalDuration}s`);
    console.log(`  Duration: ${normalMetadata.duration.toFixed(2)}s`);
    console.log(`  Size: ${(normalStats.size / (1024 * 1024)).toFixed(2)} MB`);
    console.log('');

    // Test 2: Half frame rate (2x duration)
    console.log('🐌 Test 2: Half frame rate (2x slower)...');
    const slowOutputPath = path.join(__dirname, 'test-half-framerate.mp4');
    const startSlow = Date.now();

    await videoComposer.composeWithAudioMix(
      videoPath,
      null, // no BGM
      null, // no narration
      null, // no subtitle
      '',   // no audio filter
      slowOutputPath,
      {
        resource: 'Video',
        operation: 'Render',
        halfFrameRate: true,
        outputFormat: 'mp4',
        videoCodec: 'libx264',
        quality: 'high',
      }
    );

    const slowDuration = ((Date.now() - startSlow) / 1000).toFixed(1);
    const slowStats = await fs.stat(slowOutputPath);
    const slowMetadata = await videoComposer.getVideoMetadata(slowOutputPath);

    console.log(`  ✅ Completed in ${slowDuration}s`);
    console.log(`  Duration: ${slowMetadata.duration.toFixed(2)}s`);
    console.log(`  Size: ${(slowStats.size / (1024 * 1024)).toFixed(2)} MB`);
    console.log('');

    // Compare results
    console.log('📊 Comparison:');
    const durationRatio = (slowMetadata.duration / normalMetadata.duration).toFixed(2);
    console.log(`  Duration ratio: ${durationRatio}x (expected: ~2.0x)`);
    console.log(`  Normal: ${normalMetadata.duration.toFixed(2)}s → Slow: ${slowMetadata.duration.toFixed(2)}s`);
    console.log('');

    if (durationRatio >= 1.9 && durationRatio <= 2.1) {
      console.log('✨ Test PASSED! Duration doubled as expected.');
    } else {
      console.log('⚠️  Test WARNING: Duration ratio not exactly 2x');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  } finally {
    await fileManager.cleanup();
  }
}

testHalfFrameRate();
