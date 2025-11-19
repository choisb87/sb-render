const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
const path = require('path');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const mergedVideo = path.join(__dirname, 'merged_scenes.mp4');
const bgmPath = path.join(__dirname, 'champion_bgm.mp3');
const outputPath = path.join(__dirname, 'manual_bgm_test.mp4');

console.log('=== Manual BGM Test ===');
console.log('Video:', mergedVideo);
console.log('BGM:', bgmPath);

// Get video duration first
ffmpeg.ffprobe(mergedVideo, (err, videoMeta) => {
    if (err) {
        console.error('Failed to probe video:', err);
        return;
    }

    const videoDuration = videoMeta.format.duration;
    const hasOriginalAudio = videoMeta.streams.some(s => s.codec_type === 'audio');

    console.log(`\nVideo duration: ${videoDuration.toFixed(2)}s`);
    console.log(`Has original audio: ${hasOriginalAudio}`);

    // Build FFmpeg command manually
    const command = ffmpeg(mergedVideo);

    // Add BGM with stream_loop
    command.input(bgmPath).inputOptions([
        '-stream_loop', '-1',
        '-t', videoDuration.toString()
    ]);

    // Build filter chain
    const filters = [];
    const inputs = [];

    // Original audio from video
    if (hasOriginalAudio) {
        filters.push('[0:a]volume=1.0[original]');
        inputs.push('[original]');
    }

    // BGM
    const bgmVolume = 0.2; // 20%
    filters.push(`[1:a]atrim=0:${videoDuration},asetpts=PTS-STARTPTS,volume=${bgmVolume}[bgm]`);
    inputs.push('[bgm]');

    // Mix
    const mixInputs = inputs.join('');
    filters.push(`${mixInputs}amix=inputs=${inputs.length}:duration=longest:dropout_transition=2,dynaudnorm[mixed]`);

    const filterChain = filters.join(';');
    console.log(`\n Filter chain:\n${filterChain}\n`);

    command.complexFilter(filterChain);

    command
        .videoCodec('libx264')
        .outputOptions([
            '-map', '0:v',
            '-map', '[mixed]',
            '-crf', '18',
            '-preset', 'medium',
            '-movflags', '+faststart'
        ])
        .audioCodec('aac')
        .audioBitrate('192k')
        .output(outputPath);

    command.on('start', (cmd) => {
        console.log('FFmpeg command:');
        console.log(cmd);
        console.log('');
    });

    command.on('progress', (progress) => {
        if (progress.percent) {
            process.stdout.write(`\rProgress: ${Math.round(progress.percent)}%`);
        }
    });

    command.on('end', () => {
        console.log('\n\n✅ Done!');
        console.log(`Output: ${outputPath}`);

        // Probe output
        ffmpeg.ffprobe(outputPath, (err, outMeta) => {
            if (err) {
                console.error('Failed to probe output:', err);
                return;
            }

            const audioStreams = outMeta.streams.filter(s => s.codec_type === 'audio');
            console.log(`\nOutput info:`);
            console.log(`  Duration: ${outMeta.format.duration.toFixed(2)}s`);
            console.log(`  Audio streams: ${audioStreams.length}`);
            console.log(`\n🎧 PLAY THIS FILE AND CHECK IF BGM IS PRESENT!`);
        });
    });

    command.on('error', (err) => {
        console.error('\n❌ Error:', err.message);
    });

    command.run();
});
