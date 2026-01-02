import { promises as fs, appendFileSync } from 'fs';
import { dirname, join } from 'path';
import { createCommand, ffprobe, getFfmpegPath, getFfprobePath } from '../utils/ffmpeg-wrapper';
import type { IVideoComposer, IVideoMetadata, ISbRenderNodeParams, KenBurnsConfig, ZoomDirection, MotionSpeed, ParallaxConfig } from '../interfaces';
import { parallaxEngine } from './ParallaxEngine';

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

// Log FFmpeg paths on initialization
console.log(`[VideoComposer] ✅ FFmpeg path: ${getFfmpegPath()}`);
console.log(`[VideoComposer] ✅ FFprobe path: ${getFfprobePath()}`);
debugLog(`[VideoComposer] FFmpeg: ${getFfmpegPath()}, FFprobe: ${getFfprobePath()}`)

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
        const command = createCommand(videoPath);

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
        const command = createCommand(videoPath);

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

        // NOTE: Audio filter chain is stored in finalAudioFilterChain
        // We will combine it with video filters later to create a unified filter_complex

        // Video filters - build as part of filter_complex to avoid conflicts
        const videoFilterParts: string[] = [];

        // Half frame rate if enabled (doubles duration)
        // CRITICAL: For syncToAudio, we need the VIDEO-ONLY duration (frame length)
        // NOT the max duration which may include audio from an already-merged source.
        // videoMetadata.videoDuration = video stream duration only
        // videoDuration = max(format, video, audio) - may include embedded audio
        let actualVideoDuration: number;
        if (videoMetadata.videoDuration && videoMetadata.videoDuration > 0) {
          // Use video stream duration directly (most accurate)
          actualVideoDuration = videoMetadata.videoDuration;
          console.log(`[ComposeAudioMix] Using video stream duration: ${actualVideoDuration}s`);
        } else {
          // Fallback: If no video stream duration, use format duration
          // but be aware this might include audio duration
          actualVideoDuration = videoDuration;
          console.log(`[ComposeAudioMix] ⚠️ No video stream duration, using format duration: ${actualVideoDuration}s`);
        }

        let currentVideoDuration = actualVideoDuration;
        console.log(`[ComposeAudioMix] Video frame duration: ${actualVideoDuration}s, narration: ${narrationDuration}s, syncToAudio: ${config.syncToAudio}`);
        if (config.halfFrameRate) {
          // Slow down video by doubling PTS and maintaining consistent frame timing
          videoFilterParts.push('setpts=2.0*PTS');
          currentVideoDuration *= 2;
        }

        // If narration is longer than video AND sync enabled, stretch video to match audio
        console.log(`[ComposeAudioMix] SyncToAudio check: enabled=${config.syncToAudio}, narration=${narrationDuration}s, video=${currentVideoDuration}s, shouldSync=${config.syncToAudio && narrationDuration > currentVideoDuration}`);
        if (config.syncToAudio && narrationDuration > currentVideoDuration) {
          const slowDownFactor = narrationDuration / currentVideoDuration;
          console.log(`[ComposeAudioMix] ✅ Syncing video to audio: slowing down by factor ${slowDownFactor.toFixed(4)}`);
          videoFilterParts.push(`setpts=${slowDownFactor.toFixed(6)}*PTS`);

          // IMPORTANT: When slowing down video significantly, frame rate drops.
          // We must resample to a standard frame rate (e.g., 24fps) to ensure
          // there are enough frames for subtitles to be rendered correctly.
          videoFilterParts.push('fps=24');
          currentVideoDuration = narrationDuration; // Update after stretching
        }

        // If narration is STILL longer than video (syncToAudio disabled or insufficient),
        // extend video by freezing the last frame to prevent narration cut-off
        if (narrationDuration > currentVideoDuration) {
          const extensionDuration = narrationDuration - currentVideoDuration + 1; // +1s buffer
          console.log(`[ComposeAudioMix] Extending video by ${extensionDuration.toFixed(2)}s to match narration (tpad)`);
          // tpad freezes the last frame for the specified duration
          videoFilterParts.push(`tpad=stop_mode=clone:stop_duration=${extensionDuration.toFixed(3)}`);
        }

        // Add subtitle overlay if present
        if (subtitlePath) {
          const escapedPath = subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:');
          // __dirname is dist/nodes/SbRender/services, go up 4 levels to package root
          const fontsDir = join(dirname(dirname(dirname(dirname(__dirname)))), 'fonts');
          const escapedFontsDir = fontsDir.replace(/\\/g, '/').replace(/:/g, '\\:');
          videoFilterParts.push(`ass=${escapedPath}:fontsdir=${escapedFontsDir}`);
        }

        // Build video filter chain for filter_complex
        let videoFilterChain = '';
        const hasVideoFilters = videoFilterParts.length > 0;
        if (hasVideoFilters) {
          videoFilterChain = `[0:v]${videoFilterParts.join(',')}[vout]`;
          console.log(`[ComposeAudioMix] Video filter chain: ${videoFilterChain}`);
        }

        // Combine video and audio filter chains into a single filter_complex
        const hasAudioFilters = finalAudioFilterChain && finalAudioFilterChain.includes('[mixed]');
        let combinedFilterComplex = '';

        if (hasVideoFilters && hasAudioFilters) {
          // Both video and audio filters - combine them
          combinedFilterComplex = `${videoFilterChain};${finalAudioFilterChain}`;
          console.log(`[ComposeAudioMix] Combined filter_complex: ${combinedFilterComplex}`);
        } else if (hasVideoFilters) {
          // Only video filters
          combinedFilterComplex = videoFilterChain;
          console.log(`[ComposeAudioMix] Video-only filter_complex: ${combinedFilterComplex}`);
        } else if (hasAudioFilters) {
          // Only audio filters
          combinedFilterComplex = finalAudioFilterChain;
          console.log(`[ComposeAudioMix] Audio-only filter_complex: ${combinedFilterComplex}`);
        }

        // Apply the combined filter_complex
        if (combinedFilterComplex) {
          try {
            command.complexFilter(combinedFilterComplex);
            console.log(`[ComposeAudioMix] ✅ Combined filter_complex applied successfully`);
          } catch (filterError) {
            console.error(`[ComposeAudioMix] ❌ Combined filter_complex failed:`, filterError);
            debugLog(`[ComposeAudioMix] Combined filter error: ${filterError}`);
            // Reset flags to use simple mapping
            finalAudioFilterChain = '';
          }
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

        // Map video and audio outputs based on what filters were applied
        if (hasVideoFilters && hasAudioFilters) {
          // Both video and audio filters applied
          console.log(`[ComposeAudioMix] Mapping filtered video [vout] and audio [mixed]`);
          outputOptions.unshift('-map [vout]', '-map [mixed]');
        } else if (hasVideoFilters) {
          // Only video filters - use filtered video, original/simple audio
          console.log(`[ComposeAudioMix] Mapping filtered video [vout] with original audio`);
          if (narrationPath) {
            outputOptions.unshift('-map [vout]', '-map 1:a');
          } else if (bgmPath) {
            outputOptions.unshift('-map [vout]', '-map 1:a');
          } else {
            outputOptions.unshift('-map [vout]', '-map 0:a?');
          }
        } else if (hasAudioFilters) {
          // Only audio filters - use original video, filtered audio
          console.log(`[ComposeAudioMix] Mapping original video with filtered audio [mixed]`);
          outputOptions.unshift('-map 0:v', '-map [mixed]');
        } else if (bgmPath || narrationPath) {
          // Simple audio mapping when no complex filters
          console.log(`[ComposeAudioMix] Using simple audio mapping - BGM: ${!!bgmPath}, Narration: ${!!narrationPath}`);
          if (bgmPath && !narrationPath) {
            outputOptions.unshift('-map 0:v', '-map 1:a');
          } else if (narrationPath && !bgmPath) {
            outputOptions.unshift('-map 0:v', '-map 1:a');
          } else {
            outputOptions.unshift('-map 0:v', '-map 1:a');
          }
        } else {
          // No additional audio - preserve original if exists
          console.log(`[ComposeAudioMix] Preserving original audio only`);
          outputOptions.unshift('-map 0:v', '-map 0:a?');
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
      ffprobe(videoPath, [
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
      ffprobe(audioPath, (error, metadata) => {
        if (error || !metadata) {
          reject(new Error(`Failed to get audio duration: ${error?.message || 'No metadata'}`));
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

      ffprobe(videoPath, (error, metadata) => {
        if (error || !metadata) {
          // CRITICAL: If ffprobe fails in n8n, it's likely a path/permission issue
          // NOT that the video lacks audio. Safer to assume audio EXISTS.
          console.error('[Metadata] ❌ ffprobe failed for:', videoPath);
          console.error('[Metadata] Error:', error?.message || 'No metadata');
          debugLog(`[Metadata] ❌ FFPROBE FAILED: ${videoPath}`);
          debugLog(`[Metadata] Error: ${error?.message || 'No metadata'}`);
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

        // Calculate video stream duration - try stream duration first, then calculate from frames
        // Use type assertion for ffprobe stream properties not in the basic type definition
        const extendedVideoStream = videoStream as typeof videoStream & {
          nb_frames?: string;
          avg_frame_rate?: string;
        };

        let videoDuration = videoStream.duration ? parseFloat(String(videoStream.duration)) : 0;

        // If no stream duration, calculate from nb_frames and fps
        if (videoDuration <= 0 && extendedVideoStream.nb_frames) {
          const nbFrames = parseInt(String(extendedVideoStream.nb_frames), 10);
          // Try r_frame_rate first (e.g., "30/1" or "30000/1001"), then avg_frame_rate
          const frameRateStr = videoStream.r_frame_rate || extendedVideoStream.avg_frame_rate || '24/1';
          const [num, den] = frameRateStr.split('/').map(Number);
          const fps = den > 0 ? num / den : num || 24;
          videoDuration = nbFrames / fps;
          console.log(`[Metadata] Video duration calculated from frames: ${nbFrames} frames / ${fps} fps = ${videoDuration.toFixed(3)}s`);
        }

        const audioDuration = audioStream?.duration ? parseFloat(String(audioStream.duration)) : 0;
        const maxDuration = Math.max(formatDuration, videoDuration, audioDuration) || 10;

        // Extract FPS for metadata
        let fps: number | undefined;
        if (videoStream.r_frame_rate) {
          const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
          fps = den > 0 ? num / den : num;
        } else if (extendedVideoStream.avg_frame_rate) {
          const [num, den] = extendedVideoStream.avg_frame_rate.split('/').map(Number);
          fps = den > 0 ? num / den : num;
        }

        console.log(`[Metadata] Durations - format: ${formatDuration}s, video: ${videoDuration}s, audio: ${audioDuration}s, using: ${maxDuration}s, fps: ${fps || 'unknown'}`);

        const result: IVideoMetadata = {
          duration: maxDuration,
          width: videoStream.width || 1920,
          height: videoStream.height || 1080,
          hasAudio: hasValidAudio,
          videoCodec: videoStream.codec_name || 'unknown',
          audioCodec: audioStream?.codec_name,
          videoDuration: videoDuration > 0 ? videoDuration : undefined,
          audioDuration: audioDuration > 0 ? audioDuration : undefined,
          fps,
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
        const command = createCommand();

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
   * @param kenBurnsConfigs - Optional array of Ken Burns configurations for each image
   */
  async createVideoFromImages(
    imagePaths: string[],
    durations: number[],
    outputPath: string,
    videoCodec = 'libx264',
    quality = 'high',
    customCRF?: number,
    outputFormat = 'mp4',
    kenBurnsConfigs?: KenBurnsConfig[],
  ): Promise<Buffer> {
    if (imagePaths.length !== durations.length) {
      throw new Error('Number of images must match number of durations');
    }

    // Default config for all images if not provided
    const defaultConfig: KenBurnsConfig = { motion: 'none', direction: 'center', speed: 'normal' };
    const configs: KenBurnsConfig[] = kenBurnsConfigs || imagePaths.map(() => defaultConfig);
    if (configs.length !== imagePaths.length) {
      throw new Error('Number of Ken Burns configs must match number of images');
    }

    const FPS = 24;
    const parallaxVideoPaths: string[] = []; // Track generated parallax videos for cleanup

    // Helper functions
    const isZoompanEffect = (config: KenBurnsConfig): boolean =>
      config.motion !== 'none' && config.motion !== 'parallax';

    const isParallaxEffect = (config: KenBurnsConfig): boolean => config.motion === 'parallax';

    // Pre-process parallax images to generate video clips
    const processedPaths = [...imagePaths];
    const processedTypes: ('image' | 'video')[] = imagePaths.map(() => 'image');

    for (let i = 0; i < configs.length; i++) {
      if (isParallaxEffect(configs[i])) {
        console.log(`[ImageToVideo] Processing parallax effect for image ${i}`);
        const config = configs[i];
        const parallaxConfig: ParallaxConfig = {
          direction: config.parallaxDirection || 'left',
          intensity: config.parallaxIntensity || 'normal',
          layerCount: 3,
        };

        try {
          // Generate parallax video
          const parallaxOutputPath = join(dirname(outputPath), `parallax_${Date.now()}_${i}.mp4`);
          await parallaxEngine.generateParallaxVideo(
            imagePaths[i],
            parallaxOutputPath,
            parallaxConfig,
            durations[i],
            FPS,
            videoCodec,
            quality,
            customCRF,
          );

          processedPaths[i] = parallaxOutputPath;
          processedTypes[i] = 'video';
          parallaxVideoPaths.push(parallaxOutputPath);
          console.log(`[ImageToVideo] Parallax video generated: ${parallaxOutputPath}`);
        } catch (error) {
          console.error(`[ImageToVideo] Parallax generation failed for image ${i}, falling back to static:`, error);
          // Keep original image path on failure
        }
      }
    }

    return new Promise((resolve, reject) => {
      try {
        const command = createCommand();

        // Add all inputs (images or parallax videos)
        processedPaths.forEach((mediaPath, index) => {
          const config = configs[index];

          if (processedTypes[index] === 'video') {
            // Parallax video - add as video input
            command.input(mediaPath);
          } else if (isZoompanEffect(config)) {
            command
              .input(mediaPath)
              .inputOptions([
                '-loop 1',
                '-framerate 1',
                '-t 1',
              ]);
          } else {
            command
              .input(mediaPath)
              .inputOptions([
                '-loop 1',
                `-t ${durations[index]}`,
              ]);
          }
        });

        // Build filter for each media based on Ken Burns config
        const filters: string[] = [];

        processedPaths.forEach((_, index) => {
          const duration = durations[index];
          const config = configs[index];
          const frames = Math.ceil(duration * FPS);

          console.log(`[ImageToVideo] Image ${index}: motion='${config.motion}', direction='${config.direction}', speed='${config.speed}', duration=${duration}s`);

          // Helper to build zoompan filter string
          const buildZoompanFilter = (
            zoomExpr: string,
            xExpr: string,
            yExpr: string,
          ): string => {
            return (
              `[${index}:v]scale=8000:-1,` +
              `zoompan=z='${zoomExpr}':` +
              `x='${xExpr}':y='${yExpr}':` +
              `d=${frames}:s=1920x1080:fps=${FPS},` +
              `setsar=1[v${index}]`
            );
          };

          // Easing expressions
          const t = `(on/${frames})`;
          const easeOut = `(1-(1-${t})*(1-${t}))`;
          const easeIn = `(${t}*${t})`;
          const easeInOut = `if(lt(${t},0.5),2*${t}*${t},1-(-2*${t}+2)*(-2*${t}+2)/2)`;

          // Speed multipliers
          const speedMultiplier: Record<MotionSpeed, number> = {
            slow: 0.12,
            normal: 0.25,
            fast: 0.45,
          };
          const speed = config.speed || 'normal';
          const zoomAmount = speedMultiplier[speed];
          const panAmount = speed === 'slow' ? 0.06 : speed === 'fast' ? 0.15 : 0.1;

          // Direction offsets for zoom
          const getZoomPosition = (dir: ZoomDirection): { x: string; y: string } => {
            switch (dir) {
              case 'left':
                return { x: `iw/3-(iw/zoom/2)`, y: 'ih/2-(ih/zoom/2)' };
              case 'right':
                return { x: `2*iw/3-(iw/zoom/2)`, y: 'ih/2-(ih/zoom/2)' };
              case 'top':
                return { x: 'iw/2-(iw/zoom/2)', y: `ih/3-(ih/zoom/2)` };
              case 'bottom':
                return { x: 'iw/2-(iw/zoom/2)', y: `2*ih/3-(ih/zoom/2)` };
              case 'center':
              default:
                return { x: 'iw/2-(iw/zoom/2)', y: 'ih/2-(ih/zoom/2)' };
            }
          };

          const { motion, direction = 'center' } = config;

          switch (motion) {
            case 'zoomIn': {
              const pos = getZoomPosition(direction);
              filters.push(buildZoompanFilter(
                `1+${zoomAmount}*${easeOut}`,
                pos.x,
                pos.y,
              ));
              break;
            }

            case 'zoomOut': {
              const pos = getZoomPosition(direction);
              const startZoom = 1 + zoomAmount;
              filters.push(buildZoompanFilter(
                `${startZoom}-${zoomAmount}*${easeIn}`,
                pos.x,
                pos.y,
              ));
              break;
            }

            case 'panLeft':
              filters.push(buildZoompanFilter(
                '1.2',
                `iw/2-(iw/zoom/2)+${panAmount}*iw*(1-${easeInOut})`,
                'ih/2-(ih/zoom/2)',
              ));
              break;

            case 'panRight':
              filters.push(buildZoompanFilter(
                '1.2',
                `iw/2-(iw/zoom/2)-${panAmount}*iw*(1-${easeInOut})`,
                'ih/2-(ih/zoom/2)',
              ));
              break;

            case 'panUp':
              filters.push(buildZoompanFilter(
                '1.2',
                'iw/2-(iw/zoom/2)',
                `ih/2-(ih/zoom/2)+${panAmount}*ih*(1-${easeInOut})`,
              ));
              break;

            case 'panDown':
              filters.push(buildZoompanFilter(
                '1.2',
                'iw/2-(iw/zoom/2)',
                `ih/2-(ih/zoom/2)-${panAmount}*ih*(1-${easeInOut})`,
              ));
              break;

            case 'parallax':
              // Parallax videos are pre-generated, just scale and normalize
              filters.push(
                `[${index}:v]scale=1920:1080:force_original_aspect_ratio=decrease,` +
                `pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${FPS}[v${index}]`
              );
              break;

            case 'none':
            default:
              filters.push(
                `[${index}:v]scale=1920:1080:force_original_aspect_ratio=decrease,` +
                `pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${FPS}[v${index}]`
              );
              break;
          }
        });

        const scaleFilters = filters.join(';');
        const concatInputs = processedPaths.map((_, index) => `[v${index}]`).join('');
        const filterString = `${scaleFilters};${concatInputs}concat=n=${processedPaths.length}:v=1:a=0[outv]`;

        console.log(`[ImageToVideo] Ken Burns configs: ${configs.map(c => c.motion).join(', ')}`);
        console.log(`[ImageToVideo] Generated filter: ${filterString.substring(0, 200)}...`);
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

        // Cleanup function for parallax temp files
        const cleanupParallaxFiles = async () => {
          for (const tempPath of parallaxVideoPaths) {
            try {
              await fs.unlink(tempPath);
              console.log(`[ImageToVideo] Cleaned up parallax temp: ${tempPath}`);
            } catch (e) {
              // Ignore cleanup errors
            }
          }
        };

        // Handle completion
        command.on('end', async () => {
          try {
            const buffer = await fs.readFile(outputPath);
            await cleanupParallaxFiles();
            resolve(buffer);
          } catch (error) {
            await cleanupParallaxFiles();
            reject(new Error(`Failed to read output file: ${error}`));
          }
        });

        command.on('error', async (error: Error) => {
          await cleanupParallaxFiles();
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
