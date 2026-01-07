import { SubtitleEngine } from '../nodes/SbRender/services/SubtitleEngine';

describe('SubtitleEngine', () => {
  let engine: SubtitleEngine;

  beforeEach(() => {
    engine = new SubtitleEngine();
  });

  describe('parseSRT', () => {
    it('should parse a simple SRT string', () => {
      const srt = `1
00:00:01,000 --> 00:00:05,000
Hello World`;

      const subtitles = engine.parseSRT(srt);
      expect(subtitles).toHaveLength(1);
      expect(subtitles[0].text).toBe('Hello World');
      expect(subtitles[0].startTime).toBe(1);
      expect(subtitles[0].endTime).toBe(5);
    });

    it('should parse multiple subtitle blocks', () => {
      const srt = `1
00:00:01,000 --> 00:00:02,000
First

2
00:00:03,000 --> 00:00:04,000
Second`;

      const subtitles = engine.parseSRT(srt);
      expect(subtitles).toHaveLength(2);
      expect(subtitles[0].text).toBe('First');
      expect(subtitles[1].text).toBe('Second');
    });

    it('should handle timestamp format MM:SS,mmm', () => {
        const srt = `1
00:01,000 --> 00:05,000
Short Format`;

        const subtitles = engine.parseSRT(srt);
        expect(subtitles).toHaveLength(1);
        expect(subtitles[0].startTime).toBe(1);
        expect(subtitles[0].endTime).toBe(5);
    });

    it('should use default config values', () => {
      const srt = `1
00:00:01,000 --> 00:00:05,000
Test`;

      const subtitles = engine.parseSRT(srt);
      expect(subtitles[0].fontSize).toBe(75); // Default from code
      expect(subtitles[0].fontColor).toBe('#FFFFFF');
    });

    it('should override defaults with provided config', () => {
        const srt = `1
00:00:01,000 --> 00:00:05,000
Test`;

        const subtitles = engine.parseSRT(srt, { fontSize: 100, fontColor: '#FF0000' });
        expect(subtitles[0].fontSize).toBe(100);
        expect(subtitles[0].fontColor).toBe('#FF0000');
    });

    it('should adjust overlapping subtitles', () => {
        const srt = `1
00:00:01,000 --> 00:00:05,000
First

2
00:00:04,000 --> 00:00:06,000
Second`; // Starts before first ends

        const subtitles = engine.parseSRT(srt);
        expect(subtitles).toHaveLength(2);
        // First subtitle should end before second starts (minus gap)
        expect(subtitles[0].endTime).toBeLessThan(subtitles[1].startTime);
        expect(subtitles[0].endTime).toBe(3.95); // 4.00 - 0.05
    });
  });

  describe('generateSRT', () => {
    it('should generate valid SRT string from config', () => {
        const subtitles = [{
            startTime: 1,
            endTime: 5,
            text: 'Hello',
            fontSize: 20,
            fontColor: '#FFF',
            fontFamily: 'Arial',
            alignment: 'center' as const,
            position: 'bottom' as const,
        }];

        const output = engine.generateSRT(subtitles);
        expect(output).toContain('1');
        expect(output).toContain('00:00:01,000 --> 00:00:05,000');
        expect(output).toContain('Hello');
    });
  });

  describe('validateSubtitles', () => {
      it('should throw if text is empty', () => {
          const subtitles = [{
              startTime: 1,
              endTime: 5,
              text: '',
              fontSize: 20,
              fontColor: '#FFF',
              fontFamily: 'Arial',
              alignment: 'center' as const,
              position: 'bottom' as const,
          }];
          expect(() => engine.validateSubtitles(subtitles)).toThrow();
      });

      it('should throw if end time is before start time', () => {
        const subtitles = [{
            startTime: 5,
            endTime: 1,
            text: 'test',
            fontSize: 20,
            fontColor: '#FFF',
            fontFamily: 'Arial',
            alignment: 'center' as const,
            position: 'bottom' as const,
        }];
        expect(() => engine.validateSubtitles(subtitles)).toThrow();
    });
  });
});
