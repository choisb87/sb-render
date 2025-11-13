const SbRender = require('./dist/nodes/SbRender/SbRender.node.js').SbRender;

// Mock n8n execution context
const mockContext = {
  getInputData: () => [{ json: {} }], // Empty item from manual trigger
  getNodeParameter: (name, itemIndex, defaultValue) => {
    const params = {
      resource: 'Video',
      operation: 'Merge',
      videoUrls: [
        'https://v3b.fal.media/files/b/rabbit/0k_1hwkedyFiF060HUm-__video.mp4',
        'https://v3b.fal.media/files/b/rabbit/0k_1hwkedyFiF060HUm-__video.mp4'
      ],
      outputFilename: 'merged-video.mp4',
      mergeOutputFormat: 'mp4',
      mergeVideoCodec: 'libx264',
      mergeQuality: 'high',
      mergeCustomCRF: 18,
      mergeOutputBinaryProperty: 'data'
    };

    console.log(`getNodeParameter('${name}', ${itemIndex}, ${defaultValue}) => ${JSON.stringify(params[name])}`);
    return params[name] !== undefined ? params[name] : defaultValue;
  },
  helpers: {
    prepareBinaryData: async (buffer, filename, mimeType) => {
      return {
        data: buffer.toString('base64'),
        fileName: filename,
        mimeType: mimeType
      };
    }
  },
  getNode: () => ({ name: 'Test Node' }),
  continueOnFail: () => false
};

async function test() {
  console.log('\n=== Testing SB Render Merge Operation ===\n');

  const node = new SbRender();

  try {
    const result = await node.execute.call(mockContext);
    console.log('\n=== Result ===');
    console.log('Return data length:', result[0].length);
    console.log('First item:', JSON.stringify(result[0][0], null, 2));
  } catch (error) {
    console.error('\n=== Error ===');
    console.error(error);
  }
}

test();
