import { createWriteStream, promises as fs } from 'fs';
import * as path from 'path';
import fetch from 'node-fetch';
import { file as tmpFile } from 'tmp-promise';
import type { IFileManager } from '../interfaces';

/**
 * FileManager Service
 * Handles file downloads, binary extraction, and temporary file management
 */
export class FileManager implements IFileManager {
  private tempFiles: string[] = [];

  /**
   * Download file from URL to temporary location
   */
  async downloadFile(url: string): Promise<string> {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
      }

      // Extract file extension from URL or content-type
      const extension = this.getExtensionFromUrl(url) || this.getExtensionFromContentType(response.headers.get('content-type'));
      const tempPath = await this.createTempFile(extension);

      // Stream download to temp file
      const fileStream = createWriteStream(tempPath);
      await new Promise((resolve, reject) => {
        response.body.pipe(fileStream);
        response.body.on('error', reject);
        fileStream.on('finish', resolve);
      });

      return tempPath;
    } catch (error) {
      throw new Error(`File download failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract binary data to temporary file
   */
  async extractBinary(binaryData: Buffer, extension: string): Promise<string> {
    try {
      const tempPath = await this.createTempFile(extension);
      await fs.writeFile(tempPath, binaryData);
      return tempPath;
    } catch (error) {
      throw new Error(`Binary extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create temporary file path with extension
   */
  async createTempFile(extension: string): Promise<string> {
    const result = await tmpFile({
      prefix: 'sb-render-',
      postfix: extension.startsWith('.') ? extension : `.${extension}`,
      keep: true, // Keep file until manual cleanup
    });

    this.tempFiles.push(result.path);
    return result.path;
  }

  /**
   * Clean up temporary files
   */
  async cleanup(files?: string[]): Promise<void> {
    const filesToClean = files || this.tempFiles;

    await Promise.all(
      filesToClean.map(async (file) => {
        try {
          await fs.unlink(file);
        } catch (error) {
          // Ignore errors if file doesn't exist
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            console.warn(`Failed to clean up temp file ${file}:`, error);
          }
        }
      }),
    );

    if (!files) {
      this.tempFiles = [];
    }
  }

  /**
   * Extract file extension from URL
   */
  private getExtensionFromUrl(url: string): string {
    const urlPath = new URL(url).pathname;
    const ext = path.extname(urlPath);
    return ext || '';
  }

  /**
   * Get file extension from Content-Type header
   */
  private getExtensionFromContentType(contentType: string | null): string {
    if (!contentType) return '';

    const mimeToExt: Record<string, string> = {
      'video/mp4': '.mp4',
      'video/quicktime': '.mov',
      'video/webm': '.webm',
      'video/x-msvideo': '.avi',
      'audio/mpeg': '.mp3',
      'audio/wav': '.wav',
      'audio/aac': '.aac',
      'audio/ogg': '.ogg',
    };

    const mimeType = contentType.split(';')[0].trim();
    return mimeToExt[mimeType] || '';
  }

  /**
   * Get list of tracked temporary files
   */
  getTempFiles(): string[] {
    return [...this.tempFiles];
  }
}
