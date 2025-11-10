# 🔐 브라우저 없이 npm 로그인하기

서버 환경에서 브라우저를 열 수 없을 때 npm 인증 방법입니다.

## 방법 1: Access Token 사용 (권장)

### 1단계: npm 웹사이트에서 토큰 생성

로컬 컴퓨터나 다른 브라우저에서:

1. **https://www.npmjs.com/login** 에서 로그인
2. 우측 상단 프로필 클릭 → **Access Tokens** 선택
3. **Generate New Token** 클릭
4. Token Type 선택:
   - **Classic Token** 선택 (Granular Token은 90일 제한)
5. 권한 선택:
   - **Automation** (CI/CD용) 또는
   - **Publish** (퍼블리시 전용)
6. **Generate Token** 클릭
7. 생성된 토큰 복사 (한 번만 표시됨!)

### 2단계: 서버에서 토큰 설정

```bash
# .npmrc 파일에 토큰 추가
echo "//registry.npmjs.org/:_authToken=YOUR_TOKEN_HERE" > ~/.npmrc

# 또는 현재 프로젝트에만 적용
echo "//registry.npmjs.org/:_authToken=YOUR_TOKEN_HERE" > /home/sb/sb-render/.npmrc
```

**YOUR_TOKEN_HERE**를 실제 토큰으로 교체하세요.

### 3단계: 로그인 확인

```bash
npm whoami
```

본인의 npm 사용자명이 표시되면 성공!

### 4단계: 퍼블리시

```bash
cd /home/sb/sb-render
./publish.sh
```

---

## 방법 2: 환경변수 사용

```bash
# 토큰을 환경변수로 설정
export NPM_TOKEN="your_npm_token_here"

# .npmrc 파일 생성
cat > ~/.npmrc << EOF
//registry.npmjs.org/:_authToken=\${NPM_TOKEN}
EOF

# 확인
npm whoami
```

---

## 방법 3: npm adduser (대화형)

만약 SSH로 접속 가능하다면:

```bash
npm adduser --auth-type=legacy

# 입력 사항:
# Username: npm 사용자명
# Password: npm 비밀번호
# Email: 등록된 이메일
```

---

## 방법 4: 로컬에서 토큰 생성 후 복사

### 로컬 컴퓨터에서:

```bash
# 로컬에서 로그인
npm login

# 토큰 확인
cat ~/.npmrc | grep _authToken
```

출력 예시:
```
//registry.npmjs.org/:_authToken=npm_xxxxxxxxxxxxxxxxxxxx
```

### 서버에 복사:

```bash
# 서버에서 실행
echo "//registry.npmjs.org/:_authToken=npm_xxxxxxxxxxxxxxxxxxxx" > ~/.npmrc
```

---

## 보안 주의사항

⚠️ **토큰 보안**:
- `.npmrc` 파일은 절대 Git에 커밋하지 마세요
- 토큰은 비밀번호처럼 관리하세요
- 사용 후 필요 없으면 토큰을 삭제하세요

```bash
# .gitignore에 추가 (이미 추가되어 있음)
echo ".npmrc" >> .gitignore
```

**토큰 삭제**:
npm 웹사이트 → Access Tokens → 해당 토큰 삭제

---

## 퍼블리시 전체 과정

```bash
# 1. 토큰 설정
echo "//registry.npmjs.org/:_authToken=YOUR_TOKEN" > ~/.npmrc

# 2. 로그인 확인
npm whoami
# 출력: your-username

# 3. 퍼블리시
cd /home/sb/sb-render
./publish.sh

# 또는 직접:
npm publish --access public
```

---

## 문제 해결

### "Not logged in" 오류

```bash
# .npmrc 파일 확인
cat ~/.npmrc

# 토큰이 올바른지 확인
npm whoami

# 안 되면 토큰 재생성
```

### "Token expired" 오류

```bash
# npm 웹사이트에서 새 토큰 생성
# ~/.npmrc 업데이트
echo "//registry.npmjs.org/:_authToken=NEW_TOKEN" > ~/.npmrc
```

### "403 Forbidden" 오류

```bash
# 토큰 권한 확인
# npm 웹사이트에서 Publish 권한이 있는지 확인
# 또는 Automation 타입 토큰 사용
```

---

## 빠른 설정 스크립트

```bash
#!/bin/bash
# setup-npm-token.sh

read -p "Enter your npm access token: " NPM_TOKEN
echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" > ~/.npmrc
chmod 600 ~/.npmrc
echo "✅ Token configured!"
echo "Testing..."
npm whoami
```

사용:
```bash
chmod +x setup-npm-token.sh
./setup-npm-token.sh
```

---

## 추천 방법

**서버 환경에서는 방법 1 (Access Token)이 가장 안전하고 간단합니다:**

1. 웹에서 Automation 타입 토큰 생성
2. `~/.npmrc`에 토큰 추가
3. `npm whoami`로 확인
4. `./publish.sh` 실행

이 방법이 브라우저 인증 없이 가장 안정적으로 작동합니다!
