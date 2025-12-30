/**
 * FFmpeg utility functions
 */

/**
 * Format seconds to HH:MM:SS format
 */
export function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(secs, 2)}`;
}

/**
 * Pad number with zeros
 */
export function pad(num: number, length: number): string {
  return num.toString().padStart(length, '0');
}

/**
 * Escape special characters for FFmpeg filter syntax
 */
export function escapeFilterString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/\[/g, '\\[')
    .replace(/]/g, '\\]')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/**
 * Escape file path for FFmpeg
 */
export function escapeFilePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:');
}

/**
 * Convert percentage to decimal
 */
export function percentageToDecimal(percentage: number): number {
  return percentage / 100;
}

/**
 * Get file extension from path
 */
export function getFileExtension(path: string): string {
  const parts = path.split('.');
  return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
}

/**
 * Validate FFmpeg is available
 */
export async function validateFFmpegAvailable(): Promise<boolean> {
  try {
    const ffmpegPath = await import('ffmpeg-static');
    return !!ffmpegPath.default;
  } catch {
    return false;
  }
}
