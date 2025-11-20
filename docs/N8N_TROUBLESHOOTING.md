# n8n 환경에서의 SB Render 문제 해결

## ✨ v1.1.20+ 자동 해결 기능

**v1.1.20부터 대부분의 권한 문제가 자동으로 해결됩니다!**

sb-render는 이제 다음 순서로 ffmpeg/ffprobe를 자동으로 찾습니다:
1. 🥇 **시스템 ffmpeg/ffprobe** (Docker에서 권장)
2. 🥈 npm 패키지 (권한 자동 수정 시도)
3. 🥉 안전한 기본값 (제한적 기능)

### 권장 설정 (가장 간단함)

**Docker/n8n 환경에서는 시스템 ffmpeg 설치를 권장합니다:**

```bash
# Docker 컨테이너에서 실행
docker exec <n8n-container> apk add ffmpeg
# 또는 Debian 기반
docker exec <n8n-container> apt-get update && apt-get install -y ffmpeg
```

**docker-compose.yml 예시:**
```yaml
services:
  n8n:
    image: n8nio/n8n
    command: >
      sh -c "
        apk add --no-cache ffmpeg &&
        n8n start
      "
```

이제 **권한 문제나 추가 설정 없이 바로 작동합니다!** ✅

---

## 🚨 레거시 문제 해결 (v1.1.19 이하)

### 1. FFprobe 권한 오류

**증상**:
```
EACCES: permission denied, open '/app/node_modules/@ffprobe-installer/linux-x64/ffprobe'
```

**해결 방법**:

**방법 1: v1.1.20+ 으로 업데이트 (권장)**
```bash
npm update n8n-nodes-sb-render
```

**방법 2: 시스템 FFmpeg 설치 (권장)**
```bash
# Alpine
apk add ffmpeg

# Debian/Ubuntu
apt-get install -y ffmpeg
```

**방법 3: 수동 권한 수정 (임시 해결)**
```bash
chmod +x node_modules/@ffprobe-installer/*/ffprobe*
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