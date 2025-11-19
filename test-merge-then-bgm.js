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
const bgmPath = path.join(__dirname, 'test_bgm_champion.mp3');

const video1 = path.join(__dirname, 'narration_1.mp4');
const video2 = path.join(__dirname, 'narration_2.mp4');
const video3 = path.join(__dirname, 'narration_3.mp4');
const mergedVideo = path.join(__dirname, 'merged_with_narration.mp4');
const finalOutput = path.join(__dirname, 'final_with_bgm.mp4');

async function downloadBGM() {
    if (fs.existsSync(bgmPath)) {
        console.log('BGM already downloaded');
        return;
    }
    return new Promise((resolve, reject) => {
        console.log('Downloading BGM...');
        const file = fs.createWriteStream(bgmPath);
        https.get(bgmUrl, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                console.log('✅ BGM downloaded');
                resolve();
            });
        }).on('error', reject);
    });
}

async function createVideoWithNarration(outputPath, color, duration = 10) {
    return new Promise((resolve, reject) => {
        console.log(`Creating ${duration}s video with narration (${color})...`);
        ffmpeg()
            .input(`color=c=${color}:s=640x480:d=${duration}`)
            .inputFormat('lavfi')
            // Narration: sine wave as placeholder
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
            const audioStreams = metadata.streams.filter(s => s.codec_type === 'audio');
            console.log(`📊 ${path.basename(filePath)}: ${duration}s, ${audioStreams.length} audio stream(s)`);
            resolve(duration);
        });
    });
}

async function run() {
    try {
        // Step 1: Download BGM
        await downloadBGM();

        // Step 2: Create 3 videos with narration (10s each)
        console.log('\n=== Step 1: Creating Videos with Narration ===');
        await createVideoWithNarration(video1, 'red', 10);
        await createVideoWithNarration(video2, 'green', 10);
        await createVideoWithNarration(video3, 'blue', 10);

        // Step 3: Merge videos
        console.log('\n=== Step 2: Merging Videos ===');
        const composer = new VideoComposer();
        await composer.mergeVideos([video1, video2, video3], mergedVideo);
        console.log('✅ Videos merged');

        // Check merged video duration
        console.log('\n=== Step 3: Checking Merged Video ===');
        const mergedDuration = await checkDuration(mergedVideo);
        console.log(`Merged duration: ${mergedDuration}s (expected: 30s)`);

        // Step 4: Apply BGM using composeWithAudioMix
        console.log('\n=== Step 4: Applying BGM to Merged Video ===');
        console.log('This should produce BGM for full 30 seconds...');

        await composer.composeWithAudioMix(
            mergedVideo,
            bgmPath,
            null, // no additional narration
            null, // no subtitles
            '', // filter chain will be built
            finalOutput,
            {
                bgmVolume: 20,
                bgmFadeIn: 0,
                bgmFadeOut: 0,
                narrationVolume: 100,
                narrationDelay: 0,
                outputFormat: 'mp4',
                quality: 'high'
            }
        );

        console.log('✅ BGM applied');

        // Step 5: Check final output
        console.log('\n=== Step 5: Checking Final Output ===');
        const finalDuration = await checkDuration(finalOutput);
        console.log(`Final duration: ${finalDuration}s`);

        // Play and verify
        console.log(`\n📂 Final output: ${finalOutput}`);
        console.log('🎧 Please play this file and check:');
        console.log('   - Does narration play for full 30 seconds? (Should: YES)');
        console.log('   - Does BGM play for full 30 seconds? (Should: YES, but might be only 10s)');

        if (finalDuration >= 29) {
            console.log('\n✅ Duration looks correct');
        } else {
            console.log('\n⚠️  Duration is shorter than expected!');
        }

    } catch (err) {
        console.error('\n❌ Test failed:', err);
    } finally {
        // Cleanup intermediate files
        [video1, video2, video3].forEach(f => {
            if (fs.existsSync(f)) fs.unlinkSync(f);
        });
    }
}

run();
