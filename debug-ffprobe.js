const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
const fs = require('fs');
const path = require('path');

console.log('--- Diagnostic Start ---');
console.log('Node Version:', process.version);
console.log('Platform:', process.platform);

try {
    console.log('FFmpeg Path (Installer):', ffmpegInstaller.path);
    console.log('FFprobe Path (Installer):', ffprobeInstaller.path);

    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
    ffmpeg.setFfprobePath(ffprobeInstaller.path);
    console.log('Paths set in fluent-ffmpeg.');
} catch (e) {
    console.error('Error setting paths:', e);
}

// Create a dummy video file to probe
const testVideoPath = path.join(__dirname, 'probe_test.mp4');

async function createTestVideo() {
    return new Promise((resolve, reject) => {
        console.log('Creating test video...');
        ffmpeg()
            .input('color=c=blue:s=640x480:d=1')
            .inputFormat('lavfi')
            .input('anullsrc=r=44100:cl=stereo')
            .inputFormat('lavfi')
            .inputOptions(['-t 1'])
            .output(testVideoPath)
            .outputOptions(['-c:v libx264', '-c:a aac'])
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
                console.error('FFprobe Error:', err);
                reject(err);
            } else {
                console.log('FFprobe Success!');
                const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
                console.log('Audio Stream Found:', !!audioStream);
                if (audioStream) {
                    console.log('Audio Codec:', audioStream.codec_name);
                    console.log('Channels:', audioStream.channels);
                }
                resolve(metadata);
            }
        });
    });
}

async function run() {
    try {
        if (!fs.existsSync(testVideoPath)) {
            await createTestVideo();
        }
        await probeVideo(testVideoPath);
        console.log('--- Diagnostic Passed ---');
    } catch (err) {
        console.error('--- Diagnostic Failed ---');
        console.error(err);
    } finally {
        if (fs.existsSync(testVideoPath)) {
            fs.unlinkSync(testVideoPath);
        }
    }
}

run();
