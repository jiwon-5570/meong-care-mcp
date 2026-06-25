# 멍케어노트 MCP

멍케어노트 MCP는 PlayMCP 또는 카카오톡 Agent에서 사용할 수 있는 반려견 일상 케어·식단·증상 기록 보조 MCP(Model Context Protocol) 서버입니다.

보호자가 입력한 음식 섭취, 식욕, 변 상태, 구토, 활동량, 자연어 증상 표현, 사진 관찰 내용을 구조화해 위험 신호를 분류하고 오늘의 관리 행동과 동물병원 상담용 요약을 제공합니다.

이 서비스는 질병을 진단하거나 약을 처방하지 않습니다. 모든 응답은 보호자의 기록과 상담 준비를 돕는 보조 안내이며, 이상 증상이 심하거나 지속되면 수의사 상담을 권장합니다.

## 현재 구현 상태

- Node.js + TypeScript strict mode
- Express 기반 HTTP 서버
- MCP Streamable HTTP endpoint
- MCP tools 7개 구현
- `GET /health` 구현
- `POST /mcp` 구현
- `.env` / `.env.example` 환경 변수 구성
- 공공데이터 API 실패 시 fallback 구조
- `npm run build` 통과
- production entrypoint `dist/index.js` 실행 확인

## 주요 기능

- 반려견이 먹은 음식의 위험도 확인
- 식욕, 변, 구토, 활동량 기반 일상 상태 위험도 분류
- 위험도와 주요 증상에 맞춘 오늘의 관리 행동 추천
- 동물병원 상담용 증상 요약문 생성
- 지역명 기반 동물병원 후보 안내
- 보호자 자연어 증상 표현을 표준 증상명과 카테고리로 정리
- 변/피부 사진 기록과 보호자 관찰 기반 이상 징후 정리
- 모든 MCP tool 응답에 의료 안전 문구 포함

## MCP Tool 목록

| Tool | 역할 |
| --- | --- |
| `check_food_safety` | 반려견이 먹은 음식의 위험도를 `safe`, `caution`, `danger`, `unknown`으로 분류하고 보호자 행동을 안내합니다. |
| `analyze_daily_status` | 식욕, 변, 구토, 활동량 등 오늘 상태를 기반으로 `normal`, `watch`, `vet_consult`, `urgent`를 분류합니다. |
| `recommend_daily_care` | 위험도와 주요 증상에 따라 식단, 간식, 물 섭취, 산책, 휴식 관리 행동을 추천합니다. |
| `create_vet_visit_summary` | 동물병원 상담 시 보여줄 수 있는 증상 요약문과 질문 목록을 생성합니다. |
| `find_nearby_animal_hospitals` | 지역명 기반으로 동물병원 후보를 안내합니다. 공공데이터 API 또는 로컬 샘플 데이터를 사용합니다. |
| `classify_pet_symptom` | 보호자 자연어 증상 표현을 표준 증상명, 카테고리, `normalizedSymptoms`로 정리합니다. |
| `record_pet_photo_observation` | 변/피부 사진 기록과 보호자 관찰 내용을 바탕으로 이상 징후를 정리합니다. |

## Tool 상세

### `check_food_safety`

입력:

- `foodName`: string
- `amount?: string`
- `dogWeightKg?: number`

출력:

- 음식명
- 섭취량
- 몸무게
- 위험도
- 보호자 행동 안내
- 안전 문구

### `analyze_daily_status`

입력:

- `dogName`: string
- `ageYears?: number`
- `weightKg?: number`
- `appetite`: `normal` | `less` | `none` | `increased`
- `stool`: `normal` | `soft` | `diarrhea` | `bloody` | `unknown`
- `vomiting`: `none` | `once` | `multiple`
- `energy`: `normal` | `low` | `very_low`
- `coughing?: boolean`
- `itching?: boolean`
- `eyeDischarge?: boolean`
- `foodOrSnackToday?: string[]`
- `symptomStartedAt?: string`

출력:

- 반려견 이름
- 위험도
- 판단 이유 목록
- 오늘의 관리 권장사항
- 안전 문구

### `recommend_daily_care`

입력:

- `dogName`: string
- `riskLevel`: `normal` | `watch` | `vet_consult` | `urgent`
- `mainSymptoms`: string[]
- `weightKg?: number`
- `ageYears?: number`

출력:

- 식단 관리
- 간식 제한 여부
- 물 섭취 확인
- 산책 강도
- 휴식 권장
- 관찰할 증상
- 안전 문구

### `create_vet_visit_summary`

입력:

- `dogName`: string
- `ageYears?: number`
- `weightKg?: number`
- `symptoms`: string[]
- `symptomStartedAt?: string`
- `appetite?: string`
- `stool?: string`
- `vomiting?: string`
- `energy?: string`
- `foodOrSnackToday?: string[]`
- `ownerConcern?: string`

출력:

- 병원 상담용 요약문
- 주요 증상
- 증상 시작 시점
- 먹은 음식
- 식욕/변/구토/활동량 상태
- 수의사에게 물어볼 질문 목록

### `find_nearby_animal_hospitals`

입력:

- `region`: string
- `maxResults?: number`
- `onlyOpen?: boolean`

설명:

1차 MVP에서는 GPS 기반 거리 계산이 아니라 지역명 문자열 검색을 사용합니다. `PUBLIC_DATA_SERVICE_KEY`와 `USE_PUBLIC_DATA_API=true`가 설정되어 있으면 공공데이터 API 호출을 시도하고, 실패하면 로컬 샘플 데이터로 fallback합니다.

### `classify_pet_symptom`

입력:

- `text`: string
- `animalType?: "dog" | "cat" | "unknown"`

설명:

질병명을 예측하지 않고 보호자의 자연어 표현을 증상 단위로 정리합니다. 예를 들어 “밥을 안 먹고 축 처져 있어”는 식욕저하, 무기력 같은 증상 표현으로 정리됩니다.

### `record_pet_photo_observation`

입력:

- `dogName?: string`
- `photoType`: `stool` | `skin`
- `imageUrl?: string`
- `imageBase64?: string`
- `takenAt?: string`
- `visualNotes?: string`
- `observedSigns?: string[]`
- `relatedSymptoms?: string[]`
- `appetite?: "normal" | "less" | "none" | "unknown"`
- `vomiting?: "none" | "once" | "multiple" | "unknown"`
- `energy?: "normal" | "low" | "very_low" | "unknown"`

주의:

사진 기능은 실제 이미지 진단 기능이 아닙니다. 현재 MVP는 보호자가 입력한 사진 설명, 관찰 항목, 관련 증상을 바탕으로 이상 징후를 기록하는 보조 기능입니다. `imageBase64`는 전체 원문을 저장하지 않고 preview/omitted 형태로 처리합니다.

## 프로젝트 구조

```text
meong-care-mcp/
├─ src/
│  ├─ index.ts
│  ├─ data/
│  │  ├─ animalHospitals.sample.json
│  │  ├─ symptomDictionary.sample.json
│  │  └─ photoRecords.json
│  ├─ logic/
│  │  ├─ careRules.ts
│  │  ├─ foodRules.ts
│  │  ├─ hospitalRules.ts
│  │  ├─ photoRules.ts
│  │  ├─ riskRules.ts
│  │  └─ symptomRules.ts
│  ├─ services/
│  │  ├─ photoRecordService.ts
│  │  ├─ publicDataHospitalService.ts
│  │  ├─ publicDataSymptomService.ts
│  │  └─ visionAnalyzer.ts
│  ├─ types/
│  │  └─ photoRecord.ts
│  └─ utils/
│     └─ safetyMessage.ts
├─ demo-prompts.md
├─ submission-summary.md
├─ package.json
├─ tsconfig.json
├─ README.md
└─ .env.example
```

## 설치

```bash
npm install
```

## 개발 실행

```bash
npm run dev
```

## 빌드

```bash
npm run build
```

## Production 실행

```bash
npm run build
npm start
```

`npm start`는 `dist/index.js`를 실행합니다. 서버 포트는 `PORT` 환경 변수를 사용합니다. `PORT`가 없거나 잘못된 값이면 기본값 `3000`으로 실행됩니다.

## Health Check

```bash
curl http://localhost:3000/health
```

예상 응답:

```json
{
  "status": "ok",
  "service": "meong-care-note-mcp",
  "mcpEndpoint": "/mcp"
}
```

## 환경 변수

`.env.example`을 참고해 `.env` 또는 배포 플랫폼의 환경 변수를 구성합니다.

```env
PORT=3000
PUBLIC_DATA_SERVICE_KEY=
PUBLIC_DATA_ANIMAL_HOSPITAL_API_URL=https://apis.data.go.kr/1741000/animal_hospitals/info
USE_PUBLIC_DATA_API=false
PUBLIC_DATA_SYMPTOM_API_URL=
USE_SYMPTOM_PUBLIC_DATA=false
```

환경 변수가 누락되어도 서버는 시작됩니다. 공공데이터 API 사용이 꺼져 있거나 API 호출이 실패하면 로컬 샘플 데이터로 fallback합니다.

## 공공데이터 API

동물병원 검색은 공공데이터포털의 동물병원 조회 API URL을 사용할 수 있습니다.

- API 키가 없거나 `USE_PUBLIC_DATA_API=false`이면 `src/data/animalHospitals.sample.json`을 사용합니다.
- `PUBLIC_DATA_SERVICE_KEY`를 입력하고 `USE_PUBLIC_DATA_API=true`로 설정하면 실시간 API 호출을 시도합니다.
- API 오류, 인증 오류, 응답 형식 차이, 결과 없음이 발생하면 서버는 죽지 않고 로컬 샘플 데이터로 fallback합니다.

증상 분류 API는 현재 확인 가능한 공식 OpenAPI가 없어 `src/data/symptomDictionary.sample.json` 로컬 사전을 기본으로 사용합니다.

## PlayMCP 등록

PlayMCP에는 배포된 서버의 Streamable HTTP endpoint를 등록합니다.

로컬 테스트 endpoint:

```text
http://localhost:3000/mcp
```

배포 후 endpoint:

```text
https://your-domain.example/mcp
```

등록 전 확인 순서:

1. `npm run build`
2. `npm start`
3. `GET /health` 응답 확인
4. PlayMCP endpoint에 `/mcp` 경로 등록
5. `tools/list`에서 7개 tool 노출 확인

## 배포 체크리스트

- `npm run build` 통과
- `npm start` 실행 확인
- `/health` 200 응답 확인
- 배포 환경 변수 등록
- PlayMCP에 `/mcp` endpoint 등록
- 공공데이터 API를 사용할 경우 `PUBLIC_DATA_SERVICE_KEY` 입력
- 실제 API 사용 시 `USE_PUBLIC_DATA_API=true` 설정
- `.env`는 GitHub에 업로드하지 않음

## 데모 질문

자세한 시연 질문은 [demo-prompts.md](./demo-prompts.md)를 참고하세요.

1. 강아지가 포도 한 알 먹었어. 몸무게는 11kg이야.
2. 우리 강아지 6살 11kg인데 어제부터 밥을 반만 먹고 변이 묽어. 구토는 없어.
3. 강아지가 밥을 안 먹고 축 처져 있어. 증상으로 정리해줘.
4. 강아지 변 사진을 기록해줘. 사진상 묽은 변처럼 보이고 어제부터 밥을 덜 먹어.
5. 부산 진구 근처 동물병원 알려줘.
6. 방금 증상들을 동물병원에 보여줄 수 있게 정리해줘.

## 제출 요약

공모전 제출용 요약은 [submission-summary.md](./submission-summary.md)를 참고하세요.

## 의료 안전 고지

멍케어노트 MCP의 안내는 진단이나 처방이 아닙니다. 반려견의 이상 증상이 심하거나 지속되면 수의사 상담을 권장합니다. 혈변, 반복 구토, 매우 심한 무기력, 식욕이 전혀 없는 상태, 호흡 이상처럼 위험 신호가 보이면 빠른 진료 권장을 우선해야 합니다.
