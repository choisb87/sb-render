import type { IAudioMixer, IAudioMixConfig } from '../interfaces';

/**
 * Simple AudioMixer Service
 * Uses basic FFmpeg input/output mapping instead of complex filters
 */
export class SimpleAudioMixer implements IAudioMixer {
  /**
   * Mix BGM and narration with video audio using simple approach
   */
  async mixAudioTracks(
    videoPath: string,
    _config: IAudioMixConfig,
  ): Promise<string> {
    return videoPath;
  }

  /**
   * Generate simple FFmpeg input/output configuration
   * Returns empty string to indicate no complex filter needed
   */
  getAudioFilterChain(_config: IAudioMixConfig, _hasOriginalAudio: boolean): string {
    // Return empty - we'll handle audio mixing with simple input/output mapping
    return '';
  }

  /**
   * Get FFmpeg command options for simple audio mixing
   */
  getSimpleAudioOptions(config: IAudioMixConfig, hasOriginalAudio: boolean): {
    inputOptions: string[],
    outputOptions: string[],
    inputCount: number
  } {
    const inputOptions: string[] = [];
    const outputOptions: string[] = [];
    let inputCount = 1; // Video is input 0

    console.log(`[SimpleAudioMixer] Config - BGM: ${!!config.bgmPath}, Narration: ${!!config.narrationPath}, Original: ${hasOriginalAudio}`);

    // Handle BGM
    if (config.bgmPath) {
      const bgmVolume = config.bgmVolume / 100;
      const videoDuration = config.videoDuration;
      
      // Add BGM input options
      inputOptions.push(
        '-stream_loop', '-1',  // Loop BGM
        '-t', videoDuration.toString()  // Duration limit
      );
      
      // BGM will be input 1 (or next available)
      outputOptions.push(`-filter_complex "[${inputCount}:a]volume=${bgmVolume}[bgm]"`);
      inputCount++;
    }

    // Handle narration
    if (config.narrationPath) {
      // Narration will be next input
      if (config.narrationDelay > 0) {
        outputOptions.push(`-filter_complex "[${inputCount}:a]volume=${config.narrationVolume / 100},adelay=${config.narrationDelay * 1000}|${config.narrationDelay * 1000}[narration]"`);
      } else {
        outputOptions.push(`-filter_complex "[${inputCount}:a]volume=${config.narrationVolume / 100}[narration]"`);
      }
      inputCount++;
    }

    // Mix all audio sources
    if (config.bgmPath && config.narrationPath && hasOriginalAudio) {
      // All three: video audio, BGM, narration
      outputOptions.push('-filter_complex "[0:a][bgm][narration]amix=inputs=3:duration=longest[mixed]"');
      outputOptions.push('-map', '0:v', '-map', '[mixed]');
    } else if (config.bgmPath && hasOriginalAudio) {
      // Video audio + BGM
      outputOptions.push('-filter_complex "[0:a][bgm]amix=inputs=2:duration=longest[mixed]"');
      outputOptions.push('-map', '0:v', '-map', '[mixed]');
    } else if (config.narrationPath && hasOriginalAudio) {
      // Video audio + narration
      outputOptions.push('-filter_complex "[0:a][narration]amix=inputs=2:duration=longest[mixed]"');
      outputOptions.push('-map', '0:v', '-map', '[mixed]');
    } else if (config.bgmPath) {
      // BGM only
      outputOptions.push('-map', '0:v', '-map', '[bgm]');
    } else if (config.narrationPath) {
      // Narration only
      outputOptions.push('-map', '0:v', '-map', '[narration]');
    } else {
      // Original audio only
      outputOptions.push('-map', '0:v', '-map', '0:a');
    }

    return { inputOptions, outputOptions, inputCount: inputCount - 1 };
  }

  /**
   * Calculate the number of audio inputs for FFmpeg command
   */
  getAudioInputCount(config: IAudioMixConfig, hasOriginalAudio: boolean): number {
    let count = 0;
    if (hasOriginalAudio) count++;
    if (config.bgmPath) count++;
    if (config.narrationPath) count++;
    return count;
  }

  /**
   * Validate audio mix configuration
   */
  validateConfig(config: IAudioMixConfig): void {
    if (config.bgmVolume < 0 || config.bgmVolume > 100) {
      throw new Error('BGM volume must be between 0 and 100');
    }

    if (config.narrationVolume < 0 || config.narrationVolume > 100) {
      throw new Error('Narration volume must be between 0 and 100');
    }

    if (config.bgmFadeIn < 0) {
      throw new Error('BGM fade-in duration must be non-negative');
    }

    if (config.bgmFadeOut < 0) {
      throw new Error('BGM fade-out duration must be non-negative');
    }

    if (config.narrationDelay < 0) {
      throw new Error('Narration delay must be non-negative');
    }

    if (config.videoDuration <= 0) {
      throw new Error('Video duration must be positive');
    }
  }
}