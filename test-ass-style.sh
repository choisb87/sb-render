#!/bin/bash

# Test ASS subtitle with background box
cat > /tmp/test-subtitle.ass << 'EOF'
[Script Info]
Title: Test Subtitle
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,NanumGothic,48,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,3,2,2,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,첫 번째 장면입니다
Dialogue: 0,0:00:05.00,0:00:10.00,Default,,0,0,0,,두 번째 장면입니다
EOF

echo "✅ Generated ASS file with BorderStyle=3 (opaque box)"
echo "📁 File: /tmp/test-subtitle.ass"
echo ""
echo "ASS Style configuration:"
echo "  - BorderStyle: 3 (opaque box)"
echo "  - BackColour: &H80000000 (black with 50% opacity)"
echo "  - Font: NanumGothic, 48px"
echo "  - Position: bottom-center"
echo ""
cat /tmp/test-subtitle.ass
