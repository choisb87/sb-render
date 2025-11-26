const path = require('path');
const fs = require('fs');

// Import the compiled services directly
const { SubtitleEngine } = require('./dist/nodes/SbRender/services/SubtitleEngine');
const { FileManager } = require('./dist/nodes/SbRender/services/FileManager');

async function testRealSRT() {
  console.log('🎬 Testing Real SRT Subtitle\n');

  const videoUrl = 'https://v3b.fal.media/files/b/tiger/1tTYJHVTaLZ-8dH77HzJ6_video.mp4';
  const srtContent = `1
00:00:00,160 --> 00:00:03,000
여러분, 지금 이 순간에도 70대 할머니가 유튜브로

2
00:00:03,120 --> 00:00:06,019
월 300만원을 벌고 있습니다. 믿기시나요?

3
00:00:06,559 --> 00:00:08,960
나이 들면 집에서 쉬어야 한다는 생각, 이제`;

  const outputPath = path.join(__dirname, 'test-srt-real-output.mp4');

  // Clean up old output
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
    console.log('🗑️  Cleaned up old output file\n');
  }

  const fileManager = new FileManager();
  const subtitleEngine = new SubtitleEngine(fileManager);

  try {
    console.log('📥 Downloading video...');
    const videoPath = await fileManager.downloadFile(videoUrl, 'video.mp4');
    console.log(`✅ Downloaded: ${videoPath}\n`);

    // Get video metadata
    const ffprobePath = require('@ffprobe-installer/ffprobe').path;
    const { execSync } = require('child_process');

    console.log('🔍 Getting video metadata...');
    const probeOutput = execSync(`"${ffprobePath}" -v error -select_streams v:0 -show_entries stream=width,height,duration -of json "${videoPath}"`).toString();
    const probe = JSON.parse(probeOutput);
    const metadata = {
      width: probe.streams[0].width,
      height: probe.streams[0].height,
      duration: parseFloat(probe.streams[0].duration)
    };
    console.log(`📊 Video: ${metadata.width}x${metadata.height}, ${metadata.duration.toFixed(2)}s\n`);

    // Parse SRT with background settings
    console.log('📝 Parsing SRT content...');
    const defaultConfig = {
      fontSize: 48,
      fontColor: '#FFFFFF',
      backgroundColor: '#000000',
      backgroundOpacity: 70,
      borderColor: '#000000',
      borderWidth: 2,
      position: 'bottom',
      alignment: 'center'
    };

    const parsedSubtitles = subtitleEngine.parseSRT(srtContent, defaultConfig);
    console.log(`✅ Parsed ${parsedSubtitles.length} subtitle entries\n`);

    // Show parsed subtitles
    parsedSubtitles.forEach((sub, idx) => {
      console.log(`Subtitle ${idx + 1}:`);
      console.log(`  Time: ${sub.startTime.toFixed(2)}s - ${sub.endTime.toFixed(2)}s`);
      console.log(`  Text: ${sub.text}`);
      console.log(`  Config: font=${sub.fontSize}px, bgColor=${sub.backgroundColor}, bgOpacity=${sub.backgroundOpacity}%`);
      console.log('');
    });

    // Generate ASS file
    console.log('🎨 Generating ASS file...');
    const assContent = subtitleEngine.generateASS(parsedSubtitles, metadata.width, metadata.height);
    const assPath = await subtitleEngine.writeSubtitleFile(assContent, 'ass');
    console.log(`✅ ASS file created: ${assPath}\n`);

    // Show ASS content
    console.log('📄 ASS File Content:');
    console.log('─'.repeat(80));
    const assLines = assContent.split('\n');
    assLines.forEach((line, idx) => {
      if (idx < 15 || line.startsWith('Dialogue:')) {
        console.log(line);
      }
    });
    console.log('─'.repeat(80));
    console.log('');

    // Compose video
    console.log('🎬 Rendering video with subtitles...');
    const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
    const fontsDir = path.join(__dirname, 'fonts');

    const filterComplex = `[0:v]subtitles='${assPath.replace(/'/g, "\\'")}':fontsdir='${fontsDir}'[v]`;

    const command = [
      `"${ffmpegPath}"`,
      '-y',
      `-i "${videoPath}"`,
      '-filter_complex', `"${filterComplex}"`,
      '-map', '[v]',
      '-map', '0:a?',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '23',
      '-c:a', 'copy',
      '-movflags', '+faststart',
      `"${outputPath}"`
    ].join(' ');

    console.log('Command (truncated):', command.substring(0, 150) + '...\n');

    execSync(command, { stdio: 'inherit' });

    console.log('\n✅ Rendering complete!\n');

    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🎉 Success!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`📁 Output: ${outputPath}`);
      console.log(`📦 Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      console.log('');
      console.log('✨ Check the video to verify subtitles are properly rendered!');
      console.log('');
    }

    // Cleanup temp files
    console.log('🧹 Cleaning up temporary files...');
    await fileManager.cleanup();
    console.log('✅ Cleanup complete');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

testRealSRT();
