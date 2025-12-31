/**
 * ParallaxEngine - Creates parallax effects from static images
 * Uses FFmpeg filters and optional sharp for layer-based parallax motion
 *
 * Pure FFmpeg fallback ensures compatibility in all environments
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
    console.warn('[ParallaxEngine] Sharp not available, using FFmpeg-only mode');
    return false;
  }
}

/**
 * Get motion parameters based on intensity
 */
function getIntensityParams(intensity: ParallaxIntensity): {
  fgSpeed: number;
  bgSpeed: number;
  zoomAmount: number;
} {
  switch (intensity) {
    case 'subtle':
      return { fgSpeed: 0.03, bgSpeed: 0.01, zoomAmount: 0.03 };
    case 'normal':
      return { fgSpeed: 0.06, bgSpeed: 0.02, zoomAmount: 0.06 };
    case 'dramatic':
      return { fgSpeed: 0.12, bgSpeed: 0.04, zoomAmount: 0.10 };
    default:
      return { fgSpeed: 0.06, bgSpeed: 0.02, zoomAmount: 0.06 };
  }
}

/**
 * Generate pseudo-parallax using FFmpeg complex filter
 * Creates a 2.5D effect by applying different zoom/pan speeds to foreground vs background
 */
async function generateParallaxWithFFmpeg(
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

  // Calculate zoom and pan expressions based on direction
  let zoomExpr: string;
  let xExpr: string;
  let yExpr: string;

  // Base zoom that slightly increases over time for depth effect
  const baseZoom = 1.1;
  const zoomDelta = params.zoomAmount;

  switch (config.direction) {
    case 'left':
      // Pan left with subtle zoom - foreground moves faster
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
      // Zoom in with slight parallax offset
      zoomExpr = `${baseZoom}+${zoomDelta * 2}*on/${totalFrames}`;
      xExpr = `(iw-ow)/2`;
      yExpr = `(ih-oh)/2`;
      break;

    case 'zoomOut':
      // Zoom out with slight parallax offset
      zoomExpr = `${baseZoom + zoomDelta * 2}-${zoomDelta * 2}*on/${totalFrames}`;
      xExpr = `(iw-ow)/2`;
      yExpr = `(ih-oh)/2`;
      break;

    default:
      zoomExpr = `${baseZoom}`;
      xExpr = `(iw-ow)/2`;
      yExpr = `(ih-oh)/2`;
  }

  // Build zoompan filter with parallax-like motion
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
      console.log(`[ParallaxEngine] FFmpeg command: ${cmd}`);
    });

    command.on('error', (err: Error) => {
      console.error('[ParallaxEngine] FFmpeg error:', err.message);
      reject(err);
    });

    command.on('end', () => {
      console.log('[ParallaxEngine] Parallax video created');
      resolve();
    });

    command.run();
  });
}

/**
 * Generate multi-layer parallax using sharp for layer separation
 * Creates more realistic 3D effect with separate foreground/background motion
 */
async function generateMultiLayerParallax(
  imagePath: string,
  outputPath: string,
  config: ParallaxConfig,
  duration: number,
  fps: number,
  width: number,
  height: number,
): Promise<void> {
  if (!sharp) {
    throw new Error('Sharp not available for multi-layer parallax');
  }

  const params = getIntensityParams(config.intensity);
  const totalFrames = Math.ceil(duration * fps);
  const tempDir = path.join(path.dirname(outputPath), `parallax_temp_${Date.now()}`);

  try {
    fs.mkdirSync(tempDir, { recursive: true });

    // Load original image
    const image = sharp(imagePath);
    const metadata = await image.metadata();
    const imgWidth = metadata.width || width;
    const imgHeight = metadata.height || height;

    // Create gradient masks for foreground/background separation
    // Foreground: bottom portion (typically subject)
    // Background: top portion (typically sky/distant objects)

    const maskHeight = Math.floor(imgHeight * 0.4); // Top 40% is "background"

    // Create background layer (top portion with gradient fade)
    const bgGradient = Buffer.alloc(imgWidth * imgHeight);
    for (let y = 0; y < imgHeight; y++) {
      const alpha = y < maskHeight
        ? 255
        : Math.max(0, 255 - Math.floor((y - maskHeight) / (imgHeight - maskHeight) * 255));
      for (let x = 0; x < imgWidth; x++) {
        bgGradient[y * imgWidth + x] = alpha;
      }
    }

    // Create foreground layer (bottom portion with gradient fade)
    const fgGradient = Buffer.alloc(imgWidth * imgHeight);
    for (let y = 0; y < imgHeight; y++) {
      const alpha = y > imgHeight - maskHeight
        ? 255
        : Math.max(0, Math.floor(y / maskHeight * 255));
      for (let x = 0; x < imgWidth; x++) {
        fgGradient[y * imgWidth + x] = alpha;
      }
    }

    // Generate frames
    console.log(`[ParallaxEngine] Generating ${totalFrames} parallax frames...`);

    for (let frame = 0; frame < totalFrames; frame++) {
      const progress = frame / totalFrames;

      // Calculate offsets for each layer
      let bgOffsetX = 0, bgOffsetY = 0;
      let fgOffsetX = 0, fgOffsetY = 0;
      let bgZoom = 1.0, fgZoom = 1.0;

      const bgMove = params.bgSpeed * imgWidth * (progress - 0.5) * 2;
      const fgMove = params.fgSpeed * imgWidth * (progress - 0.5) * 2;

      switch (config.direction) {
        case 'left':
          bgOffsetX = Math.round(bgMove);
          fgOffsetX = Math.round(fgMove);
          break;
        case 'right':
          bgOffsetX = Math.round(-bgMove);
          fgOffsetX = Math.round(-fgMove);
          break;
        case 'up':
          bgOffsetY = Math.round(bgMove);
          fgOffsetY = Math.round(fgMove);
          break;
        case 'down':
          bgOffsetY = Math.round(-bgMove);
          fgOffsetY = Math.round(-fgMove);
          break;
        case 'zoomIn':
          bgZoom = 1 + params.bgSpeed * progress;
          fgZoom = 1 + params.fgSpeed * progress;
          break;
        case 'zoomOut':
          bgZoom = 1 + params.bgSpeed * (1 - progress);
          fgZoom = 1 + params.fgSpeed * (1 - progress);
          break;
      }

      // Generate background layer with offset
      const bgWidth = Math.round(imgWidth * bgZoom);
      const bgHeight = Math.round(imgHeight * bgZoom);
      const bgLayer = await sharp(imagePath)
        .resize(bgWidth, bgHeight, { fit: 'fill' })
        .extend({
          top: Math.max(0, -bgOffsetY),
          bottom: Math.max(0, bgOffsetY),
          left: Math.max(0, -bgOffsetX),
          right: Math.max(0, bgOffsetX),
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .extract({
          left: Math.max(0, bgOffsetX) + Math.floor((bgWidth - imgWidth) / 2),
          top: Math.max(0, bgOffsetY) + Math.floor((bgHeight - imgHeight) / 2),
          width: imgWidth,
          height: imgHeight,
        })
        .toBuffer();

      // Generate foreground layer with offset
      const fgWidth = Math.round(imgWidth * fgZoom);
      const fgHeight = Math.round(imgHeight * fgZoom);
      const fgLayer = await sharp(imagePath)
        .resize(fgWidth, fgHeight, { fit: 'fill' })
        .extend({
          top: Math.max(0, -fgOffsetY),
          bottom: Math.max(0, fgOffsetY),
          left: Math.max(0, -fgOffsetX),
          right: Math.max(0, fgOffsetX),
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .extract({
          left: Math.max(0, fgOffsetX) + Math.floor((fgWidth - imgWidth) / 2),
          top: Math.max(0, fgOffsetY) + Math.floor((fgHeight - imgHeight) / 2),
          width: imgWidth,
          height: imgHeight,
        })
        .toBuffer();

      // Composite layers
      const framePath = path.join(tempDir, `frame_${String(frame).padStart(5, '0')}.png`);
      await sharp(bgLayer)
        .composite([
          {
            input: fgLayer,
            blend: 'over',
          },
        ])
        .resize(width, height, { fit: 'fill' })
        .toFile(framePath);

      if (frame % Math.floor(totalFrames / 10) === 0) {
        console.log(`[ParallaxEngine] Frame ${frame + 1}/${totalFrames}`);
      }
    }

    // Combine frames into video
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

      command.on('error', (err: Error) => reject(err));
      command.on('end', () => resolve());
      command.run();
    });

  } finally {
    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

/**
 * Get image dimensions using FFprobe
 */
async function getImageDimensions(imagePath: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, _reject) => {
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
        // Default dimensions if probe fails
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

    console.log(`[ParallaxEngine] Initialized (sharp: ${this.sharpAvailable ? 'available' : 'not available'})`);
  }

  /**
   * Check if parallax effects are available
   */
  isAvailable(): boolean {
    return true; // Always available with FFmpeg fallback
  }

  /**
   * Check if multi-layer parallax is available (requires sharp)
   */
  isMultiLayerAvailable(): boolean {
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

    console.log(`[ParallaxEngine] Image size: ${width}x${height}`);

    try {
      // Try multi-layer parallax if sharp is available
      if (this.sharpAvailable && config.layerCount && config.layerCount > 1) {
        console.log('[ParallaxEngine] Using multi-layer mode');
        await generateMultiLayerParallax(
          imagePath,
          outputPath,
          config,
          duration,
          fps,
          width,
          height,
        );
      } else {
        // Use FFmpeg-only parallax
        console.log('[ParallaxEngine] Using FFmpeg-only mode');
        await generateParallaxWithFFmpeg(
          imagePath,
          outputPath,
          config,
          duration,
          fps,
          width,
          height,
        );
      }

      // Read and return the output
      const buffer = fs.readFileSync(outputPath);
      console.log(`[ParallaxEngine] Video created: ${buffer.length} bytes`);
      return buffer;

    } catch (error) {
      console.error('[ParallaxEngine] Error generating parallax:', error);
      throw error;
    }
  }

  /**
   * Legacy method for compatibility - generates frames and returns paths
   */
  async generateParallaxFrames(
    imagePath: string,
    outputDir: string,
    config: ParallaxConfig,
    duration: number,
    fps = 24,
  ): Promise<string[]> {
    // For compatibility, generate video and return single path
    const outputPath = path.join(outputDir, 'parallax_output.mp4');
    await this.generateParallaxVideo(imagePath, outputPath, config, duration, fps);
    return [outputPath];
  }
}

// Singleton instance
export const parallaxEngine = new ParallaxEngine();
