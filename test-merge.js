const { VideoComposer } = require('./dist/nodes/SbRender/services/VideoComposer');
const { FileManager } = require('./dist/nodes/SbRender/services/FileManager');
const fs = require('fs').promises;
const path = require('path');

async function testMerge() {
  console.log('🎬 Starting Merge Videos Test...\n');

  // Load test data
  const testData = require('./test-data.json');
  const videoUrls = testData.map(item => item.video_url);

  console.log(`📹 Found ${videoUrls.length} videos to merge:`);
  videoUrls.forEach((url, index) => {
    console.log(`  ${index + 1}. ${url.split('/').pop()}`);
  });
  console.log('');

  const fileManager = new FileManager();
  const videoComposer = new VideoComposer();

  try {
    // Download all videos
    console.log('⬇️  Downloading videos...');
    const videoPaths = [];
    for (let i = 0; i < videoUrls.length; i++) {
      process.stdout.write(`  Downloading ${i + 1}/${videoUrls.length}... `);
      const videoPath = await fileManager.downloadFile(videoUrls[i]);
      videoPaths.push(videoPath);
      console.log('✅');
    }
    console.log('');

    // Create output path
    const outputPath = path.join(__dirname, 'test-merged-output.mp4');

    // Merge videos
    console.log('🔄 Merging videos...');
    const startTime = Date.now();

    const videoBuffer = await videoComposer.mergeVideos(
      videoPaths,
      outputPath,
      'libx264',  // codec
      'high',     // quality
      undefined,  // customCRF
      'mp4'       // format
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Merge completed in ${duration}s\n`);

    // Save output
    await fs.writeFile(outputPath, videoBuffer);
    const stats = await fs.stat(outputPath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    console.log('📦 Output Information:');
    console.log(`  Path: ${outputPath}`);
    console.log(`  Size: ${sizeMB} MB`);
    console.log(`  Videos merged: ${videoUrls.length}`);
    console.log('');
    console.log('✨ Test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  } finally {
    // Cleanup temp files
    await fileManager.cleanup();
  }
}

testMerge();
