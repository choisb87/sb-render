import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { accessSync } from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import type { IVideoComposer, IVideoMetadata, ISbRenderNodeParams } from '../interfaces';

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Set FFprobe path - try multiple sources
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
  ffmpeg.setFfprobePath(ffprobeInstaller.path);
} catch (error) {
  // If @ffprobe-installer is not available, try to find ffprobe in the same directory as ffmpeg
  const ffmpegDir = dirname(ffmpegInstaller.path);
  const ffprobePath = join(ffmpegDir, 'ffprobe');
  try {
    accessSync(ffprobePath);
    ffmpeg.setFfprobePath(ffprobePath);
  } catch {
    // ffprobe will need to be in system PATH
    console.warn('ffprobe not found in package, will try system PATH');
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

        command
          .videoCodec(config.videoCodec || 'libx264')
          .outputOptions([
            `-crf ${crf}`,
            '-preset medium',
            '-movflags +faststart', // Enable streaming
          ]);

        // Audio codec
        if (audioPath) {
          command
            .audioCodec('aac')
            .audioBitrate('192k');
        } else {
          command.noAudio();
        }

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
    // Get video duration
    const videoMetadata = await this.getVideoMetadata(videoPath);
    const videoDuration = videoMetadata.duration;

    // Get narration duration if exists
    let narrationDuration = 0;
    if (narrationPath) {
      try {
        const narrationMetadata = await this.getAudioDuration(narrationPath);
        narrationDuration = narrationMetadata;
      } catch (error) {
        console.warn('Failed to get narration duration:', error);
      }
    }

    return new Promise((resolve, reject) => {
      try {
        const command = ffmpeg(videoPath);

        // Add BGM input
        if (bgmPath) {
          command.input(bgmPath);
        }

        // Add narration input
        if (narrationPath) {
          command.input(narrationPath);
        }

        // Apply complex audio filter
        if (audioFilterChain) {
          command.complexFilter(audioFilterChain);
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

        // Map video and mixed audio
        command.outputOptions([
          '-map 0:v',
          audioFilterChain ? '-map [mixed]' : '',
        ].filter(Boolean));

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
      // Try to use ffprobe
      ffmpeg.ffprobe(videoPath, (error, metadata) => {
        if (error) {
          // If ffprobe fails, return default metadata
          console.warn('ffprobe failed, using default metadata:', error.message);
          resolve({
            duration: 10, // Default 10 seconds
            width: 1920,
            height: 1080,
            hasAudio: false, // Assume no audio to avoid stream errors
            videoCodec: 'unknown',
            audioCodec: undefined,
          });
          return;
        }

        const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
        const audioStream = metadata.streams.find((s) => s.codec_type === 'audio');

        // Check if audio stream is valid (has codec and channels)
        const hasValidAudio = !!audioStream &&
                             !!audioStream.codec_name &&
                             audioStream.codec_name !== 'none' &&
                             (audioStream.channels ?? 0) > 0;

        if (!videoStream) {
          // No video stream found, use defaults
          console.warn('No video stream found, using default metadata');
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

        resolve({
          duration: metadata.format.duration || 10,
          width: videoStream.width || 1920,
          height: videoStream.height || 1080,
          hasAudio: hasValidAudio,
          videoCodec: videoStream.codec_name || 'unknown',
          audioCodec: audioStream?.codec_name,
        });
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

    // Check if videos have audio streams
    const hasAudio = await Promise.all(
      videoPaths.map(async (videoPath) => {
        try {
          const metadata = await this.getVideoMetadata(videoPath);
          return metadata.hasAudio;
        } catch {
          return false;
        }
      })
    );

    const allHaveAudio = hasAudio.every(has => has);

    return new Promise((resolve, reject) => {
      try {
        const command = ffmpeg();

        // Add all video inputs
        videoPaths.forEach(videoPath => {
          command.input(videoPath);
        });

        // Create concat filter based on audio availability
        let filterString: string;
        if (allHaveAudio) {
          // All videos have audio - use normal concat
          filterString = videoPaths.map((_, index) => `[${index}:v][${index}:a]`).join('') +
                        `concat=n=${videoPaths.length}:v=1:a=1[outv][outa]`;
        } else {
          // Some videos don't have audio - video only concat
          filterString = videoPaths.map((_, index) => `[${index}:v]`).join('') +
                        `concat=n=${videoPaths.length}:v=1:a=0[outv]`;
        }

        command.complexFilter(filterString);

        // Map output streams
        if (allHaveAudio) {
          command.outputOptions([
            '-map [outv]',
            '-map [outa]',
          ]);
        } else {
          command.outputOptions([
            '-map [outv]',
          ]);
        }

        // Set output codec and quality
        const crf = this.getCRF(quality, customCRF);

        command
          .videoCodec(videoCodec)
          .outputOptions([
            `-crf ${crf}`,
            '-preset medium',
            '-movflags +faststart',
          ]);

        // Add audio codec only if videos have audio
        if (allHaveAudio) {
          command
            .audioCodec('aac')
            .audioBitrate('192k');
        }

        command
          .format(outputFormat)
          .output(outputPath);

        // Handle events
        command.on('start', (commandLine: string) => {
          console.log('FFmpeg merge command:', commandLine);
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
