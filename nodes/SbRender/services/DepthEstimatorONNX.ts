/**
 * DepthEstimatorONNX - AI depth estimation using ONNX Runtime
 * Uses MiDaS model for monocular depth estimation
 * No Python required - runs entirely in Node.js
 */
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

// ONNX Runtime types
type InferenceSession = import('onnxruntime-node').InferenceSession;
type Tensor = import('onnxruntime-node').Tensor;

// MiDaS small model URL (from Hugging Face - julienkay/sentis-MiDaS)
// Model: midas_v21_small_256 - 66.4 MB, input 256x256
const MODEL_URL = 'https://huggingface.co/julienkay/sentis-MiDaS/resolve/main/onnx/midas_v21_small_256.onnx';
const MODEL_FILENAME = 'midas_v21_small_256.onnx';

// Model storage path - use n8n's data directory if available
function getModelDir(): string {
  // Try n8n data directory first
  const n8nDataDir = process.env.N8N_USER_FOLDER || '/home/node/.n8n';
  const modelDir = path.join(n8nDataDir, 'sb-render-models');

  // Fallback to temp directory
  if (!fs.existsSync(n8nDataDir)) {
    return path.join('/tmp', 'sb-render-models');
  }

  return modelDir;
}

let ort: typeof import('onnxruntime-node') | null = null;
let session: InferenceSession | null = null;
let initPromise: Promise<boolean> | null = null;

/**
 * Download file from URL (handles redirects including cross-host)
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  const maxRedirects = 10;
  let redirectCount = 0;

  const download = (requestUrl: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (redirectCount >= maxRedirects) {
        reject(new Error('Too many redirects'));
        return;
      }

      const protocol = requestUrl.startsWith('https') ? https : http;

      protocol.get(requestUrl, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            redirectCount++;
            console.log(`[DepthEstimatorONNX] Following redirect ${redirectCount}...`);
            // Consume the response body to free up the connection
            response.resume();
            download(redirectUrl).then(resolve).catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Download failed with status ${response.statusCode}`));
          return;
        }

        const file = fs.createWriteStream(destPath);
        const totalSize = parseInt(response.headers['content-length'] || '0', 10);
        let downloadedSize = 0;
        let lastPercent = -10;

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          if (totalSize > 0) {
            const percent = Math.round((downloadedSize / totalSize) * 100);
            if (percent >= lastPercent + 10) {
              console.log(`[DepthEstimatorONNX] Download progress: ${percent}% (${Math.round(downloadedSize / 1024 / 1024)}MB / ${Math.round(totalSize / 1024 / 1024)}MB)`);
              lastPercent = percent;
            }
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve();
        });

        file.on('error', (err) => {
          file.close();
          if (fs.existsSync(destPath)) {
            fs.unlinkSync(destPath);
          }
          reject(err);
        });
      }).on('error', (err) => {
        if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath);
        }
        reject(err);
      });
    });
  };

  return download(url);
}

/**
 * Initialize ONNX Runtime and load model
 */
async function initializeONNX(): Promise<boolean> {
  if (session !== null) return true;

  // Prevent multiple simultaneous initializations
  if (initPromise !== null) return initPromise;

  initPromise = (async () => {
    try {
      // Try to load ONNX Runtime
      ort = await import('onnxruntime-node');
      console.log('[DepthEstimatorONNX] ONNX Runtime loaded');

      // Check if model exists, download if not
      const modelDir = getModelDir();
      const modelPath = path.join(modelDir, MODEL_FILENAME);

      if (!fs.existsSync(modelPath)) {
        console.log('[DepthEstimatorONNX] Downloading MiDaS model...');

        // Create model directory
        if (!fs.existsSync(modelDir)) {
          fs.mkdirSync(modelDir, { recursive: true });
        }

        await downloadFile(MODEL_URL, modelPath);
        console.log('[DepthEstimatorONNX] Model downloaded successfully');
      }

      // Load the model
      console.log('[DepthEstimatorONNX] Loading model...');
      session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
      });

      console.log('[DepthEstimatorONNX] Model loaded successfully');
      return true;

    } catch (error) {
      console.error('[DepthEstimatorONNX] Initialization failed:', error);
      session = null;
      initPromise = null;
      return false;
    }
  })();

  return initPromise;
}


/**
 * Postprocess depth map output
 */
function postprocessDepth(output: Float32Array, outputWidth: number, outputHeight: number, targetWidth: number, targetHeight: number): Float32Array {
  const result = new Float32Array(targetWidth * targetHeight);

  // Resize depth map to target size
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const srcX = Math.floor((x / targetWidth) * outputWidth);
      const srcY = Math.floor((y / targetHeight) * outputHeight);
      const srcIdx = srcY * outputWidth + srcX;
      result[y * targetWidth + x] = output[srcIdx];
    }
  }

  // Normalize to 0-1 range
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < result.length; i++) {
    if (result[i] < min) min = result[i];
    if (result[i] > max) max = result[i];
  }

  const range = max - min || 1;
  for (let i = 0; i < result.length; i++) {
    result[i] = (result[i] - min) / range;
  }

  return result;
}

/**
 * Estimate depth from image using ONNX Runtime
 * @param imagePath Path to input image
 * @returns Depth map as Float32Array (normalized 0-1, higher = closer)
 */
export async function estimateDepthONNX(imagePath: string): Promise<{ depthMap: Float32Array; width: number; height: number } | null> {
  // Try to load sharp for image processing
  let sharp: typeof import('sharp');
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.error('[DepthEstimatorONNX] Sharp not available for image processing');
    return null;
  }

  // Initialize ONNX
  const initialized = await initializeONNX();
  if (!initialized || !session || !ort) {
    console.error('[DepthEstimatorONNX] ONNX not initialized');
    return null;
  }

  try {
    // Load and preprocess image
    const image = sharp(imagePath);
    const metadata = await image.metadata();
    const width = metadata.width || 512;
    const height = metadata.height || 512;

    // Resize to model input size and get raw RGB data
    // MiDaS v21 small uses 256x256 input
    const targetSize = 256;
    const resizedBuffer = await image
      .resize(targetSize, targetSize, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer();

    // Prepare input tensor - MiDaS expects normalized input
    const inputData = new Float32Array(3 * targetSize * targetSize);
    const mean = [0.485, 0.456, 0.406];
    const std = [0.229, 0.224, 0.225];

    for (let i = 0; i < targetSize * targetSize; i++) {
      for (let c = 0; c < 3; c++) {
        const value = resizedBuffer[i * 3 + c] / 255.0;
        const normalized = (value - mean[c]) / std[c];
        inputData[c * targetSize * targetSize + i] = normalized;
      }
    }

    // Create input tensor - MiDaS expects [1, 3, 256, 256]
    const inputTensor = new ort.Tensor('float32', inputData, [1, 3, targetSize, targetSize]);

    // Run inference
    console.log('[DepthEstimatorONNX] Running inference...');
    const feeds: Record<string, Tensor> = {};
    const inputNames = session.inputNames;
    feeds[inputNames[0]] = inputTensor;

    const results = await session.run(feeds);

    // Get output
    const outputNames = session.outputNames;
    const outputTensor = results[outputNames[0]];
    const outputData = outputTensor.data as Float32Array;

    // Get output dimensions
    const outputDims = outputTensor.dims;
    const outputHeight = outputDims[outputDims.length - 2] as number;
    const outputWidth = outputDims[outputDims.length - 1] as number;

    // Postprocess to original image size
    const depthMap = postprocessDepth(outputData, outputWidth, outputHeight, width, height);

    console.log(`[DepthEstimatorONNX] Depth estimation complete: ${width}x${height}`);

    return { depthMap, width, height };

  } catch (error) {
    console.error('[DepthEstimatorONNX] Inference failed:', error);
    return null;
  }
}

/**
 * Check if ONNX depth estimation is available
 */
export async function isONNXAvailable(): Promise<boolean> {
  try {
    // Try to import onnxruntime-node
    await import('onnxruntime-node');
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the path to the model file (for debugging)
 */
export function getModelPath(): string {
  const modelDir = getModelDir();
  return path.join(modelDir, MODEL_FILENAME);
}
