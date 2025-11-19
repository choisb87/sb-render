import type { IAudioMixer, IAudioMixConfig } from '../interfaces';

/**
 * AudioMixer Service
 * Handles audio track mixing with volume control and fade effects
 */
export class AudioMixer implements IAudioMixer {
  /**
   * Mix BGM and narration with video audio
   * Returns path to video with mixed audio
   */
  async mixAudioTracks(
    videoPath: string,
    _config: IAudioMixConfig,
  ): Promise<string> {
    // This method would typically use FFmpeg directly
    // For now, we return the filter chain that will be used by VideoComposer
    // The actual mixing happens during final composition
    return videoPath;
  }

  /**
   * Generate FFmpeg audio filter chain
   * Creates complex filter for mixing multiple audio sources
   */
  getAudioFilterChain(config: IAudioMixConfig, hasOriginalAudio: boolean): string {
    const filters: string[] = [];
    const inputs: string[] = [];
    let inputIndex = 1; // Start from 1 (0 is video, 1 is first audio input)

    // Handle original video audio
    if (hasOriginalAudio) {
      filters.push('[0:a]volume=1.0[original]');
      inputs.push('[original]');
    }

    //Handle BGM
    if (config.bgmPath) {
      const bgmVolume = config.bgmVolume / 100;
      const videoDuration = config.videoDuration;
      const bgmFadeIn = config.bgmFadeIn || 0;
      const bgmFadeOut = config.bgmFadeOut || 0;

      // BGM is looped at input level with stream_loop
      // Apply volume, fade effects, and ensure it matches video duration
      let bgmFilter = `[${inputIndex}:a]volume=${bgmVolume}`;
      
      // Add fade effects if specified
      if (bgmFadeIn > 0) {
        bgmFilter += `,afade=t=in:ss=0:d=${bgmFadeIn}`;
      }
      if (bgmFadeOut > 0) {
        const fadeStart = Math.max(0, videoDuration - bgmFadeOut);
        bgmFilter += `,afade=t=out:st=${fadeStart}:d=${bgmFadeOut}`;
      }
      
      // Use apad instead of atrim for better duration handling
      // This ensures BGM continues for the entire video even if slightly longer
      bgmFilter += `,apad=pad_dur=${videoDuration},atrim=0:${videoDuration},asetpts=PTS-STARTPTS[bgm]`;

      filters.push(bgmFilter);
      inputs.push('[bgm]');
      inputIndex++;
    }

    // Handle Narration
    if (config.narrationPath) {
      const narrationVolume = config.narrationVolume / 100;
      const delay = config.narrationDelay * 1000; // Convert to milliseconds

      let narrationFilter = `[${inputIndex}:a]volume=${narrationVolume}`;

      // Add delay if specified
      if (delay > 0) {
        narrationFilter += `,adelay=${delay}|${delay}`;
      }

      narrationFilter += '[narration]';
      filters.push(narrationFilter);
      inputs.push('[narration]');
      inputIndex++;
    }

    // Mix all audio tracks
    if (inputs.length === 0) {
      return ''; // No audio to mix
    }

    if (inputs.length === 1) {
      // Only one audio source, just use it directly
      const singleInput = inputs[0];
      filters.push(`${singleInput}acopy[mixed]`);
    } else {
      // Mix multiple audio sources
      // Use 'longest' to ensure BGM continues for entire video duration
      const mixInputs = inputs.join('');
      const videoDuration = config.videoDuration;
      
      // Ensure all inputs are padded to video duration before mixing
      // This prevents audio cutoff issues in n8n environment
      filters.push(
        `${mixInputs}amix=inputs=${inputs.length}:duration=first:dropout_transition=2,apad=pad_dur=${videoDuration},atrim=0:${videoDuration},dynaudnorm[mixed]`,
      );
    }

    return filters.join(';');
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
