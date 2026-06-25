# 멍케어노트 MCP

반려견의 일상 케어, 식단, 증상 기록을 도와주는 MCP(Model Context Protocol) 서버입니다. 카카오톡 또는 PlayMCP에서 보호자가 입력한 내용을 바탕으로 음식 위험도 확인, 오늘 상태 위험도 분류, 관리 행동 추천, 동물병원 상담용 요약, 근처 동물병원 안내, 증상 표현 정리, 사진 기반 관찰 기록을 제공합니다.

이 서비스는 질병을 진단하거나 약을 처방하지 않습니다. 보호자가 상태를 더 잘 기록하고, 위험 신호를 놓치지 않도록 돕는 보조 도구입니다.

## 주요 기능

- 반려견이 먹은 음식의 위험도 확인
- 식욕, 변, 구토, 활동량 등 일상 상태 기반 위험도 분류
- 위험도와 증상에 맞춘 식단, 물 섭취, 산책, 휴식 관리 추천
- 동물병원 상담 시 보여줄 수 있는 증상 요약문 생성
- 지역명 기반 동물병원 후보 안내
- 자연어 증상 표현을 표준 증상명과 카테고리로 정리
- 변/피부 사진 기록과 보호자 관찰 기반 이상 징후 정리
- 모든 tool 응답에 의료 안전 문구 포함

## MCP Tool 목록

### `check_food_safety`

반려견이 먹은 음식의 위험도를 `safe`, `caution`, `danger`, `unknown`으로 분류하고 보호자 행동 안내를 제공합니다.

입력:

- `foodName`: 음식명
- `amount`: 섭취량, 선택
- `dogWeightKg`: 반려견 몸무게, 선택

### `analyze_daily_status`

반려견의 오늘 상태를 바탕으로 위험도를 `normal`, `watch`, `vet_consult`, `urgent`로 분류합니다.

입력:

- `dogName`
- `ageYears`, 선택
- `weightKg`, 선택
- `appetite`: `normal`, `less`, `none`, `increased`
- `stool`: `normal`, `soft`, `diarrhea`, `bloody`, `unknown`
- `vomiting`: `none`, `once`, `multiple`
- `energy`: `normal`, `low`, `very_low`
- `coughing`, `itching`, `eyeDischarge`, 선택
- `foodOrSnackToday`, 선택
- `symptomStartedAt`, 선택

### `recommend_daily_care`

위험도와 주요 증상을 바탕으로 오늘의 식단, 간식, 물 섭취, 산책, 휴식 관리 행동을 추천합니다.

### `create_vet_visit_summary`

동물병원 상담 시 보여줄 수 있는 증상 요약문과 수의사에게 물어볼 질문 목록을 생성합니다.

### `find_nearby_animal_hospitals`

입력 지역 근처의 동물병원 후보를 안내합니다. 1차 MVP에서는 정확한 GPS 거리 계산이 아니라 지역명 문자열 검색을 사용합니다.

입력:

- `region`: 검색 지역
- `maxResults`: 최대 결과 수, 선택
- `onlyOpen`: 영업중 항목만 볼지 여부, 선택

출력:

- 검색 지역
- 동물병원 후보 목록
- 병원명, 주소, 영업상태, 전화번호, 인허가일자, 데이터 출처
- 방문 전 전화 확인 권장 문구
- 응급 증상 시 빠른 진료 권장 문구
- 안전 문구

### `classify_pet_symptom`

보호자가 자연어로 입력한 증상 표현을 표준 증상명, 증상 카테고리, 위험도 분석에 연결할 수 있는 `normalizedSymptoms`로 정리합니다. 질병명을 예측하지 않습니다.

입력:

- `text`: 보호자 자연어 증상 설명
- `animalType`: `dog`, `cat`, `unknown`, 선택

### `record_pet_photo_observation`

반려견 변 사진 또는 피부 사진을 기록하고, 보호자가 함께 입력한 관찰 내용을 바탕으로 이상 징후와 위험도를 정리합니다. MVP에서는 실제 이미지 AI 분석을 수행하지 않고 `visualNotes`, `observedSigns`, `relatedSymptoms` 기반 rule-based 분석을 사용합니다.

입력:

- `dogName`, 선택
- `photoType`: `stool` 또는 `skin`
- `imageUrl`, 선택
- `imageBase64`, 선택
- `takenAt`, 선택
- `visualNotes`, 선택
- `observedSigns`, 선택
- `relatedSymptoms`, 선택
- `appetite`: `normal`, `less`, `none`, `unknown`, 선택
- `vomiting`: `none`, `once`, `multiple`, `unknown`, 선택
- `energy`: `normal`, `low`, `very_low`, `unknown`, 선택

사진 기록은 `src/data/photoRecords.json`에 append 방식으로 저장됩니다. `imageBase64`는 전체 원문을 저장하지 않고 생략 표시 형태의 preview만 저장합니다.

## 설치 방법

```bash
npm install
```

## 실행 방법

개발 실행:

```bash
npm run dev
```

빌드:

```bash
npm run build
```

빌드 후 실행:

```bash
npm start
```

기본 포트는 `3000`이며, `.env` 또는 실행 환경에서 `PORT`로 변경할 수 있습니다.

## `/health` 확인 방법

서버 실행 후 아래 주소를 확인합니다.

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

## 공공데이터 API 설정

`.env.example` 기준 환경 변수:

```bash
PUBLIC_DATA_SERVICE_KEY=
PUBLIC_DATA_ANIMAL_HOSPITAL_API_URL=
USE_PUBLIC_DATA_API=false
PUBLIC_DATA_SYMPTOM_API_URL=
USE_SYMPTOM_PUBLIC_DATA=false
```

`USE_PUBLIC_DATA_API=true`이고 `PUBLIC_DATA_ANIMAL_HOSPITAL_API_URL`이 있으면 병원 검색에서 공공데이터 API를 호출합니다. API가 꺼져 있거나 호출에 실패하면 `src/data/animalHospitals.sample.json`을 사용합니다.

`USE_SYMPTOM_PUBLIC_DATA=true`이고 `PUBLIC_DATA_SYMPTOM_API_URL`이 있으면 증상 사전 API를 호출합니다. API가 꺼져 있거나 호출에 실패하면 `src/data/symptomDictionary.sample.json`을 사용합니다.

API 응답 형식은 기관별로 다를 수 있어 `normalizeHospitalItem`, `normalizeSymptomDictionaryItem`에서 공통 타입으로 변환합니다.

## Fallback 동작

- 공공데이터 API가 꺼져 있으면 로컬 샘플 데이터를 사용합니다.
- API 연결 실패, 비정상 응답, 결과 없음이 발생해도 서버는 죽지 않고 fallback 데이터를 사용합니다.
- 응답에는 공공데이터 API 연결 실패 또는 샘플/백업 데이터 사용 여부를 `dataNotice`로 표시합니다.

## 사진 기록 안전 고지

사진 분석은 진단이 아닙니다. 현재 MVP는 실제 이미지 AI 모델이 아니라 보호자가 입력한 사진 설명과 관찰 항목을 기준으로 이상 징후를 정리합니다. 사진은 조명, 초점, 각도에 따라 다르게 보일 수 있으므로 원인 판단이나 치료 결정에 사용하면 안 됩니다. 증상이 지속되거나 악화되면 수의사 상담을 권장합니다.

## PlayMCP 등록용 Endpoint

로컬 테스트:

```text
http://localhost:3000/mcp
```

배포 후 PlayMCP에는 배포 도메인의 `/mcp` 경로를 등록합니다.

```text
https://your-domain.example/mcp
```

## 데모 질문 예시

1. 우리 강아지 6살 11kg인데 어제부터 밥을 반만 먹고 변이 묽어. 구토는 없어.
2. 강아지가 포도 한 알 먹었어. 몸무게는 11kg이야.
3. 방금 말한 증상들을 동물병원에 보여줄 수 있게 정리해줘.
4. 부산 진구 근처 동물병원 알려줘.
5. 강아지가 밥을 안 먹고 축 처져 있어. 증상으로 정리해줘.
6. 강아지 변 사진을 기록해줘. 사진은 묽은 변처럼 보이고 어제부터 밥을 안 먹어.
7. 강아지 피부 사진을 기록해줘. 발 쪽에 붉은기와 털 빠짐이 보여.
8. 방금 사진 기록을 병원에 보여줄 수 있게 요약해줘.

## 의료 안전 고지

멍케어노트 MCP의 안내는 진단이나 처방이 아닙니다. 반려견의 이상 증상이 심하거나 지속되면 수의사 상담을 권장합니다. 혈변, 반복 구토, 매우 심한 무기력, 식욕이 전혀 없는 상태, 호흡 이상처럼 위험 신호가 보이면 빠른 진료 권장을 우선해야 합니다.
