/**
 * ParallaxGeneratorONNX - Generate parallax video using ONNX depth estimation
 * Pure Node.js implementation - no Python required
 */
import * as fs from 'fs';
import * as path from 'path';
import { estimateDepthONNX, isONNXAvailable } from './DepthEstimatorONNX';
import { createCommand } from '../utils/ffmpeg-wrapper';

type Sharp = typeof import('sharp');
let sharp: Sharp | null = null;

async function loadSharp(): Promise<Sharp | null> {
  if (sharp) return sharp;
  try {
    sharp = (await import('sharp')).default;
    return sharp;
  } catch {
    console.warn('[ParallaxGeneratorONNX] Sharp not available');
    return null;
  }
}

export interface ParallaxConfig {
  direction: 'left' | 'right' | 'up' | 'down' | 'zoomIn' | 'zoomOut';
  intensity: 'subtle' | 'normal' | 'dramatic';
  zoom?: 'none' | 'in' | 'out';
}

function easeInOutSine(t: number): number {
  return (1 - Math.cos(t * Math.PI)) / 2;
}

/**
 * Generate parallax video using ONNX depth estimation
 */
export async function generateParallaxONNX(
  imagePath: string,
  outputPath: string,
  config: ParallaxConfig,
  duration: number,
  fps = 24,
): Promise<boolean> {
  const sharpModule = await loadSharp();
  if (!sharpModule) {
    console.error('[ParallaxGeneratorONNX] Sharp required for image processing');
    return false;
  }

  // Check ONNX availability
  const onnxAvailable = await isONNXAvailable();
  if (!onnxAvailable) {
    console.error('[ParallaxGeneratorONNX] ONNX Runtime not available');
    return false;
  }

  console.log('[ParallaxGeneratorONNX] Starting parallax generation...');
  console.log(`[ParallaxGeneratorONNX] Config: direction=${config.direction}, intensity=${config.intensity}, zoom=${config.zoom || 'none'}`);

  try {
    // Estimate depth
    console.log('[ParallaxGeneratorONNX] Estimating depth...');
    const depthResult = await estimateDepthONNX(imagePath);
    if (!depthResult) {
      console.error('[ParallaxGeneratorONNX] Depth estimation failed');
      return false;
    }

    const { depthMap, width, height } = depthResult;
    console.log(`[ParallaxGeneratorONNX] Depth map: ${width}x${height}`);

    // Ensure even dimensions
    const outWidth = Math.floor(width / 2) * 2;
    const outHeight = Math.floor(height / 2) * 2;

    // Load base image
    const baseImageBuffer = await sharpModule(imagePath)
      .resize(outWidth, outHeight)
      .removeAlpha()
      .raw()
      .toBuffer();

    // Create foreground mask based on depth (top 60% closest)
    const threshold = getPercentile(depthMap, 40); // 40th percentile = top 60%
    const fgMask = new Uint8Array(width * height);
    for (let i = 0; i < depthMap.length; i++) {
      fgMask[i] = depthMap[i] >= threshold ? 255 : 0;
    }

    // Resize mask to output dimensions
    const fgMaskResized = await sharpModule(Buffer.from(fgMask), {
      raw: { width, height, channels: 1 }
    })
      .resize(outWidth, outHeight)
      .blur(2) // Feather edges
      .raw()
      .toBuffer();

    // Create foreground layer (with alpha from mask)
    const fgBuffer = Buffer.alloc(outWidth * outHeight * 4);
    for (let i = 0; i < outWidth * outHeight; i++) {
      fgBuffer[i * 4] = baseImageBuffer[i * 3];
      fgBuffer[i * 4 + 1] = baseImageBuffer[i * 3 + 1];
      fgBuffer[i * 4 + 2] = baseImageBuffer[i * 3 + 2];
      fgBuffer[i * 4 + 3] = fgMaskResized[i];
    }

    // Create background by blurring the foreground areas
    const bgBuffer = await sharpModule(Buffer.from(baseImageBuffer), {
      raw: { width: outWidth, height: outHeight, channels: 3 }
    })
      .blur(15) // Heavy blur for inpainting effect
      .raw()
      .toBuffer();

    // Composite: use original where mask is 0, blurred where mask is high
    const bgComposite = Buffer.alloc(outWidth * outHeight * 3);
    for (let i = 0; i < outWidth * outHeight; i++) {
      const alpha = fgMaskResized[i] / 255;
      // Blend: more blur where foreground is
      bgComposite[i * 3] = Math.round(baseImageBuffer[i * 3] * (1 - alpha * 0.7) + bgBuffer[i * 3] * alpha * 0.7);
      bgComposite[i * 3 + 1] = Math.round(baseImageBuffer[i * 3 + 1] * (1 - alpha * 0.7) + bgBuffer[i * 3 + 1] * alpha * 0.7);
      bgComposite[i * 3 + 2] = Math.round(baseImageBuffer[i * 3 + 2] * (1 - alpha * 0.7) + bgBuffer[i * 3 + 2] * alpha * 0.7);
    }

    // Movement parameters
    const intensityMult = config.intensity === 'subtle' ? 0.5 :
                          config.intensity === 'dramatic' ? 1.5 : 1.0;
    const bgSpeed = Math.round(15 * intensityMult);
    const fgSpeed = Math.round(40 * intensityMult);

    // Direction vectors
    let dx = 0, dy = 0;
    switch (config.direction) {
      case 'left': dx = -1; break;
      case 'right': dx = 1; break;
      case 'up': dy = -1; break;
      case 'down': dy = 1; break;
    }

    // Zoom parameters
    const zoomAmount = 0.15 * intensityMult;
    let zoomStart = 1.0, zoomEnd = 1.0;
    if (config.zoom === 'in') {
      zoomStart = 1.0;
      zoomEnd = 1.0 + zoomAmount;
    } else if (config.zoom === 'out') {
      zoomStart = 1.0 + zoomAmount;
      zoomEnd = 1.0;
    }

    // Create padded background for movement
    const padX = Math.round(Math.max(fgSpeed, bgSpeed) * 2);
    const padY = Math.round(Math.max(fgSpeed, bgSpeed) * 2);
    const paddedWidth = outWidth + padX * 2;
    const paddedHeight = outHeight + padY * 2;

    // Create padded background using edge extension
    const bgImage = sharpModule(Buffer.from(bgComposite), {
      raw: { width: outWidth, height: outHeight, channels: 3 }
    });
    const bgPaddedBuffer = await bgImage
      .extend({
        top: padY,
        bottom: padY,
        left: padX,
        right: padX,
        extendWith: 'mirror'
      })
      .raw()
      .toBuffer();

    // Generate frames
    const totalFrames = Math.round(duration * fps);
    const tempDir = path.join('/tmp', `parallax_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    console.log(`[ParallaxGeneratorONNX] Generating ${totalFrames} frames...`);

    for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
      const t = frameIdx / Math.max(totalFrames - 1, 1);
      const eased = easeInOutSine(t);

      // Calculate offsets
      const bgOffsetX = Math.round(dx * bgSpeed * eased);
      const bgOffsetY = Math.round(dy * bgSpeed * eased);
      const fgOffsetX = Math.round(dx * fgSpeed * eased);
      const fgOffsetY = Math.round(dy * fgSpeed * eased);
      const currentZoom = zoomStart + (zoomEnd - zoomStart) * eased;

      // Extract background region
      const cropX = padX - bgOffsetX;
      const cropY = padY - bgOffsetY;

      const bgFrame = await sharpModule(Buffer.from(bgPaddedBuffer), {
        raw: { width: paddedWidth, height: paddedHeight, channels: 3 }
      })
        .extract({ left: cropX, top: cropY, width: outWidth, height: outHeight })
        .ensureAlpha()
        .raw()
        .toBuffer();

      // Create foreground with offset
      const fgFrame = Buffer.alloc(outWidth * outHeight * 4);
      for (let y = 0; y < outHeight; y++) {
        for (let x = 0; x < outWidth; x++) {
          const srcX = x - fgOffsetX;
          const srcY = y - fgOffsetY;

          if (srcX >= 0 && srcX < outWidth && srcY >= 0 && srcY < outHeight) {
            const srcIdx = (srcY * outWidth + srcX) * 4;
            const dstIdx = (y * outWidth + x) * 4;
            fgFrame[dstIdx] = fgBuffer[srcIdx];
            fgFrame[dstIdx + 1] = fgBuffer[srcIdx + 1];
            fgFrame[dstIdx + 2] = fgBuffer[srcIdx + 2];
            fgFrame[dstIdx + 3] = fgBuffer[srcIdx + 3];
          }
        }
      }

      // Composite foreground over background
      const frameData = Buffer.alloc(outWidth * outHeight * 3);
      for (let i = 0; i < outWidth * outHeight; i++) {
        const alpha = fgFrame[i * 4 + 3] / 255;
        frameData[i * 3] = Math.round(fgFrame[i * 4] * alpha + bgFrame[i * 4] * (1 - alpha));
        frameData[i * 3 + 1] = Math.round(fgFrame[i * 4 + 1] * alpha + bgFrame[i * 4 + 1] * (1 - alpha));
        frameData[i * 3 + 2] = Math.round(fgFrame[i * 4 + 2] * alpha + bgFrame[i * 4 + 2] * (1 - alpha));
      }

      // Apply zoom if needed
      let finalFrame = sharpModule(frameData, {
        raw: { width: outWidth, height: outHeight, channels: 3 }
      });

      if (currentZoom !== 1.0) {
        const zoomedWidth = Math.round(outWidth * currentZoom);
        const zoomedHeight = Math.round(outHeight * currentZoom);
        const cropLeft = Math.round((zoomedWidth - outWidth) / 2);
        const cropTop = Math.round((zoomedHeight - outHeight) / 2);

        finalFrame = finalFrame
          .resize(zoomedWidth, zoomedHeight)
          .extract({ left: cropLeft, top: cropTop, width: outWidth, height: outHeight });
      }

      // Save frame
      const framePath = path.join(tempDir, `frame_${String(frameIdx).padStart(5, '0')}.png`);
      await finalFrame.png().toFile(framePath);

      if (frameIdx % fps === 0) {
        console.log(`[ParallaxGeneratorONNX] Frame ${frameIdx}/${totalFrames}`);
      }
    }

    // Encode frames to video
    console.log('[ParallaxGeneratorONNX] Encoding video...');
    await encodeFramesToVideo(tempDir, outputPath, outWidth, outHeight, fps, duration);

    // Cleanup
    fs.rmSync(tempDir, { recursive: true, force: true });

    console.log(`[ParallaxGeneratorONNX] Video created: ${outputPath}`);
    return true;

  } catch (error) {
    console.error('[ParallaxGeneratorONNX] Error:', error);
    return false;
  }
}

/**
 * Get percentile value from array
 */
function getPercentile(arr: Float32Array, percentile: number): number {
  const sorted = Array.from(arr).sort((a, b) => a - b);
  const index = Math.floor((percentile / 100) * sorted.length);
  return sorted[index];
}

/**
 * Encode frames to video using FFmpeg
 */
async function encodeFramesToVideo(
  framesDir: string,
  outputPath: string,
  _width: number,
  _height: number,
  fps: number,
  duration: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const inputPattern = path.join(framesDir, 'frame_%05d.png');
    const command = createCommand(inputPattern);

    command
      .inputOptions([`-framerate ${fps}`])
      .outputOptions([
        `-t ${duration}`,
        '-pix_fmt yuv420p',
        '-c:v libx264',
        '-crf 18',
        '-preset medium',
        '-movflags +faststart',
      ])
      .format('mp4')
      .output(outputPath);

    command.on('error', (err: Error) => {
      console.error('[ParallaxGeneratorONNX] FFmpeg error:', err.message);
      reject(err);
    });

    command.on('end', () => {
      resolve();
    });

    command.run();
  });
}

/**
 * Check if ONNX parallax generation is available
 */
export async function isParallaxONNXAvailable(): Promise<boolean> {
  const sharpModule = await loadSharp();
  if (!sharpModule) return false;

  const onnxAvailable = await isONNXAvailable();
  return onnxAvailable;
}
