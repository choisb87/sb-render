# Quick Start Guide

Get started with **sb-render** in 5 minutes!

## Installation

### Option 1: n8n Community Nodes (Easiest)

1. Open n8n
2. Go to **Settings → Community Nodes**
3. Click **Install**
4. Enter: `n8n-nodes-sb-render`
5. Click **Install**
6. Restart n8n

### Option 2: Manual Installation

```bash
cd ~/.n8n
npm install n8n-nodes-sb-render
# Restart n8n
```

## First Workflow

### Simple Video with Subtitle

1. Create new workflow
2. Add **SB Render** node
3. Configure:

```
Video Source: URL
Video URL: https://your-video-url.mp4

Enable Subtitles: ✓
Subtitle Text: "Hello World"
Start Time: 0
End Time: 5
Position: Bottom

Output Format: MP4
Quality: High
```

4. Execute workflow
5. Download result from `data` binary property

## Common Recipes

### Recipe 1: Video + Background Music

```
Video URL: https://example.com/video.mp4

Enable BGM: ✓
BGM URL: https://example.com/music.mp3
BGM Volume: 30
BGM Fade In: 2 seconds
BGM Fade Out: 2 seconds

Output: MP4
```

### Recipe 2: Multiple Subtitles

```
Enable Subtitles: ✓

Subtitle 1:
- Text: "Introduction"
- Start: 0, End: 5
- Position: Bottom

Subtitle 2:
- Text: "Chapter 1"
- Start: 5, End: 10
- Position: Top

Subtitle 3:
- Text: "Conclusion"
- Start: 10, End: 15
- Position: Bottom
```

### Recipe 3: Complete Composition

```
Video: URL or Binary Data

BGM:
- Enable: ✓
- Volume: 25%
- Fade In/Out: 3 seconds

Narration:
- Enable: ✓
- Volume: 85%
- Delay: 1 second

Subtitles:
- Multiple subtitles with custom styling
- Font Size: 48
- Color: White (#FFFFFF)
- Background: Black (#000000, 80% opacity)

Output:
- Format: MP4
- Codec: H.264
- Quality: High
```

## Workflow Examples

### Example 1: URL-based Processing

```
Workflow:
SB Render Node
└─ Video URL: Direct video link
└─ BGM URL: Direct music link
└─ Output: Binary data

Next Step: Send to Google Drive / Dropbox / S3
```

### Example 2: Binary Data Pipeline

```
Workflow:
HTTP Request → SB Render → Cloud Storage
└─ Download video
└─ Add subtitles + BGM
└─ Upload result
```

### Example 3: Batch Processing

```
Workflow:
Split in Batches → SB Render → Merge
└─ Process 10 videos
└─ Add same BGM to all
└─ Combine results
```

## Testing Tips

### Start Small
1. Test with short videos (< 1 minute)
2. Use medium quality first
3. Add one feature at a time

### Debug Checklist
- ✓ Video URL accessible?
- ✓ Subtitle times within video duration?
- ✓ Audio files in supported format?
- ✓ Sufficient disk space?

## Parameter Reference

### Essential Parameters

| Parameter | Purpose | Example |
|-----------|---------|---------|
| Video Source | Input method | `url` or `binary` |
| Video URL | Video location | `https://...` |
| Enable BGM | Add background music | `true/false` |
| BGM Volume | Music volume | `0-100` (30 default) |
| Enable Subtitles | Add text overlay | `true/false` |
| Output Format | File type | `mp4`, `mov`, `webm` |
| Quality | Encoding quality | `low`, `medium`, `high` |

### Advanced Parameters

| Parameter | Purpose | Example |
|-----------|---------|---------|
| BGM Fade In/Out | Smooth audio transitions | `2 seconds` |
| Narration Delay | Voiceover timing | `0-10 seconds` |
| Custom Position | Exact subtitle placement | `X: 960, Y: 100` |
| Custom CRF | Fine-tune quality | `0-51` (18 = high) |
| Border Width | Subtitle outline | `2 pixels` |

## Best Practices

### ✅ Do's
- Use URL source for external files
- Use binary source for workflow data
- Test with short videos first
- Start with default settings
- Use MP4 format for compatibility
- Set appropriate volume levels

### ❌ Don'ts
- Don't use very large files (>100MB) initially
- Don't skip validation testing
- Don't use custom quality without understanding CRF
- Don't mix incompatible formats
- Don't forget to check subtitle timing

## Performance Tips

1. **Quality vs Speed**
   - Low: Fast, larger file
   - Medium: Balanced
   - High: Slow, smaller file

2. **Format Selection**
   - MP4: Best compatibility
   - WebM: Web-optimized
   - MOV: Professional editing

3. **Audio Optimization**
   - BGM: 20-40% volume
   - Narration: 70-90% volume
   - Use compressed audio (MP3, AAC)

## Troubleshooting

### Video Not Processing?
1. Check video URL accessibility
2. Verify FFmpeg installation
3. Check n8n logs
4. Try smaller file first

### Subtitles Not Showing?
1. Verify timing (within video duration)
2. Check font color vs video background
3. Increase font size
4. Try different position

### Audio Issues?
1. Check volume levels
2. Verify audio format
3. Test without fade effects
4. Ensure audio duration ≤ video duration

## Next Steps

1. ✓ Install node
2. ✓ Create first workflow
3. ✓ Test basic rendering
4. → Explore advanced features
5. → Build production workflows
6. → Join n8n community

## Resources

- **Full Documentation**: [README.md](README.md)
- **Technical Design**: [DESIGN.md](DESIGN.md)
- **Issues**: GitHub Issues
- **n8n Community**: [community.n8n.io](https://community.n8n.io/)

---

**Happy Video Rendering! 🎬**
