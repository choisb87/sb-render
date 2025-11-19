const { VideoComposer } = require('./dist/nodes/SbRender/services/VideoComposer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
const fs = require('fs');
const path = require('path');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const video1 = path.join(__dirname, 'test_10s_1.mp4');
const video2 = path.join(__dirname, 'test_10s_2.mp4');
const video3 = path.join(__dirname, 'test_10s_3.mp4');
const mergedOutput = path.join(__dirname, 'test_merged_30s.mp4');

async function createTestVideo(outputPath, color, duration = 10) {
    return new Promise((resolve, reject) => {
        console.log(`Creating ${duration}s video (${color})...`);
        ffmpeg()
            .input(`color=c=${color}:s=640x480:d=${duration}`)
            .inputFormat('lavfi')
            .input(`sine=frequency=440:duration=${duration}`)
            .inputFormat('lavfi')
            .outputOptions(['-c:v libx264', '-c:a aac', '-pix_fmt yuv420p'])
            .output(outputPath)
            .on('end', () => {
                console.log(`✅ Created: ${path.basename(outputPath)}`);
                resolve();
            })
            .on('error', reject)
            .run();
    });
}

async function checkDuration(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) reject(err);
            const duration = metadata.format.duration;
            console.log(`📊 ${path.basename(filePath)}: ${duration}s`);
            resolve(duration);
        });
    });
}

async function run() {
    try {
        // Create 3 test videos (10s each)
        console.log('=== Creating Test Videos ===');
        await createTestVideo(video1, 'red', 10);
        await createTestVideo(video2, 'green', 10);
        await createTestVideo(video3, 'blue', 10);

        // Check their durations
        console.log('\n=== Checking Source Durations ===');
        const d1 = await checkDuration(video1);
        const d2 = await checkDuration(video2);
        const d3 = await checkDuration(video3);
        console.log(`Total expected: ${d1 + d2 + d3}s`);

        // Merge videos
        console.log('\n=== Merging Videos ===');
        const composer = new VideoComposer();
        await composer.mergeVideos([video1, video2, video3], mergedOutput);
        console.log('✅ Merge completed');

        // Check merged duration
        console.log('\n=== Checking Merged Video Duration ===');
        const mergedDuration = await checkDuration(mergedOutput);

        const expected = d1 + d2 + d3;
        const diff = Math.abs(mergedDuration - expected);

        console.log(`\nExpected: ${expected}s`);
        console.log(`Actual: ${mergedDuration}s`);
        console.log(`Difference: ${diff.toFixed(2)}s`);

        if (diff < 0.5) {
            console.log('\n✅✅✅ PASS: Duration metadata is correct!');
        } else {
            console.log('\n❌❌❌ FAIL: Duration metadata is WRONG!');
            console.log('This would cause BGM to be cut short!');
        }

        console.log(`\n📂 Merged file: ${mergedOutput}`);

    } catch (err) {
        console.error('\n❌ Test failed:', err);
    } finally {
        // Cleanup
        [video1, video2, video3].forEach(f => {
            if (fs.existsSync(f)) fs.unlinkSync(f);
        });
    }
}

run();
