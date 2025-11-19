const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
const fs = require('fs');
const path = require('path');
const { VideoComposer } = require('./dist/nodes/SbRender/services/VideoComposer');

// Setup paths
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const videoWithAudio = path.join(__dirname, 'test_audio.mp4');
const videoNoAudio = path.join(__dirname, 'test_silent.mp4');
const outputVideo = path.join(__dirname, 'test_merged.mp4');

async function createVideo(hasAudio, outputPath) {
    return new Promise((resolve, reject) => {
        console.log(`Creating video ${hasAudio ? 'with' : 'without'} audio: ${outputPath}`);
        const command = ffmpeg()
            .input('color=c=red:s=1920x1080:d=2')
            .inputFormat('lavfi');

        if (hasAudio) {
            command
                .input('anullsrc=r=44100:cl=stereo')
                .inputFormat('lavfi')
                .inputOptions(['-t 2']);
        }

        command
            .output(outputPath)
            .outputOptions([
                '-c:v libx264',
                '-pix_fmt yuv420p'
            ]);

        if (hasAudio) {
            command.outputOptions(['-c:a aac']);
        }

        command
            .on('end', () => resolve(outputPath))
            .on('error', reject)
            .run();
    });
}

async function checkAudio(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) reject(err);
            const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
            resolve(!!audioStream);
        });
    });
}

async function run() {
    try {
        // 1. Create test videos
        await createVideo(true, videoWithAudio);
        await createVideo(false, videoNoAudio);

        // 2. Merge videos
        console.log('Merging videos...');
        const composer = new VideoComposer();

        // We need to mock the interface or just use the class if it works
        // Since VideoComposer is TS, we need to use the compiled JS
        // Assuming dist/nodes/SbRender/services/VideoComposer.js exists

        await composer.mergeVideos(
            [videoWithAudio, videoNoAudio],
            outputVideo
        );

        // 3. Verify output
        const hasAudio = await checkAudio(outputVideo);
        console.log(`Output video has audio: ${hasAudio}`);

        if (hasAudio) {
            console.log('✅ Test PASSED');
        } else {
            console.error('❌ Test FAILED: Output video missing audio');
            process.exit(1);
        }

    } catch (err) {
        console.error('Test failed:', err);
        process.exit(1);
    } finally {
        // Cleanup
        [videoWithAudio, videoNoAudio, outputVideo].forEach(f => {
            if (fs.existsSync(f)) fs.unlinkSync(f);
        });
    }
}

run();
