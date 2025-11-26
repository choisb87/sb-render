const path = require('path');
const fs = require('fs');

// Import the compiled services directly
const { SubtitleEngine } = require('./dist/nodes/SbRender/services/SubtitleEngine');
const { FileManager } = require('./dist/nodes/SbRender/services/FileManager');

async function testLargeTextMode() {
  console.log('🎬 Testing Large Text Mode (120px, 20% opacity)\n');

  const videoUrl = 'https://d288ub56sdnkmp.cloudfront.net/silver/2025-11-24/8.mp3';
  const srtContent = `1
00:00:00,160 --> 00:00:03,000
여러분, 지금 이 순간에도 70대 할머니가 유튜브로

2
00:00:03,120 --> 00:00:06,019
월 300만원을 벌고 있습니다. 믿기시나요?

3
00:00:06,559 --> 00:00:08,960
나이 들면 집에서 쉬어야 한다는 생각, 이제

4
00:00:09,099 --> 00:00:12,060
완전히 틀렸습니다. 2025년

5
00:00:12,179 --> 00:00:14,960
대한민국은 지금 액티브 시니어의 시대입니다.`;

  const outputPath = path.join(__dirname, 'test-large-text-output.mp4');

  // Clean up old output
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
    console.log('🗑️  Cleaned up old output file\n');
  }

  const fileManager = new FileManager();
  const subtitleEngine = new SubtitleEngine(fileManager);

  try {
    console.log('📥 Downloading audio/video...');
    const videoPath = await fileManager.downloadFile(videoUrl, 'audio.mp3');
    console.log(`✅ Downloaded: ${videoPath}\n`);

    // Get audio metadata
    const ffprobePath = require('@ffprobe-installer/ffprobe').path;
    const { execSync } = require('child_process');

    console.log('🔍 Getting media metadata...');
    const probeOutput = execSync(`"${ffprobePath}" -v error -select_streams a:0 -show_entries stream=duration -of json "${videoPath}"`).toString();
    const probe = JSON.parse(probeOutput);
    const duration = parseFloat(probe.streams[0].duration);

    console.log(`📊 Audio duration: ${duration.toFixed(2)}s\n`);

    // Parse SRT with Large Text Mode settings (120px, 20% opacity)
    console.log('📝 Parsing SRT with Large Text Mode...');
    const defaultConfig = {
      fontSize: 120,
      fontColor: '#FFFFFF',
      backgroundColor: '#000000',
      backgroundOpacity: 20,  // Large Text Mode = 20%
      borderColor: '#000000',
      borderWidth: 2,
      position: 'bottom',
      alignment: 'center'
    };

    const parsedSubtitles = subtitleEngine.parseSRT(srtContent, defaultConfig);
    console.log(`✅ Parsed ${parsedSubtitles.length} subtitle entries\n`);

    // Show first few subtitles
    console.log('📋 Subtitle Preview:');
    parsedSubtitles.slice(0, 3).forEach((sub, idx) => {
      console.log(`  ${idx + 1}. [${sub.startTime.toFixed(2)}s - ${sub.endTime.toFixed(2)}s]`);
      console.log(`     "${sub.text.substring(0, 40)}..."`);
      console.log(`     Font: ${sub.fontSize}px, BG Opacity: ${sub.backgroundOpacity}%`);
    });
    console.log('');

    // Generate ASS file - use 1920x1080 as standard video size
    console.log('🎨 Generating ASS file...');
    const metadata = { width: 1920, height: 1080 };
    const assContent = subtitleEngine.generateASS(parsedSubtitles, metadata.width, metadata.height);
    const assPath = await subtitleEngine.writeSubtitleFile(assContent, 'ass');
    console.log(`✅ ASS file created: ${assPath}\n`);

    // Verify ASS settings
    console.log('🔍 Verifying ASS Settings:');
    const styleMatch = assContent.match(/Style: Style\d+,([^,]+),(\d+),([^,]+),([^,]+),([^,]+),([^,]+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)/);
    if (styleMatch) {
      const fontName = styleMatch[1];
      const fontSize = styleMatch[2];
      const backColor = styleMatch[6];
      const borderStyle = styleMatch[15];

      console.log(`  ✓ Font: ${fontName}, ${fontSize}px`);
      console.log(`  ✓ BackColour: ${backColor}`);
      console.log(`  ✓ BorderStyle: ${borderStyle} ${borderStyle === '3' ? '(Opaque Box) ✅' : '(Wrong!) ❌'}`);

      // Parse opacity
      if (backColor.startsWith('&H')) {
        const alphaHex = backColor.substring(2, 4);
        const alphaValue = parseInt(alphaHex, 16);
        const calculatedOpacity = 100 - (alphaValue / 2.55);
        console.log(`  ✓ Alpha: 0x${alphaHex} (${alphaValue}) = ${calculatedOpacity.toFixed(1)}% opacity`);

        if (Math.abs(calculatedOpacity - 20) < 1) {
          console.log(`  ✅ Large Text Mode opacity (20%) is correct!`);
        }
      }
    }
    console.log('');

    // Create a test video with the subtitles
    // Since we have audio, we'll create a video with color bars and the subtitles
    console.log('🎬 Creating video with subtitles...');
    const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
    const fontsDir = path.join(__dirname, 'fonts');

    const command = [
      `"${ffmpegPath}"`,
      '-y',
      '-f', 'lavfi',
      `-i "color=c=black:s=1920x1080:d=${duration}"`,
      `-i "${videoPath}"`,
      '-filter_complex', `"[0:v]subtitles='${assPath.replace(/'/g, "\\'")}':fontsdir='${fontsDir}'[v]"`,
      '-map', '[v]',
      '-map', '1:a',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      '-t', duration.toFixed(2),
      `"${outputPath}"`
    ].join(' ');

    console.log('Command (truncated):', command.substring(0, 150) + '...\n');

    execSync(command, { stdio: 'inherit', timeout: 120000 });

    console.log('\n✅ Rendering complete!\n');

    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🎉 Success!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`📁 Output: ${outputPath}`);
      console.log(`📦 Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      console.log('');
      console.log('✨ Large Text Mode Settings:');
      console.log('   - Font Size: 120px');
      console.log('   - Background: Black');
      console.log('   - Background Opacity: 20%');
      console.log('');
      console.log('🎥 Check the video to verify large text with subtle background!');
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

testLargeTextMode();
