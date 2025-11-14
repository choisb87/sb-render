const { VideoComposer } = require('./dist/nodes/SbRender/services/VideoComposer');
const { FileManager } = require('./dist/nodes/SbRender/services/FileManager');
const path = require('path');
const fs = require('fs');

async function testMerge() {
  const videoComposer = new VideoComposer();
  const fileManager = new FileManager();

  const videoUrls = [
    'https://d288ub56sdnkmp.cloudfront.net/mediafx/assets/9l5X8jqMqXnvcVjgrP-7_.mp4',
    'https://d288ub56sdnkmp.cloudfront.net/mediafx/assets/oFsRXDStxviHVlH55vMoM.mp4',
    'https://d288ub56sdnkmp.cloudfront.net/mediafx/assets/R6YxwD0PmGqnmeQgblPcG.mp4'
  ];

  try {
    console.log('📥 Downloading videos...');
    const videoPaths = [];

    for (let i = 0; i < videoUrls.length; i++) {
      console.log(`\nDownloading video ${i + 1}/${videoUrls.length}...`);
      const videoPath = await fileManager.downloadFile(videoUrls[i], `test_video_${i}.mp4`);
      videoPaths.push(videoPath);
      console.log(`✅ Downloaded to: ${videoPath}`);

      // Check if video has audio
      const { execSync } = require('child_process');
      try {
        const audioCheck = execSync(`ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`, { encoding: 'utf8' });
        console.log(`   Audio codec: ${audioCheck.trim() || 'NO AUDIO'}`);
      } catch (e) {
        console.log('   Audio codec: NO AUDIO');
      }
    }

    console.log('\n🔧 Merging videos...');
    const outputPath = '/tmp/test-merge-output.mp4';
    await videoComposer.mergeVideos(videoPaths, outputPath);

    console.log(`\n✅ Merge complete!`);
    console.log(`📁 Output: ${outputPath}`);

    // Check if merged video has audio
    const { execSync } = require('child_process');
    try {
      const audioCheck = execSync(`ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`, { encoding: 'utf8' });
      console.log(`\n🔊 Merged video audio: ${audioCheck.trim() || 'NO AUDIO ❌'}`);

      // Get detailed audio info
      const audioInfo = execSync(`ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,sample_rate,channels -of json "${outputPath}"`, { encoding: 'utf8' });
      console.log('\n📊 Audio details:', JSON.parse(audioInfo));
    } catch (e) {
      console.log('\n❌ Merged video has NO AUDIO!');
    }

    // Get file size
    const stats = fs.statSync(outputPath);
    console.log(`📦 File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  } catch (error) {
    console.error('❌ Test failed:', error);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

testMerge();
