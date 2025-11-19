import { promises as fs, appendFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import * as ffprobeInstaller from '@ffprobe-installer/ffprobe';
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
  const ffmpegPath = ffmpegInstaller.path;
  const ffprobePath = ffprobeInstaller.path;

  // Validate that binaries actually exist (critical for n8n environment)
  if (!existsSync(ffmpegPath)) {
    console.error(`[VideoComposer] FFmpeg binary not found at: ${ffmpegPath}`);
    debugLog(`[VideoComposer] FFmpeg binary missing: ${ffmpegPath}`);
    
    // Try system ffmpeg as fallback
    try {
      ffmpeg.setFfmpegPath('ffmpeg');
      console.warn('[VideoComposer] Using system ffmpeg as fallback');
      debugLog('[VideoComposer] Using system ffmpeg as fallback');
    } catch (systemError) {
      throw new Error(`FFmpeg binary not found at ${ffmpegPath} and system ffmpeg unavailable`);
    }
  } else {
    ffmpeg.setFfmpegPath(ffmpegPath);
    console.log(`[VideoComposer] ✅ FFmpeg verified: ${ffmpegPath}`);
    debugLog(`[VideoComposer] FFmpeg path set and verified: ${ffmpegPath}`);
  }

  if (!existsSync(ffprobePath)) {
    console.error(`[VideoComposer] FFprobe binary not found at: ${ffprobePath}`);
    debugLog(`[VideoComposer] FFprobe binary missing: ${ffprobePath}`);
    
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
    ffmpeg.setFfprobePath(ffprobePath);
    console.log(`[VideoComposer] ✅ FFprobe verified: ${ffprobePath}`);
    debugLog(`[VideoComposer] FFprobe path set and verified: ${ffprobePath}`);
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
    }

    return new Promise((resolve, reject) => {
      try {
        const command = ffmpeg(videoPath);

        // Add BGM input with better looping strategy
        if (bgmPath) {
          console.log(`[ComposeAudioMix] Adding BGM input with stream_loop for ${videoDuration}s video`);
          debugLog(`[ComposeAudioMix] BGM strategy: loop BGM (${bgmDuration}s) for video (${videoDuration}s)`);
          
          // Use stream_loop with a safety margin and shortest option in filter
          // This ensures BGM continues for the entire video duration even if our duration calculation is slightly off
          const loopCount = Math.ceil(videoDuration / bgmDuration) + 1; // Extra loop for safety
          command.input(bgmPath).inputOptions([
            '-stream_loop', loopCount.toString(), // Loop more than needed
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

          finalAudioFilterChain = audioMixer.getAudioFilterChain(audioConfig, videoMetadata.hasAudio);
          console.log(`[ComposeAudioMix] Generated filter chain: ${finalAudioFilterChain}`);
        }

        // Apply complex audio filter
        if (finalAudioFilterChain) {
          command.complexFilter(finalAudioFilterChain);
        }

        // Video filters
        const videoFilters: string[] = [];

        // Half frame rate if enabled (doubles duration)
        if (config.halfFrameRate) {
          // Slow down video by doubling PTS and maintaining consistent frame timing
          videoFilters.push('setpts=2.0*PTS');
        }

        // If narration is longer than video, freeze last frame
        if (narrationDuration > videoDuration) {
          const freezeDuration = narrationDuration - videoDuration;
          videoFilters.push(`tpad=stop_mode=clone:stop_duration=${freezeDuration}`);
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

        // Map video and mixed audio
        if (finalAudioFilterChain) {
          // BGM/나레이션 믹싱이 있는 경우
          outputOptions.unshift('-map [mixed]', '-map 0:v');
        } else {
          // 자막만 추가하는 경우 - 원본 오디오 보존
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
        ffmpeg.setFfprobePath(ffprobeInstaller.path);
        debugLog(`[Metadata] FFprobe path reconfirmed: ${ffprobeInstaller.path}`);
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

        const result = {
          duration: metadata.format.duration || 10,
          width: videoStream.width || 1920,
          height: videoStream.height || 1080,
          hasAudio: hasValidAudio,
          videoCodec: videoStream.codec_name || 'unknown',
          audioCodec: audioStream?.codec_name,
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
