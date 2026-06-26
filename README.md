# 멍케어노트 MCP

멍케어노트 MCP는 PlayMCP 또는 카카오톡 Agent에서 바로 사용할 수 있는 반려견 일상 케어 보조 MCP(Model Context Protocol) 서버입니다.

보호자가 반려견의 나이, 몸무게, 식욕, 변 상태, 구토 여부, 활동량, 먹은 음식 등을 입력하면 현재 상태를 바탕으로 위험 신호를 분류하고 오늘의 식단, 산책, 휴식, 관찰 행동을 안내합니다. 또한 위험 음식 섭취나 이상 증상이 있을 때 동물병원 상담용 요약문을 생성합니다.

이 서비스는 질병을 진단하거나 약을 처방하지 않습니다. 보호자가 이상 신호를 놓치지 않도록 돕고, 수의사에게 더 정확한 정보를 전달할 수 있게 정리하는 생활 관리 보조 도구입니다.

## 현재 상태

- Node.js + TypeScript strict mode
- Express 기반 Streamable HTTP MCP 서버
- `GET /health`
- `POST /mcp`
- MCP tools 9개 구현
- Dockerfile 포함
- KakaoCloud Git 소스 빌드 대응
- 공공데이터 API 실패 시 로컬 샘플 fallback
- Anthropic API 설정 시 사진 관찰 보조 지원
- JSON 파일 기반 MVP 기록 저장
- `npm test`, `npm run validate` 통과

## 주요 기능

- 음식 안전 확인
- 위험 음식 섭취 기록 및 병원 상담용 요약 생성
- 오늘 상태 분석
- 통합 일상 케어 노트 생성
- 식단, 물 섭취, 산책, 휴식 관리 추천
- 동물병원 상담용 증상 요약문 생성
- 지역 기반 동물병원 후보 안내
- 자연어 증상 표현 분류
- 변/피부 사진 관찰 기록

## 의료 안전 원칙

- 병명을 단정하지 않습니다.
- 약을 처방하지 않습니다.
- “이 병입니다”, “이 약을 먹이세요”, “병원 안 가도 됩니다” 같은 표현을 사용하지 않습니다.
- 위험한 경우 “빠른 동물병원 상담 권장”, “동물병원 상담 권장”처럼 명확히 안내합니다.
- 사진 기능은 이미지 진단이 아니라 사진 기록 및 관찰 보조 기능입니다.
- 모든 MCP tool 응답에는 안전 문구가 포함됩니다.

공통 안전 문구는 `src/utils/safetyMessage.ts`에서 관리합니다.

## MCP Tool 목록

| Tool | 역할 |
| --- | --- |
| `check_food_safety` | 음식명을 기준으로 `safe`, `caution`, `danger`, `unknown` 위험도를 분류하고 보호자 행동을 안내합니다. |
| `analyze_daily_status` | 식욕, 변, 구토, 활동량, 증상 기간, 위험 음식 섭취 여부를 바탕으로 오늘 상태 위험도를 분류합니다. |
| `create_daily_care_note` | 오늘 상태 입력 한 번으로 위험도, 식단, 산책, 휴식, 관찰 항목, 병원 상담용 요약을 함께 생성합니다. |
| `recommend_daily_care` | 위험도와 주요 증상을 바탕으로 오늘의 식단, 물 섭취, 산책, 휴식 관리 행동을 추천합니다. |
| `create_vet_visit_summary` | 동물병원 상담 시 보여줄 수 있는 증상 요약문과 질문 목록을 생성합니다. |
| `find_nearby_animal_hospitals` | 지역명 기반으로 동물병원 후보를 안내합니다. 공공데이터 API 또는 로컬 샘플 데이터를 사용합니다. |
| `classify_pet_symptom` | 보호자의 자연어 증상 표현을 증상명, 카테고리, 정규화된 표현으로 정리합니다. |
| `record_pet_photo_observation` | 변/피부 사진과 보호자 관찰 내용을 기록하고 이상 징후를 정리합니다. |
| `record_food_ingestion_event` | 위험할 수 있는 음식 섭취 상황을 구조화해 기록하고 병원 상담용 요약을 생성합니다. |

모든 tool은 PlayMCP 권장 metadata 규칙에 맞춰 `name`, `description`, `inputSchema`, `annotations`를 포함합니다.

## Tool 상세

### `check_food_safety`

반려견이 먹은 음식의 위험도를 확인하고 보호자가 취해야 할 행동을 안내합니다.

입력:

- `foodName: string`
- `amount?: string`
- `dogWeightKg?: number`

출력:

- 음식명
- 섭취량
- 몸무게
- 위험도: `safe` | `caution` | `danger` | `unknown`
- 보호자 행동 안내
- 안전 문구

위험 음식 예시:

- 초콜릿
- 포도
- 건포도
- 양파
- 마늘
- 자일리톨
- 커피/카페인
- 알코올
- 마카다미아
- 아보카도

### `analyze_daily_status`

반려견의 오늘 상태를 바탕으로 위험도를 분류합니다.

입력:

- `dogName: string`
- `ageYears?: number`
- `weightKg?: number`
- `appetite: "normal" | "less" | "none" | "increased"`
- `stool: "normal" | "soft" | "diarrhea" | "bloody" | "unknown"`
- `vomiting: "none" | "once" | "multiple"`
- `energy: "normal" | "low" | "very_low"`
- `coughing?: boolean`
- `itching?: boolean`
- `eyeDischarge?: boolean`
- `foodOrSnackToday?: string[]`
- `symptomStartedAt?: string`

위험도:

- `urgent`: 혈변, 반복 구토, 매우 무기력, 식욕 전혀 없음, 위험 음식 섭취
- `vet_consult`: 이상 신호 2개 이상, 증상 지속, 어린 강아지/노령견의 이상 신호
- `watch`: 이상 신호 1개 또는 묽은 변
- `normal`: 뚜렷한 이상 입력 없음

### `create_daily_care_note`

카카오톡에서 가장 자연스럽게 쓰기 위한 통합 tool입니다. 보호자가 오늘 상태를 한 번에 말하면 위험도 분석, 오늘 관리 행동, 병원 상담용 요약을 함께 생성합니다.

입력은 `analyze_daily_status`와 동일하며 `ownerConcern?: string`을 추가로 받을 수 있습니다.

출력:

- 반려견 이름
- 위험도
- 판단 이유
- 주요 증상
- 오늘 식단/간식/물/산책/휴식 관리
- 관찰할 증상
- 병원 상담용 요약
- 다음 행동 안내
- 안전 문구

### `recommend_daily_care`

위험도와 주요 증상을 바탕으로 오늘의 관리 행동을 추천합니다.

입력:

- `dogName: string`
- `riskLevel: "normal" | "watch" | "vet_consult" | "urgent"`
- `mainSymptoms: string[]`
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

동물병원 상담 시 보여줄 수 있는 증상 요약문을 생성합니다.

입력:

- `dogName: string`
- `ageYears?: number`
- `weightKg?: number`
- `symptoms: string[]`
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
- 안전 문구

### `find_nearby_animal_hospitals`

지역명 기반으로 동물병원 후보를 안내합니다.

입력:

- `region: string`
- `maxResults?: number`
- `onlyOpen?: boolean`

공공데이터 API 키와 URL이 설정되어 있으면 실시간 호출을 시도합니다. 호출 실패 또는 미설정 시 `src/data/animalHospitals.sample.json`을 사용합니다.

### `classify_pet_symptom`

보호자가 자연스럽게 입력한 증상 표현을 증상명과 카테고리로 정리합니다.

예:

- “밥을 안 먹고 축 처져 있어요”
- “변이 묽고 구토했어요”
- “계속 긁고 눈곱이 많아요”

### `record_pet_photo_observation`

변/피부 사진과 보호자 관찰 내용을 기록하고 이상 징후를 정리합니다.

중요:

- 실제 이미지 진단이 아닙니다.
- 사진에 보이는 객관적 특징과 보호자 입력을 기록하는 보조 기능입니다.
- `imageBase64`는 전체 저장하지 않고 preview 또는 `[base64 omitted]`로만 저장합니다.
- `ANTHROPIC_API_KEY`가 있으면 Anthropic API로 사진 관찰 보조를 시도하고 실패 시 룰 기반 fallback을 사용합니다.

### `record_food_ingestion_event`

위험할 수 있는 음식을 먹은 상황을 병원 상담용으로 구조화해 기록합니다.

입력:

- `dogName?: string`
- `weightKg?: number`
- `foodName: string`
- `foodDetail?: string`
- `amount?: string`
- `eatenAt?: string`
- `photoUrl?: string`
- `imageBase64?: string`
- `currentSymptoms?: string[]`
- `ownerMemo?: string`

출력:

- `recordId`
- 위험도
- 기록된 정보 요약
- 부족한 정보 질문 목록
- 즉시 확인해야 할 항목
- 병원 상담용 요약문
- 안전 문구

위험도가 `danger`이면 “빠른 동물병원 상담 권장”을 명확히 포함합니다.

## 프로젝트 구조

```text
meong-care-mcp/
├─ src/
│  ├─ data/
│  │  ├─ animalHospitals.sample.json
│  │  ├─ foodIngestionRecords.json
│  │  ├─ photoRecords.json
│  │  └─ symptomDictionary.sample.json
│  ├─ logic/
│  │  ├─ careRules.ts
│  │  ├─ dailyCareNoteRules.ts
│  │  ├─ foodIngestionRules.ts
│  │  ├─ foodRules.ts
│  │  ├─ hospitalRules.ts
│  │  ├─ photoRules.ts
│  │  ├─ riskRules.ts
│  │  └─ symptomRules.ts
│  ├─ services/
│  │  ├─ foodIngestionRecordService.ts
│  │  ├─ jsonRecordStore.ts
│  │  ├─ photoRecordService.ts
│  │  ├─ publicDataHospitalService.ts
│  │  ├─ publicDataSymptomService.ts
│  │  └─ visionAnalyzer.ts
│  ├─ types/
│  │  ├─ foodIngestionRecord.ts
│  │  └─ photoRecord.ts
│  ├─ utils/
│  │  └─ safetyMessage.ts
│  └─ index.ts
├─ scripts/
│  └─ validateMcpServer.mjs
├─ tests/
│  ├─ domainRules.test.mjs
│  └─ jsonRecordStore.test.mjs
├─ Dockerfile
├─ README.md
├─ demo-prompts.md
├─ submission-summary.md
├─ package.json
└─ tsconfig.json
```

## 설치

```bash
npm install
```

## 개발 실행

```bash
npm run dev
```

기본 포트는 `3000`입니다.

```text
http://localhost:3000
```

## 빌드

```bash
npm run build
```

빌드 결과는 `dist/`에 생성됩니다.

## 실행

```bash
npm start
```

## 테스트

```bash
npm test
```

## MCP 검증

```bash
npm run validate
```

검증 항목:

- TypeScript build
- 도메인 룰 테스트
- JSON 기록 저장 테스트
- MCP 서버 health check
- `tools/list`
- tool metadata 규칙
- 9개 tool 호출
- 안전 문구 포함 여부
- 금지 의료 표현 포함 여부
- base64 전체 저장 방지

## Health Check

```bash
curl http://localhost:3000/health
```

응답 예시:

```json
{
  "status": "ok",
  "service": "meong-care-note-mcp",
  "mcpEndpoint": "/mcp"
}
```

## 환경 변수

`.env`는 현재 Git 추적 대상입니다. 비밀키는 private 저장소 정책에 맞게 관리하세요.

```env
PORT=3000

PUBLIC_DATA_SERVICE_KEY=
PUBLIC_DATA_ANIMAL_HOSPITAL_API_URL=https://apis.data.go.kr/1741000/animal_hospitals/info
USE_PUBLIC_DATA_API=false

PUBLIC_DATA_SYMPTOM_API_URL=
USE_SYMPTOM_PUBLIC_DATA=false

PHOTO_RECORDS_PATH=src/data/photoRecords.json
FOOD_INGESTION_RECORDS_PATH=src/data/foodIngestionRecords.json

ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-6
```

설명:

- `PORT`: 서버 실행 포트입니다.
- `PUBLIC_DATA_SERVICE_KEY`: 공공데이터포털 API 키입니다.
- `PUBLIC_DATA_ANIMAL_HOSPITAL_API_URL`: 동물병원 API URL입니다.
- `USE_PUBLIC_DATA_API`: `true`이면 공공데이터 API를 우선 사용합니다.
- `PUBLIC_DATA_SYMPTOM_API_URL`: 증상 사전 API URL입니다. 현재는 미설정 시 로컬 샘플을 사용합니다.
- `USE_SYMPTOM_PUBLIC_DATA`: `true`이면 증상 사전 API 사용을 시도합니다.
- `PHOTO_RECORDS_PATH`: 사진 기록 JSON 저장 경로입니다.
- `FOOD_INGESTION_RECORDS_PATH`: 위험 음식 섭취 기록 JSON 저장 경로입니다.
- `ANTHROPIC_API_KEY`: Anthropic 사진 관찰 보조 API 키입니다.
- `ANTHROPIC_MODEL`: Anthropic 모델명입니다.

## Anthropic 사진 관찰 보조

`record_pet_photo_observation`에서 `imageBase64`가 들어오고 `ANTHROPIC_API_KEY`가 설정되어 있으면 Anthropic Messages API를 호출해 사진 관찰 보조를 시도합니다.

안전 원칙:

- 병명, 원인, 치료법을 단정하지 않습니다.
- 사진에 보이는 색상, 형태, 점액질/혈변처럼 보이는 부분, 붉은기, 각질, 탈모 범위 등 객관적 특징만 정리합니다.
- API 호출 실패 시 서버는 죽지 않고 룰 기반 fallback 또는 실패 안내를 반환합니다.

## 기록 데이터 저장

MVP 기준으로 기록은 JSON 파일에 저장합니다.

- 사진 기록: `src/data/photoRecords.json`
- 위험 음식 섭취 기록: `src/data/foodIngestionRecords.json`

파일이 없으면 자동 생성됩니다. JSON이 깨져 있으면 기존 파일은 백업하고 새 배열로 복구합니다.

## PlayMCP 등록

PlayMCP에는 배포된 서버의 Streamable HTTP endpoint를 등록합니다.

```text
https://<배포도메인>/mcp
```

로컬 테스트 endpoint:

```text
http://localhost:3000/mcp
```

## KakaoCloud Git 소스 빌드

KakaoCloud PlayMCP in KC에서 Git 소스 빌드를 사용할 때:

```text
Git URL: https://github.com/jiwon-5570/meong-care-mcp
Branch/ref: main
Dockerfile path: Dockerfile
```

배포 후 PlayMCP 등록 endpoint:

```text
https://<KakaoCloud 배포 도메인>/mcp
```

## Docker 실행

```bash
docker build -t meong-care-mcp .
docker run --rm -p 3000:3000 --env-file .env meong-care-mcp
```

## 배포 체크리스트

- `npm run build` 통과
- `npm test` 통과
- `npm run validate` 통과
- `GET /health` 응답 확인
- PlayMCP endpoint `/mcp` 등록
- KakaoCloud 환경변수 설정
- 공공데이터 API를 사용할 경우 `PUBLIC_DATA_SERVICE_KEY` 입력
- Anthropic 사진 관찰 보조를 사용할 경우 `ANTHROPIC_API_KEY` 입력

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

멍케어노트 MCP의 안내는 진단이나 처방이 아닙니다. 반려견의 이상 증상이 심하거나 지속되면 수의사 상담을 권장합니다.

혈변, 반복 구토, 매우 심한 무기력, 식욕이 전혀 없는 상태, 호흡 이상처럼 위험 신호가 보이면 빠른 동물병원 상담을 우선해야 합니다.
