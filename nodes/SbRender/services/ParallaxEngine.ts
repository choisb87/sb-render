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
import { spawn, execSync } from 'child_process';

// Path to the depth parallax Python script
// In compiled code, __dirname is dist/nodes/SbRender/services/
// Script is at project_root/scripts/depth_parallax.py
const DEPTH_SCRIPT_PATH = path.join(__dirname, '../../../../scripts/depth_parallax.py');

// Check if Python depth estimation is available
let pythonDepthAvailable: boolean | null = null;

async function checkPythonDepth(): Promise<boolean> {
  if (pythonDepthAvailable !== null) return pythonDepthAvailable;

  try {
    // Check if Python and required packages are available
    execSync('python3 -c "import torch; import transformers"', { stdio: 'pipe' });
    if (fs.existsSync(DEPTH_SCRIPT_PATH)) {
      pythonDepthAvailable = true;
      console.log('[ParallaxEngine] Python depth estimation available');
    } else {
      pythonDepthAvailable = false;
      console.log('[ParallaxEngine] Depth script not found:', DEPTH_SCRIPT_PATH);
    }
  } catch {
    pythonDepthAvailable = false;
    console.log('[ParallaxEngine] Python depth estimation not available (missing torch/transformers)');
  }

  return pythonDepthAvailable;
}

/**
 * Generate parallax using AI depth estimation (Python + Depth Anything)
 * Creates true layer separation based on depth map
 */
async function generateDepthParallax(
  imagePath: string,
  outputPath: string,
  config: ParallaxConfig,
  duration: number,
  fps: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const options = JSON.stringify({
      direction: config.direction,
      intensity: config.intensity,
      duration,
      fps,
      layerCount: config.layerCount || 3,
      zoom: config.zoom || 'none',
    });

    console.log(`[ParallaxEngine] Running depth estimation: python3 ${DEPTH_SCRIPT_PATH}`);

    const proc = spawn('python3', [DEPTH_SCRIPT_PATH, imagePath, outputPath, options], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      // Log progress messages
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          console.log(`[DepthParallax] ${line.trim()}`);
        }
      }
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error('[ParallaxEngine] Depth parallax failed:', stderr);
        reject(new Error(`Depth parallax failed with code ${code}: ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        if (result.success) {
          console.log('[ParallaxEngine] Depth parallax completed successfully');
          resolve();
        } else {
          reject(new Error(result.error || 'Unknown error'));
        }
      } catch {
        // If no JSON output, assume success if file exists
        if (fs.existsSync(outputPath)) {
          resolve();
        } else {
          reject(new Error('Depth parallax failed: no output file'));
        }
      }
    });

    proc.on('error', (err) => {
      console.error('[ParallaxEngine] Failed to spawn Python process:', err);
      reject(err);
    });
  });
}

export type ParallaxDirection = 'left' | 'right' | 'up' | 'down' | 'zoomIn' | 'zoomOut';
export type ParallaxIntensity = 'subtle' | 'normal' | 'dramatic';
export type ParallaxZoom = 'none' | 'in' | 'out';

export interface ParallaxConfig {
  direction: ParallaxDirection;
  intensity: ParallaxIntensity;
  layerCount?: number; // Number of depth layers (2-5), default 3
  zoom?: ParallaxZoom; // Combined zoom effect: 'none', 'in', 'out'
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
 * Ken Burns effect using zoompan with optimized settings
 * Uses higher zoom and stronger movement for visible parallax
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
  const totalFrames = Math.ceil(duration * fps);

  // Movement intensity - increased for more visible effect
  const intensityMultiplier = config.intensity === 'subtle' ? 0.7 :
                              config.intensity === 'dramatic' ? 1.6 : 1.0;

  // Higher base zoom for smoother subpixel movement
  const baseZoom = 1.3;
  // Stronger zoom change
  const zoomDelta = 0.12 * intensityMultiplier;
  // Stronger pan movement (percentage of available space)
  const panSpeed = 0.15 * intensityMultiplier;

  let zoomExpr: string;
  let xExpr: string;
  let yExpr: string;

  // Smooth easing using sine function for natural movement
  // on = frame number, goes from 0 to totalFrames
  // Using smooth start/end with sine easing
  const progress = `on/${totalFrames}`;
  const easeInOut = `(1-cos(${progress}*PI))/2`;

  switch (config.direction) {
    case 'left':
      // Pan from right to left
      zoomExpr = `${baseZoom}+${zoomDelta}*${progress}`;
      xExpr = `(iw-ow)/2*(1+${panSpeed})-${panSpeed}*(iw-ow)/2*${easeInOut}*2`;
      yExpr = `(ih-oh)/2`;
      break;
    case 'right':
      // Pan from left to right
      zoomExpr = `${baseZoom}+${zoomDelta}*${progress}`;
      xExpr = `(iw-ow)/2*(1-${panSpeed})+${panSpeed}*(iw-ow)/2*${easeInOut}*2`;
      yExpr = `(ih-oh)/2`;
      break;
    case 'up':
      // Pan from bottom to top
      zoomExpr = `${baseZoom}+${zoomDelta}*${progress}`;
      xExpr = `(iw-ow)/2`;
      yExpr = `(ih-oh)/2*(1+${panSpeed})-${panSpeed}*(ih-oh)/2*${easeInOut}*2`;
      break;
    case 'down':
      // Pan from top to bottom
      zoomExpr = `${baseZoom}+${zoomDelta}*${progress}`;
      xExpr = `(iw-ow)/2`;
      yExpr = `(ih-oh)/2*(1-${panSpeed})+${panSpeed}*(ih-oh)/2*${easeInOut}*2`;
      break;
    case 'zoomIn':
      zoomExpr = `${baseZoom}+${zoomDelta * 2.5}*${easeInOut}`;
      xExpr = `(iw-ow)/2`;
      yExpr = `(ih-oh)/2`;
      break;
    case 'zoomOut':
      zoomExpr = `${baseZoom + zoomDelta * 2.5}-${zoomDelta * 2.5}*${easeInOut}`;
      xExpr = `(iw-ow)/2`;
      yExpr = `(ih-oh)/2`;
      break;
    default:
      zoomExpr = `${baseZoom}`;
      xExpr = `(iw-ow)/2`;
      yExpr = `(ih-oh)/2`;
  }

  // zoompan filter with smooth interpolation
  const filterChain = `zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${totalFrames}:s=${width}x${height}:fps=${fps}`;

  return new Promise((resolve, reject) => {
    const command = createCommand(imagePath);

    command
      .inputOptions(['-loop 1'])
      .videoFilters([filterChain])
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
   * Uses AI depth estimation for true parallax, falls back to Ken Burns
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

    // Check if Python depth estimation is available
    const depthAvailable = await checkPythonDepth();

    try {
      if (depthAvailable) {
        // Use AI depth-based parallax for true layer separation
        console.log('[ParallaxEngine] Using AI depth-based parallax (Depth Anything V2)');
        await generateDepthParallax(
          imagePath,
          outputPath,
          config,
          duration,
          fps,
        );
      } else {
        // Fall back to Ken Burns effect
        console.log('[ParallaxEngine] Using Ken Burns effect (depth estimation not available)');
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

      // If depth parallax failed, try Ken Burns as fallback
      if (depthAvailable) {
        console.log('[ParallaxEngine] Depth parallax failed, falling back to Ken Burns');
        try {
          await generateSimpleKenBurns(
            imagePath,
            outputPath,
            config,
            duration,
            fps,
            width,
            height,
          );
          const buffer = fs.readFileSync(outputPath);
          return buffer;
        } catch (fallbackError) {
          console.error('[ParallaxEngine] Ken Burns fallback also failed:', fallbackError);
          throw fallbackError;
        }
      }

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
