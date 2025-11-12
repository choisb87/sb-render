const { VideoComposer } = require('./dist/nodes/SbRender/services/VideoComposer');
const { FileManager } = require('./dist/nodes/SbRender/services/FileManager');

async function testMergeSimple() {
  console.log('🎬 Testing Merge Operation Simple Case...\n');

  const fileManager = new FileManager();
  const videoComposer = new VideoComposer();

  try {
    // Use just 2 videos from test-data.json for quick test
    const testData = require('./test-data.json');
    const videoUrls = testData.slice(0, 2).map(item => item.video_url);

    console.log(`📹 Merging ${videoUrls.length} videos:`);
    videoUrls.forEach((url, i) => {
      console.log(`  ${i + 1}. ${url.split('/').pop()}`);
    });
    console.log('');

    // Download videos
    console.log('⬇️  Downloading videos...');
    const videoPaths = [];
    for (const videoUrl of videoUrls) {
      const videoPath = await fileManager.downloadFile(videoUrl);
      videoPaths.push(videoPath);
      console.log(`  ✅ Downloaded: ${videoPath}`);
    }
    console.log('');

    // Create output path
    const outputPath = require('path').join(__dirname, 'test-merge-simple.mp4');

    // Merge videos
    console.log('🔄 Merging videos...');
    const videoBuffer = await videoComposer.mergeVideos(
      videoPaths,
      outputPath,
      'libx264',
      'high',
      undefined,
      'mp4'
    );

    console.log('✅ Merge completed!');
    console.log(`  Output size: ${(videoBuffer.length / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`  Output path: ${outputPath}`);

    // Verify output file
    const fs = require('fs');
    const stats = fs.statSync(outputPath);
    console.log(`  File size on disk: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
    console.log('');
    console.log('✨ Test PASSED!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await fileManager.cleanup();
  }
}

testMergeSimple();
