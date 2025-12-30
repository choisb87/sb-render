import { promises as fs, appendFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
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

// Set FFmpeg and FFprobe paths with validation
try {
  // ffmpeg-static exports path directly, ffprobe-static exports { path }
  const ffmpegBinPath = ffmpegPath as string;
  const ffprobeBinPath = ffprobeStatic.path;

  // Validate that binaries actually exist (critical for n8n environment)
  if (!ffmpegBinPath || !existsSync(ffmpegBinPath)) {
    console.error(`[VideoComposer] FFmpeg binary not found at: ${ffmpegBinPath}`);
    debugLog(`[VideoComposer] FFmpeg binary missing: ${ffmpegBinPath}`);

    // Try system ffmpeg as fallback
    try {
      ffmpeg.setFfmpegPath('ffmpeg');
      console.warn('[VideoComposer] Using system ffmpeg as fallback');
      debugLog('[VideoComposer] Using system ffmpeg as fallback');
    } catch (systemError) {
      throw new Error(`FFmpeg binary not found at ${ffmpegBinPath} and system ffmpeg unavailable`);
    }
  } else {
    ffmpeg.setFfmpegPath(ffmpegBinPath);
    console.log(`[VideoComposer] ✅ FFmpeg verified: ${ffmpegBinPath}`);
    debugLog(`[VideoComposer] FFmpeg path set and verified: ${ffmpegBinPath}`);
  }

  if (!ffprobeBinPath || !existsSync(ffprobeBinPath)) {
    console.error(`[VideoComposer] FFprobe binary not found at: ${ffprobeBinPath}`);
    debugLog(`[VideoComposer] FFprobe binary missing: ${ffprobeBinPath}`);

    // Try system ffprobe as fallback
    try {
      ffmpeg.setFfprobePath('ffprobe');
      console.warn('[VideoComposer] Using system ffprobe as fallback');
      debugLog('[VideoComposer] Using system ffprobe as fallback');
    } catch (systemError) {
      console.warn('[VideoComposer] System ffprobe also unavailable, metadata detection will be limited');
      debugLog('[VideoComposer] System ffprobe unavailable, will use fallback metadata');
      // Don't throw - we'll handle this gracefully in getVideoMetadata
    }
  } else {
    ffmpeg.setFfprobePath(ffprobeBinPath);
    console.log(`[VideoComposer] ✅ FFprobe verified: ${ffprobeBinPath}`);
    debugLog(`[VideoComposer] FFprobe path set and verified: ${ffprobeBinPath}`);
  }
} catch (error) {
  console.error('[VideoComposer] CRITICAL: Failed to initialize FFmpeg/FFprobe:', error);
  debugLog(`[VideoComposer] Initialization error: ${error}`);
  
  // Final fallback: try system binaries
  try {
    ffmpeg.setFfmpegPath('ffmpeg');
    ffmpeg.setFfprobePath('ffprobe');
    console.warn('[VideoComposer] Using system ffmpeg/ffprobe binaries as last resort');
    debugLog('[VideoComposer] Using system binaries as last resort');
  } catch (systemError) {
    console.error('[VideoComposer] No FFmpeg/FFprobe available - operations will be limited');
    debugLog('[VideoComposer] No FFmpeg available - critical error');
  }
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
    } else if (videoMetadata.hasAudio && videoMetadata.audioDuration) {
      // No separate narration path, but original video has audio
      // Use audio duration from original video to prevent narration cut-off
      narrationDuration = videoMetadata.audioDuration;
      console.log(`[ComposeAudioMix] Using original video audio duration as narration: ${narrationDuration}s`);
    }

    // Calculate effective duration (max of video and narration) to ensure BGM covers the whole duration
    const effectiveDuration = Math.max(videoDuration, narrationDuration);
    console.log(`[ComposeAudioMix] Effective duration for BGM: ${effectiveDuration}s (Video: ${videoDuration}s, Narration: ${narrationDuration}s)`);

    return new Promise((resolve, reject) => {
      try {
        const command = ffmpeg(videoPath);

        // Add BGM input with simple approach
        if (bgmPath) {
          console.log(`[ComposeAudioMix] Adding BGM input for ${effectiveDuration}s video`);
          debugLog(`[ComposeAudioMix] BGM strategy: simple input mapping`);
          // Use simple input approach without complex looping
          command.input(bgmPath).inputOptions([
            '-stream_loop', '-1',  // Infinite loop to cover any duration
            '-t', (effectiveDuration + 10).toString() // Buffer time based on effective duration
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
            narrationDuration: narrationDuration, // Pass narration duration for proper trim calculation
          };

          console.log(`[ComposeAudioMix] Audio config:`, JSON.stringify(audioConfig, null, 2));
          debugLog(`[ComposeAudioMix] Audio config: ${JSON.stringify(audioConfig)}`);

          finalAudioFilterChain = audioMixer.getAudioFilterChain(audioConfig, videoMetadata.hasAudio);
          console.log(`[ComposeAudioMix] Generated filter chain: "${finalAudioFilterChain}"`);
          debugLog(`[ComposeAudioMix] Generated filter chain: ${finalAudioFilterChain}`);
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

        // Half frame rate if enabled (doubles duration)
        // Use actual video stream duration (frame length), not max duration
        // This ensures tpad is applied when audio is longer than video frames
        const actualVideoDuration = videoMetadata.videoDuration || videoDuration;
        let currentVideoDuration = actualVideoDuration;
        console.log(`[ComposeAudioMix] Video frame duration: ${actualVideoDuration}s, narration: ${narrationDuration}s`);
        if (config.halfFrameRate) {
          // Slow down video by doubling PTS and maintaining consistent frame timing
          videoFilters.push('setpts=2.0*PTS');
          currentVideoDuration *= 2;
        }

        // If narration is longer than video AND sync enabled, stretch video to match audio
        if (config.syncToAudio && narrationDuration > currentVideoDuration) {
          const slowDownFactor = narrationDuration / currentVideoDuration;
          console.log(`[ComposeAudioMix] Syncing video to audio: slowing down by factor ${slowDownFactor.toFixed(4)}`);
          videoFilters.push(`setpts=${slowDownFactor.toFixed(6)}*PTS`);

          // IMPORTANT: When slowing down video significantly, frame rate drops.
          // We must resample to a standard frame rate (e.g., 24fps) to ensure
          // there are enough frames for subtitles to be rendered correctly.
          videoFilters.push('fps=24');
          currentVideoDuration = narrationDuration; // Update after stretching
        }

        // If narration is STILL longer than video (syncToAudio disabled or insufficient),
        // extend video by freezing the last frame to prevent narration cut-off
        if (narrationDuration > currentVideoDuration) {
          const extensionDuration = narrationDuration - currentVideoDuration + 1; // +1s buffer
          console.log(`[ComposeAudioMix] Extending video by ${extensionDuration.toFixed(2)}s to match narration (tpad)`);
          // tpad freezes the last frame for the specified duration
          videoFilters.push(`tpad=stop_mode=clone:stop_duration=${extensionDuration.toFixed(3)}`);
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

        // Add explicit frame rate for half frame rate mode to ensure proper playback
        if (config.halfFrameRate) {
          outputOptions.push('-r 24');
        }

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

      // Try to use ffprobe
      // Ensure path is set in case n8n environment is different
      try {
        ffmpeg.setFfprobePath(ffprobeStatic.path);
        debugLog(`[Metadata] FFprobe path reconfirmed: ${ffprobeStatic.path}`);
      } catch (e) {
        console.warn('[Metadata] Could not set ffprobe path:', e);
        debugLog(`[Metadata] FFprobe path setting failed: ${e}`);
      }

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

        const streamInfo = {
          videoStream: videoStream ? `${videoStream.codec_name} ${videoStream.width}x${videoStream.height}` : 'none',
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
          });
          return;
        }

        // Use the maximum of format duration, video stream duration, and audio stream duration
        // This prevents audio from being cut off when audio is slightly longer than video
        const formatDuration = metadata.format.duration || 0;
        const videoDuration = videoStream.duration ? parseFloat(String(videoStream.duration)) : 0;
        const audioDuration = audioStream?.duration ? parseFloat(String(audioStream.duration)) : 0;
        const maxDuration = Math.max(formatDuration, videoDuration, audioDuration) || 10;

        console.log(`[Metadata] Durations - format: ${formatDuration}s, video: ${videoDuration}s, audio: ${audioDuration}s, using: ${maxDuration}s`);

        const result = {
          duration: maxDuration,
          width: videoStream.width || 1920,
          height: videoStream.height || 1080,
          hasAudio: hasValidAudio,
          videoCodec: videoStream.codec_name || 'unknown',
          audioCodec: audioStream?.codec_name,
          videoDuration: videoDuration > 0 ? videoDuration : undefined,
          audioDuration: audioDuration > 0 ? audioDuration : undefined,
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
          // IMPORTANT: Do NOT use fps filter here - it resamples video frames independently of audio,
          // causing audio-video desync that accumulates over time. The concat filter will handle
          // frame timing correctly as long as all inputs have compatible parameters.
          const scaleFilters = videoPaths.map((_, index) =>
            `[${index}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[v${index}]`
          ).join(';');

          // Prepare audio streams with fade in/out to prevent click sounds at segment boundaries
          // Short 50ms fades at boundaries eliminate audio discontinuity artifacts
          const FADE_DURATION = 0.05; // 50ms fade to prevent click sounds
          const audioStreams: string[] = [];
          let audioFilters = '';

          videoPaths.forEach((_, index) => {
            const duration = videoMetadataList[index].duration;
            const fadeOutStart = Math.max(0, duration - FADE_DURATION);

            if (hasAudio[index]) {
              // Apply fade in at start and fade out at end to prevent click sounds
              // afade=t=in applies fade in, afade=t=out applies fade out
              audioFilters += `[${index}:a]afade=t=in:st=0:d=${FADE_DURATION},afade=t=out:st=${fadeOutStart}:d=${FADE_DURATION}[a${index}];`;
              audioStreams.push(`[a${index}]`);
            } else {
              // Generate silent audio for this video using anullsrc
              // We use the video duration to trim the silence
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
          // IMPORTANT: Do NOT use fps filter - preserve original frame timing
          const scaleFilters = videoPaths.map((_, index) =>
            `[${index}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[v${index}]`
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
   * @param kenBurnsEffects - Optional array of Ken Burns effects for each image ('none' | 'zoomIn' | 'zoomOut')
   */
  async createVideoFromImages(
    imagePaths: string[],
    durations: number[],
    outputPath: string,
    videoCodec = 'libx264',
    quality = 'high',
    customCRF?: number,
    outputFormat = 'mp4',
    kenBurnsEffects?: ('none' | 'zoomIn' | 'zoomOut')[],
  ): Promise<Buffer> {
    if (imagePaths.length !== durations.length) {
      throw new Error('Number of images must match number of durations');
    }

    // Default to 'none' for all images if not provided
    const effects = kenBurnsEffects || imagePaths.map(() => 'none');
    if (effects.length !== imagePaths.length) {
      throw new Error('Number of Ken Burns effects must match number of images');
    }

    return new Promise((resolve, reject) => {
      try {
        const command = ffmpeg();
        const FPS = 24;

        // Add all images as inputs with loop and duration
        imagePaths.forEach((imagePath, index) => {
          command
            .input(imagePath)
            .inputOptions([
              '-loop 1',
              `-t ${durations[index]}`,
            ]);
        });

        // Build filter for each image based on Ken Burns effect
        const filters: string[] = [];

        imagePaths.forEach((_, index) => {
          const duration = durations[index];
          const effect = effects[index];
          const frames = Math.ceil(duration * FPS);

          if (effect === 'zoomIn') {
            // Ken Burns Zoom In: 1.0 → 1.2 scale, centered
            // zoompan outputs at target size, so we need to start larger and use zoom
            filters.push(
              `[${index}:v]scale=8000:-1,` +
              `zoompan=z='1+0.2*on/${frames}':` +
              `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
              `d=${frames}:s=1920x1080:fps=${FPS},` +
              `setsar=1[v${index}]`
            );
          } else if (effect === 'zoomOut') {
            // Ken Burns Zoom Out: 1.2 → 1.0 scale, centered
            filters.push(
              `[${index}:v]scale=8000:-1,` +
              `zoompan=z='1.2-0.2*on/${frames}':` +
              `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
              `d=${frames}:s=1920x1080:fps=${FPS},` +
              `setsar=1[v${index}]`
            );
          } else {
            // No effect - standard scale with padding
            filters.push(
              `[${index}:v]scale=1920:1080:force_original_aspect_ratio=decrease,` +
              `pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${FPS}[v${index}]`
            );
          }
        });

        const scaleFilters = filters.join(';');
        const concatInputs = imagePaths.map((_, index) => `[v${index}]`).join('');
        const filterString = `${scaleFilters};${concatInputs}concat=n=${imagePaths.length}:v=1:a=0[outv]`;

        console.log(`[ImageToVideo] Ken Burns effects: ${effects.join(', ')}`);
        debugLog(`[ImageToVideo] Filter: ${filterString}`);

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
