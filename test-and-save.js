#!/usr/bin/env node

/**
 * Test script for SB Render node - saves output
 */

const { SbRender } = require('./dist/nodes/SbRender/SbRender.node.js');
const fs = require('fs');
const path = require('path');

// Mock n8n context
const mockContext = {
  getInputData: () => [{
    json: {
      video_url: "https://v3b.fal.media/files/b/lion/W68O5FekZ9dtlcSbUwcx4_video.mp4",
      audio_url: "https://v3b.fal.media/files/b/lion/SBQzktbrFho8lXKg_4Ipl_output.mp3",
      subtitle: "지금 이 순간에도 수많은 부모들이 똑같은 고민에 빠져 있습니다. 아이를 제대로 키우고 있는 걸까요?"
    }
  }],

  getNodeParameter: (name, itemIndex, defaultValue) => {
    const params = {
      resource: 'Video',
      operation: 'Render',
      videoSource: 'url',
      videoUrl: 'https://v3b.fal.media/files/b/lion/W68O5FekZ9dtlcSbUwcx4_video.mp4',
      enableBGM: true,
      bgmSource: 'url',
      bgmUrl: 'https://v3b.fal.media/files/b/lion/SBQzktbrFho8lXKg_4Ipl_output.mp3',
      bgmVolume: 30,
      bgmFadeIn: 2,
      bgmFadeOut: 2,
      enableNarration: false,
      enableSubtitles: true,
      subtitles: {
        subtitle: [{
          text: '지금 이 순간에도 수많은 부모들이\n똑같은 고민에 빠져 있습니다.\n아이를 제대로 키우고 있는 걸까요?',
          startTime: 0,
          endTime: 8,
          position: 'bottom',
          fontSize: 56,
          fontColor: '#FFFFFF',
          fontFamily: 'Arial',
          alignment: 'center',
          backgroundColor: '#000000',
          backgroundOpacity: 70,
          borderColor: '#000000',
          borderWidth: 3
        }]
      },
      outputFormat: 'mp4',
      videoCodec: 'libx264',
      quality: 'high',
      outputBinaryProperty: 'data'
    };

    return params[name] !== undefined ? params[name] : defaultValue;
  },

  getNode: () => ({ name: 'SB Render Test' }),

  helpers: {
    assertBinaryData: (itemIndex, propertyName) => ({
      mimeType: 'video/mp4',
      fileExtension: '.mp4'
    }),

    getBinaryDataBuffer: async (itemIndex, propertyName) => {
      return Buffer.from('test');
    },

    prepareBinaryData: async (buffer, filename, mimeType) => ({
      data: buffer.toString('base64'),
      mimeType,
      fileName: filename,
      fileExtension: '.mp4',
      _buffer: buffer // Store original buffer
    })
  },

  continueOnFail: () => false
};

async function test() {
  console.log('🎬 Rendering video with BGM and subtitles...\n');

  const node = new SbRender();

  try {
    const result = await node.execute.call(mockContext);

    console.log('✅ Rendering completed!');
    console.log('   Duration:', result[0][0].json.duration, 'seconds');
    console.log('   Resolution:', `${result[0][0].json.width}x${result[0][0].json.height}`);

    // Save output file
    const outputPath = path.join(__dirname, 'output-rendered.mp4');
    const binaryData = result[0][0].binary.data;

    // Decode base64 and save
    const buffer = Buffer.from(binaryData.data, 'base64');
    fs.writeFileSync(outputPath, buffer);

    const stats = fs.statSync(outputPath);
    console.log('\n📁 Output saved:');
    console.log('   Path:', outputPath);
    console.log('   Size:', (stats.size / 1024 / 1024).toFixed(2), 'MB');

    console.log('\n🎉 Test completed successfully!');
    console.log('   You can play the video at:', outputPath);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

test();
