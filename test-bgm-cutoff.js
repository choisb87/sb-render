const { VideoComposer } = require('./dist/nodes/SbRender/services/VideoComposer');
const { AudioMixer } = require('./dist/nodes/SbRender/services/AudioMixer');
const https = require('https');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const bgmUrl = 'https://d288ub56sdnkmp.cloudfront.net/Champion.mp3';
const bgmPath = path.join(__dirname, 'test_bgm.mp3');
const testVideoPath = path.join(__dirname, 'test_video_for_bgm.mp4');
const outputWithBgm = path.join(__dirname, 'output_with_bgm.mp4');

async function downloadFile(url, outputPath) {
    return new Promise((resolve, reject) => {
        console.log(`Downloading: ${url}`);
        const file = fs.createWriteStream(outputPath);
        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                console.log(`✅ Downloaded: ${path.basename(outputPath)}`);
                resolve(outputPath);
            });
        }).on('error', (err) => {
            fs.unlink(outputPath, () => { });
            reject(err);
        });
    });
}

async function createTestVideo(duration = 30) {
    return new Promise((resolve, reject) => {
        console.log(`Creating ${duration}s test video...`);
        ffmpeg()
            .input(`color=c=blue:s=640x480:d=${duration}`)
            .inputFormat('lavfi')
            .input(`sine=frequency=440:duration=${duration}`)
            .inputFormat('lavfi')
            .outputOptions(['-c:v libx264', '-c:a aac', '-pix_fmt yuv420p'])
            .output(testVideoPath)
            .on('end', () => {
                console.log('✅ Test video created');
                resolve(testVideoPath);
            })
            .on('error', reject)
            .run();
    });
}

async function probeDuration(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) reject(err);
            const duration = metadata.format.duration;
            console.log(`📊 ${path.basename(filePath)}: ${duration}s`);
            resolve(duration);
        });
    });
}

async function checkAudioStreams(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) reject(err);
            const audioStreams = metadata.streams.filter(s => s.codec_type === 'audio');
            console.log(`🔊 ${path.basename(filePath)}: ${audioStreams.length} audio stream(s)`);
            audioStreams.forEach((stream, i) => {
                console.log(`   Stream ${i}: ${stream.codec_name}, duration: ${stream.duration || 'N/A'}s`);
            });
            resolve(audioStreams);
        });
    });
}

async function run() {
    try {
        // Download BGM
        if (!fs.existsSync(bgmPath)) {
            await downloadFile(bgmUrl, bgmPath);
        }

        // Create test video (30 seconds)
        await createTestVideo(30);

        // Check durations
        console.log('\n=== Checking Durations ===');
        const bgmDuration = await probeDuration(bgmPath);
        const videoDuration = await probeDuration(testVideoPath);

        console.log(`\nBGM Duration: ${bgmDuration}s`);
        console.log(`Video Duration: ${videoDuration}s`);

        // Mix audio using AudioMixer
        console.log('\n=== Mixing Audio with BGM ===');
        const audioMixer = new AudioMixer();

        const mixedAudioPath = await audioMixer.mixAudio(
            testVideoPath,
            bgmPath,
            null, // no narration
            path.join(__dirname, 'mixed_audio.aac'),
            {
                bgmVolume: 30,
                bgmFadeIn: 2,
                bgmFadeOut: 2,
                narrationVolume: 80,
                narrationDelay: 0
            }
        );

        console.log(`✅ Mixed audio created: ${mixedAudioPath}`);

        // Check mixed audio duration
        await probeDuration(mixedAudioPath);
        await checkAudioStreams(mixedAudioPath);

        // Create final video with BGM
        console.log('\n=== Creating Final Video ===');
        const composer = new VideoComposer();

        // Use composeWithAudioMix
        await composer.composeWithAudioMix(
            testVideoPath,
            bgmPath,
            null,
            null,
            '', // will be built internally
            outputWithBgm,
            {
                bgmVolume: 30,
                bgmFadeIn: 2,
                bgmFadeOut: 2,
                outputFormat: 'mp4',
                quality: 'high'
            }
        );

        console.log(`✅ Final video created: ${outputWithBgm}`);

        // Check output
        console.log('\n=== Checking Output ===');
        const outputDuration = await probeDuration(outputWithBgm);
        await checkAudioStreams(outputWithBgm);

        console.log(`\n📂 Output saved to: ${outputWithBgm}`);
        console.log(`📊 Output duration: ${outputDuration}s (expected: ${videoDuration}s)`);

        if (Math.abs(outputDuration - videoDuration) < 1) {
            console.log('\n✅ Duration matches video duration');
        } else {
            console.log('\n⚠️  Duration mismatch!');
        }

        console.log('\n💡 Play the video to check if BGM continues throughout or cuts off at 10s');

    } catch (err) {
        console.error('\n❌ Test failed:', err);
    }
}

run();
