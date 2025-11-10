import { promises as fs } from 'fs';
// import * as path from 'path'; // Unused
import { file as tmpFile } from 'tmp-promise';
import type { ISubtitleEngine, ISubtitleConfig } from '../interfaces';

/**
 * SubtitleEngine Service
 * Generates SRT and ASS subtitle files with customizable styling
 */
export class SubtitleEngine implements ISubtitleEngine {
  /**
   * Generate SRT subtitle file (simple format, limited styling)
   */
  generateSRT(subtitles: ISubtitleConfig[]): string {
    const srtBlocks: string[] = [];

    subtitles.forEach((subtitle, index) => {
      const startTime = this.formatSRTTime(subtitle.startTime);
      const endTime = this.formatSRTTime(subtitle.endTime);

      srtBlocks.push(
        `${index + 1}\n${startTime} --> ${endTime}\n${subtitle.text}\n`,
      );
    });

    return srtBlocks.join('\n');
  }

  /**
   * Generate ASS subtitle file with full styling support
   */
  generateASS(subtitles: ISubtitleConfig[], videoWidth: number, videoHeight: number): string {
    const header = this.generateASSHeader(videoWidth, videoHeight);
    const styles = this.generateASSStyles(subtitles);
    const events = this.generateASSEvents(subtitles, videoWidth, videoHeight);

    return `${header}\n\n${styles}\n\n${events}`;
  }

  /**
   * Write subtitle file to disk
   */
  async writeSubtitleFile(content: string, format: 'srt' | 'ass'): Promise<string> {
    const { path: tempPath } = await tmpFile({
      prefix: 'sb-render-subtitle-',
      postfix: `.${format}`,
      keep: true,
    });

    await fs.writeFile(tempPath, content, 'utf8');
    return tempPath;
  }

  /**
   * Format time in SRT format (HH:MM:SS,mmm)
   */
  private formatSRTTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.floor((seconds % 1) * 1000);

    return `${this.pad(hours, 2)}:${this.pad(minutes, 2)}:${this.pad(secs, 2)},${this.pad(millis, 3)}`;
  }

  /**
   * Format time in ASS format (H:MM:SS.cc)
   */
  private formatASSTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const centisecs = Math.floor((seconds % 1) * 100);

    return `${hours}:${this.pad(minutes, 2)}:${this.pad(secs, 2)}.${this.pad(centisecs, 2)}`;
  }

  /**
   * Generate ASS file header
   */
  private generateASSHeader(videoWidth: number, videoHeight: number): string {
    return `[Script Info]
Title: sb-render subtitles
ScriptType: v4.00+
WrapStyle: 0
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}
ScaledBorderAndShadow: yes`;
  }

  /**
   * Generate ASS styles section
   */
  private generateASSStyles(subtitles: ISubtitleConfig[]): string {
    const stylesHeader = `[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding`;

    const uniqueStyles = new Map<string, string>();

    subtitles.forEach((subtitle, index) => {
      const styleName = `Style${index}`;
      const primaryColor = this.hexToASSColor(subtitle.fontColor);
      const outlineColor = this.hexToASSColor(subtitle.borderColor || '#000000');
      const backColor = this.hexToASSColor(subtitle.backgroundColor || '#000000', subtitle.backgroundOpacity);

      const alignment = this.getASSAlignment(subtitle.alignment, subtitle.position);
      const outline = subtitle.borderWidth || 2;

      const styleDefinition = `Style: ${styleName},${subtitle.fontFamily},${subtitle.fontSize},${primaryColor},${primaryColor},${outlineColor},${backColor},0,0,0,0,100,100,0,0,1,${outline},2,${alignment},10,10,10,1`;

      uniqueStyles.set(styleName, styleDefinition);
    });

    const styleLines = Array.from(uniqueStyles.values()).join('\n');
    return `${stylesHeader}\n${styleLines}`;
  }

  /**
   * Generate ASS events section
   */
  private generateASSEvents(subtitles: ISubtitleConfig[], _videoWidth: number, videoHeight: number): string {
    const eventsHeader = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

    const eventLines: string[] = [];

    subtitles.forEach((subtitle, index) => {
      const startTime = this.formatASSTime(subtitle.startTime);
      const endTime = this.formatASSTime(subtitle.endTime);
      const styleName = `Style${index}`;

      // Calculate position override if custom position
      let positionTag = '';
      if (subtitle.position === 'custom' && subtitle.customX !== undefined && subtitle.customY !== undefined) {
        positionTag = `{\\pos(${subtitle.customX},${subtitle.customY})}`;
      } else {
        // Use margin-based positioning
        const marginV = this.getMarginV(subtitle.position, subtitle.customY, videoHeight);
        eventLines.push(
          `Dialogue: 0,${startTime},${endTime},${styleName},,0,0,${marginV},,${positionTag}${subtitle.text}`,
        );
        return;
      }

      eventLines.push(
        `Dialogue: 0,${startTime},${endTime},${styleName},,0,0,0,,${positionTag}${subtitle.text}`,
      );
    });

    return `${eventsHeader}\n${eventLines.join('\n')}`;
  }

  /**
   * Convert hex color to ASS color format (&HAABBGGRR)
   */
  private hexToASSColor(hex: string, opacity: number = 100): string {
    // Remove # if present
    hex = hex.replace('#', '');

    // Parse RGB
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    // Convert opacity percentage to alpha (0-255, inverted for ASS)
    const alpha = Math.round((100 - opacity) * 2.55);

    // Format as &HAABBGGRR
    return `&H${this.toHex(alpha)}${this.toHex(b)}${this.toHex(g)}${this.toHex(r)}`;
  }

  /**
   * Get ASS alignment number based on position and alignment
   */
  private getASSAlignment(alignment: string, position: string): number {
    // ASS alignment: 1-3 bottom, 4-6 middle, 7-9 top
    // Within each row: 1/4/7 left, 2/5/8 center, 3/6/9 right

    let baseAlignment = 0;

    if (position === 'bottom') baseAlignment = 1;
    else if (position === 'middle') baseAlignment = 4;
    else if (position === 'top') baseAlignment = 7;
    else baseAlignment = 5; // default to center-middle

    if (alignment === 'left') return baseAlignment;
    if (alignment === 'center') return baseAlignment + 1;
    if (alignment === 'right') return baseAlignment + 2;

    return baseAlignment + 1; // default center
  }

  /**
   * Calculate vertical margin based on position
   */
  private getMarginV(position: string, customY: number | undefined, videoHeight: number): number {
    if (customY !== undefined) return customY;

    if (position === 'top') return 50;
    if (position === 'middle') return Math.round(videoHeight / 2);
    if (position === 'bottom') return 100;

    return 100; // default bottom
  }

  /**
   * Convert number to 2-digit hex
   */
  private toHex(num: number): string {
    return num.toString(16).padStart(2, '0').toUpperCase();
  }

  /**
   * Pad number with zeros
   */
  private pad(num: number, length: number): string {
    return num.toString().padStart(length, '0');
  }

  /**
   * Validate subtitle configuration
   */
  validateSubtitles(subtitles: ISubtitleConfig[]): void {
    subtitles.forEach((subtitle, index) => {
      if (!subtitle.text || subtitle.text.trim() === '') {
        throw new Error(`Subtitle ${index + 1}: Text cannot be empty`);
      }

      if (subtitle.startTime < 0) {
        throw new Error(`Subtitle ${index + 1}: Start time cannot be negative`);
      }

      if (subtitle.endTime <= subtitle.startTime) {
        throw new Error(`Subtitle ${index + 1}: End time must be greater than start time`);
      }

      if (subtitle.fontSize <= 0) {
        throw new Error(`Subtitle ${index + 1}: Font size must be positive`);
      }

      if (subtitle.position === 'custom') {
        if (subtitle.customX === undefined || subtitle.customY === undefined) {
          throw new Error(`Subtitle ${index + 1}: Custom position requires customX and customY`);
        }
      }
    });
  }
}
