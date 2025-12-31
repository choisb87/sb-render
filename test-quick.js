const { VideoComposer } = require('./dist/nodes/SbRender/services/VideoComposer');
const { execSync } = require('child_process');
const fs = require('fs');
const https = require('https');

async function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(filepath); });
    }).on('error', reject);
  });
}

async function test() {
  const composer = new VideoComposer();
  const imagePath = '/tmp/test-quick.png';
  
  console.log('Downloading image...');
  await downloadImage('https://d288ub56sdnkmp.cloudfront.net/capture.png', imagePath);
  
  // Test zoomInFast - should show 40% zoom
  console.log('\nTesting zoomInFast (should show 40% dramatic zoom)...');
  await composer.createVideoFromImages(
    [imagePath], [3], '/tmp/test-zoomInFast.mp4',
    'libx264', 'high', undefined, 'mp4', ['zoomInFast']
  );
  console.log('Created: /tmp/test-zoomInFast.mp4');
  
  // Test panLeft
  console.log('\nTesting panLeft (should pan from right to left)...');
  await composer.createVideoFromImages(
    [imagePath], [3], '/tmp/test-panLeft.mp4',
    'libx264', 'high', undefined, 'mp4', ['panLeft']
  );
  console.log('Created: /tmp/test-panLeft.mp4');
  
  console.log('\nDone! Check /tmp/test-zoomInFast.mp4 and /tmp/test-panLeft.mp4');
}

test().catch(console.error);
