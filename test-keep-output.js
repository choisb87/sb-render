const { VideoComposer } = require('./dist/nodes/SbRender/services/VideoComposer');
const https = require('https');
const http = require('http');
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

const outputMerged = path.join(__dirname, 'merged_output.mp4');

async function downloadVideo(url, outputPath) {
    return new Promise((resolve, reject) => {
        console.log(`Downloading: ${url}`);
        const file = fs.createWriteStream(outputPath);
        const protocol = url.startsWith('https') ? https : http;

        protocol.get(url, (response) => {
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

async function probeVideo(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
                console.error(`❌ Probe failed for ${path.basename(filePath)}:`, err.message);
                reject(err);
            } else {
                const videoStream = metadata.streams.find(s => s.codec_type === 'video');
                const audioStream = metadata.streams.find(s => s.codec_type === 'audio');

                const info = {
                    file: path.basename(filePath),
                    duration: metadata.format.duration,
                    hasVideo: !!videoStream,
                    hasAudio: !!audioStream,
                    videoCodec: videoStream?.codec_name,
                    audioCodec: audioStream?.codec_name,
                    channels: audioStream?.channels
                };

                console.log(`📹 ${info.file}:`);
                console.log(`   Duration: ${info.duration}s`);
                console.log(`   Video: ${info.videoCodec || 'none'}`);
                console.log(`   Audio: ${info.audioCodec || 'none'} (${info.channels || 0} channels)`);

                resolve(info);
            }
        });
    });
}

async function run() {
    const downloadedPaths = [];

    try {
        // Download all videos
        console.log('\n=== Downloading Videos ===');
        for (let i = 0; i < videoUrls.length; i++) {
            const outputPath = path.join(__dirname, `video_${i}.mp4`);
            await downloadVideo(videoUrls[i], outputPath);
            downloadedPaths.push(outputPath);
        }

        // Probe all videos
        console.log('\n=== Probing Videos ===');
        const videoInfos = [];
        for (const videoPath of downloadedPaths) {
            const info = await probeVideo(videoPath);
            videoInfos.push(info);
        }

        // Summary
        console.log('\n=== Summary ===');
        const withAudio = videoInfos.filter(v => v.hasAudio).length;
        const withoutAudio = videoInfos.filter(v => !v.hasAudio).length;
        console.log(`Videos with audio: ${withAudio}`);
        console.log(`Videos without audio: ${withoutAudio}`);

        // Merge
        console.log('\n=== Merging Videos ===');
        const composer = new VideoComposer();
        await composer.mergeVideos(downloadedPaths, outputMerged);
        console.log('✅ Merge completed');

        // Probe output
        console.log('\n=== Checking Output ===');
        const outputInfo = await probeVideo(outputMerged);

        console.log(`\n📂 Output saved to: ${outputMerged}`);
        console.log(`📊 File size: ${(fs.statSync(outputMerged).size / 1024 / 1024).toFixed(2)} MB`);

        if (outputInfo.hasAudio) {
            console.log('\n✅✅✅ SUCCESS: Output has audio! ✅✅✅');
        } else {
            console.log('\n❌❌❌ FAILED: Output missing audio! ❌❌❌');
        }

        // Cleanup downloaded source videos only
        console.log('\n=== Cleanup ===');
        downloadedPaths.forEach(f => {
            if (fs.existsSync(f)) {
                fs.unlinkSync(f);
                console.log(`Deleted source: ${path.basename(f)}`);
            }
        });

        console.log(`\n✅ Output file kept: ${outputMerged}`);

    } catch (err) {
        console.error('\n❌ Test failed:', err);
    }
}

run();
