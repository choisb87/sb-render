import { promises as fs, appendFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { execSync } from 'child_process';
import ffmpeg from 'fluent-ffmpeg';
import type { IVideoComposer, IVideoMetadata, ISbRenderNodeParams } from '../interfaces';

// Debug mode: set SB_RENDER_DEBUG=true to enable file-based debug logging
const DEBUG_MODE = process.env.SB_RENDER_DEBUG === 'true';
const DEBUG_LOG_PATH = '/tmp/sb-render-debug.log';

// Helper function for debug logging
function debugLog(message: string): void {
  if (DEBUG_MODE) {
    const timestamp = new Date().toISOString();
    appendFileSync(DEBUG_LOG_PATH, `${timestamp} ${message}\n`);
  }
}

/**
 * Check if a command is available in the system
 */
function isCommandAvailable(command: string): boolean {
  try {
    execSync(`which ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Fix permissions for npm-installed binaries
 */
function fixBinaryPermissions(binaryPath: string): boolean {
  try {
    if (existsSync(binaryPath)) {
      execSync(`chmod +x "${binaryPath}"`, { stdio: 'ignore' });
      return true;
    }
  } catch (error) {
    debugLog(`[VideoComposer] Failed to fix permissions for ${binaryPath}: ${error}`);
  }
  return false;
}

// Set FFmpeg and FFprobe paths with intelligent fallback strategy
// Priority: 1. System binaries (most reliable in Docker)
//           2. npm packages with permission fix
//           3. Graceful degradation
try {
  let ffmpegPath: string | undefined;
  let ffprobePath: string | undefined;

  // STRATEGY 1: Try system binaries first (best for Docker/n8n)
  if (isCommandAvailable('ffmpeg')) {
    ffmpegPath = 'ffmpeg';
    console.log('[VideoComposer] ✅ Using system ffmpeg');
    debugLog('[VideoComposer] Using system ffmpeg');
  }

  if (isCommandAvailable('ffprobe')) {
    ffprobePath = 'ffprobe';
    console.log('[VideoComposer] ✅ Using system ffprobe');
    debugLog('[VideoComposer] Using system ffprobe');
  }

  // STRATEGY 2: Try npm-installed binaries if system binaries not available
  if (!ffmpegPath || !ffprobePath) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ffprobeInstaller = require('@ffprobe-installer/ffprobe');

      if (!ffmpegPath && ffmpegInstaller.path) {
        if (existsSync(ffmpegInstaller.path)) {
          // Try to fix permissions
          fixBinaryPermissions(ffmpegInstaller.path);
          ffmpegPath = ffmpegInstaller.path;
          console.log(`[VideoComposer] ✅ Using npm ffmpeg: ${ffmpegPath}`);
          debugLog(`[VideoComposer] Using npm ffmpeg: ${ffmpegPath}`);
        }
      }

      if (!ffprobePath && ffprobeInstaller.path) {
        if (existsSync(ffprobeInstaller.path)) {
          // Try to fix permissions
          fixBinaryPermissions(ffprobeInstaller.path);
          ffprobePath = ffprobeInstaller.path;
          console.log(`[VideoComposer] ✅ Using npm ffprobe: ${ffprobePath}`);
          debugLog(`[VideoComposer] Using npm ffprobe: ${ffprobePath}`);
        }
      }
    } catch (npmError) {
      console.warn('[VideoComposer] npm ffmpeg/ffprobe packages not available:', npmError);
      debugLog(`[VideoComposer] npm packages unavailable: ${npmError}`);
    }
  }

  // Set the paths in fluent-ffmpeg
  if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
  } else {
    console.error('[VideoComposer] ⚠️  No FFmpeg found - video operations will fail');
    debugLog('[VideoComposer] No FFmpeg available');
  }

  if (ffprobePath) {
    ffmpeg.setFfprobePath(ffprobePath);
  } else {
    console.warn('[VideoComposer] ⚠️  No FFprobe found - metadata detection will be limited');
    debugLog('[VideoComposer] No FFprobe available - will use fallback metadata');
  }

  // Log final configuration
  console.log('[VideoComposer] 🎬 FFmpeg configuration complete');
  debugLog(`[VideoComposer] Final config - FFmpeg: ${ffmpegPath || 'none'}, FFprobe: ${ffprobePath || 'none'}`);
} catch (error) {
  console.error('[VideoComposer] ⚠️  Failed to initialize FFmpeg/FFprobe:', error);
  debugLog(`[VideoComposer] Initialization error: ${error}`);
}

/**
 * VideoComposer Service
 * Handles final video composition with audio and subtitles
 */
export class VideoComposer implements IVideoComposer {
  /**
   * Compose final video with audio and subtitles
   */
  async compose(
    videoPath: string,
    audioPath: string | null,
    subtitlePath: string | null,
    outputPath: string,
    config: ISbRenderNodeParams,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const command = ffmpeg(videoPath);

        // Add audio inputs if present
        if (audioPath) {
          // Audio is already mixed, we'll map it
        }

        // Video filters
        const videoFilters: string[] = [];

        // Add subtitle overlay if present
        if (subtitlePath) {
          // Escape paths for FFmpeg filter
          const escapedPath = subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:');
          // __dirname is dist/nodes/SbRender/services, go up 4 levels to package root
          const fontsDir = join(dirname(dirname(dirname(dirname(__dirname)))), 'fonts');
          const escapedFontsDir = fontsDir.replace(/\\/g, '/').replace(/:/g, '\\:');
          videoFilters.push(`ass=${escapedPath}:fontsdir=${escapedFontsDir}`);
        }

        // Apply video filters if any
        if (videoFilters.length > 0) {
          command.videoFilters(videoFilters);
        }

        // Set output codec and quality
        const crf = this.getCRF(config.quality || 'high', config.customCRF);

        // Map video and audio streams
        const outputOptions = [
          '-map 0:v',  // Map video from input
          `-crf ${crf}`,
          '-preset medium',
          '-movflags +faststart', // Enable streaming
        ];

        // Add audio mapping if input has audio
        if (audioPath) {
          // Already mixed audio - this path shouldn't be used with subtitles only
          outputOptions.splice(1, 0, '-map 0:a');
        } else {
          // Check if original video has audio and map it
          // When adding subtitles only, preserve original audio
          outputOptions.splice(1, 0, '-map 0:a?');  // ? makes it optional
        }

        command
          .videoCodec(config.videoCodec || 'libx264')
          .outputOptions(outputOptions);

        // Audio codec - always set for videos with audio
        command
          .audioCodec('aac')
          .audioBitrate('192k');

        // Set output format
        command.format(config.outputFormat || 'mp4');

        // Save to output path
        command.output(outputPath);

        // Handle events
        command.on('start', (commandLine: string) => {
          console.log('FFmpeg command:', commandLine);
        });

        command.on('progress', (progress: { percent?: number }) => {
          if (progress.percent) {
            console.log(`Processing: ${Math.round(progress.percent)}% done`);
          }
        });

        command.on('end', async () => {
          try {
            // Read the output file
            const buffer = await fs.readFile(outputPath);
            resolve(buffer);
          } catch (error) {
            reject(new Error(`Failed to read output file: ${error}`));
          }
        });

        command.on('error', (error: Error) => {
          reject(new Error(`FFmpeg error: ${error.message}`));
        });

        // Run the command
        command.run();
      } catch (error) {
        reject(new Error(`Video composition failed: ${error}`));
      }
    });
  }

  /**
   * Compose with complex audio mixing
   */
  async composeWithAudioMix(
    videoPath: string,
    bgmPath: string | null,
    narrationPath: string | null,
    subtitlePath: string | null,
    audioFilterChain: string,
    outputPath: string,
    config: ISbRenderNodeParams,
  ): Promise<Buffer> {
    // Get video duration with better error handling for n8n
    let videoMetadata: IVideoMetadata;
    try {
      videoMetadata = await this.getVideoMetadata(videoPath);
      console.log(`[ComposeAudioMix] Video metadata: duration=${videoMetadata.duration}s, hasAudio=${videoMetadata.hasAudio}`);
      debugLog(`[ComposeAudioMix] Video metadata: ${JSON.stringify(videoMetadata)}`);
    } catch (error) {
      console.warn('[ComposeAudioMix] Failed to get video metadata, using fallback duration detection');
      debugLog(`[ComposeAudioMix] Metadata detection failed: ${error}`);
      
      // Fallback: Use ffprobe directly on video to get duration
      try {
        const fallbackDuration = await this.getFallbackDuration(videoPath);
        videoMetadata = {
          duration: fallbackDuration,
          width: 1920,
          height: 1080,
          hasAudio: true, // Assume audio exists in n8n to preserve it
          videoCodec: 'unknown'
        };
        console.log(`[ComposeAudioMix] Using fallback duration: ${fallbackDuration}s`);
      } catch (fallbackError) {
        console.warn('[ComposeAudioMix] Fallback duration detection also failed, using 30s default');
        videoMetadata = {
          duration: 30, // Conservative default for multiple merged videos
          width: 1920,
          height: 1080,
          hasAudio: true,
          videoCodec: 'unknown'
        };
      }
    }

    const videoDuration = videoMetadata.duration;

    // Get BGM duration if exists
    let bgmDuration = 0;
    if (bgmPath) {
      try {
        bgmDuration = await this.getAudioDuration(bgmPath);
        console.log(`[ComposeAudioMix] BGM duration: ${bgmDuration}s, video duration: ${videoDuration}s`);
        debugLog(`[ComposeAudioMix] BGM duration: ${bgmDuration}s`);
      } catch (error) {
        console.warn('Failed to get BGM duration:', error);
        bgmDuration = 180; // Default 3 minutes
      }
    }

    // Get narration duration if exists
    let narrationDuration = 0;
    if (narrationPath) {
      try {
        const narrationMetadata = await this.getAudioDuration(narrationPath);
        narrationDuration = narrationMetadata;
        console.log(`[ComposeAudioMix] Narration duration: ${narrationDuration}s`);
      } catch (error) {
        console.warn('Failed to get narration duration:', error);
      }
    }

    return new Promise((resolve, reject) => {
      try {
        const command = ffmpeg(videoPath);

        // Add BGM input with simple approach
        if (bgmPath) {
          console.log(`[ComposeAudioMix] Adding BGM input for ${videoDuration}s video`);
          debugLog(`[ComposeAudioMix] BGM strategy: simple input mapping`);
          // Use simple input approach without complex looping
          command.input(bgmPath).inputOptions([
            '-stream_loop', '10',  // Fixed number of loops instead of calculation
            '-t', (videoDuration + 10).toString() // Buffer time
          ]);
        }

        // Add narration input
        if (narrationPath) {
          command.input(narrationPath);
        }

        // Generate audio filter chain if not provided
        let finalAudioFilterChain = audioFilterChain;
        if (!finalAudioFilterChain && (bgmPath || narrationPath)) {
          // Import AudioMixer dynamically to avoid circular dependency
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { AudioMixer } = require('./AudioMixer');
          const audioMixer = new AudioMixer();

          const audioConfig = {
            videoDuration,
            bgmPath: bgmPath || undefined,
            bgmVolume: config.bgmVolume || 30,
            bgmFadeIn: config.bgmFadeIn || 0,
            bgmFadeOut: config.bgmFadeOut || 0,
            narrationPath: narrationPath || undefined,
            narrationVolume: config.narrationVolume || 100,
            narrationDelay: config.narrationDelay || 0,
          };

          console.log(`[ComposeAudioMix] Audio config:`, JSON.stringify(audioConfig, null, 2));
          debugLog(`[ComposeAudioMix] Audio config: ${JSON.stringify(audioConfig)}`);

          finalAudioFilterChain = audioMixer.getAudioFilterChain(audioConfig, videoMetadata.hasAudio);
          console.log(`[ComposeAudioMix] Generated filter chain: "${finalAudioFilterChain}"`);
          debugLog(`[ComposeAudioMix] Generated filter chain: ${finalAudioFilterChain}`);

          // If Half Frame Rate is enabled, pad audio to match doubled video duration
          if (config.halfFrameRate && finalAudioFilterChain && finalAudioFilterChain.includes('[mixed]')) {
            const paddedVideoDuration = videoDuration * 2;
            // Add apad filter to extend audio with silence to match video duration
            finalAudioFilterChain = finalAudioFilterChain.replace('[mixed]', `,apad=whole_dur=${paddedVideoDuration}[mixed]`);
            console.log(`[ComposeAudioMix] Padding audio to ${paddedVideoDuration}s for Half Frame Rate`);
            debugLog(`[ComposeAudioMix] Audio padding filter added: whole_dur=${paddedVideoDuration}`);
          }
        }

        // Apply complex audio filter with fallback to simple approach
        if (finalAudioFilterChain && finalAudioFilterChain.trim() !== '') {
          console.log(`[ComposeAudioMix] Attempting complex filter: ${finalAudioFilterChain}`);
          debugLog(`[ComposeAudioMix] Filter chain: ${finalAudioFilterChain}`);
          
          try {
            // Validate filter chain before applying
            if (finalAudioFilterChain.includes('[mixed]')) {
              command.complexFilter(finalAudioFilterChain);
              console.log(`[ComposeAudioMix] ✅ Complex filter applied successfully`);
            } else {
              throw new Error('Filter chain missing [mixed] output');
            }
          } catch (filterError) {
            console.error(`[ComposeAudioMix] ❌ Complex filter failed, falling back to simple audio mapping:`, filterError);
            debugLog(`[ComposeAudioMix] Complex filter error: ${filterError}`);
            
            // Fallback to simple audio mapping
            finalAudioFilterChain = '';

            // Simple audio mapping based on what inputs we have
            if (bgmPath && narrationPath) {
              // Use simple audio filters instead of complex filter
              command.audioFilters([
                {
                  filter: 'volume',
                  options: (config.bgmVolume || 30) / 100
                }
              ]);
            } else if (bgmPath) {
              command.audioFilters([
                {
                  filter: 'volume',
                  options: (config.bgmVolume || 30) / 100
                }
              ]);
            }
          }
        } else {
          console.log(`[ComposeAudioMix] No complex audio filter, using simple audio mapping`);
          debugLog(`[ComposeAudioMix] Empty or invalid filter chain: "${finalAudioFilterChain}"`);
          
          // Apply simple volume control if BGM is present
          if (bgmPath) {
            console.log(`[ComposeAudioMix] Applying simple BGM volume: ${config.bgmVolume || 30}%`);
            command.audioFilters([
              {
                filter: 'volume',
                options: (config.bgmVolume || 30) / 100
              }
            ]);
          }
        }

        // Video filters
        const videoFilters: string[] = [];

        // Calculate target video duration based on options
        let targetVideoDuration = videoDuration;

        if (config.halfFrameRate) {
          // Half frame rate doubles the video duration by stretching PTS
          videoFilters.push('setpts=2.0*PTS');
          targetVideoDuration = videoDuration * 2;
          console.log(`[ComposeAudioMix] Half frame rate: ${videoDuration}s → ${targetVideoDuration}s (setpts=2.0*PTS)`);
          debugLog(`[ComposeAudioMix] Video PTS doubled for half frame rate`);
        } else if (config.syncToAudio && narrationDuration > 0) {
          // Sync to audio: stretch/compress video to match narration duration using setpts
          const speedFactor = videoDuration / narrationDuration;
          videoFilters.push(`setpts=${speedFactor.toFixed(4)}*PTS`);
          targetVideoDuration = narrationDuration;
          console.log(`[ComposeAudioMix] Sync to audio: ${videoDuration}s → ${targetVideoDuration}s (speed: ${speedFactor.toFixed(4)}x)`);
          debugLog(`[ComposeAudioMix] Video speed adjustment: setpts=${speedFactor}*PTS`);
        }

        // If narration is longer than target video duration, freeze last frame
        // This handles cases where narration is longer even after half frame rate
        if (narrationDuration > targetVideoDuration) {
          const freezeDuration = narrationDuration - targetVideoDuration;
          videoFilters.push(`tpad=stop_mode=clone:stop_duration=${freezeDuration}`);
          console.log(`[ComposeAudioMix] Extending video with freeze frame: +${freezeDuration}s`);
        }

        // Add subtitle overlay if present
        if (subtitlePath) {
          const escapedPath = subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:');
          // __dirname is dist/nodes/SbRender/services, go up 4 levels to package root
          const fontsDir = join(dirname(dirname(dirname(dirname(__dirname)))), 'fonts');
          const escapedFontsDir = fontsDir.replace(/\\/g, '/').replace(/:/g, '\\:');
          videoFilters.push(`ass=${escapedPath}:fontsdir=${escapedFontsDir}`);
        }

        if (videoFilters.length > 0) {
          command.videoFilters(videoFilters);
        }

        // Set output codec and quality
        const crf = this.getCRF(config.quality || 'high', config.customCRF);

        const outputOptions = [
          `-crf ${crf}`,
          '-preset medium',
          '-movflags +faststart',
        ];

        // Note: Half frame rate is handled by setpts=2.0*PTS in video filters
        // No need to change output frame rate here

        // Map video and mixed audio with safe fallback
        if (finalAudioFilterChain && finalAudioFilterChain.includes('[mixed]')) {
          // Complex filter was successfully applied
          console.log(`[ComposeAudioMix] Using complex filter output mapping`);
          outputOptions.unshift('-map [mixed]', '-map 0:v');
        } else if (bgmPath || narrationPath) {
          // Simple audio mapping when complex filter failed or not used
          console.log(`[ComposeAudioMix] Using simple audio mapping - BGM: ${!!bgmPath}, Narration: ${!!narrationPath}`);
          if (bgmPath && !narrationPath) {
            // BGM only - map BGM audio and video
            outputOptions.unshift('-map 1:a', '-map 0:v');
          } else if (narrationPath && !bgmPath) {
            // Narration only - map narration audio and video
            const narrationIndex = videoMetadata.hasAudio ? 1 : 1;
            outputOptions.unshift(`-map ${narrationIndex}:a`, '-map 0:v');
          } else {
            // Both BGM and narration - use first audio input (BGM)
            outputOptions.unshift('-map 1:a', '-map 0:v');
          }
        } else {
          // No additional audio - preserve original if exists
          console.log(`[ComposeAudioMix] Preserving original audio only`);
          outputOptions.unshift('-map 0:a?', '-map 0:v');
        }

        command
          .videoCodec(config.videoCodec || 'libx264')
          .outputOptions(outputOptions)
          .audioCodec('aac')
          .audioBitrate('192k')
          .format(config.outputFormat || 'mp4')
          .output(outputPath);

        // Handle events
        command.on('start', (commandLine: string) => {
          console.log('FFmpeg command:', commandLine);
        });

        command.on('progress', (progress: { percent?: number }) => {
          if (progress.percent) {
            console.log(`Processing: ${Math.round(progress.percent)}% done`);
          }
        });

        command.on('end', async () => {
          try {
            const buffer = await fs.readFile(outputPath);
            resolve(buffer);
          } catch (error) {
            reject(new Error(`Failed to read output file: ${error}`));
          }
        });

        command.on('error', (error: Error) => {
          reject(new Error(`FFmpeg error: ${error.message}`));
        });

        command.run();
      } catch (error) {
        reject(new Error(`Video composition failed: ${error}`));
      }
    });
  }

  /**
   * Get fallback video duration using direct ffprobe call
   */
  private async getFallbackDuration(videoPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      console.log(`[FallbackDuration] Attempting direct ffprobe on: ${videoPath}`);
      
      // Try with a simpler ffprobe call
      ffmpeg.ffprobe(videoPath, [
        '-v', 'quiet',
        '-show_entries', 'format=duration',
        '-of', 'csv=p=0'
      ], (error, metadata) => {
        if (error) {
          console.error('[FallbackDuration] Direct ffprobe also failed:', error);
          reject(error);
          return;
        }
        
        const duration = metadata?.format?.duration || 0;
        console.log(`[FallbackDuration] Detected duration: ${duration}s`);
        resolve(duration);
      });
    });
  }

  /**
   * Get audio file duration
   */
  async getAudioDuration(audioPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(audioPath, (error, metadata) => {
        if (error) {
          reject(new Error(`Failed to get audio duration: ${error.message}`));
          return;
        }

        const duration = metadata.format.duration || 0;
        resolve(duration);
      });
    });
  }

  /**
   * Get video metadata (duration, resolution, codec)
   */
  async getVideoMetadata(videoPath: string): Promise<IVideoMetadata> {
    return new Promise((resolve) => {
      const logMsg = `[Metadata] Checking video: ${videoPath}`;
      console.log(logMsg);
      // Also write to file for n8n debugging
      debugLog(`${logMsg}`);

      // FFprobe path is already configured at module initialization
      // No need to reconfigure here

      ffmpeg.ffprobe(videoPath, (error, metadata) => {
        if (error) {
          // CRITICAL: If ffprobe fails in n8n, it's likely a path/permission issue
          // NOT that the video lacks audio. Safer to assume audio EXISTS.
          console.error('[Metadata] ❌ ffprobe failed for:', videoPath);
          console.error('[Metadata] Error:', error.message);
          console.error('[Metadata] Error code:', error.code || 'unknown');
          debugLog(`[Metadata] ❌ FFPROBE FAILED: ${videoPath}`);
          debugLog(`[Metadata] Error: ${error.message}`);
          debugLog(`[Metadata] Assuming audio EXISTS to prevent loss`);

          // CHANGED: Assume audio EXISTS when probe fails
          // This prevents audio loss in n8n when ffprobe has issues
          // Better to have potential duplicate audio than lose it entirely
          resolve({
            duration: 10, // Default 10 seconds
            width: 1920,
            height: 1080,
            hasAudio: true, // ASSUME audio exists to preserve it
            videoCodec: 'unknown',
            audioCodec: 'aac', // Assume common codec
          });
          return;
        }

        const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
        const audioStream = metadata.streams.find((s) => s.codec_type === 'audio');

        // Extract frame rate from video stream
        let fps: number | undefined;
        if (videoStream) {
          // r_frame_rate is a fraction like "24/1" or "30000/1001"
          const frameRateStr = videoStream.r_frame_rate || videoStream.avg_frame_rate;
          if (frameRateStr) {
            const [num, den] = frameRateStr.split('/').map(Number);
            if (den && den > 0) {
              fps = num / den;
              console.log(`[Metadata] Detected frame rate: ${fps.toFixed(2)}fps (${frameRateStr})`);
              debugLog(`[Metadata] Frame rate: ${fps}fps from ${frameRateStr}`);
            }
          }
        }

        const streamInfo = {
          videoStream: videoStream ? `${videoStream.codec_name} ${videoStream.width}x${videoStream.height} @${fps?.toFixed(2) || '?'}fps` : 'none',
          audioStream: audioStream ? `${audioStream.codec_name} channels=${audioStream.channels}` : 'none'
        };
        console.log(`[Metadata] Streams found:`, streamInfo);
        debugLog(`[Metadata] Streams: ${JSON.stringify(streamInfo)}`);

        // Check if audio stream is valid (has codec and channels)
        const hasValidAudio = !!audioStream &&
          !!audioStream.codec_name &&
          audioStream.codec_name !== 'none' &&
          (audioStream.channels ?? 0) > 0;

        console.log(`[Metadata] hasValidAudio: ${hasValidAudio}`);
        debugLog(`[Metadata] hasValidAudio: ${hasValidAudio}`);

        if (!videoStream) {
          // No video stream found, use defaults
          console.warn('[Metadata] ⚠️  No video stream found, using default metadata');
          resolve({
            duration: 10,
            width: 1920,
            height: 1080,
            hasAudio: hasValidAudio,
            videoCodec: 'unknown',
            audioCodec: audioStream?.codec_name,
            fps: undefined,
          });
          return;
        }

        const result = {
          duration: metadata.format.duration || 10,
          width: videoStream.width || 1920,
          height: videoStream.height || 1080,
          hasAudio: hasValidAudio,
          videoCodec: videoStream.codec_name || 'unknown',
          audioCodec: audioStream?.codec_name,
          fps: fps,
        };

        console.log(`[Metadata] ✅ Result:`, result);
        resolve(result);
      });
    });
  }

  /**
   * Get CRF value based on quality setting
   */
  private getCRF(quality: string, customCRF?: number): number {
    if (quality === 'custom' && customCRF !== undefined) {
      return Math.max(0, Math.min(51, customCRF));
    }

    const crfMap: Record<string, number> = {
      low: 28,
      medium: 23,
      high: 18,
    };

    return crfMap[quality] || 23;
  }

  /**
   * Merge multiple videos in sequence
   */
  async mergeVideos(
    videoPaths: string[],
    outputPath: string,
    videoCodec = 'libx264',
    quality = 'high',
    customCRF?: number,
    outputFormat = 'mp4',
  ): Promise<Buffer> {
    if (videoPaths.length === 0) {
      throw new Error('No videos provided for merging');
    }

    if (videoPaths.length === 1) {
      // Only one video, just copy it
      const buffer = await fs.readFile(videoPaths[0]);
      return buffer;
    }

    // Get metadata for all videos
    const videoMetadataList = await Promise.all(
      videoPaths.map(async (videoPath, index) => {
        try {
          const metadata = await this.getVideoMetadata(videoPath);
          console.log(`[Merge] Video ${index} metadata:`, {
            path: videoPath,
            hasAudio: metadata.hasAudio,
            duration: metadata.duration
          });
          return metadata;
        } catch (error) {
          console.warn(`[Merge] Failed to get metadata for video ${index}:`, error);
          // Return safe default
          return {
            hasAudio: false,
            duration: 0,
            width: 1920,
            height: 1080,
            videoCodec: 'unknown'
          } as IVideoMetadata;
        }
      })
    );

    const hasAudio = videoMetadataList.map(m => m.hasAudio);

    const allHaveAudio = hasAudio.every(has => has);
    const audioSummary = {
      hasAudio,
      allHaveAudio,
      totalVideos: videoPaths.length
    };
    console.log(`[Merge] Audio summary:`, audioSummary);
    debugLog(`[Merge] Audio summary: ${JSON.stringify(audioSummary)}`);

    return new Promise((resolve, reject) => {
      try {
        const command = ffmpeg();

        // Add all video inputs
        videoPaths.forEach(videoPath => {
          command.input(videoPath);
        });

        // Normalize all videos to same resolution and framerate before concat
        // This ensures compatibility when mixing videos from different sources
        let filterString: string;

        // Check if we have mixed audio (some have audio, some don't)
        const hasMixedAudio = !allHaveAudio && hasAudio.some(has => has);

        if (allHaveAudio || hasMixedAudio) {
          // All videos have audio OR mixed audio - normalize video and ensure audio for all
          const scaleFilters = videoPaths.map((_, index) =>
            `[${index}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24[v${index}]`
          ).join(';');

          // Prepare audio streams
          const audioStreams: string[] = [];
          let audioFilters = '';

          videoPaths.forEach((_, index) => {
            if (hasAudio[index]) {
              // Use original audio
              audioStreams.push(`[${index}:a]`);
            } else {
              // Generate silent audio for this video using anullsrc
              // We use the video duration to trim the silence
              const duration = videoMetadataList[index].duration;
              // anullsrc generates infinite silence, we trim it to video duration
              // We use a unique label for this silence stream
              audioFilters += `anullsrc=r=44100:cl=stereo,atrim=duration=${duration}[silence${index}];`;
              audioStreams.push(`[silence${index}]`);
            }
          });

          // Combine scale filters and audio filters
          const allFilters = scaleFilters + ';' + audioFilters;

          // Build concat inputs: video and audio streams in pairs
          const concatInputs = videoPaths.map((_, index) => `[v${index}]${audioStreams[index]}`).join('');

          filterString = `${allFilters}${concatInputs}concat=n=${videoPaths.length}:v=1:a=1[outv][outa]`;
        } else {
          // No videos have audio - normalize and concat video only
          const scaleFilters = videoPaths.map((_, index) =>
            `[${index}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24[v${index}]`
          ).join(';');
          const videoStreams = videoPaths.map((_, index) => `[v${index}]`).join('');

          filterString = `${scaleFilters};${videoStreams}concat=n=${videoPaths.length}:v=1:a=0[outv]`;
        }

        console.log(`[Merge] FFmpeg filter:`, filterString);
        debugLog(`[Merge] FFmpeg filter: ${filterString}`);
        command.complexFilter(filterString);

        // Map output streams FIRST (must come before codec options for FFmpeg)
        const crf = this.getCRF(quality, customCRF);

        if (allHaveAudio || hasMixedAudio) {
          console.log(`[Merge] Mapping both video and audio outputs`);
          debugLog(`[Merge] Mapping both video and audio outputs`);
          command.outputOptions([
            '-map', '[outv]',
            '-map', '[outa]',
            `-c:v`, videoCodec,
            `-crf`, crf.toString(),
            `-preset`, 'medium',
            `-c:a`, 'aac',
            `-b:a`, '192k',
            '-movflags', '+faststart',
          ]);
        } else {
          console.log(`[Merge] Mapping video output only (no audio)`);
          command.outputOptions([
            '-map', '[outv]',
            `-c:v`, videoCodec,
            `-crf`, crf.toString(),
            `-preset`, 'medium',
            '-movflags', '+faststart',
          ]);
        }


        command
          .format(outputFormat)
          .output(outputPath);

        // Handle events
        command.on('start', (commandLine: string) => {
          console.log('FFmpeg merge command:', commandLine);
          debugLog(`[FFmpeg] Command: ${commandLine}`);
        });

        command.on('progress', (progress: { percent?: number }) => {
          if (progress.percent) {
            console.log(`Merging: ${Math.round(progress.percent)}% done`);
          }
        });

        command.on('end', async () => {
          try {
            const buffer = await fs.readFile(outputPath);
            resolve(buffer);
          } catch (error) {
            reject(new Error(`Failed to read merged output file: ${error}`));
          }
        });

        command.on('error', (error: Error) => {
          reject(new Error(`FFmpeg merge error: ${error.message}`));
        });

        command.run();
      } catch (error) {
        reject(new Error(`Video merge failed: ${error}`));
      }
    });
  }

  /**
   * Create video from multiple images with specified durations
   */
  async createVideoFromImages(
    imagePaths: string[],
    durations: number[],
    outputPath: string,
    videoCodec = 'libx264',
    quality = 'high',
    customCRF?: number,
    outputFormat = 'mp4',
  ): Promise<Buffer> {
    if (imagePaths.length !== durations.length) {
      throw new Error('Number of images must match number of durations');
    }

    return new Promise((resolve, reject) => {
      try {
        const command = ffmpeg();

        // Add all images as inputs with loop and duration
        imagePaths.forEach((imagePath, index) => {
          command
            .input(imagePath)
            .inputOptions([
              '-loop 1',
              `-t ${durations[index]}`,
            ]);
        });

        // Build filter to scale all images to 1920x1080 and concat
        // Each image is scaled to fit within 1920x1080 with padding (black bars) if needed
        const scaleFilters = imagePaths.map((_, index) =>
          `[${index}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24[v${index}]`
        ).join(';');

        const concatInputs = imagePaths.map((_, index) => `[v${index}]`).join('');
        const filterString = `${scaleFilters};${concatInputs}concat=n=${imagePaths.length}:v=1:a=0[outv]`;

        console.log(`FFmpeg image to video filter: scale and concat`);

        // Apply complex filter
        command.complexFilter(filterString);

        // Set output codec and quality
        const crf = this.getCRF(quality, customCRF);

        command
          .outputOptions([
            '-map [outv]',
            '-pix_fmt yuv420p', // Ensure compatibility
            `-crf ${crf}`,
            '-preset medium',
            '-movflags +faststart',
          ])
          .videoCodec(videoCodec)
          .format(outputFormat)
          .output(outputPath);

        // Progress tracking
        command.on('progress', (progress: { percent?: number }) => {
          if (progress.percent) {
            console.log(`Creating video from images: ${Math.round(progress.percent)}% done`);
          }
        });

        // Handle completion
        command.on('end', async () => {
          try {
            const buffer = await fs.readFile(outputPath);
            resolve(buffer);
          } catch (error) {
            reject(new Error(`Failed to read output file: ${error}`));
          }
        });

        command.on('error', (error: Error) => {
          reject(new Error(`FFmpeg image to video error: ${error.message}`));
        });

        command.run();
      } catch (error) {
        reject(new Error(`Image to video creation failed: ${error}`));
      }
    });
  }

  /**
   * Validate output configuration
   */
  validateConfig(config: ISbRenderNodeParams): void {
    const validFormats = ['mp4', 'mov', 'webm'];
    if (config.outputFormat && !validFormats.includes(config.outputFormat)) {
      throw new Error(`Invalid output format: ${config.outputFormat}`);
    }

    const validCodecs = ['libx264', 'libx265', 'vp9'];
    if (config.videoCodec && !validCodecs.includes(config.videoCodec)) {
      throw new Error(`Invalid video codec: ${config.videoCodec}`);
    }

    if (config.quality === 'custom') {
      if (config.customCRF === undefined || config.customCRF < 0 || config.customCRF > 51) {
        throw new Error('Custom CRF must be between 0 and 51');
      }
    }
  }
}
