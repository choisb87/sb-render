# n8n 환경에서의 SB Render 문제 해결

## 🚨 일반적인 문제들

### 1. FFprobe 권한 오류

**증상**:
```
EACCES: permission denied, open '/app/node_modules/@ffprobe-installer/linux-x64/ffprobe'
```

**해결 방법**:

**방법 1: 설치 후 권한 수정**
```bash
# n8n 컨테이너에서 실행
chmod +x node_modules/@ffprobe-installer/*/ffprobe*
```

**방법 2: Docker 이미지에 미리 추가**
```dockerfile
# Dockerfile에 추가
RUN apt-get update && apt-get install -y ffmpeg
RUN npm install n8n-nodes-sb-render
RUN find node_modules/@ffprobe-installer -name "ffprobe*" -exec chmod +x {} \;
```

**방법 3: 시스템 FFmpeg 사용**
```dockerfile
# 시스템 패키지로 설치
RUN apt-get install -y ffmpeg
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV FFPROBE_PATH=/usr/bin/ffprobe
```

### 2. n8n Cloud 제한

**증상**:
```
Operation not permitted: Cannot execute binary
```

**원인**: n8n Cloud는 보안상 외부 바이너리 실행을 제한합니다.

**해결 방법**:
- Self-hosted n8n 사용 권장
- 또는 사전 처리된 미디어 사용

### 3. 플랫폼 불일치

**증상**:
```
cannot execute binary file: Exec format error
```

**해결 방법**:
```bash
# 현재 플랫폼 확인
uname -m  # x86_64 또는 aarch64

# 올바른 패키지 설치
npm rebuild @ffprobe-installer
```

### 4. Docker 보안 정책

**증상**:
```
sh: ./ffprobe: Operation not permitted
```

**해결 방법**:

**옵션 1: 권한 있는 컨테이너**
```bash
docker run --privileged n8n
```

**옵션 2: 볼륨 마운트 수정**
```bash
# noexec 제거
docker run -v /path:/app:exec n8n
```

**옵션 3: 별도 실행 디렉토리**
```bash
# /tmp에 복사 후 실행
cp node_modules/@ffprobe-installer/*/ffprobe /tmp/
chmod +x /tmp/ffprobe
```

## 🛠 환경별 설정

### Self-hosted n8n (Docker)

**docker-compose.yml**:
```yaml
services:
  n8n:
    image: n8nio/n8n
    environment:
      - N8N_NODES_INCLUDE=["n8n-nodes-sb-render"]
    volumes:
      - n8n_data:/home/node/.n8n
    command: >
      bash -c "
        apt-get update && 
        apt-get install -y ffmpeg &&
        n8n start
      "
```

**커스텀 Dockerfile**:
```dockerfile
FROM n8nio/n8n

# 시스템 FFmpeg 설치
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# SB Render 노드 설치
RUN npm install n8n-nodes-sb-render

# 권한 수정
RUN find node_modules/@ffprobe-installer -name "ffprobe*" -exec chmod +x {} \; || true

USER node
```

### n8n Desktop

1. **Node.js 환경에서 권한 설정**:
```bash
npm install n8n-nodes-sb-render
chmod +x node_modules/@ffprobe-installer/*/ffprobe*
```

2. **시스템 FFmpeg 설치**:
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Windows (Chocolatey)
choco install ffmpeg
```

## 🔧 디버깅 도구

### 1. 환경 확인
```bash
# FFmpeg 설치 확인
which ffmpeg
which ffprobe

# 권한 확인
ls -la node_modules/@ffprobe-installer/*/ffprobe*

# 실행 가능 확인
/path/to/ffprobe -version
```

### 2. SB Render 디버그 모드
```json
{
  "debugMode": true
}
```
로그 위치: `/tmp/sb-render-debug.log`

### 3. n8n 로그 확인
```bash
# Docker 로그
docker logs n8n-container

# n8n 로그 레벨 증가
export N8N_LOG_LEVEL=debug
```

## 🚀 권장 설정

### 프로덕션 환경
```dockerfile
FROM n8nio/n8n

# 1. 시스템 종속성 설치
RUN apt-get update && \
    apt-get install -y \
      ffmpeg \
      fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

# 2. n8n 노드 설치
RUN npm install n8n-nodes-sb-render

# 3. 권한 및 환경 설정
RUN chmod +x /usr/bin/ffmpeg /usr/bin/ffprobe
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV FFPROBE_PATH=/usr/bin/ffprobe

USER node
```

### 개발 환경
```bash
# 1. 시스템 FFmpeg 설치
sudo apt install ffmpeg  # 또는 brew install ffmpeg

# 2. 패키지 설치
npm install n8n-nodes-sb-render

# 3. 권한 수정 (필요시)
npm run postinstall
```

## ⚡ 성능 최적화

### 1. 임시 파일 위치
```bash
# 빠른 디스크 사용
export TMPDIR=/fast-disk/tmp
export N8N_USER_FOLDER=/fast-disk/n8n
```

### 2. FFmpeg 옵션 조정
```json
{
  "quality": "medium",
  "videoCodec": "libx264",
  "debugMode": false
}
```

### 3. 메모리 관리
```bash
# n8n 메모리 제한 증가
export NODE_OPTIONS="--max-old-space-size=4096"
```

## 📞 지원

문제가 지속되면:
1. GitHub Issues: https://github.com/choisb87/sb-render/issues
2. 디버그 로그 첨부 (`/tmp/sb-render-debug.log`)
3. 환경 정보 포함:
   - OS/플랫폼
   - n8n 버전
   - Docker/Self-hosted 여부
   - FFmpeg 설치 상태