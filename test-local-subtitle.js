const path = require('path');
const fs = require('fs');

// Import the compiled services directly
const { SubtitleEngine } = require('./dist/nodes/SbRender/services/SubtitleEngine');
const { VideoComposer } = require('./dist/nodes/SbRender/services/VideoComposer');
const { FileManager } = require('./dist/nodes/SbRender/services/FileManager');

async function testSubtitleRendering() {
  console.log('🎬 Testing Subtitle Background Rendering\n');

  const videoUrl = 'https://v3b.fal.media/files/b/tiger/1tTYJHVTaLZ-8dH77HzJ6_video.mp4';
  const srtContent = `1
00:00:01,000 --> 00:00:03,500
안녕하세요.

2
00:00:04,200 --> 00:00:06,800
이것은 SRT 자막 파일 예시입니다.`;

  const outputPath = path.join(__dirname, 'test-subtitle-output.mp4');

  // Clean up old output
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
    console.log('🗑️  Cleaned up old output file\n');
  }

  const fileManager = new FileManager();
  const subtitleEngine = new SubtitleEngine(fileManager);
  const videoComposer = new VideoComposer(fileManager, subtitleEngine);

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

    // Create subtitle config with background
    const subtitleConfig = {
      text: srtContent,
      format: 'srt',
      fontSize: 48,
      fontColor: '#FFFFFF',
      backgroundColor: '#000000',
      backgroundOpacity: 70,  // 70% opacity
      borderColor: '#000000',
      borderWidth: 2,
      position: 'bottom',
      alignment: 'center'
    };

    console.log('📝 Subtitle Configuration:');
    console.log('  - Format: SRT');
    console.log('  - Font: 48px white');
    console.log('  - Background: Black with 70% opacity');
    console.log('  - Position: Bottom center');
    console.log('  - Border: 2px black\n');

    // Parse SRT and generate ASS file
    console.log('🎨 Converting SRT to ASS with background...');
    const parsedSubtitles = subtitleEngine.parseSRT(srtContent, {
      fontSize: 48,
      fontColor: '#FFFFFF',
      backgroundColor: '#000000',
      backgroundOpacity: 70,
      borderColor: '#000000',
      borderWidth: 2,
      position: 'bottom',
      alignment: 'center'
    });

    const assContent = subtitleEngine.generateASS(parsedSubtitles, metadata.width, metadata.height);
    const assPath = await subtitleEngine.writeSubtitleFile(assContent, 'ass');
    console.log(`✅ ASS file created: ${assPath}\n`);

    // Show ASS content for verification
    console.log('📄 ASS File Content (first 30 lines):');
    const assFileContent = fs.readFileSync(assPath, 'utf8');
    const assLines = assFileContent.split('\n').slice(0, 30);
    console.log(assLines.join('\n'));
    console.log('...\n');

    // Compose video
    console.log('🎬 Rendering video with subtitles...');
    const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
    const fontPath = path.join(__dirname, 'fonts', 'NanumGothic.ttf');

    console.log(`📝 Using font: ${fontPath}\n`);

    const filterComplex = `[0:v]subtitles='${assPath.replace(/'/g, "\\'")}':fontsdir='${path.join(__dirname, 'fonts')}'[v]`;

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

    console.log('Command:', command.substring(0, 200) + '...\n');

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
      console.log('✨ Check the video to verify subtitle background box!');
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

testSubtitleRendering();
