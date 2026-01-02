# n8n-nodes-sb-render

[![npm version](https://badge.fury.io/js/n8n-nodes-sb-render.svg)](https://badge.fury.io/js/n8n-nodes-sb-render)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

This is an n8n community node for video rendering with customizable subtitles, background music (BGM), and narration using FFmpeg.

**sb-render** allows you to automate video composition workflows in n8n, combining video files with:
- 🎵 Background music with volume control and fade effects
- 🎙️ Narration audio with timing control
- 📝 Customizable subtitles with extensive styling options
- 🎨 Multiple output formats and quality presets
- 🖼️ AI-powered parallax effects from static images (Depth Anything V2)
- 🔀 Video merging with transitions and audio sync

Inspired by [n8n-nodes-mediafx](https://github.com/dandacompany/n8n-nodes-mediafx).

## Table of Contents

- [Installation](#installation)
- [Prerequisites](#prerequisites)
- [Operations](#operations)
- [Parallax Effect](#parallax-effect)
- [Configuration](#configuration)
- [Examples](#examples)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Installation

### Community Nodes (Recommended)

1. Go to **Settings > Community Nodes** in n8n
2. Select **Install**
3. Enter `n8n-nodes-sb-render`
4. Agree to the risks and install

### Manual Installation

```bash
npm install n8n-nodes-sb-render
```

For n8n self-hosted installations:

```bash
cd ~/.n8n
npm install n8n-nodes-sb-render
# Restart n8n
```

## Prerequisites

- **n8n version**: 1.0.0 or higher
- **Node.js**: 16.0.0 or higher
- **FFmpeg**: Auto-detected from system or installed via npm packages

### FFmpeg Installation (Docker/n8n Users)

For **Docker or self-hosted n8n**, installing system ffmpeg is recommended:

```bash
# Alpine-based containers (n8n official image)
docker exec <container-name> apk add --no-cache ffmpeg

# Debian/Ubuntu-based containers
docker exec <container-name> apt-get update && apt-get install -y ffmpeg
```

**docker-compose.yml example:**
```yaml
services:
  n8n:
    image: n8nio/n8n
    command: >
      sh -c "
        apk add --no-cache ffmpeg &&
        n8n start
      "
```

The node will automatically:
1. ✅ Use system ffmpeg/ffprobe if available (most reliable)
2. ✅ Fall back to npm packages with auto-permission fix
3. ✅ Gracefully degrade with limited functionality

> **Note**: v1.1.20+ automatically handles ffmpeg/ffprobe detection and permission issues!

## Operations

### Video → Render

Compose a video with optional background music, narration, and subtitles.

**Features:**
- ✅ Multiple input sources (URL or binary data)
- ✅ Audio mixing with independent volume controls
- ✅ Fade in/out effects for BGM
- ✅ Customizable subtitle positioning and styling
- ✅ Multiple output formats (MP4, MOV, WebM)
- ✅ Quality presets (Low, Medium, High, Custom)
- ✅ Smart audio merging (handles mixed audio/silent video inputs)

### Image → Parallax

Create 2.5D parallax video effects from static images using AI depth estimation.

**Features:**
- ✅ AI-powered depth estimation (Depth Anything V2)
- ✅ True layer separation with inpainting
- ✅ Direction + Zoom combination effects
- ✅ Intensity control (subtle, normal, dramatic)
- ✅ Falls back to Ken Burns effect if AI not available

## Parallax Effect

The parallax feature uses **Depth Anything V2** AI model to create professional 2.5D parallax effects from static images.

### How It Works

1. **Depth Estimation**: AI model analyzes the image to create a depth map
2. **Layer Separation**: Foreground is extracted based on depth (closer objects)
3. **Inpainting**: Background is filled where foreground was removed
4. **Animation**: Layers move at different speeds creating parallax illusion

### Parameters

| Parameter | Type | Options | Description |
|-----------|------|---------|-------------|
| **direction** | String | `left`, `right`, `up`, `down` | Pan direction |
| **zoom** | String | `none`, `in`, `out` | Zoom effect (combinable with direction) |
| **intensity** | String | `subtle`, `normal`, `dramatic` | Movement intensity |
| **duration** | Number | seconds | Video duration |

### Combined Effects

You can combine zoom with direction for richer effects:

```json
{
  "direction": "left",
  "zoom": "in",
  "intensity": "normal",
  "duration": 5
}
```

**Effect Combinations:**
- `left` + `zoomIn`: Pan left while zooming in
- `right` + `zoomOut`: Pan right while zooming out
- `up` + `zoomIn`: Pan up with zoom in
- `zoomIn` only: Pure zoom in effect (set direction to empty)

### Requirements for AI Parallax

For AI-powered depth parallax, the following Python packages are required on the server:

```bash
pip3 install torch transformers pillow opencv-python-headless
```

If not available, the node automatically falls back to Ken Burns (zoompan) effect.

## Configuration

### Video Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| **Video Source** | Options | Yes | `url` or `binary` |
| **Video URL** | String | If URL | URL of the video file |
| **Video Binary Property** | String | If Binary | Name of binary property containing video |

### Background Music (BGM)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| **Enable BGM** | Boolean | false | Add background music |
| **BGM Source** | Options | - | `url` or `binary` |
| **BGM URL** | String | - | URL of BGM file |
| **BGM Volume** | Number | 30 | Volume 0-100 |
| **BGM Fade In** | Number | 2 | Fade-in duration (seconds) |
| **BGM Fade Out** | Number | 2 | Fade-out duration (seconds) |

### Narration

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| **Enable Narration** | Boolean | false | Add narration audio |
| **Narration Source** | Options | - | `url` or `binary` |
| **Narration URL** | String | - | URL of narration file |
| **Narration Volume** | Number | 80 | Volume 0-100 |
| **Narration Delay** | Number | 0 | Delay before start (seconds) |

### Subtitles

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| **Enable Subtitles** | Boolean | false | Add subtitles |
| **Text** | String | - | Subtitle text content |
| **Start Time** | Number | - | Start time in seconds |
| **End Time** | Number | - | End time in seconds |
| **Position** | Options | bottom | `top`, `middle`, `bottom`, `custom` |
| **Font Size** | Number | 90 | Text size |
| **Font Color** | Color | #FFFFFF | Text color (hex) |
| **Font Family** | String | Arial | Font name |
| **Alignment** | Options | center | `left`, `center`, `right` |
| **Background Color** | Color | #000000 | Background color (hex) |
| **Background Opacity** | Number | 80 | Opacity 0-100 |
| **Border Color** | Color | #000000 | Border color (hex) |
| **Border Width** | Number | 2 | Border width (pixels) |

### Output Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| **Output Format** | Options | mp4 | `mp4`, `mov`, `webm` |
| **Video Codec** | Options | libx264 | `libx264`, `libx265`, `vp9` |
| **Quality** | Options | high | `low`, `medium`, `high`, `custom` |
| **Custom CRF** | Number | 18 | CRF value 0-51 (if custom quality) |
| **Output Binary Property** | String | data | Property name for output |

## Examples

### Example 1: Simple Video with Subtitles

```json
{
  "videoSource": "url",
  "videoUrl": "https://example.com/video.mp4",
  "enableSubtitles": true,
  "subtitles": {
    "subtitle": [
      {
        "text": "Welcome to our video!",
        "startTime": 0,
        "endTime": 5,
        "position": "bottom",
        "fontSize": 48,
        "fontColor": "#FFFFFF",
        "alignment": "center"
      }
    ]
  },
  "outputFormat": "mp4",
  "quality": "high"
}
```

### Example 2: Video with BGM and Narration

```json
{
  "videoSource": "url",
  "videoUrl": "https://example.com/video.mp4",
  "enableBGM": true,
  "bgmSource": "url",
  "bgmUrl": "https://example.com/music.mp3",
  "bgmVolume": 20,
  "bgmFadeIn": 3,
  "bgmFadeOut": 3,
  "enableNarration": true,
  "narrationSource": "url",
  "narrationUrl": "https://example.com/narration.mp3",
  "narrationVolume": 90,
  "narrationDelay": 2,
  "outputFormat": "mp4"
}
```

### Example 3: Custom Positioned Subtitles

```json
{
  "videoSource": "url",
  "videoUrl": "https://example.com/video.mp4",
  "enableSubtitles": true,
  "subtitles": {
    "subtitle": [
      {
        "text": "Top-left subtitle",
        "startTime": 0,
        "endTime": 5,
        "position": "custom",
        "customX": 100,
        "customY": 100,
        "fontSize": 36,
        "fontColor": "#FFFF00",
        "alignment": "left",
        "backgroundColor": "#000000",
        "backgroundOpacity": 70,
        "borderColor": "#FFFFFF",
        "borderWidth": 3
      }
    ]
  }
}
```

### Example 4: Workflow Integration

**Scenario**: Download video from URL, add BGM and subtitles, upload to cloud storage

```
HTTP Request → SB Render → Google Drive
```

1. **HTTP Request**: Download video file
2. **SB Render**: Add BGM and subtitles
3. **Google Drive**: Upload rendered video

## Development

### Build

```bash
npm install
npm run build
```

### Development Mode

```bash
npm run dev
```

### Linting

```bash
npm run lint
npm run lintfix
```

### Project Structure

```
sb-render/
├── nodes/
│   └── SbRender/
│       ├── SbRender.node.ts         # Main node implementation
│       ├── SbRender.node.json       # Node metadata
│       ├── services/
│       │   ├── FileManager.ts       # File handling
│       │   ├── AudioMixer.ts        # Audio composition
│       │   ├── SubtitleEngine.ts    # Subtitle generation
│       │   └── VideoComposer.ts     # Video rendering
│       ├── interfaces/
│       │   └── index.ts             # TypeScript types
│       └── utils/
│           ├── ffmpeg.ts            # FFmpeg helpers
│           └── validation.ts        # Input validation
├── fonts/                           # Custom fonts
├── package.json
├── tsconfig.json
└── README.md
```

## Troubleshooting

### FFmpeg Not Found

The node automatically installs FFmpeg via `@ffmpeg-installer/ffmpeg`. If you encounter issues:

```bash
npm install @ffmpeg-installer/ffmpeg --force
```

### File Download Errors

**Issue**: Video/audio URLs fail to download

**Solutions**:
- Verify URL accessibility
- Check for authentication requirements
- Ensure sufficient disk space
- Try using binary data input instead

### Subtitle Not Appearing

**Issue**: Subtitles don't show in output video

**Solutions**:
- Verify timing (start/end times within video duration)
- Check subtitle position and size
- Ensure font is available on system
- Try different output format (MP4 recommended)

### Memory Issues

**Issue**: Process crashes with large video files

**Solutions**:
- Reduce video resolution before processing
- Use lower quality preset
- Process videos in smaller batches
- Increase Node.js memory limit:

```bash
export NODE_OPTIONS="--max-old-space-size=4096"
```

### Audio Sync Issues

**Issue**: Audio out of sync with video

**Solutions**:
- Ensure all audio files are in compatible formats
- Check narration delay settings
- Verify video frame rate compatibility
- Try re-encoding source files

## Technical Details

### FFmpeg Commands

The node uses **fluent-ffmpeg** to construct FFmpeg commands:

**Audio Mixing**:
```bash
-filter_complex "[0:a]volume=1.0[original];[1:a]volume=0.3,afade=t=in:st=0:d=2[bgm];[original][bgm]amix=inputs=2[mixed]"
```

**Subtitle Overlay**:
```bash
-vf "ass=subtitles.ass"
```

**Complete Command**:
```bash
ffmpeg -i video.mp4 -i bgm.mp3 -filter_complex "..." -vf "ass=..." -c:v libx264 -crf 18 output.mp4
```

### Subtitle Formats

- **SRT**: Simple subtitle format (limited styling)
- **ASS**: Advanced SubStation Alpha (full styling support) ← **Used by default**

ASS format provides:
- Custom fonts and colors
- Precise positioning
- Background colors and opacity
- Border/outline effects
- Multiple alignment options

## Performance

### Resource Usage

| Video Length | Memory | Processing Time |
|--------------|--------|-----------------|
| 1 minute | ~200MB | ~30 seconds |
| 5 minutes | ~500MB | ~2 minutes |
| 10 minutes | ~1GB | ~5 minutes |

*Times measured on standard VPS (2 CPU, 4GB RAM)*

### Optimization Tips

1. **Use appropriate quality**: High quality for final output, medium for testing
2. **Compress BGM**: Use lower bitrate audio files (128-192 kbps)
3. **Batch processing**: Process multiple videos in parallel workflows
4. **Cache audio files**: Reuse same BGM/narration across multiple videos

## Compatibility

### Supported Video Formats

**Input**: MP4, MOV, WebM, AVI, MKV
**Output**: MP4, MOV, WebM

### Supported Audio Formats

**Input**: MP3, WAV, AAC, OGG, M4A
**Output**: AAC (default)

### Codec Compatibility

| Codec | Quality | Speed | Browser Support |
|-------|---------|-------|-----------------|
| H.264 (libx264) | Good | Fast | Excellent |
| H.265 (libx265) | Better | Slower | Limited |
| VP9 | Good | Slow | Good (WebM) |

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

### Development Guidelines

- Follow existing code style (ESLint configured)
- Add TypeScript types for new features
- Update documentation for new parameters
- Test with various video formats

## Roadmap

### v1.1 (Planned)

- [ ] Multiple video layers
- [ ] Video transitions
- [ ] Logo/watermark overlay
- [ ] Preset subtitle templates
- [ ] Batch processing mode

### v2.0 (Future)

- [ ] GPU acceleration (NVENC, VideoToolbox)
- [ ] Cloud storage integration
- [ ] Progress callbacks
- [ ] Advanced video effects

## Credits

- Inspired by [n8n-nodes-mediafx](https://github.com/dandacompany/n8n-nodes-mediafx)
- Uses [FFmpeg](https://ffmpeg.org/) for video processing
- Built with [fluent-ffmpeg](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg)

## License

[MIT](LICENSE)

## Support

- **Issues**: [GitHub Issues](https://github.com/choisb87/sb-render/issues)
- **Documentation**: [GitHub Wiki](https://github.com/choisb87/sb-render/wiki)
- **n8n Community**: [n8n Community Forum](https://community.n8n.io/)

---

**Made with ❤️ for the n8n community**
