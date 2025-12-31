/**
 * Minimal FFmpeg wrapper using child_process.spawn
 * Replaces deprecated fluent-ffmpeg library
 */
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { existsSync } from 'fs';
import { join } from 'path';
import ffmpegStaticPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

// Find binary in multiple locations (for n8n environment)
function findBinary(primaryPath: string | null, binaryName: string): string | null {
  if (primaryPath && existsSync(primaryPath)) {
    return primaryPath;
  }

  const searchPaths = [
    '/home/node/.n8n/node_modules/ffmpeg-static/ffmpeg',
    '/home/node/.n8n/node_modules/ffprobe-static/bin/linux/x64/ffprobe',
    '/home/node/.n8n/nodes/node_modules/ffmpeg-static/ffmpeg',
    '/home/node/.n8n/nodes/node_modules/ffprobe-static/bin/linux/x64/ffprobe',
    join(__dirname, '..', '..', '..', 'node_modules', 'ffmpeg-static', 'ffmpeg'),
    join(__dirname, '..', '..', '..', 'node_modules', 'ffprobe-static', 'bin', 'linux', 'x64', 'ffprobe'),
    join(__dirname, '..', '..', '..', '..', 'node_modules', 'ffmpeg-static', 'ffmpeg'),
    join(__dirname, '..', '..', '..', '..', 'node_modules', 'ffprobe-static', 'bin', 'linux', 'x64', 'ffprobe'),
    join(__dirname, '..', '..', '..', '..', '..', 'node_modules', 'ffmpeg-static', 'ffmpeg'),
    join(__dirname, '..', '..', '..', '..', '..', 'node_modules', 'ffprobe-static', 'bin', 'linux', 'x64', 'ffprobe'),
  ];

  for (const searchPath of searchPaths) {
    if (searchPath.includes(binaryName) && existsSync(searchPath)) {
      console.log(`[FFmpegWrapper] Found ${binaryName} at: ${searchPath}`);
      return searchPath;
    }
  }

  return null;
}

// Resolve binary paths
let ffmpegPath = findBinary(ffmpegStaticPath as string, 'ffmpeg') || 'ffmpeg';
let ffprobePath = findBinary(ffprobeStatic.path, 'ffprobe') || 'ffprobe';

console.log(`[FFmpegWrapper] FFmpeg path: ${ffmpegPath}`);
console.log(`[FFmpegWrapper] FFprobe path: ${ffprobePath}`);

export function setFfmpegPath(path: string): void {
  ffmpegPath = path;
}

export function setFfprobePath(path: string): void {
  ffprobePath = path;
}

export function getFfmpegPath(): string {
  return ffmpegPath;
}

export function getFfprobePath(): string {
  return ffprobePath;
}

export interface FfprobeData {
  format: {
    duration?: number;
    size?: string;
    bit_rate?: string;
    filename?: string;
  };
  streams: Array<{
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    duration?: string | number;
    channels?: number;
    sample_rate?: string;
    bit_rate?: string;
    r_frame_rate?: string;
  }>;
}

export interface AudioFilterOption {
  filter: string;
  options: string | number | Record<string, unknown>;
}

/**
 * Run ffprobe and return metadata
 */
export function ffprobe(
  filePath: string,
  optionsOrCallback?: string[] | ((error: Error | null, data?: FfprobeData) => void),
  callback?: (error: Error | null, data?: FfprobeData) => void,
): void {
  let options: string[] = [];
  let cb: (error: Error | null, data?: FfprobeData) => void;

  if (typeof optionsOrCallback === 'function') {
    cb = optionsOrCallback;
  } else if (Array.isArray(optionsOrCallback) && callback) {
    options = optionsOrCallback;
    cb = callback;
  } else if (callback) {
    cb = callback;
  } else {
    throw new Error('ffprobe requires a callback function');
  }

  const args = [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    ...options,
    filePath,
  ];

  const proc = spawn(ffprobePath, args);
  let stdout = '';
  let stderr = '';

  proc.stdout.on('data', (data) => {
    stdout += data.toString();
  });

  proc.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  proc.on('close', (code) => {
    if (code !== 0) {
      cb(new Error(`ffprobe exited with code ${code}: ${stderr}`));
      return;
    }

    try {
      const data = JSON.parse(stdout) as FfprobeData;
      cb(null, data);
    } catch (parseError) {
      cb(new Error(`Failed to parse ffprobe output: ${parseError}`));
    }
  });

  proc.on('error', (error) => {
    cb(error);
  });
}

/**
 * FFmpeg command builder
 */
export class FFmpegCommand extends EventEmitter {
  private inputs: Array<{ path: string; options: string[] }> = [];
  private outputPath = '';
  private outputOpts: string[] = [];
  private videoFilters_: string[] = [];
  private audioFilters_: string[] = [];
  private complexFilter_: string | null = null;
  private videoCodec_: string | null = null;
  private audioCodec_: string | null = null;
  private audioBitrate_: string | null = null;
  private format_: string | null = null;
  private process: ChildProcess | null = null;

  constructor(inputPath?: string) {
    super();
    if (inputPath) {
      this.inputs.push({ path: inputPath, options: [] });
    }
  }

  input(path: string): this {
    this.inputs.push({ path, options: [] });
    return this;
  }

  inputOptions(options: string[]): this {
    if (this.inputs.length > 0) {
      this.inputs[this.inputs.length - 1].options.push(...options);
    }
    return this;
  }

  videoCodec(codec: string): this {
    this.videoCodec_ = codec;
    return this;
  }

  audioCodec(codec: string): this {
    this.audioCodec_ = codec;
    return this;
  }

  audioBitrate(bitrate: string): this {
    this.audioBitrate_ = bitrate;
    return this;
  }

  videoFilters(filters: string[]): this {
    this.videoFilters_.push(...filters);
    return this;
  }

  audioFilters(filters: AudioFilterOption[]): this {
    for (const f of filters) {
      let filterStr = f.filter;
      if (typeof f.options === 'object' && !Array.isArray(f.options)) {
        const opts = Object.entries(f.options as Record<string, unknown>)
          .map(([k, v]) => `${k}=${v}`)
          .join(':');
        filterStr += `=${opts}`;
      } else {
        filterStr += `=${f.options}`;
      }
      this.audioFilters_.push(filterStr);
    }
    return this;
  }

  complexFilter(filterGraph: string): this {
    this.complexFilter_ = filterGraph;
    return this;
  }

  outputOptions(options: string[]): this {
    this.outputOpts.push(...options);
    return this;
  }

  format(fmt: string): this {
    this.format_ = fmt;
    return this;
  }

  output(path: string): this {
    this.outputPath = path;
    return this;
  }

  private buildArgs(): string[] {
    const args: string[] = ['-y']; // Overwrite output

    // Add inputs with their options
    for (const input of this.inputs) {
      args.push(...input.options);
      args.push('-i', input.path);
    }

    // Complex filter takes precedence
    if (this.complexFilter_) {
      args.push('-filter_complex', this.complexFilter_);
    } else {
      // Video filters
      if (this.videoFilters_.length > 0) {
        args.push('-vf', this.videoFilters_.join(','));
      }

      // Audio filters
      if (this.audioFilters_.length > 0) {
        args.push('-af', this.audioFilters_.join(','));
      }
    }

    // Output options (must come before codec options for proper ordering)
    args.push(...this.outputOpts);

    // Codecs (only if not already in outputOpts)
    if (this.videoCodec_ && !this.outputOpts.some(o => o.includes('-c:v') || o.includes('-vcodec'))) {
      args.push('-c:v', this.videoCodec_);
    }

    if (this.audioCodec_ && !this.outputOpts.some(o => o.includes('-c:a') || o.includes('-acodec'))) {
      args.push('-c:a', this.audioCodec_);
    }

    if (this.audioBitrate_ && !this.outputOpts.some(o => o.includes('-b:a'))) {
      args.push('-b:a', this.audioBitrate_);
    }

    // Format
    if (this.format_) {
      args.push('-f', this.format_);
    }

    // Output path
    args.push(this.outputPath);

    return args;
  }

  run(): void {
    const args = this.buildArgs();
    const commandLine = `${ffmpegPath} ${args.join(' ')}`;

    this.emit('start', commandLine);

    this.process = spawn(ffmpegPath, args);

    let stderr = '';
    let duration = 0;

    this.process.stderr?.on('data', (data: Buffer) => {
      const str = data.toString();
      stderr += str;

      // Parse duration from output
      const durationMatch = str.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
      if (durationMatch) {
        const hours = parseInt(durationMatch[1], 10);
        const minutes = parseInt(durationMatch[2], 10);
        const seconds = parseInt(durationMatch[3], 10);
        duration = hours * 3600 + minutes * 60 + seconds;
      }

      // Parse progress
      const timeMatch = str.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
      if (timeMatch && duration > 0) {
        const hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2], 10);
        const seconds = parseInt(timeMatch[3], 10);
        const currentTime = hours * 3600 + minutes * 60 + seconds;
        const percent = Math.min(100, (currentTime / duration) * 100);
        this.emit('progress', { percent });
      }
    });

    this.process.on('close', (code) => {
      if (code === 0) {
        this.emit('end');
      } else {
        this.emit('error', new Error(`FFmpeg exited with code ${code}: ${stderr}`));
      }
    });

    this.process.on('error', (error) => {
      this.emit('error', error);
    });
  }

  kill(): void {
    if (this.process) {
      this.process.kill('SIGTERM');
    }
  }
}

/**
 * Create a new FFmpeg command
 */
export function createCommand(inputPath?: string): FFmpegCommand {
  return new FFmpegCommand(inputPath);
}

// Default export for compatibility
export default {
  createCommand,
  ffprobe,
  setFfmpegPath,
  setFfprobePath,
  getFfmpegPath,
  getFfprobePath,
};
