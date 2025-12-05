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

    // Validate essential parameters
    if (!config.videoDuration || config.videoDuration <= 0) {
      console.warn('[AudioMixer] Invalid video duration, using default 10s');
      config.videoDuration = 10;
    }

    console.log(`[AudioMixer] Building filter chain - BGM: ${!!config.bgmPath}, Narration: ${!!config.narrationPath}, OriginalAudio: ${hasOriginalAudio}`);

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

      console.log(`[AudioMixer] Processing BGM - Volume: ${bgmVolume}, Duration: ${videoDuration}s`);

      // BGM is looped at input level with stream_loop
      // Apply volume and basic processing
      // DO NOT trim BGM - let it continue until the longest audio ends
      let bgmFilter = `[${inputIndex}:a]volume=${bgmVolume}`;

      // Add fade effects if specified and values are valid
      if (bgmFadeIn > 0 && !isNaN(bgmFadeIn)) {
        bgmFilter += `,afade=t=in:ss=0:d=${bgmFadeIn}`;
        console.log(`[AudioMixer] Adding BGM fade in: ${bgmFadeIn}s`);
      }
      // Note: Fade out will be handled at the end based on actual mixed duration
      // For now, we don't apply fade out to BGM to preserve narration length

      bgmFilter += `[bgm]`;

      console.log(`[AudioMixer] BGM filter: ${bgmFilter}`);
      filters.push(bgmFilter);
      inputs.push('[bgm]');
      inputIndex++;
    }

    // Handle Narration
    if (config.narrationPath) {
      const narrationVolume = config.narrationVolume / 100;
      const delay = config.narrationDelay * 1000; // Convert to milliseconds

      console.log(`[AudioMixer] Processing Narration - Volume: ${narrationVolume}, Delay: ${delay}ms`);

      let narrationFilter = `[${inputIndex}:a]volume=${narrationVolume}`;

      // Add delay if specified and value is valid
      if (delay > 0 && !isNaN(delay)) {
        narrationFilter += `,adelay=${delay}|${delay}`;
        console.log(`[AudioMixer] Adding narration delay: ${delay}ms`);
      }

      narrationFilter += '[narration]';
      
      console.log(`[AudioMixer] Narration filter: ${narrationFilter}`);
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
      // Remove 'acopy' as it might not be recognized in some FFmpeg versions
      filters.push(`${singleInput}anull[mixed]`);
    } else {
      // Mix multiple audio sources
      // Use 'longest' to ensure BGM continues for entire video duration
      const mixInputs = inputs.join('');
      
      // Simple mix without problematic options that may not be supported
      filters.push(
        `${mixInputs}amix=inputs=${inputs.length}:duration=longest[mixed]`,
      );
    }

    const filterChain = filters.join(';');
    console.log(`[AudioMixer] Generated filter chain: ${filterChain}`);

    // Comprehensive validation
    if (!this.validateFilterChain(filterChain)) {
      console.error('[AudioMixer] Filter chain validation failed');
      return '';
    }

    return filterChain;
  }

  /**
   * Validate FFmpeg audio filter chain syntax
   */
  private validateFilterChain(filterChain: string): boolean {
    if (!filterChain || filterChain.trim() === '') {
      console.warn('[AudioMixer] Empty filter chain');
      return false;
    }

    // Check for undefined/NaN/null values
    if (filterChain.includes('undefined') || filterChain.includes('NaN') || filterChain.includes('null')) {
      console.error('[AudioMixer] Filter chain contains invalid values (undefined/NaN/null)');
      return false;
    }

    // Check for balanced brackets
    const openBrackets = (filterChain.match(/\[/g) || []).length;
    const closeBrackets = (filterChain.match(/\]/g) || []).length;
    if (openBrackets !== closeBrackets) {
      console.error(`[AudioMixer] Unbalanced brackets: ${openBrackets} open, ${closeBrackets} close`);
      return false;
    }

    // Check for [mixed] output label (required for our audio mixing)
    if (!filterChain.includes('[mixed]')) {
      console.error('[AudioMixer] Missing [mixed] output label');
      return false;
    }

    // Check for valid audio filter names
    const validFilters = ['volume', 'adelay', 'afade', 'amix', 'anullsrc', 'atrim', 'apad'];
    const hasValidFilter = validFilters.some(f => filterChain.includes(f));
    if (!hasValidFilter) {
      console.warn('[AudioMixer] No recognized audio filters found in chain');
    }

    return true;
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
