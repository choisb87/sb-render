const { VideoComposer } = require('./dist/nodes/SbRender/services/VideoComposer');
const path = require('path');

async function test() {
  console.log('=== Half Frame Rate Test ===\n');

  const videoComposer = new VideoComposer();
  
  // 테스트 파일 경로
  const videoUrl = 'https://v3b.fal.media/files/b/tiger/1tTYJHVTaLZ-8dH77HzJ6_video.mp4';
  const audioUrl = 'https://v3b.fal.media/files/b/koala/ke2UEshNV5WlnX53o-CE1_output.mp3';
  
  const outputPath = path.join(__dirname, 'test-output-half-framerate.mp4');
  
  console.log('Video URL:', videoUrl);
  console.log('Audio URL:', audioUrl);
  console.log('Output:', outputPath);
  console.log('\nDownloading files...\n');

  // 파일 다운로드
  const videoPath = await downloadFile(videoUrl, '/tmp/test-video.mp4');
  const audioPath = await downloadFile(audioUrl, '/tmp/test-audio.mp3');
  
  console.log('Video downloaded to:', videoPath);
  console.log('Audio downloaded to:', audioPath);

  // 비디오 메타데이터 확인
  const videoMetadata = await videoComposer.getVideoMetadata(videoPath);
  console.log('\nVideo Metadata:', JSON.stringify(videoMetadata, null, 2));

  // Half Frame Rate 렌더링
  console.log('\n=== Starting Half Frame Rate Rendering ===\n');
  
  const config = {
    halfFrameRate: true,
    syncToAudio: false,
    quality: 'high',
    outputFormat: 'mp4',
    videoCodec: 'libx264'
  };

  try {
    const result = await videoComposer.composeWithAudioMix(
      videoPath,
      null, // bgmPath
      audioPath, // narrationPath
      null, // subtitlePath
      '', // audioFilterChain
      outputPath,
      config
    );

    console.log('\n✅ Rendering completed!');
    console.log('Output file:', outputPath);
    
    // 출력 파일 메타데이터 확인
    const outputMetadata = await videoComposer.getVideoMetadata(outputPath);
    console.log('\nOutput Metadata:', JSON.stringify(outputMetadata, null, 2));
    
    console.log('\n=== Test Results ===');
    console.log('Input video duration:', videoMetadata.duration, 'seconds');
    console.log('Expected output duration:', videoMetadata.duration * 2, 'seconds (Half Frame Rate)');
    console.log('Actual output duration:', outputMetadata.duration, 'seconds');
    console.log('Audio duration: ~7 seconds');
    
    if (Math.abs(outputMetadata.duration - (videoMetadata.duration * 2)) < 0.5) {
      console.log('\n✅ SUCCESS: Output duration matches expected!');
    } else {
      console.log('\n❌ FAILED: Output duration does not match expected!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

async function downloadFile(url, dest) {
  const fetch = require('node-fetch');
  const fs = require('fs').promises;
  
  const response = await fetch(url);
  const buffer = await response.buffer();
  await fs.writeFile(dest, buffer);
  return dest;
}

test().catch(console.error);
