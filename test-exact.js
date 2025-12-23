const { VideoComposer } = require('./dist/nodes/SbRender/services/VideoComposer');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('=== Exact Test: Video + BGM + Subtitle ===');
  console.log('Narration: OFF, HalfFrameRate: OFF, SyncToAudio: OFF\n');

  const tempDir = '/tmp/sync-audio-local-test';
  const videoPath = path.join(tempDir, 'input-video.mp4');
  const bgmPath = path.join(tempDir, 'bgm.mp3');
  const subtitlePath = path.join(tempDir, 'test.ass');
  const outputPath = path.join(tempDir, 'output-exact.mp4');

  const composer = new VideoComposer();

  // Check original audio at specific timestamps
  console.log('=== Checking original video audio ===');
  const videoMeta = await composer.getVideoMetadata(videoPath);
  const bgmDuration = await composer.getAudioDuration(bgmPath);

  console.log(`Original Video: ${videoMeta.duration.toFixed(2)}s`);
  console.log(`Original Audio: hasAudio=${videoMeta.hasAudio}`);
  console.log(`BGM: ${bgmDuration.toFixed(2)}s\n`);

  // Exact config matching n8n with all options OFF
  const renderConfig = {
    bgmVolume: 30,
    bgmFadeIn: 0,
    bgmFadeOut: 0,  // No fade
    narrationVolume: 100,
    narrationDelay: 0,
    syncToAudio: false,
    halfFrameRate: false,
    videoCodec: 'libx264',
    quality: 'medium',
    outputFormat: 'mp4',
  };

  console.log('Rendering...\n');

  const result = await composer.composeWithAudioMix(
    videoPath,
    bgmPath,
    null,         // NO Narration
    subtitlePath,
    '',
    outputPath,
    renderConfig
  );

  // Detailed comparison
  console.log('\n=== DETAILED COMPARISON ===\n');

  const ffmpeg = require('fluent-ffmpeg');

  // Original
  await new Promise((resolve) => {
    ffmpeg.ffprobe(videoPath, (err, meta) => {
      const audio = meta.streams.find(s => s.codec_type === 'audio');
      const video = meta.streams.find(s => s.codec_type === 'video');
      console.log('ORIGINAL:');
      console.log(`  Video duration: ${video.duration}s`);
      console.log(`  Audio duration: ${audio.duration}s`);
      resolve();
    });
  });

  // Output
  await new Promise((resolve) => {
    ffmpeg.ffprobe(outputPath, (err, meta) => {
      const audio = meta.streams.find(s => s.codec_type === 'audio');
      const video = meta.streams.find(s => s.codec_type === 'video');
      console.log('\nOUTPUT:');
      console.log(`  Video duration: ${video.duration}s`);
      console.log(`  Audio duration: ${audio.duration}s`);

      const origAudio = 265.890998;
      const outAudio = parseFloat(audio.duration);
      const diff = origAudio - outAudio;

      if (Math.abs(diff) > 0.5) {
        console.log(`\n❌ AUDIO MISMATCH: ${diff.toFixed(2)}s shorter than original`);
      } else {
        console.log(`\n✅ Audio duration matches (diff: ${diff.toFixed(3)}s)`);
      }
      resolve();
    });
  });

  console.log(`\nOutput saved: ${outputPath}`);
}

main().catch(console.error);
