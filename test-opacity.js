const path = require('path');
const fs = require('fs');

// Import the compiled services directly
const { SubtitleEngine } = require('./dist/nodes/SbRender/services/SubtitleEngine');
const { FileManager } = require('./dist/nodes/SbRender/services/FileManager');

async function testOpacityLevels() {
  console.log('🎬 Testing Subtitle Background Opacity Levels\n');

  const videoUrl = 'https://v3b.fal.media/files/b/tiger/1tTYJHVTaLZ-8dH77HzJ6_video.mp4';
  const srtContent = `1
00:00:01,000 --> 00:00:03,500
테스트 자막입니다`;

  const fileManager = new FileManager();
  const subtitleEngine = new SubtitleEngine(fileManager);

  try {
    console.log('📥 Downloading video...');
    const videoPath = await fileManager.downloadFile(videoUrl, 'video.mp4');
    console.log(`✅ Downloaded: ${videoPath}\n`);

    // Get video metadata
    const ffprobePath = require('@ffprobe-installer/ffprobe').path;
    const { execSync } = require('child_process');

    const probeOutput = execSync(`"${ffprobePath}" -v error -select_streams v:0 -show_entries stream=width,height,duration -of json "${videoPath}"`).toString();
    const probe = JSON.parse(probeOutput);
    const metadata = {
      width: probe.streams[0].width,
      height: probe.streams[0].height,
      duration: parseFloat(probe.streams[0].duration)
    };

    // Test different opacity levels
    const opacityTests = [
      { opacity: 20, label: 'Large Text Mode (20%)' },
      { opacity: 50, label: 'Medium (50%)' },
      { opacity: 70, label: 'Default (70%)' },
      { opacity: 100, label: 'Full Opaque (100%)' }
    ];

    for (const test of opacityTests) {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`Testing: ${test.label}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

      const subtitleConfig = {
        backgroundColor: '#000000',
        backgroundOpacity: test.opacity,
        fontSize: test.opacity === 20 ? 120 : 48,
      };

      const parsedSubtitles = subtitleEngine.parseSRT(srtContent, subtitleConfig);
      const assContent = subtitleEngine.generateASS(parsedSubtitles, metadata.width, metadata.height);

      // Show first 5 lines for debugging
      if (test.opacity === 20) {
        console.log('ASS Content Preview:');
        console.log(assContent.split('\n').slice(9, 12).join('\n'));
        console.log('');
      }

      // Find the Style line - Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment...
      const styleMatch = assContent.match(/Style: (Style\d+),([^,]+),(\d+),([^,]+),([^,]+),([^,]+),([^,]+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)/);
      if (styleMatch) {
        const backColor = styleMatch[7];  // BackColour is 7th field
        const borderStyle = styleMatch[16];  // BorderStyle is 16th field

        console.log(`✓ BackColour: ${backColor}`);
        console.log(`✓ BorderStyle: ${borderStyle} ${borderStyle === '3' ? '(Opaque Box) ✅' : '(Wrong!) ❌'}`);

        // Parse the hex alpha value
        if (backColor.startsWith('&H')) {
          const alphaHex = backColor.substring(2, 4);
          const alphaValue = parseInt(alphaHex, 16);
          const calculatedOpacity = 100 - (alphaValue / 2.55);
          console.log(`  - Alpha hex: 0x${alphaHex} (${alphaValue})`);
          console.log(`  - Calculated opacity: ${calculatedOpacity.toFixed(1)}%`);
          console.log(`  - Expected opacity: ${test.opacity}%`);

          if (Math.abs(calculatedOpacity - test.opacity) < 1) {
            console.log(`  ✅ Opacity correct!`);
          } else {
            console.log(`  ⚠️  Opacity mismatch!`);
          }
        }
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ All opacity tests completed!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await fileManager.cleanup();

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

testOpacityLevels();
