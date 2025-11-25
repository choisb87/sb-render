const { renderVideo } = require('./dist/index.js');
const path = require('path');
const fs = require('fs');

async function testSubtitleBackground() {
  console.log('🧪 Testing Subtitle Background Rendering...\n');

  const outputPath = path.join(__dirname, 'test-subtitle-bg-output.mp4');

  // Clean up old file if exists
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
    console.log('🗑️  Cleaned up old output file\n');
  }

  const datasets = [
    {
      video_url: 'https://replicate.delivery/yhqm/JQP8jCi4gzOgWYeWGcKIXNe7YkQEdvF1ztLfk1bQn7uiFfonA/output.mp4',
      audio_url: '',
      subtitle: '첫 번째 장면입니다'
    },
    {
      video_url: 'https://replicate.delivery/yhqm/cnCBhB5zUBZIcxHVpBwx0sI4Z6efDEcJAKDOlvVaUAWiFfonA/output.mp4',
      audio_url: '',
      subtitle: '두 번째 장면입니다'
    }
  ];

  const config = {
    datasets,
    bgm_url: '',
    output_path: outputPath,
    enable_half_framerate: false,
    enable_sync_to_audio: false,
    subtitle_config: {
      font_size: 48,
      font_color: '#FFFFFF',
      bg_color: '#000000',
      bg_opacity: 0.7,
      position: 'bottom',
      padding: 20
    }
  };

  console.log('📊 Test Configuration:');
  console.log('  - Datasets:', datasets.length);
  console.log('  - Font Size:', config.subtitle_config.font_size);
  console.log('  - Font Color:', config.subtitle_config.font_color);
  console.log('  - BG Color:', config.subtitle_config.bg_color);
  console.log('  - BG Opacity:', config.subtitle_config.bg_opacity);
  console.log('  - Position:', config.subtitle_config.position);
  console.log('  - Padding:', config.subtitle_config.padding);
  console.log();

  try {
    console.log('🎬 Starting render...\n');
    const result = await renderVideo(config);

    console.log('\n✅ Render completed successfully!');
    console.log('📁 Output:', result.output_path);

    if (fs.existsSync(result.output_path)) {
      const stats = fs.statSync(result.output_path);
      console.log('📦 File size:', (stats.size / 1024 / 1024).toFixed(2), 'MB');
    }
  } catch (error) {
    console.error('\n❌ Render failed:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

testSubtitleBackground();
