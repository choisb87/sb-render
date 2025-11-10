# sb-render: n8n Video Rendering Community Node

## Design Specification v1.0

---

## 1. Overview

**Purpose**: n8n community node for compositing videos with background music, narration, and customizable subtitles using FFmpeg.

**Target Use Case**: Automated video production workflows requiring:
- Video composition with multiple audio tracks
- Subtitle overlay with extensive customization
- Batch video processing in n8n workflows

**Reference Architecture**: Based on [n8n-nodes-mediafx](https://github.com/dandacompany/n8n-nodes-mediafx) patterns

---

## 2. System Architecture

### 2.1 High-Level Design

```
┌─────────────────────────────────────────────────────────────┐
│                      sb-render Node                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Inputs:                                                    │
│  ├─ Video URL/Binary     ──┐                               │
│  ├─ BGM URL/Binary        ──┤                               │
│  ├─ Narration URL/Binary  ──┤                               │
│  └─ Subtitle Config       ──┤                               │
│                             │                               │
│                             ▼                               │
│                    ┌──────────────────┐                     │
│                    │  File Manager    │                     │
│                    │  (Download/Temp) │                     │
│                    └────────┬─────────┘                     │
│                             │                               │
│                             ▼                               │
│                    ┌──────────────────┐                     │
│                    │  Audio Mixer     │                     │
│                    │  (BGM+Narration) │                     │
│                    └────────┬─────────┘                     │
│                             │                               │
│                             ▼                               │
│                    ┌──────────────────┐                     │
│                    │ Subtitle Engine  │                     │
│                    │ (FFmpeg Filters) │                     │
│                    └────────┬─────────┘                     │
│                             │                               │
│                             ▼                               │
│                    ┌──────────────────┐                     │
│                    │  Video Composer  │                     │
│                    │  (Final Render)  │                     │
│                    └────────┬─────────┘                     │
│                             │                               │
│  Output:                    ▼                               │
│  └─ Rendered Video Binary                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Processing Pipeline

```
1. INPUT PREPARATION
   ├─ Download video from URL or extract from binary
   ├─ Download BGM from URL or extract from binary (optional)
   ├─ Download narration from URL or extract from binary (optional)
   └─ Parse subtitle configuration

2. AUDIO MIXING
   ├─ Extract original video audio (if present)
   ├─ Mix BGM with volume control and fade effects
   ├─ Mix narration with volume control and positioning
   └─ Create composite audio track

3. SUBTITLE GENERATION
   ├─ Create SRT/ASS subtitle file from configuration
   ├─ Apply styling (font, size, color, position)
   ├─ Generate FFmpeg subtitle filter chain
   └─ Prepare overlay parameters

4. VIDEO COMPOSITION
   ├─ Combine video with composite audio
   ├─ Apply subtitle overlay via FFmpeg filters
   ├─ Encode with configured codec/quality
   └─ Generate final output binary

5. CLEANUP
   └─ Remove temporary files
```

---

## 3. Node Interface Design

### 3.1 Node Properties Structure

```typescript
{
  "resource": "Video",
  "operation": "Render",

  // Video Input
  "videoSource": "url|binary",
  "videoUrl": "string",
  "videoBinaryProperty": "string",

  // BGM Input (Optional)
  "enableBGM": "boolean",
  "bgmSource": "url|binary",
  "bgmUrl": "string",
  "bgmBinaryProperty": "string",
  "bgmVolume": "number (0-100)",
  "bgmFadeIn": "number (seconds)",
  "bgmFadeOut": "number (seconds)",

  // Narration Input (Optional)
  "enableNarration": "boolean",
  "narrationSource": "url|binary",
  "narrationUrl": "string",
  "narrationBinaryProperty": "string",
  "narrationVolume": "number (0-100)",
  "narrationDelay": "number (seconds)",

  // Subtitle Configuration
  "enableSubtitles": "boolean",
  "subtitles": [
    {
      "text": "string",
      "startTime": "number (seconds)",
      "endTime": "number (seconds)",
      "position": "top|middle|bottom|custom",
      "customX": "number (pixels)",
      "customY": "number (pixels)",
      "fontSize": "number",
      "fontColor": "string (hex)",
      "fontFamily": "string",
      "alignment": "left|center|right",
      "backgroundColor": "string (hex)",
      "backgroundOpacity": "number (0-100)",
      "borderColor": "string (hex)",
      "borderWidth": "number"
    }
  ],

  // Output Configuration
  "outputFormat": "mp4|mov|webm",
  "videoCodec": "libx264|libx265|vp9",
  "quality": "low|medium|high|custom",
  "customCRF": "number (0-51)",
  "outputBinaryProperty": "string"
}
```

### 3.2 UI Display Configuration

**Sections:**
1. **Video Input** - Source selection and configuration
2. **Audio Configuration** - BGM and narration settings
3. **Subtitle Settings** - Multi-subtitle configuration with styling
4. **Output Options** - Format, codec, and quality settings

---

## 4. TypeScript Interfaces

### 4.1 Core Interfaces

```typescript
// Main node input parameters
interface ISbRenderNodeParams {
  resource: 'Video';
  operation: 'Render';

  videoSource: 'url' | 'binary';
  videoUrl?: string;
  videoBinaryProperty?: string;

  enableBGM: boolean;
  bgmSource?: 'url' | 'binary';
  bgmUrl?: string;
  bgmBinaryProperty?: string;
  bgmVolume?: number;
  bgmFadeIn?: number;
  bgmFadeOut?: number;

  enableNarration: boolean;
  narrationSource?: 'url' | 'binary';
  narrationUrl?: string;
  narrationBinaryProperty?: string;
  narrationVolume?: number;
  narrationDelay?: number;

  enableSubtitles: boolean;
  subtitles?: ISubtitleConfig[];

  outputFormat: 'mp4' | 'mov' | 'webm';
  videoCodec: 'libx264' | 'libx265' | 'vp9';
  quality: 'low' | 'medium' | 'high' | 'custom';
  customCRF?: number;
  outputBinaryProperty: string;
}

// Subtitle configuration
interface ISubtitleConfig {
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

// Internal processing types
interface IMediaFile {
  path: string;
  type: 'video' | 'audio' | 'subtitle';
  temporary: boolean;
}

interface IAudioMixConfig {
  bgmPath?: string;
  bgmVolume: number;
  bgmFadeIn: number;
  bgmFadeOut: number;
  narrationPath?: string;
  narrationVolume: number;
  narrationDelay: number;
}

interface IFFmpegCommand {
  inputs: string[];
  filters: string[];
  outputs: string[];
}
```

### 4.2 Service Interfaces

```typescript
interface IFileManager {
  downloadFile(url: string): Promise<string>;
  extractBinary(binaryData: Buffer, propertyName: string): Promise<string>;
  createTempFile(extension: string): string;
  cleanup(files: string[]): Promise<void>;
}

interface IAudioMixer {
  mixAudioTracks(videoPath: string, config: IAudioMixConfig): Promise<string>;
  getAudioFilterChain(config: IAudioMixConfig): string;
}

interface ISubtitleEngine {
  generateSRT(subtitles: ISubtitleConfig[]): string;
  generateASS(subtitles: ISubtitleConfig[]): string;
  getSubtitleFilterChain(subtitlePath: string, subtitles: ISubtitleConfig[]): string;
}

interface IVideoComposer {
  compose(
    videoPath: string,
    audioPath: string,
    subtitlePath: string,
    outputPath: string,
    config: ISbRenderNodeParams
  ): Promise<Buffer>;
}
```

---

## 5. FFmpeg Integration Strategy

### 5.1 Audio Mixing Command

```bash
ffmpeg -i video.mp4 \
       -i bgm.mp3 \
       -i narration.mp3 \
       -filter_complex "\
         [0:a]volume=1.0[original]; \
         [1:a]volume=0.3,afade=t=in:st=0:d=2,afade=t=out:st=58:d=2[bgm]; \
         [2:a]volume=0.8,adelay=2000|2000[narration]; \
         [original][bgm][narration]amix=inputs=3:duration=first:dropout_transition=2[mixed]" \
       -map 0:v -map "[mixed]" \
       output_audio_mixed.mp4
```

### 5.2 Subtitle Overlay Command

**Using ASS subtitles for full styling control:**

```bash
ffmpeg -i video_with_audio.mp4 \
       -vf "ass=subtitles.ass" \
       -c:v libx264 -crf 23 -preset medium \
       -c:a copy \
       output_final.mp4
```

**ASS Subtitle Format Example:**

```ass
[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, BackColour, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV
Style: Custom,Arial,48,&H00FFFFFF,&H80000000,1,2,1,2,50,50,50

[Events]
Format: Layer, Start, End, Style, Text
Dialogue: 0,0:00:00.00,0:00:05.00,Custom,Hello World
Dialogue: 0,0:00:05.00,0:00:10.00,Custom,Second subtitle
```

### 5.3 Complete Composition Pipeline

```typescript
// Pseudo-code for FFmpeg command generation
function buildFFmpegCommand(params: ISbRenderNodeParams): string[] {
  const inputs: string[] = [
    '-i', videoPath,
    ...(bgmPath ? ['-i', bgmPath] : []),
    ...(narrationPath ? ['-i', narrationPath] : [])
  ];

  const audioFilter = buildAudioFilterChain(params);
  const videoFilter = buildVideoFilterChain(params);

  const filters = [
    '-filter_complex', audioFilter,
    '-vf', videoFilter
  ];

  const outputs = [
    '-map', '0:v',
    '-map', '[mixed]',
    '-c:v', params.videoCodec,
    '-crf', getCRF(params.quality, params.customCRF),
    '-preset', 'medium',
    '-c:a', 'aac',
    '-b:a', '192k',
    outputPath
  ];

  return [...inputs, ...filters, ...outputs];
}
```

---

## 6. Project Structure

```
sb-render/
├── nodes/
│   └── SbRender/
│       ├── SbRender.node.ts           # Main node class
│       ├── SbRender.node.json         # Node metadata
│       ├── services/
│       │   ├── FileManager.ts         # File download/management
│       │   ├── AudioMixer.ts          # Audio composition
│       │   ├── SubtitleEngine.ts      # Subtitle generation
│       │   └── VideoComposer.ts       # Final video rendering
│       ├── interfaces/
│       │   └── index.ts               # TypeScript interfaces
│       └── utils/
│           ├── ffmpeg.ts              # FFmpeg helpers
│           └── validation.ts          # Input validation
├── fonts/                             # Custom fonts directory
├── package.json                       # Dependencies & metadata
├── tsconfig.json                      # TypeScript config
├── .eslintrc.js                       # Linting rules
├── gulpfile.js                        # Build automation
├── README.md                          # Documentation
└── DESIGN.md                          # This file
```

---

## 7. Dependencies

```json
{
  "dependencies": {
    "@ffmpeg-installer/ffmpeg": "^1.1.0",
    "fluent-ffmpeg": "^2.1.2",
    "node-fetch": "^2.6.7",
    "tmp-promise": "^3.0.3"
  },
  "devDependencies": {
    "@types/fluent-ffmpeg": "^2.1.21",
    "@types/node": "^18.0.0",
    "typescript": "^5.0.0",
    "gulp": "^4.0.2",
    "@typescript-eslint/eslint-plugin": "^5.0.0"
  }
}
```

---

## 8. Configuration Defaults

```typescript
const DEFAULTS = {
  // Audio
  bgmVolume: 30,
  bgmFadeIn: 2,
  bgmFadeOut: 2,
  narrationVolume: 80,
  narrationDelay: 0,

  // Subtitles
  subtitle: {
    position: 'bottom',
    fontSize: 48,
    fontColor: '#FFFFFF',
    fontFamily: 'Arial',
    alignment: 'center',
    backgroundColor: '#000000',
    backgroundOpacity: 80,
    borderColor: '#000000',
    borderWidth: 2,
    customY: 100  // pixels from bottom when position = 'bottom'
  },

  // Output
  outputFormat: 'mp4',
  videoCodec: 'libx264',
  quality: 'high',
  crfMapping: {
    low: 28,
    medium: 23,
    high: 18
  },
  outputBinaryProperty: 'data'
};
```

---

## 9. Error Handling Strategy

### 9.1 Input Validation Errors
- Missing required video source
- Invalid URL format
- Invalid time ranges for subtitles
- Unsupported file formats

### 9.2 Processing Errors
- FFmpeg execution failures
- File download failures
- Insufficient disk space
- Audio/video compatibility issues

### 9.3 Error Response Format

```typescript
interface INodeError {
  message: string;
  description: string;
  httpCode?: number;
  cause?: Error;
}

// Example usage
throw new NodeOperationError(
  this.getNode(),
  'Failed to download video file',
  {
    description: `URL ${videoUrl} returned 404`,
    httpCode: 404
  }
);
```

---

## 10. Testing Strategy

### 10.1 Unit Tests
- File manager operations (download, cleanup)
- Audio filter chain generation
- Subtitle format generation (SRT, ASS)
- FFmpeg command builder

### 10.2 Integration Tests
- Complete video rendering workflow
- Multiple subtitle configurations
- Audio mixing variations
- Binary data handling

### 10.3 Test Data Requirements
- Sample video files (various formats/codecs)
- Sample audio files (MP3, WAV, AAC)
- Test URLs with different response types
- Edge case subtitle configurations

---

## 11. Performance Considerations

### 11.1 Optimization Strategies
- Stream processing where possible
- Temporary file cleanup
- Parallel FFmpeg operations for batch processing
- Memory-efficient binary handling

### 11.2 Resource Limits
- Maximum video duration: Configurable (default: 1 hour)
- Maximum file size: Configurable (default: 2GB)
- Concurrent rendering operations: 1 per node execution
- Temporary storage monitoring

---

## 12. Future Enhancements (v2.0)

### 12.1 Planned Features
- Multiple video layer composition
- Advanced transitions between subtitles
- Logo/watermark overlay support
- Video effects (filters, color grading)
- Template-based subtitle styling
- Batch processing mode
- Progress callbacks for long renders

### 12.2 API Extensions
- Webhook notifications on completion
- Cloud storage integration (S3, GCS)
- Distributed rendering support
- GPU acceleration (NVENC, VideoToolbox)

---

## 13. Documentation Requirements

### 13.1 User Documentation
- Quick start guide
- Complete property reference
- Subtitle configuration examples
- Audio mixing best practices
- Troubleshooting guide

### 13.2 Developer Documentation
- Architecture overview
- Service interface documentation
- FFmpeg command reference
- Contributing guidelines
- Release process

---

## 14. License & Attribution

**License**: MIT
**Attribution**: Inspired by [n8n-nodes-mediafx](https://github.com/dandacompany/n8n-nodes-mediafx)
**Author**: sb-render contributors

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-11-10 | Initial design specification |

---

**Status**: 🎯 Design Complete - Ready for Implementation
