# 📦 NPM 패키지 퍼블리싱 가이드

## 현재 상태 ✅

- ✅ 패키지 이름: `n8n-nodes-sb-render` (사용 가능)
- ✅ package.json 준비 완료
- ✅ 빌드 완료 (`dist/` 디렉토리 생성됨)
- ✅ GitHub 저장소: https://github.com/choisb87/sb-render
- ✅ 라이센스: MIT

---

## 단계별 퍼블리싱 절차

### 1단계: npm 계정 준비

**npm 계정이 없다면:**
```bash
# 브라우저에서 회원가입
# https://www.npmjs.com/signup
```

**npm 계정이 있다면:**
```bash
# 터미널에서 로그인
npm login

# 입력 정보:
# - Username: npm 사용자명
# - Password: npm 비밀번호
# - Email: 등록된 이메일
# - OTP (있는 경우): 2단계 인증 코드
```

### 2단계: 로그인 확인

```bash
# 현재 로그인된 사용자 확인
npm whoami
```

성공하면 사용자명이 표시됩니다.

---

### 3단계: 최종 빌드 및 검증

```bash
cd /home/sb/sb-render

# 의존성 설치 (혹시 모를 경우)
npm install

# 빌드
npm run build

# 린트 검사
npm run lint

# package.json 검증
npm pack --dry-run
```

`npm pack --dry-run` 결과에서 포함될 파일 목록을 확인하세요:
- ✅ `dist/` 폴더
- ✅ `package.json`
- ✅ `README.md`
- ✅ `LICENSE`

---

### 4단계: 버전 확인 및 업데이트 (선택)

**첫 퍼블리시라면 1.0.0 유지**

향후 업데이트 시:
```bash
# 패치 버전 증가 (1.0.0 → 1.0.1)
npm version patch

# 마이너 버전 증가 (1.0.0 → 1.1.0)
npm version minor

# 메이저 버전 증가 (1.0.0 → 2.0.0)
npm version major
```

---

### 5단계: 퍼블리시! 🚀

```bash
cd /home/sb/sb-render

# 퍼블릭 패키지로 퍼블리시
npm publish --access public
```

**성공 메시지 예시:**
```
npm notice 📦  n8n-nodes-sb-render@1.0.0
npm notice === Tarball Contents ===
npm notice 1.1kB  package.json
npm notice 12.5kB README.md
npm notice 34.1kB dist/nodes/SbRender/SbRender.node.js
...
npm notice === Tarball Details ===
npm notice name:          n8n-nodes-sb-render
npm notice version:       1.0.0
npm notice filename:      n8n-nodes-sb-render-1.0.0.tgz
npm notice package size:  XX.X kB
npm notice unpacked size: XXX.X kB
npm notice total files:   XX
+ n8n-nodes-sb-render@1.0.0
```

---

### 6단계: 퍼블리시 확인

**npm 레지스트리에서 확인:**
```bash
# 패키지 정보 조회
npm view n8n-nodes-sb-render

# 브라우저에서 확인
# https://www.npmjs.com/package/n8n-nodes-sb-render
```

---

## 퍼블리시 후 사용 방법

### n8n UI에서 설치

1. **n8n 실행** → Settings (⚙️) → Community Nodes
2. **Install a community node** 클릭
3. 패키지 이름 입력: `n8n-nodes-sb-render`
4. **Install** 클릭
5. n8n 자동 재시작 후 노드 사용 가능

### npm으로 직접 설치

```bash
# n8n 설치 디렉토리에서
npm install n8n-nodes-sb-render

# 또는 전역 설치
npm install -g n8n-nodes-sb-render
```

---

## 문제 해결

### 오류: "You must be logged in to publish packages"
```bash
npm logout
npm login
# 다시 로그인 후 퍼블리시
```

### 오류: "Package name too similar to existing package"
```bash
# package.json에서 name을 변경
# 예: "n8n-nodes-sb-render-video" 등
```

### 오류: "You do not have permission to publish"
```bash
# 2단계 인증이 활성화된 경우
npm publish --otp=123456  # 6자리 OTP 코드
```

### 퍼블리시 취소 (24시간 이내만 가능)
```bash
# 특정 버전 삭제
npm unpublish n8n-nodes-sb-render@1.0.0

# 전체 패키지 삭제 (주의!)
npm unpublish n8n-nodes-sb-render --force
```

---

## 업데이트 퍼블리시

코드를 수정한 후 새 버전 퍼블리시:

```bash
# 1. 코드 수정
# 2. 빌드
npm run build

# 3. 버전 업데이트
npm version patch  # 또는 minor, major

# 4. Git 커밋 & 푸시
git add .
git commit -m "Update to v1.0.1"
git push origin main
git push --tags

# 5. 퍼블리시
npm publish
```

---

## 배지 추가 (선택)

README.md 상단에 추가할 배지:

```markdown
[![npm version](https://badge.fury.io/js/n8n-nodes-sb-render.svg)](https://www.npmjs.com/package/n8n-nodes-sb-render)
[![npm downloads](https://img.shields.io/npm/dt/n8n-nodes-sb-render.svg)](https://www.npmjs.com/package/n8n-nodes-sb-render)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
```

---

## 빠른 퍼블리시 스크립트

```bash
#!/bin/bash
# publish.sh

echo "🚀 Publishing n8n-nodes-sb-render to npm..."

# 빌드
echo "📦 Building..."
npm run build

# 린트
echo "🔍 Linting..."
npm run lint

# Dry run
echo "🧪 Dry run..."
npm pack --dry-run

# 퍼블리시 확인
read -p "Ready to publish? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
    npm publish --access public
    echo "✅ Published successfully!"
    echo "📋 View at: https://www.npmjs.com/package/n8n-nodes-sb-render"
fi
```

---

## 체크리스트

퍼블리시 전 최종 확인:

- [ ] npm 계정 로그인됨 (`npm whoami`)
- [ ] 빌드 성공 (`npm run build`)
- [ ] 린트 통과 (`npm run lint`)
- [ ] package.json 검증 완료
- [ ] README.md 작성 완료
- [ ] LICENSE 파일 포함
- [ ] .gitignore에 node_modules 포함
- [ ] .npmignore 확인 (또는 package.json의 files 필드)
- [ ] 테스트 데이터 제외됨

---

**준비 완료!** 위 단계를 따라 퍼블리시하시면 됩니다! 🎉
