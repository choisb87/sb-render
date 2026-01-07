import {
  validateVideoSource,
  validateBGMConfig,
  ValidationError,
} from '../nodes/SbRender/utils/validation';
import type { ISbRenderNodeParams } from '../nodes/SbRender/interfaces';

describe('Validation Utilities', () => {
  describe('validateVideoSource', () => {
    it('should throw if videoSource is missing', () => {
      const params = {} as ISbRenderNodeParams;
      expect(() => validateVideoSource(params)).toThrow(ValidationError);
    });

    it('should throw if videoUrl is missing when source is url', () => {
      const params = {
        videoSource: 'url',
        videoUrl: '',
      } as ISbRenderNodeParams;
      expect(() => validateVideoSource(params)).toThrow(ValidationError);
    });

    it('should pass if videoUrl is valid', () => {
      const params = {
        videoSource: 'url',
        videoUrl: 'https://example.com/video.mp4',
      } as ISbRenderNodeParams;
      expect(() => validateVideoSource(params)).not.toThrow();
    });

    it('should throw if videoUrl is invalid', () => {
      const params = {
        videoSource: 'url',
        videoUrl: 'not-a-url',
      } as ISbRenderNodeParams;
      expect(() => validateVideoSource(params)).toThrow(ValidationError);
    });
  });

  describe('validateBGMConfig', () => {
    it('should do nothing if enableBGM is false', () => {
      const params = {
        enableBGM: false,
      } as ISbRenderNodeParams;
      expect(() => validateBGMConfig(params)).not.toThrow();
    });

    it('should throw if bgmSource is missing when enabled', () => {
      const params = {
        enableBGM: true,
      } as ISbRenderNodeParams;
      expect(() => validateBGMConfig(params)).toThrow(ValidationError);
    });

     it('should validate volume range', () => {
      const params = {
        enableBGM: true,
        bgmSource: 'url',
        bgmUrl: 'https://example.com/music.mp3',
        bgmVolume: 101, // Invalid
      } as ISbRenderNodeParams;
      expect(() => validateBGMConfig(params)).toThrow(ValidationError);
    });

    it('should pass with valid config', () => {
      const params = {
        enableBGM: true,
        bgmSource: 'url',
        bgmUrl: 'https://example.com/music.mp3',
        bgmVolume: 50,
      } as ISbRenderNodeParams;
      expect(() => validateBGMConfig(params)).not.toThrow();
    });
  });
});
