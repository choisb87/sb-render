const { VideoComposer } = require('./dist/nodes/SbRender/services/VideoComposer');
const https = require('https');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const videoUrls = [
    'https://d288ub56sdnkmp.cloudfront.net/mediafx/assets/1635-yvhphOFJjChRusnK_video.mp4',
    'https://d288ub56sdnkmp.cloudfront.net/mediafx/assets/3ILQzcIWM_JlmlWMfwQbK_video.mp4',
    'https://d288ub56sdnkmp.cloudfront.net/mediafx/assets/WZ-E7M-cOjx2cD1BqyK46_video.mp4',
    'https://d288ub56sdnkmp.cloudfront.net/mediafx/assets/dSI3VBXHMhN1z1F5qoNG7_video.mp4',
    'https://d288ub56sdnkmp.cloudfront.net/mediafx/assets/57AZ1fUPKRS6RF0pPTj6K_video.mp4'
];

const bgmUrl = 'https://d288ub56sdnkmp.cloudfront.net/Champion.mp3';
const bgmPath = path.join(__dirname, 'champion_bgm.mp3');
const mergedVideo = path.join(__dirname, 'merged_scenes.mp4');
const finalOutput = path.join(__dirname, 'final_with_bgm_test.mp4');

async function downloadFile(url, outputPath) {
    if (fs.existsSync(outputPath)) {
        console.log(`Already exists: ${path.basename(outputPath)}`);
        return outputPath;
    }
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

async function checkDuration(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) reject(err);
            const duration = metadata.format.duration;
            const audioStreams = metadata.streams.filter(s => s.codec_type === 'audio');
            console.log(`📊 ${path.basename(filePath)}: ${duration.toFixed(2)}s, ${audioStreams.length} audio stream(s)`);
            resolve(duration);
        });
    });
}

async function run() {
    const downloadedVideos = [];

    try {
        // Step 1: Download BGM
        console.log('=== Step 1: Downloading BGM ===');
        await downloadFile(bgmUrl, bgmPath);
        const bgmDuration = await checkDuration(bgmPath);
        console.log(`BGM duration: ${bgmDuration.toFixed(2)}s`);

        // Step 2: Download Videos
        console.log('\n=== Step 2: Downloading Videos ===');
        for (let i = 0; i < videoUrls.length; i++) {
            const videoPath = path.join(__dirname, `scene_${i}.mp4`);
            await downloadFile(videoUrls[i], videoPath);
            downloadedVideos.push(videoPath);
        }

        // Check video durations
        console.log('\n=== Step 3: Checking Video Durations ===');
        let totalDuration = 0;
        for (const videoPath of downloadedVideos) {
            const duration = await checkDuration(videoPath);
            totalDuration += duration;
        }
        console.log(`\nTotal expected duration after merge: ${totalDuration.toFixed(2)}s`);

        // Step 4: Merge Videos
        console.log('\n=== Step 4: Merging Videos ===');
        const composer = new VideoComposer();
        await composer.mergeVideos(downloadedVideos, mergedVideo);
        console.log('✅ Videos merged');

        // Check merged duration
        console.log('\n=== Step 5: Checking Merged Video ===');
        const mergedDuration = await checkDuration(mergedVideo);
        console.log(`Merged duration: ${mergedDuration.toFixed(2)}s (expected: ${totalDuration.toFixed(2)}s)`);

        // Step 6: Apply BGM
        console.log('\n=== Step 6: Applying BGM to Merged Video ===');
        console.log(`BGM will be looped/trimmed to match video duration: ${mergedDuration.toFixed(2)}s`);

        await composer.composeWithAudioMix(
            mergedVideo,
            bgmPath,
            null, // no additional narration
            null, // no subtitles
            '', // empty filter chain - will be auto-generated
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

        // Step 7: Verify Final Output
        console.log('\n=== Step 7: Verifying Final Output ===');
        const finalDuration = await checkDuration(finalOutput);

        console.log(`\n📂 Final output: ${finalOutput}`);
        console.log(`📊 Video duration: ${finalDuration.toFixed(2)}s`);
        console.log(`📊 Expected BGM duration: ${mergedDuration.toFixed(2)}s`);

        console.log('\n🎧 PLEASE PLAY THE VIDEO AND CHECK:');
        console.log('   1. Does narration/original audio play throughout? (Should: YES)');
        console.log('   2. Does BGM play for FULL duration? (Should: YES)');
        console.log('   3. Any audio cutoff at 10s mark? (Should: NO)');

        if (Math.abs(finalDuration - mergedDuration) < 1) {
            console.log('\n✅ Duration matches!');
        } else {
            console.log('\n⚠️  Duration mismatch!');
        }

    } catch (err) {
        console.error('\n❌ Test failed:', err);
    } finally {
        // Cleanup downloaded files (keep final output for review)
        console.log('\n=== Cleanup ===');
        downloadedVideos.forEach(f => {
            if (fs.existsSync(f)) {
                fs.unlinkSync(f);
                console.log(`Deleted: ${path.basename(f)}`);
            }
        });
        console.log(`\nKept for review:`);
        console.log(`  - ${bgmPath}`);
        console.log(`  - ${mergedVideo}`);
        console.log(`  - ${finalOutput}`);
    }
}

run();
