import type { ISbRenderNodeParams, ISubtitleConfig } from '../interfaces';

/**
 * Validation utilities for sb-render node
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate video source configuration
 */
export function validateVideoSource(params: ISbRenderNodeParams): void {
  if (!params.videoSource) {
    throw new ValidationError('Video source must be specified (url or binary)');
  }

  if (params.videoSource === 'url') {
    if (!params.videoUrl || params.videoUrl.trim() === '') {
      throw new ValidationError('Video URL is required when video source is URL');
    }

    if (!isValidUrl(params.videoUrl)) {
      throw new ValidationError('Invalid video URL format');
    }
  }

  if (params.videoSource === 'binary') {
    if (!params.videoBinaryProperty || params.videoBinaryProperty.trim() === '') {
      throw new ValidationError('Video binary property name is required when video source is binary');
    }
  }
}

/**
 * Validate BGM configuration
 */
export function validateBGMConfig(params: ISbRenderNodeParams): void {
  if (!params.enableBGM) return;

  if (!params.bgmSource) {
    throw new ValidationError('BGM source must be specified when BGM is enabled');
  }

  if (params.bgmSource === 'url') {
    if (!params.bgmUrl || params.bgmUrl.trim() === '') {
      throw new ValidationError('BGM URL is required when BGM source is URL');
    }

    if (!isValidUrl(params.bgmUrl)) {
      throw new ValidationError('Invalid BGM URL format');
    }
  }

  if (params.bgmSource === 'binary') {
    if (!params.bgmBinaryProperty || params.bgmBinaryProperty.trim() === '') {
      throw new ValidationError('BGM binary property name is required when BGM source is binary');
    }
  }

  const volume = params.bgmVolume ?? 30;
  if (volume < 0 || volume > 100) {
    throw new ValidationError('BGM volume must be between 0 and 100');
  }

  const fadeIn = params.bgmFadeIn ?? 0;
  if (fadeIn < 0) {
    throw new ValidationError('BGM fade-in duration must be non-negative');
  }

  const fadeOut = params.bgmFadeOut ?? 0;
  if (fadeOut < 0) {
    throw new ValidationError('BGM fade-out duration must be non-negative');
  }
}

/**
 * Validate narration configuration
 */
export function validateNarrationConfig(params: ISbRenderNodeParams): void {
  if (!params.enableNarration) return;

  if (!params.narrationSource) {
    throw new ValidationError('Narration source must be specified when narration is enabled');
  }

  if (params.narrationSource === 'url') {
    if (!params.narrationUrl || params.narrationUrl.trim() === '') {
      throw new ValidationError('Narration URL is required when narration source is URL');
    }

    if (!isValidUrl(params.narrationUrl)) {
      throw new ValidationError('Invalid narration URL format');
    }
  }

  if (params.narrationSource === 'binary') {
    if (!params.narrationBinaryProperty || params.narrationBinaryProperty.trim() === '') {
      throw new ValidationError('Narration binary property name is required when narration source is binary');
    }
  }

  const volume = params.narrationVolume ?? 80;
  if (volume < 0 || volume > 100) {
    throw new ValidationError('Narration volume must be between 0 and 100');
  }

  const delay = params.narrationDelay ?? 0;
  if (delay < 0) {
    throw new ValidationError('Narration delay must be non-negative');
  }
}

/**
 * Validate subtitle configuration
 */
export function validateSubtitles(subtitles: ISubtitleConfig[]): void {
  if (!subtitles || subtitles.length === 0) return;

  subtitles.forEach((subtitle, index) => {
    if (!subtitle.text || subtitle.text.trim() === '') {
      throw new ValidationError(`Subtitle ${index + 1}: Text cannot be empty`);
    }

    if (subtitle.startTime < 0) {
      throw new ValidationError(`Subtitle ${index + 1}: Start time cannot be negative`);
    }

    if (subtitle.endTime <= subtitle.startTime) {
      throw new ValidationError(`Subtitle ${index + 1}: End time must be greater than start time`);
    }

    if (subtitle.fontSize <= 0) {
      throw new ValidationError(`Subtitle ${index + 1}: Font size must be positive`);
    }

    if (!isValidColor(subtitle.fontColor)) {
      throw new ValidationError(`Subtitle ${index + 1}: Invalid font color format (use #RRGGBB)`);
    }

    if (subtitle.backgroundColor && !isValidColor(subtitle.backgroundColor)) {
      throw new ValidationError(`Subtitle ${index + 1}: Invalid background color format (use #RRGGBB)`);
    }

    if (subtitle.borderColor && !isValidColor(subtitle.borderColor)) {
      throw new ValidationError(`Subtitle ${index + 1}: Invalid border color format (use #RRGGBB)`);
    }

    if (subtitle.backgroundOpacity !== undefined) {
      if (subtitle.backgroundOpacity < 0 || subtitle.backgroundOpacity > 100) {
        throw new ValidationError(`Subtitle ${index + 1}: Background opacity must be between 0 and 100`);
      }
    }

    if (subtitle.position === 'custom') {
      if (subtitle.customX === undefined || subtitle.customY === undefined) {
        throw new ValidationError(`Subtitle ${index + 1}: Custom position requires customX and customY`);
      }

      if (subtitle.customX < 0 || subtitle.customY < 0) {
        throw new ValidationError(`Subtitle ${index + 1}: Custom position coordinates must be non-negative`);
      }
    }
  });
}

/**
 * Validate output configuration
 */
export function validateOutputConfig(params: ISbRenderNodeParams): void {
  const validFormats = ['mp4', 'mov', 'webm'];
  if (params.outputFormat && !validFormats.includes(params.outputFormat)) {
    throw new ValidationError(`Invalid output format: ${params.outputFormat}. Must be one of: ${validFormats.join(', ')}`);
  }

  const validCodecs = ['libx264', 'libx265', 'vp9'];
  if (params.videoCodec && !validCodecs.includes(params.videoCodec)) {
    throw new ValidationError(`Invalid video codec: ${params.videoCodec}. Must be one of: ${validCodecs.join(', ')}`);
  }

  const validQualities = ['low', 'medium', 'high', 'custom'];
  if (params.quality && !validQualities.includes(params.quality)) {
    throw new ValidationError(`Invalid quality setting: ${params.quality}. Must be one of: ${validQualities.join(', ')}`);
  }

  if (params.quality === 'custom') {
    if (params.customCRF === undefined) {
      throw new ValidationError('Custom CRF value is required when quality is set to custom');
    }

    if (params.customCRF < 0 || params.customCRF > 51) {
      throw new ValidationError('Custom CRF must be between 0 and 51');
    }
  }

  if (!params.outputBinaryProperty || params.outputBinaryProperty.trim() === '') {
    throw new ValidationError('Output binary property name is required');
  }
}

/**
 * Validate all parameters
 */
export function validateParams(params: ISbRenderNodeParams): void {
  validateVideoSource(params);
  validateBGMConfig(params);
  validateNarrationConfig(params);

  if (params.enableSubtitles && params.subtitles?.subtitle) {
    validateSubtitles(params.subtitles.subtitle);
  }

  validateOutputConfig(params);
}

/**
 * Check if string is a valid URL
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if string is a valid hex color
 */
function isValidColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}
