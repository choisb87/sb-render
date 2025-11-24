const { VideoComposer } = require('./dist/nodes/SbRender/services/VideoComposer');
const fs = require('fs');
const path = require('path');
const https = require('https');

async function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      const writeStream = fs.createWriteStream(filepath);
      response.pipe(writeStream);
      writeStream.on('finish', () => {
        writeStream.close();
        resolve();
      });
      writeStream.on('error', reject);
    });
  });
}

async function test() {
  console.log('=== Sync Video to Audio Duration Test ===\n');

  // Download test files
  const videoUrl = 'https://v3b.fal.media/files/b/tiger/1tTYJHVTaLZ-8dH77HzJ6_video.mp4';
  const audioUrl = 'https://v3b.fal.media/files/b/koala/ke2UEshNV5WlnX53o-CE1_output.mp3';

  const videoPath = '/tmp/test-video-sync.mp4';
  const audioPath = '/tmp/test-audio-sync.mp3';

  console.log('Downloading test files...');
  await downloadFile(videoUrl, videoPath);
  await downloadFile(audioUrl, audioPath);
  console.log('✅ Files downloaded\n');

  const composer = new VideoComposer();
  const outputPath = '/tmp/test-sync-output.mp4';

  const config = {
    halfFrameRate: false,  // Half Frame Rate 비활성화
    syncToAudio: true,     // Sync to Audio 활성화
    enableNarration: true,
    enableBgm: false,
    enableSubtitle: false,
    subtitleStyle: {},
    datasets: []
  };

  console.log('🎬 Configuration:');
  console.log(`  - Video: ${videoUrl} (expected ~5s)`);
  console.log(`  - Audio: ${audioUrl} (expected ~7s)`);
  console.log(`  - Half Frame Rate: ${config.halfFrameRate}`);
  console.log(`  - Sync to Audio: ${config.syncToAudio}`);
  console.log(`  - Expected Result: Video stretched from 5s → 7s to match audio\n`);

  try {
    await composer.composeWithAudioMix(
      videoPath,
      null,  // bgmPath
      audioPath,  // narrationPath
      null,  // subtitlePath
      '',  // audioFilterChain
      outputPath,
      config
    );
    console.log('\n✅ Rendering completed!');
    console.log(`Output saved to: ${outputPath}\n`);

    // Verify output duration with ffprobe
    const { execSync } = require('child_process');
    const ffprobeCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=duration,r_frame_rate,nb_frames -of json "${outputPath}"`;
    const videoInfo = JSON.parse(execSync(ffprobeCmd).toString());

    const audioProbeCmd = `ffprobe -v error -select_streams a:0 -show_entries stream=duration -of json "${outputPath}"`;
    const audioInfo = JSON.parse(execSync(audioProbeCmd).toString());

    const videoDuration = parseFloat(videoInfo.streams[0].duration);
    const audioDuration = parseFloat(audioInfo.streams[0].duration);
    const frameRate = videoInfo.streams[0].r_frame_rate;
    const nbFrames = parseInt(videoInfo.streams[0].nb_frames);

    console.log('📊 Output Analysis:');
    console.log(`  Video Duration: ${videoDuration.toFixed(2)}s`);
    console.log(`  Audio Duration: ${audioDuration.toFixed(2)}s`);
    console.log(`  Frame Rate: ${frameRate} fps`);
    console.log(`  Total Frames: ${nbFrames}`);

    // Expected: video should be ~7s (stretched to match audio)
    if (Math.abs(videoDuration - 7) < 0.5) {
      console.log('\n✅ SUCCESS: Video duration matches audio duration (~7s)');
    } else {
      console.log(`\n❌ FAIL: Video duration (${videoDuration.toFixed(2)}s) does not match audio (~7s)`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

test().catch(console.error);
