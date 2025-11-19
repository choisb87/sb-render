const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
const fs = require('fs');
const path = require('path');

// Setup paths
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

console.log('FFmpeg path:', ffmpegInstaller.path);
console.log('FFprobe path:', ffprobeInstaller.path);

// Create a dummy video file for testing
const testVideoPath = path.join(__dirname, 'test_probe.mp4');

async function createTestVideo() {
    return new Promise((resolve, reject) => {
        console.log('Creating test video...');
        ffmpeg()
            .input('color=c=red:s=640x480:d=2')
            .inputFormat('lavfi')
            .input('anullsrc=r=44100:cl=stereo:d=2')
            .inputFormat('lavfi')
            .output(testVideoPath)
            .outputOptions([
                '-c:v libx264',
                '-c:a aac',
                '-pix_fmt yuv420p'
            ])
            .on('end', () => {
                console.log('Test video created:', testVideoPath);
                resolve(testVideoPath);
            })
            .on('error', (err) => {
                console.error('Error creating test video:', err);
                reject(err);
            })
            .run();
    });
}

async function probeVideo(filePath) {
    return new Promise((resolve, reject) => {
        console.log('Probing video:', filePath);
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
                console.error('FFprobe error:', err);
                reject(err);
                return;
            }
            console.log('FFprobe success!');
            const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
            console.log('Audio stream found:', !!audioStream);
            if (audioStream) {
                console.log('Audio codec:', audioStream.codec_name);
                console.log('Channels:', audioStream.channels);
            }
            resolve(metadata);
        });
    });
}

async function run() {
    try {
        await createTestVideo();
        await probeVideo(testVideoPath);
    } catch (err) {
        console.error('Test failed:', err);
    } finally {
        if (fs.existsSync(testVideoPath)) {
            fs.unlinkSync(testVideoPath);
            console.log('Cleaned up test video');
        }
    }
}

run();
