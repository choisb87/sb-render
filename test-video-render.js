const { VideoComposer } = require('./dist/nodes/SbRender/services/VideoComposer');
const { FileManager } = require('./dist/nodes/SbRender/services/FileManager');
const fs = require('fs');

async function testRender() {
  const fileManager = new FileManager();
  const videoComposer = new VideoComposer(fileManager);

  // 이전 대화에서 받은 값들
  const videoUrl = 'https://d288ub56sdnkmp.cloudfront.net/documentary/2025-12-05/241.mp4';

  const srtContent = `1
00:00:00,000 --> 00:00:04,000
최근 발견된 고대 동굴 벽화는 인류 역사의 새로운 장을 열어주고 있습니다.

2
00:00:04,000 --> 00:00:08,000
약 4만 년 전 그려진 것으로 추정되는 이 벽화에는 놀라운 비밀이 숨겨져 있었습니다.

3
00:00:08,000 --> 00:00:12,000
연구진은 벽화 속 상징들이 원시적인 문자 체계일 가능성을 제기했습니다.

4
00:00:12,000 --> 00:00:16,000
이는 문자의 기원을 수만 년 앞당길 수 있는 혁명적 발견입니다.

5
00:00:16,000 --> 00:00:20,000
과학자들은 이제 인류 문명의 시작점을 다시 써야 할지도 모릅니다.

6
00:00:20,000 --> 00:00:24,000
고대인들의 지혜는 우리가 상상했던 것보다 훨씬 깊었던 것입니다.`;

  try {
    console.log('=== SB Render 테스트 시작 ===');
    console.log('Video URL:', videoUrl);
    console.log('');

    // 1. 파일 다운로드
    console.log('1. 비디오 다운로드 중...');
    const videoPath = await fileManager.downloadFile(videoUrl);
    console.log('   비디오 경로:', videoPath);

    // 원본 비디오 정보 확인
    const { execSync } = require('child_process');
    const ffprobePath = '/home/sb/sb-render/node_modules/@ffprobe-installer/linux-x64/ffprobe';

    console.log('');
    console.log('=== 원본 비디오 정보 ===');
    const origProbe = execSync(`${ffprobePath} -v error -show_format -show_streams -of json "${videoPath}"`);
    const origData = JSON.parse(origProbe.toString());
    console.log('원본 길이:', parseFloat(origData.format.duration).toFixed(2), '초');

    const origVideo = origData.streams.find(s => s.codec_type === 'video');
    const origAudio = origData.streams.find(s => s.codec_type === 'audio');
    if (origVideo) {
      console.log('원본 비디오:', `${origVideo.width}x${origVideo.height}`, origVideo.codec_name);
    }
    if (origAudio) {
      console.log('원본 오디오:', origAudio.codec_name, `${origAudio.channels}ch`, `duration: ${origAudio.duration || 'N/A'}`);
    }

    // 2. SRT를 임시 파일로 저장
    console.log('');
    console.log('2. SRT 파일 생성 중...');
    const srtPath = await fileManager.createTempFile('.srt');
    fs.writeFileSync(srtPath, srtContent);
    console.log('   SRT 경로:', srtPath);

    // 3. 출력 경로
    const outputPath = '/tmp/test-render-output.mp4';

    // 4. config 설정
    const config = {
      bgmVolume: 30,
      narrationVolume: 100,
      width: 1920,
      height: 1080,
    };

    // 5. 렌더링 실행 (자막만)
    console.log('');
    console.log('3. 렌더링 시작...');
    console.log('   - 자막 추가');

    const result = await videoComposer.composeWithAudioMix(
      videoPath,
      null,  // bgmPath
      null,  // narrationPath
      srtPath,
      '',    // audioFilterChain - 빈 값 (BGM 없음)
      outputPath,
      config
    );

    console.log('');
    console.log('=== 렌더링 완료 ===');
    console.log('출력 파일:', outputPath);

    // 파일 정보 확인
    const stats = fs.statSync(outputPath);
    console.log('파일 크기:', (stats.size / 1024 / 1024).toFixed(2), 'MB');

    const probeResult = execSync(`${ffprobePath} -v error -show_format -show_streams -of json "${outputPath}"`);
    const probeData = JSON.parse(probeResult.toString());

    console.log('출력 길이:', parseFloat(probeData.format.duration).toFixed(2), '초');

    const videoStream = probeData.streams.find(s => s.codec_type === 'video');
    const audioStream = probeData.streams.find(s => s.codec_type === 'audio');

    if (videoStream) {
      console.log('비디오:', `${videoStream.width}x${videoStream.height}`, videoStream.codec_name);
    }
    if (audioStream) {
      console.log('오디오:', audioStream.codec_name, `${audioStream.channels}ch`);
    }

    // cleanup
    await fileManager.cleanup();
    console.log('');
    console.log('임시 파일 정리 완료');

  } catch (error) {
    console.error('에러 발생:', error);
    await fileManager.cleanup();
  }
}

testRender();
