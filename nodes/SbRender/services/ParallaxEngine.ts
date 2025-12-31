/**
 * ParallaxEngine - Creates 2.5D parallax effects from static images
 * Separates foreground/background layers and moves them at different speeds
 *
 * Uses sharp for layer separation and compositing
 * Falls back to simple Ken Burns if sharp is not available
 */
import * as fs from 'fs';
import * as path from 'path';
import { createCommand, getFfprobePath } from '../utils/ffmpeg-wrapper';
import { spawn } from 'child_process';

export type ParallaxDirection = 'left' | 'right' | 'up' | 'down' | 'zoomIn' | 'zoomOut';
export type ParallaxIntensity = 'subtle' | 'normal' | 'dramatic';

export interface ParallaxConfig {
  direction: ParallaxDirection;
  intensity: ParallaxIntensity;
  layerCount?: number; // Number of depth layers (2-5), default 3
}

// Try to load sharp (optional dependency)
let sharp: typeof import('sharp') | null = null;

async function loadSharp(): Promise<boolean> {
  if (sharp !== null) return true;

  try {
    sharp = (await import('sharp')).default;
    console.log('[ParallaxEngine] Sharp loaded successfully');
    return true;
  } catch (error) {
    console.warn('[ParallaxEngine] Sharp not available:', (error as Error).message);
    return false;
  }
}

/**
 * Get motion parameters based on intensity
 */
function getIntensityParams(intensity: ParallaxIntensity): {
  fgSpeed: number;  // Foreground movement (closer = moves more)
  bgSpeed: number;  // Background movement (farther = moves less)
  scaleRange: number; // Scale variation for depth effect
} {
  switch (intensity) {
    case 'subtle':
      return { fgSpeed: 0.04, bgSpeed: 0.015, scaleRange: 0.02 };
    case 'normal':
      return { fgSpeed: 0.08, bgSpeed: 0.025, scaleRange: 0.04 };
    case 'dramatic':
      return { fgSpeed: 0.15, bgSpeed: 0.04, scaleRange: 0.08 };
    default:
      return { fgSpeed: 0.08, bgSpeed: 0.025, scaleRange: 0.04 };
  }
}

/**
 * Create a gradient mask for layer separation
 * Returns RGBA buffer where alpha determines visibility
 */
function createGradientMask(
  width: number,
  height: number,
  type: 'foreground' | 'background' | 'middle',
  layerIndex: number,
  totalLayers: number,
): Buffer {
  // Create RGBA buffer
  const buffer = Buffer.alloc(width * height * 4);

  // Calculate layer boundaries
  const layerHeight = height / totalLayers;
  const layerStart = (totalLayers - 1 - layerIndex) * layerHeight; // Reverse: top layers are background
  const layerEnd = layerStart + layerHeight;

  // Feather zone for smooth transitions
  const featherSize = layerHeight * 0.3;

  for (let y = 0; y < height; y++) {
    let alpha = 0;

    if (y >= layerStart && y < layerEnd) {
      // Inside layer
      alpha = 255;

      // Apply feathering at edges
      if (y < layerStart + featherSize) {
        alpha = Math.floor(((y - layerStart) / featherSize) * 255);
      } else if (y > layerEnd - featherSize) {
        alpha = Math.floor(((layerEnd - y) / featherSize) * 255);
      }
    } else if (y < layerStart && y > layerStart - featherSize) {
      // Fade in from above
      alpha = Math.floor(((layerStart - y) / featherSize) * 128);
    } else if (y >= layerEnd && y < layerEnd + featherSize) {
      // Fade out below
      alpha = Math.floor(((y - layerEnd) / featherSize) * 128);
    }

    // For foreground (bottom), extend fully to bottom
    if (type === 'foreground' && layerIndex === 0 && y >= layerStart) {
      alpha = 255;
    }

    // For background (top), extend fully to top
    if (type === 'background' && layerIndex === totalLayers - 1 && y <= layerEnd) {
      alpha = 255;
    }

    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      buffer[idx] = 255;     // R
      buffer[idx + 1] = 255; // G
      buffer[idx + 2] = 255; // B
      buffer[idx + 3] = alpha; // A
    }
  }

  return buffer;
}

/**
 * Generate true multi-layer parallax with actual layer separation
 */
async function generateLayeredParallax(
  imagePath: string,
  outputPath: string,
  config: ParallaxConfig,
  duration: number,
  fps: number,
  width: number,
  height: number,
): Promise<void> {
  if (!sharp) {
    throw new Error('Sharp not available for parallax');
  }

  const params = getIntensityParams(config.intensity);
  const totalFrames = Math.ceil(duration * fps);
  const numLayers = config.layerCount || 3;
  const tempDir = path.join(path.dirname(outputPath), `parallax_temp_${Date.now()}`);

  console.log(`[ParallaxEngine] Creating ${numLayers}-layer parallax effect`);
  console.log(`[ParallaxEngine] Direction: ${config.direction}, Intensity: ${config.intensity}`);

  try {
    fs.mkdirSync(tempDir, { recursive: true });

    // Load and prepare the source image
    const sourceBuffer = await sharp(imagePath)
      .resize(width, height, { fit: 'cover', position: 'center' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data: sourceData, info } = sourceBuffer;
    const imgWidth = info.width;
    const imgHeight = info.height;

    console.log(`[ParallaxEngine] Source image: ${imgWidth}x${imgHeight}`);

    // Pre-calculate layer masks
    const layerMasks: Buffer[] = [];
    for (let i = 0; i < numLayers; i++) {
      const type = i === 0 ? 'foreground' : i === numLayers - 1 ? 'background' : 'middle';
      layerMasks.push(createGradientMask(imgWidth, imgHeight, type, i, numLayers));
    }

    // Generate each frame
    console.log(`[ParallaxEngine] Generating ${totalFrames} frames...`);

    for (let frameNum = 0; frameNum < totalFrames; frameNum++) {
      // Progress from -1 to 1 (centered animation)
      const progress = ((frameNum / (totalFrames - 1)) - 0.5) * 2;

      // Start with a base canvas (slightly larger for movement headroom)
      const canvasWidth = Math.floor(imgWidth * 1.2);
      const canvasHeight = Math.floor(imgHeight * 1.2);

      // Create composites array for all layers
      const composites: Array<{
        input: Buffer;
        raw: { width: number; height: number; channels: 4 };
        left: number;
        top: number;
        blend: 'over';
      }> = [];

      // Process each layer (background to foreground)
      for (let layerIdx = numLayers - 1; layerIdx >= 0; layerIdx--) {
        // Calculate movement for this layer
        // Background layers (higher index) move less, foreground layers move more
        const depthFactor = layerIdx / (numLayers - 1); // 0 = foreground, 1 = background
        const layerSpeed = params.bgSpeed + (params.fgSpeed - params.bgSpeed) * (1 - depthFactor);

        let offsetX = 0;
        let offsetY = 0;
        let scale = 1.0;

        switch (config.direction) {
          case 'left':
            offsetX = Math.round(progress * layerSpeed * imgWidth);
            break;
          case 'right':
            offsetX = Math.round(-progress * layerSpeed * imgWidth);
            break;
          case 'up':
            offsetY = Math.round(progress * layerSpeed * imgHeight);
            break;
          case 'down':
            offsetY = Math.round(-progress * layerSpeed * imgHeight);
            break;
          case 'zoomIn':
            scale = 1 + (progress + 1) * params.scaleRange * (1 - depthFactor * 0.5);
            break;
          case 'zoomOut':
            scale = 1 + (1 - progress) * params.scaleRange * (1 - depthFactor * 0.5);
            break;
        }

        // Apply mask to source image to create this layer
        const mask = layerMasks[layerIdx];
        const layerData = Buffer.alloc(imgWidth * imgHeight * 4);

        for (let i = 0; i < imgWidth * imgHeight; i++) {
          const srcIdx = i * 4;
          const maskAlpha = mask[srcIdx + 3];

          layerData[srcIdx] = sourceData[srcIdx];         // R
          layerData[srcIdx + 1] = sourceData[srcIdx + 1]; // G
          layerData[srcIdx + 2] = sourceData[srcIdx + 2]; // B
          layerData[srcIdx + 3] = maskAlpha;              // A from mask
        }

        // Create the layer image with transformations
        let layerImage = sharp(layerData, {
          raw: { width: imgWidth, height: imgHeight, channels: 4 },
        });

        // Apply scale if needed
        if (scale !== 1.0) {
          const scaledWidth = Math.round(imgWidth * scale);
          const scaledHeight = Math.round(imgHeight * scale);
          layerImage = layerImage.resize(scaledWidth, scaledHeight, { fit: 'fill' });

          // Extract center portion back to original size
          const cropX = Math.floor((scaledWidth - imgWidth) / 2);
          const cropY = Math.floor((scaledHeight - imgHeight) / 2);
          layerImage = layerImage.extract({
            left: Math.max(0, cropX),
            top: Math.max(0, cropY),
            width: Math.min(imgWidth, scaledWidth),
            height: Math.min(imgHeight, scaledHeight),
          });
        }

        const layerBuffer = await layerImage.ensureAlpha().raw().toBuffer();

        // Calculate position on canvas
        const baseX = Math.floor((canvasWidth - imgWidth) / 2);
        const baseY = Math.floor((canvasHeight - imgHeight) / 2);

        composites.push({
          input: layerBuffer,
          raw: { width: imgWidth, height: imgHeight, channels: 4 },
          left: baseX + offsetX,
          top: baseY + offsetY,
          blend: 'over',
        });
      }

      // Create the final frame by compositing all layers
      let frame = sharp({
        create: {
          width: canvasWidth,
          height: canvasHeight,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 255 },
        },
      });

      // Add each layer
      for (const comp of composites) {
        frame = sharp(await frame.png().toBuffer()).composite([{
          input: comp.input,
          raw: comp.raw,
          left: comp.left,
          top: comp.top,
          blend: comp.blend,
        }]);
      }

      // Extract the center portion at original size
      const cropX = Math.floor((canvasWidth - imgWidth) / 2);
      const cropY = Math.floor((canvasHeight - imgHeight) / 2);

      const framePath = path.join(tempDir, `frame_${String(frameNum).padStart(5, '0')}.png`);
      await frame
        .extract({ left: cropX, top: cropY, width: imgWidth, height: imgHeight })
        .png()
        .toFile(framePath);

      if (frameNum % Math.max(1, Math.floor(totalFrames / 10)) === 0) {
        console.log(`[ParallaxEngine] Frame ${frameNum + 1}/${totalFrames}`);
      }
    }

    // Combine frames into video using FFmpeg
    console.log('[ParallaxEngine] Combining frames into video...');
    const inputPattern = path.join(tempDir, 'frame_%05d.png');

    await new Promise<void>((resolve, reject) => {
      const command = createCommand();

      command
        .input(inputPattern)
        .inputOptions([`-framerate ${fps}`])
        .outputOptions([
          '-c:v libx264',
          '-crf 18',
          '-preset medium',
          '-pix_fmt yuv420p',
          '-movflags +faststart',
        ])
        .format('mp4')
        .output(outputPath);

      command.on('start', (cmd: string) => {
        console.log(`[ParallaxEngine] FFmpeg: ${cmd}`);
      });

      command.on('error', (err: Error) => reject(err));
      command.on('end', () => resolve());
      command.run();
    });

    console.log('[ParallaxEngine] Parallax video created successfully');

  } finally {
    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

/**
 * Fallback: Simple Ken Burns effect using FFmpeg zoompan
 * Used when sharp is not available
 */
async function generateSimpleKenBurns(
  imagePath: string,
  outputPath: string,
  config: ParallaxConfig,
  duration: number,
  fps: number,
  width: number,
  height: number,
): Promise<void> {
  const params = getIntensityParams(config.intensity);
  const totalFrames = Math.ceil(duration * fps);

  let zoomExpr: string;
  let xExpr: string;
  let yExpr: string;

  const baseZoom = 1.15;
  const zoomDelta = params.scaleRange;

  switch (config.direction) {
    case 'left':
      zoomExpr = `${baseZoom}+${zoomDelta}*on/${totalFrames}`;
      xExpr = `(iw-ow)/2-${params.fgSpeed}*iw*on/${totalFrames}`;
      yExpr = `(ih-oh)/2`;
      break;
    case 'right':
      zoomExpr = `${baseZoom}+${zoomDelta}*on/${totalFrames}`;
      xExpr = `(iw-ow)/2+${params.fgSpeed}*iw*on/${totalFrames}`;
      yExpr = `(ih-oh)/2`;
      break;
    case 'up':
      zoomExpr = `${baseZoom}+${zoomDelta}*on/${totalFrames}`;
      xExpr = `(iw-ow)/2`;
      yExpr = `(ih-oh)/2-${params.fgSpeed}*ih*on/${totalFrames}`;
      break;
    case 'down':
      zoomExpr = `${baseZoom}+${zoomDelta}*on/${totalFrames}`;
      xExpr = `(iw-ow)/2`;
      yExpr = `(ih-oh)/2+${params.fgSpeed}*ih*on/${totalFrames}`;
      break;
    case 'zoomIn':
      zoomExpr = `${baseZoom}+${zoomDelta * 3}*on/${totalFrames}`;
      xExpr = `(iw-ow)/2`;
      yExpr = `(ih-oh)/2`;
      break;
    case 'zoomOut':
      zoomExpr = `${baseZoom + zoomDelta * 3}-${zoomDelta * 3}*on/${totalFrames}`;
      xExpr = `(iw-ow)/2`;
      yExpr = `(ih-oh)/2`;
      break;
    default:
      zoomExpr = `${baseZoom}`;
      xExpr = `(iw-ow)/2`;
      yExpr = `(ih-oh)/2`;
  }

  const zoompanFilter = `zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${totalFrames}:s=${width}x${height}:fps=${fps}`;

  return new Promise((resolve, reject) => {
    const command = createCommand(imagePath);

    command
      .inputOptions(['-loop 1'])
      .videoFilters([zoompanFilter])
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

    command.on('start', (cmd: string) => {
      console.log(`[ParallaxEngine] FFmpeg: ${cmd}`);
    });

    command.on('error', (err: Error) => {
      console.error('[ParallaxEngine] FFmpeg error:', err.message);
      reject(err);
    });

    command.on('end', () => {
      console.log('[ParallaxEngine] Ken Burns fallback video created');
      resolve();
    });

    command.run();
  });
}

/**
 * Get image dimensions using FFprobe
 */
async function getImageDimensions(imagePath: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const probePath = getFfprobePath();
    const proc = spawn(probePath, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'json',
      imagePath,
    ]);

    let stdout = '';
    proc.stdout.on('data', (data) => { stdout += data.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve({ width: 1920, height: 1080 });
        return;
      }

      try {
        const data = JSON.parse(stdout);
        const stream = data.streams?.[0];
        resolve({
          width: stream?.width || 1920,
          height: stream?.height || 1080,
        });
      } catch {
        resolve({ width: 1920, height: 1080 });
      }
    });

    proc.on('error', () => {
      resolve({ width: 1920, height: 1080 });
    });
  });
}

export class ParallaxEngine {
  private sharpAvailable = false;
  private initialized = false;

  /**
   * Initialize the engine and check for available dependencies
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.sharpAvailable = await loadSharp();
    this.initialized = true;

    console.log(`[ParallaxEngine] Initialized (sharp: ${this.sharpAvailable ? 'YES - Multi-layer parallax enabled' : 'NO - Using Ken Burns fallback'})`);
  }

  /**
   * Check if true parallax (layer separation) is available
   */
  isLayerParallaxAvailable(): boolean {
    return this.sharpAvailable;
  }

  /**
   * Generate parallax video from a single image
   * Main entry point for creating parallax effect videos
   */
  async generateParallaxVideo(
    imagePath: string,
    outputPath: string,
    config: ParallaxConfig,
    duration: number,
    fps = 24,
    _videoCodec = 'libx264',
    _quality = 'high',
    _customCRF?: number,
  ): Promise<Buffer> {
    await this.initialize();

    console.log(`[ParallaxEngine] Generating parallax: ${config.direction}, ${config.intensity}`);
    console.log(`[ParallaxEngine] Duration: ${duration}s, FPS: ${fps}`);

    // Get image dimensions
    const dimensions = await getImageDimensions(imagePath);
    const width = Math.floor(dimensions.width / 2) * 2; // Ensure even
    const height = Math.floor(dimensions.height / 2) * 2;

    console.log(`[ParallaxEngine] Output size: ${width}x${height}`);

    try {
      if (this.sharpAvailable) {
        // Use true multi-layer parallax
        console.log('[ParallaxEngine] Using multi-layer parallax mode');
        await generateLayeredParallax(
          imagePath,
          outputPath,
          { ...config, layerCount: config.layerCount || 3 },
          duration,
          fps,
          width,
          height,
        );
      } else {
        // Fallback to simple Ken Burns
        console.log('[ParallaxEngine] Using Ken Burns fallback (sharp not available)');
        await generateSimpleKenBurns(
          imagePath,
          outputPath,
          config,
          duration,
          fps,
          width,
          height,
        );
      }

      const buffer = fs.readFileSync(outputPath);
      console.log(`[ParallaxEngine] Video created: ${buffer.length} bytes`);
      return buffer;

    } catch (error) {
      console.error('[ParallaxEngine] Error generating parallax:', error);
      throw error;
    }
  }

  /**
   * Legacy method for compatibility
   */
  async generateParallaxFrames(
    imagePath: string,
    outputDir: string,
    config: ParallaxConfig,
    duration: number,
    fps = 24,
  ): Promise<string[]> {
    const outputPath = path.join(outputDir, 'parallax_output.mp4');
    await this.generateParallaxVideo(imagePath, outputPath, config, duration, fps);
    return [outputPath];
  }
}

// Singleton instance
export const parallaxEngine = new ParallaxEngine();
