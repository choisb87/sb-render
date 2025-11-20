/**
 * TypeScript interfaces for sb-render n8n node
 */

// ============================================================================
// Main Node Parameters
// ============================================================================

export interface ISbRenderNodeParams {
  resource: 'Video';
  operation: 'Render' | 'Merge' | 'ImageToVideo';

  // Video Input (for Render operation)
  videoSource?: 'url' | 'binary';
  videoUrl?: string;
  videoBinaryProperty?: string;

  // Media Items (for Merge operation)
  mediaItems?: { items?: Array<{ type: 'video' | 'image'; url: string; duration?: number }> };
  outputFilename?: string;

  // Image To Video (for ImageToVideo operation)
  images?: Array<{ url: string; duration: number }>;
  imageToVideoOutputFilename?: string;

  // BGM Input (Optional)
  enableBGM?: boolean;
  bgmSource?: 'url' | 'binary';
  bgmUrl?: string;
  bgmBinaryProperty?: string;
  bgmVolume?: number;
  bgmFadeIn?: number;
  bgmFadeOut?: number;

  // Narration Input (Optional)
  enableNarration?: boolean;
  narrationSource?: 'url' | 'binary';
  narrationUrl?: string;
  narrationBinaryProperty?: string;
  narrationVolume?: number;
  narrationDelay?: number;

  // Subtitle Configuration
  enableSubtitles?: boolean;
  subtitleSource?: 'manual' | 'srt_string' | 'srt_url' | 'srt_binary';
  srtContent?: string;
  srtFileUrl?: string;
  srtBinaryProperty?: string;
  subtitles?: { subtitle?: ISubtitleConfig[] };

  // Output Configuration (for Render operation)
  outputFormat?: 'mp4' | 'mov' | 'webm';
  videoCodec?: 'libx264' | 'libx265' | 'vp9';
  quality?: 'low' | 'medium' | 'high' | 'custom';
  customCRF?: number;
  halfFrameRate?: boolean;
  outputBinaryProperty?: string;

  // Output Configuration (for Merge operation)
  mergeOutputFormat?: 'mp4' | 'mov' | 'webm';
  mergeVideoCodec?: 'libx264' | 'libx265' | 'vp9';
  mergeQuality?: 'low' | 'medium' | 'high' | 'custom';
  mergeCustomCRF?: number;
  mergeOutputBinaryProperty?: string;

  // Output Configuration (for ImageToVideo operation)
  imageToVideoOutputFormat?: 'mp4' | 'mov' | 'webm';
  imageToVideoVideoCodec?: 'libx264' | 'libx265' | 'vp9';
  imageToVideoQuality?: 'low' | 'medium' | 'high' | 'custom';
  imageToVideoCustomCRF?: number;
  imageToVideoOutputBinaryProperty?: string;
}

// ============================================================================
// Subtitle Configuration
// ============================================================================

export interface ISubtitleConfig {
  text: string;
  startTime: number;
  endTime: number;
  position: 'top' | 'middle' | 'bottom' | 'custom';
  customX?: number;
  customY?: number;
  fontSize: number;
  fontColor: string;
  fontFamily: string;
  alignment: 'left' | 'center' | 'right';
  backgroundColor?: string;
  backgroundOpacity?: number;
  borderColor?: string;
  borderWidth?: number;
}

// ============================================================================
// Internal Processing Types
// ============================================================================

export interface IMediaFile {
  path: string;
  type: 'video' | 'audio' | 'subtitle';
  temporary: boolean;
}

export interface IAudioMixConfig {
  videoDuration: number;
  bgmPath?: string;
  bgmVolume: number;
  bgmFadeIn: number;
  bgmFadeOut: number;
  narrationPath?: string;
  narrationVolume: number;
  narrationDelay: number;
}

export interface IFFmpegCommand {
  inputs: string[];
  filters: string[];
  outputs: string[];
}

// ============================================================================
// Service Interfaces
// ============================================================================

export interface IFileManager {
  /**
   * Download file from URL to temporary location
   */
  downloadFile(url: string): Promise<string>;

  /**
   * Extract binary data to temporary file
   */
  extractBinary(binaryData: Buffer, extension: string): Promise<string>;

  /**
   * Create temporary file path with extension
   */
  createTempFile(extension: string): Promise<string>;

  /**
   * Clean up temporary files
   */
  cleanup(files: string[]): Promise<void>;
}

export interface IAudioMixer {
  /**
   * Mix BGM and narration with video audio
   */
  mixAudioTracks(
    videoPath: string,
    config: IAudioMixConfig,
  ): Promise<string>;

  /**
   * Generate FFmpeg audio filter chain
   */
  getAudioFilterChain(config: IAudioMixConfig, hasOriginalAudio: boolean): string;
}

export interface ISubtitleEngine {
  /**
   * Generate SRT subtitle file
   */
  generateSRT(subtitles: ISubtitleConfig[]): string;

  /**
   * Generate ASS subtitle file with styling
   */
  generateASS(subtitles: ISubtitleConfig[], videoWidth: number, videoHeight: number): string;

  /**
   * Write subtitle file to disk
   */
  writeSubtitleFile(content: string, format: 'srt' | 'ass'): Promise<string>;
}

export interface IVideoComposer {
  /**
   * Compose final video with audio and subtitles
   */
  compose(
    videoPath: string,
    audioPath: string | null,
    subtitlePath: string | null,
    outputPath: string,
    config: ISbRenderNodeParams,
  ): Promise<Buffer>;

  /**
   * Get video metadata (duration, resolution, codec)
   */
  getVideoMetadata(videoPath: string): Promise<IVideoMetadata>;
}

export interface IVideoMetadata {
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  videoCodec: string;
  audioCodec?: string;
  fps?: number; // Frames per second
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULTS = {
  // Audio
  bgmVolume: 30,
  bgmFadeIn: 2,
  bgmFadeOut: 2,
  narrationVolume: 80,
  narrationDelay: 0,

  // Subtitles
  subtitle: {
    position: 'bottom' as const,
    fontSize: 48,
    fontColor: '#FFFFFF',
    fontFamily: 'Arial',
    alignment: 'center' as const,
    backgroundColor: '#000000',
    backgroundOpacity: 80,
    borderColor: '#000000',
    borderWidth: 2,
    customY: 100, // pixels from bottom when position = 'bottom'
  },

  // Output
  outputFormat: 'mp4' as const,
  videoCodec: 'libx264' as const,
  quality: 'high' as const,
  crfMapping: {
    low: 28,
    medium: 23,
    high: 18,
  },
  outputBinaryProperty: 'data',
};
