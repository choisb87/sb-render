const { VideoComposer } = require('./dist/nodes/SbRender/services/VideoComposer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
const path = require('path');
const fs = require('fs');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const video1 = path.join(__dirname, 'test_v1_audio.mp4');
const video2 = path.join(__dirname, 'test_v2_silent.mp4');
const outputMerged = path.join(__dirname, 'test_merged_output.mp4');

async function createTestVideos() {
    console.log('Creating test video 1 (with audio)...');
    await new Promise((resolve, reject) => {
        ffmpeg()
            .input('color=c=green:s=640x480')
            .inputFormat('lavfi')
            .inputOptions(['-t 2'])
            .input('sine=frequency=440:duration=2')
            .inputFormat('lavfi')
            .outputOptions(['-c:v libx264', '-c:a aac', '-pix_fmt yuv420p'])
            .output(video1)
            .on('end', resolve)
            .on('error', reject)
            .run();
    });
    console.log('✅ Video 1 created');

    console.log('Creating test video 2 (silent)...');
    await new Promise((resolve, reject) => {
        ffmpeg()
            .input('color=c=red:s=640x480')
            .inputFormat('lavfi')
            .inputOptions(['-t 2'])
            .outputOptions(['-c:v libx264', '-pix_fmt yuv420p'])
            .output(video2)
            .on('end', resolve)
            .on('error', reject)
            .run();
    });
    console.log('✅ Video 2 created');
}

async function probeVideos() {
    console.log('\n=== Probing Video 1 ===');
    await new Promise((resolve, reject) => {
        ffmpeg.ffprobe(video1, (err, metadata) => {
            if (err) {
                console.error('❌ Error:', err);
                reject(err);
            } else {
                const audio = metadata.streams.find(s => s.codec_type === 'audio');
                console.log('Has audio:', !!audio);
                if (audio) console.log('Audio codec:', audio.codec_name);
                resolve();
            }
        });
    });

    console.log('\n=== Probing Video 2 ===');
    await new Promise((resolve, reject) => {
        ffmpeg.ffprobe(video2, (err, metadata) => {
            if (err) {
                console.error('❌ Error:', err);
                reject(err);
            } else {
                const audio = metadata.streams.find(s => s.codec_type === 'audio');
                console.log('Has audio:', !!audio);
                if (audio) console.log('Audio codec:', audio.codec_name);
                resolve();
            }
        });
    });
}

async function testMerge() {
    console.log('\n=== Testing VideoComposer.mergeVideos ===');
    const composer = new VideoComposer();

    try {
        await composer.mergeVideos([video1, video2], outputMerged);
        console.log('✅ Merge completed');

        // Check output
        console.log('\n=== Probing Merged Output ===');
        await new Promise((resolve, reject) => {
            ffmpeg.ffprobe(outputMerged, (err, metadata) => {
                if (err) {
                    console.error('❌ Error:', err);
                    reject(err);
                } else {
                    const audio = metadata.streams.find(s => s.codec_type === 'audio');
                    const hasAudio = !!audio;
                    console.log('Output has audio:', hasAudio);
                    if (audio) console.log('Audio codec:', audio.codec_name);

                    if (hasAudio) {
                        console.log('\n✅✅✅ TEST PASSED: Output has audio! ✅✅✅');
                    } else {
                        console.log('\n❌❌❌ TEST FAILED: Output missing audio! ❌❌❌');
                    }
                    resolve();
                }
            });
        });
    } catch (err) {
        console.error('❌ Merge failed:', err);
    }
}

async function cleanup() {
    [video1, video2, outputMerged].forEach(f => {
        if (fs.existsSync(f)) fs.unlinkSync(f);
    });
}

async function run() {
    try {
        await createTestVideos();
        await probeVideos();
        await testMerge();
    } catch (err) {
        console.error('Test error:', err);
    } finally {
        cleanup();
    }
}

run();
