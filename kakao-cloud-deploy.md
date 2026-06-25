# KakaoCloud Deployment Guide

카카오클라우드 PlayMCP in KC Git 소스 빌드에 사용할 설정입니다.

## Git 소스 빌드 입력값

- Git URL: `https://github.com/jiwon-5570/meong-care-mcp`
- 브랜치 / ref: `main`
- Dockerfile 경로: `Dockerfile`
- 컨테이너 포트: `3000`
- Health check path: `/health`
- MCP endpoint path: `/mcp`

## 필수 환경 변수

```env
PORT=3000
PHOTO_RECORDS_PATH=/app/data/photoRecords.json
FOOD_INGESTION_RECORDS_PATH=/app/data/foodIngestionRecords.json
```

## 선택 환경 변수

공공데이터 API를 사용하지 않고 샘플 fallback으로 실행할 때:

```env
USE_PUBLIC_DATA_API=false
USE_SYMPTOM_PUBLIC_DATA=false
PUBLIC_DATA_ANIMAL_HOSPITAL_API_URL=https://apis.data.go.kr/1741000/animal_hospitals/info
PUBLIC_DATA_SERVICE_KEY=
PUBLIC_DATA_SYMPTOM_API_URL=
```

공공데이터 API를 사용할 때:

```env
USE_PUBLIC_DATA_API=true
PUBLIC_DATA_SERVICE_KEY=발급받은_공공데이터_API_키
PUBLIC_DATA_ANIMAL_HOSPITAL_API_URL=https://apis.data.go.kr/1741000/animal_hospitals/info
```

`PUBLIC_DATA_SERVICE_KEY`는 공개 저장소에 커밋하지 말고 카카오클라우드 환경 변수 또는 secret으로 등록하세요.

## 배포 후 확인

배포 URL이 `https://your-domain.example`이라면:

```text
https://your-domain.example/health
https://your-domain.example/mcp
```

PlayMCP에는 `/mcp`가 붙은 endpoint를 등록합니다.

```text
https://your-domain.example/mcp
```

## 런타임 동작

- 서버는 `0.0.0.0:PORT`에 바인딩 가능한 Express 방식으로 실행됩니다.
- `PORT`가 없거나 잘못된 값이면 `3000`으로 fallback합니다.
- 공공데이터 API가 꺼져 있거나 실패하면 컨테이너 내부 `/app/data`의 샘플 데이터로 fallback합니다.
- 사진 기록은 `PHOTO_RECORDS_PATH`에 append됩니다.
- 위험 음식 섭취 기록은 `FOOD_INGESTION_RECORDS_PATH`에 append됩니다.
- 컨테이너 파일시스템은 재배포 또는 재시작 시 초기화될 수 있으므로 장기 보관이 필요하면 외부 저장소 연동이 필요합니다.
