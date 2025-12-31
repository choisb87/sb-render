/**
 * ParallaxEngine - Creates parallax effects from static images using OpenCV
 * Uses depth estimation to create multi-layer parallax motion
 */
import * as cv from '@techstark/opencv-js';
import { createCanvas, loadImage, ImageData } from 'canvas';
import * as fs from 'fs';
import * as path from 'path';

export type ParallaxDirection = 'left' | 'right' | 'up' | 'down' | 'zoomIn' | 'zoomOut';
export type ParallaxIntensity = 'subtle' | 'normal' | 'dramatic';

export interface ParallaxConfig {
  direction: ParallaxDirection;
  intensity: ParallaxIntensity;
  layerCount?: number; // Number of depth layers (2-5), default 3
}

interface DepthLayer {
  mask: cv.Mat;
  depth: number; // 0 = background, 1 = foreground
}

/**
 * Wait for OpenCV to be ready
 */
async function waitForOpenCV(): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('OpenCV initialization timeout'));
    }, 30000);

    const checkReady = () => {
      if (cv.Mat) {
        clearTimeout(timeout);
        resolve();
      } else {
        setTimeout(checkReady, 100);
      }
    };
    checkReady();
  });
}

/**
 * Load image from file path using canvas
 */
async function loadImageToMat(imagePath: string): Promise<cv.Mat> {
  const img = await loadImage(imagePath);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const mat = cv.matFromImageData(imageData);
  return mat;
}

/**
 * Save Mat to file using canvas
 */
async function saveMatToFile(mat: cv.Mat, filePath: string): Promise<void> {
  const canvas = createCanvas(mat.cols, mat.rows);
  const ctx = canvas.getContext('2d');

  // Convert to RGBA if needed
  let rgba: cv.Mat;
  if (mat.channels() === 3) {
    rgba = new cv.Mat();
    cv.cvtColor(mat, rgba, cv.COLOR_BGR2RGBA);
  } else if (mat.channels() === 1) {
    rgba = new cv.Mat();
    cv.cvtColor(mat, rgba, cv.COLOR_GRAY2RGBA);
  } else {
    rgba = mat.clone();
  }

  const imageData = new ImageData(
    new Uint8ClampedArray(rgba.data),
    rgba.cols,
    rgba.rows
  );
  ctx.putImageData(imageData, 0, 0);

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(filePath, buffer);

  if (rgba !== mat) {
    rgba.delete();
  }
}

export class ParallaxEngine {
  private initialized = false;

  /**
   * Initialize OpenCV
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await waitForOpenCV();
    this.initialized = true;
    console.log('[ParallaxEngine] OpenCV initialized');
  }

  /**
   * Create depth map from image using edge detection and gradient analysis
   * Returns a grayscale image where brighter = closer (foreground)
   */
  private createDepthMap(src: cv.Mat): cv.Mat {
    // Convert to grayscale
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // 1. Edge detection - edges often indicate foreground objects
    const edges = new cv.Mat();
    cv.Canny(gray, edges, 50, 150);

    // 2. Dilate edges to create regions
    const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(15, 15));
    const dilatedEdges = new cv.Mat();
    cv.dilate(edges, dilatedEdges, kernel);
    kernel.delete();

    // 3. Create vertical gradient (assume bottom = closer)
    const verticalGradient = new cv.Mat(src.rows, src.cols, cv.CV_8UC1);
    for (let y = 0; y < src.rows; y++) {
      const value = Math.floor((y / src.rows) * 128) + 64; // 64-192 range
      for (let x = 0; x < src.cols; x++) {
        verticalGradient.ucharPtr(y, x)[0] = value;
      }
    }

    // 4. Blur for smoothness
    const blurredEdges = new cv.Mat();
    cv.GaussianBlur(dilatedEdges, blurredEdges, new cv.Size(31, 31), 0);

    // 5. Combine edge-based depth with vertical gradient
    const depthMap = new cv.Mat();
    cv.addWeighted(blurredEdges, 0.6, verticalGradient, 0.4, 0, depthMap);

    // 6. Normalize to 0-255 range
    cv.normalize(depthMap, depthMap, 0, 255, cv.NORM_MINMAX);

    // Cleanup
    gray.delete();
    edges.delete();
    dilatedEdges.delete();
    verticalGradient.delete();
    blurredEdges.delete();

    return depthMap;
  }

  /**
   * Create depth layers from depth map
   */
  private createDepthLayers(depthMap: cv.Mat, layerCount: number): DepthLayer[] {
    const layers: DepthLayer[] = [];
    const step = 256 / layerCount;

    for (let i = 0; i < layerCount; i++) {
      const minDepth = i * step;
      const maxDepth = (i + 1) * step;

      // Create mask for this depth range
      const lowerBound = new cv.Mat(depthMap.rows, depthMap.cols, cv.CV_8UC1, new cv.Scalar(minDepth));
      const upperBound = new cv.Mat(depthMap.rows, depthMap.cols, cv.CV_8UC1, new cv.Scalar(maxDepth));

      const mask = new cv.Mat();
      const mask1 = new cv.Mat();
      const mask2 = new cv.Mat();

      cv.compare(depthMap, lowerBound, mask1, cv.CMP_GE);
      cv.compare(depthMap, upperBound, mask2, cv.CMP_LT);
      cv.bitwise_and(mask1, mask2, mask);

      // Smooth the mask edges
      const smoothMask = new cv.Mat();
      cv.GaussianBlur(mask, smoothMask, new cv.Size(11, 11), 0);

      layers.push({
        mask: smoothMask,
        depth: i / (layerCount - 1), // 0 = background, 1 = foreground
      });

      lowerBound.delete();
      upperBound.delete();
      mask1.delete();
      mask2.delete();
      mask.delete();
    }

    return layers;
  }

  /**
   * Get motion multiplier based on intensity
   */
  private getIntensityMultiplier(intensity: ParallaxIntensity): number {
    switch (intensity) {
      case 'subtle': return 0.02;
      case 'normal': return 0.05;
      case 'dramatic': return 0.1;
      default: return 0.05;
    }
  }

  /**
   * Apply transformation to a layer based on direction and progress
   */
  private applyLayerTransform(
    src: cv.Mat,
    mask: cv.Mat,
    depth: number,
    direction: ParallaxDirection,
    progress: number, // 0 to 1
    intensityMultiplier: number,
  ): cv.Mat {
    // Deeper layers (background) move less, foreground moves more
    const motionScale = 0.3 + (depth * 0.7); // 0.3 for bg, 1.0 for fg
    const maxOffset = src.cols * intensityMultiplier * motionScale;

    let offsetX = 0;
    let offsetY = 0;
    let scale = 1.0;

    // Calculate offset based on direction
    // Progress goes from 0 to 1, we want motion from -max to +max
    const normalizedProgress = (progress - 0.5) * 2; // -1 to 1

    switch (direction) {
      case 'left':
        offsetX = normalizedProgress * maxOffset * -1;
        break;
      case 'right':
        offsetX = normalizedProgress * maxOffset;
        break;
      case 'up':
        offsetY = normalizedProgress * maxOffset * -1;
        break;
      case 'down':
        offsetY = normalizedProgress * maxOffset;
        break;
      case 'zoomIn':
        scale = 1 + (progress * intensityMultiplier * motionScale);
        break;
      case 'zoomOut':
        scale = 1 + ((1 - progress) * intensityMultiplier * motionScale);
        break;
    }

    // Create transformation matrix
    const centerX = src.cols / 2;
    const centerY = src.rows / 2;

    // For translation and scaling
    const M = cv.matFromArray(2, 3, cv.CV_64FC1, [
      scale, 0, offsetX + centerX * (1 - scale),
      0, scale, offsetY + centerY * (1 - scale),
    ]);

    const transformed = new cv.Mat();
    cv.warpAffine(src, transformed, M, new cv.Size(src.cols, src.rows), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
    M.delete();

    // Apply mask to get only this layer's contribution
    const result = new cv.Mat();

    // Convert mask to 4-channel for blending
    const mask4ch = new cv.Mat();
    const channels = new cv.MatVector();
    channels.push_back(mask);
    channels.push_back(mask);
    channels.push_back(mask);
    channels.push_back(mask);
    cv.merge(channels, mask4ch);
    channels.delete();

    // Apply mask
    cv.bitwise_and(transformed, mask4ch, result);

    transformed.delete();
    mask4ch.delete();

    return result;
  }

  /**
   * Generate a single parallax frame
   */
  async generateFrame(
    src: cv.Mat,
    depthLayers: DepthLayer[],
    config: ParallaxConfig,
    progress: number, // 0 to 1
  ): Promise<cv.Mat> {
    const intensityMultiplier = this.getIntensityMultiplier(config.intensity);

    // Start with black canvas
    const result = cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC4);

    // Process each layer from background to foreground
    for (const layer of depthLayers) {
      const layerResult = this.applyLayerTransform(
        src,
        layer.mask,
        layer.depth,
        config.direction,
        progress,
        intensityMultiplier,
      );

      // Blend this layer onto result
      // Use mask for alpha blending
      for (let y = 0; y < src.rows; y++) {
        for (let x = 0; x < src.cols; x++) {
          const alpha = layer.mask.ucharPtr(y, x)[0] / 255;
          if (alpha > 0.01) {
            const srcPixel = layerResult.ucharPtr(y, x);
            const dstPixel = result.ucharPtr(y, x);

            dstPixel[0] = Math.round(srcPixel[0] * alpha + dstPixel[0] * (1 - alpha));
            dstPixel[1] = Math.round(srcPixel[1] * alpha + dstPixel[1] * (1 - alpha));
            dstPixel[2] = Math.round(srcPixel[2] * alpha + dstPixel[2] * (1 - alpha));
            dstPixel[3] = 255;
          }
        }
      }

      layerResult.delete();
    }

    return result;
  }

  /**
   * Generate all parallax frames for an image
   * Returns array of frame file paths
   */
  async generateParallaxFrames(
    imagePath: string,
    outputDir: string,
    config: ParallaxConfig,
    duration: number, // seconds
    fps = 24,
  ): Promise<string[]> {
    await this.initialize();

    console.log(`[ParallaxEngine] Generating parallax frames: ${config.direction}, ${config.intensity}`);
    console.log(`[ParallaxEngine] Duration: ${duration}s, FPS: ${fps}`);

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Load image
    const src = await loadImageToMat(imagePath);
    console.log(`[ParallaxEngine] Loaded image: ${src.cols}x${src.rows}`);

    // Create depth map
    const depthMap = this.createDepthMap(src);
    console.log('[ParallaxEngine] Created depth map');

    // Create depth layers
    const layerCount = config.layerCount || 3;
    const depthLayers = this.createDepthLayers(depthMap, layerCount);
    console.log(`[ParallaxEngine] Created ${layerCount} depth layers`);

    // Generate frames
    const totalFrames = Math.ceil(duration * fps);
    const framePaths: string[] = [];

    for (let i = 0; i < totalFrames; i++) {
      const progress = i / (totalFrames - 1);
      const frame = await this.generateFrame(src, depthLayers, config, progress);

      const framePath = path.join(outputDir, `frame_${String(i).padStart(5, '0')}.png`);
      await saveMatToFile(frame, framePath);
      framePaths.push(framePath);
      frame.delete();

      if (i % 10 === 0) {
        console.log(`[ParallaxEngine] Generated frame ${i + 1}/${totalFrames}`);
      }
    }

    // Cleanup
    src.delete();
    depthMap.delete();
    for (const layer of depthLayers) {
      layer.mask.delete();
    }

    console.log(`[ParallaxEngine] Generated ${totalFrames} frames`);
    return framePaths;
  }

  /**
   * Create video from parallax frames using FFmpeg
   */
  async createVideoFromFrames(
    framePaths: string[],
    outputPath: string,
    fps = 24,
    videoCodec = 'libx264',
    quality = 'high',
    customCRF?: number,
  ): Promise<Buffer> {
    const { createCommand } = await import('../utils/ffmpeg-wrapper');

    // Get CRF value
    const crfMapping: Record<string, number> = {
      low: 28,
      medium: 23,
      high: 18,
    };
    const crf = customCRF || crfMapping[quality] || 18;

    // Create input pattern from frame directory
    const frameDir = path.dirname(framePaths[0]);
    const inputPattern = path.join(frameDir, 'frame_%05d.png');

    return new Promise((resolve, reject) => {
      const command = createCommand();

      command
        .input(inputPattern)
        .inputOptions([`-framerate ${fps}`])
        .videoCodec(videoCodec)
        .outputOptions([
          `-crf ${crf}`,
          '-preset medium',
          '-pix_fmt yuv420p',
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
        console.log('[ParallaxEngine] Video created successfully');
        const buffer = fs.readFileSync(outputPath);
        resolve(buffer);
      });

      command.run();
    });
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
    videoCodec = 'libx264',
    quality = 'high',
    customCRF?: number,
  ): Promise<Buffer> {
    // Create temp directory for frames
    const tempDir = path.join(path.dirname(outputPath), `parallax_frames_${Date.now()}`);

    try {
      // Generate frames
      const framePaths = await this.generateParallaxFrames(
        imagePath,
        tempDir,
        config,
        duration,
        fps,
      );

      // Create video from frames
      const videoBuffer = await this.createVideoFromFrames(
        framePaths,
        outputPath,
        fps,
        videoCodec,
        quality,
        customCRF,
      );

      return videoBuffer;
    } finally {
      // Cleanup temp directory
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  }
}

// Singleton instance
export const parallaxEngine = new ParallaxEngine();
