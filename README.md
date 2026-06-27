# 멍케어노트 MCP

멍케어노트 MCP는 PlayMCP 또는 카카오톡 Agent에서 바로 사용할 수 있는 반려견 일상 케어 보조 MCP(Model Context Protocol) 서버입니다.

보호자가 반려견의 나이, 몸무게, 식욕, 변 상태, 구토 여부, 활동량, 먹은 음식 등을 입력하면 현재 상태를 바탕으로 위험 신호를 분류하고 오늘의 식단, 산책, 휴식, 관찰 행동을 안내합니다. 또한 위험 음식 섭취나 이상 증상이 있을 때 동물병원 상담용 요약문을 생성합니다.

이 서비스는 질병을 진단하거나 약을 처방하지 않습니다. 보호자가 이상 신호를 놓치지 않도록 돕고, 수의사에게 더 정확한 정보를 전달할 수 있게 정리하는 생활 관리 보조 도구입니다.

## 현재 상태

- Node.js + TypeScript strict mode
- Express 기반 Streamable HTTP MCP 서버
- `GET /health`
- `POST /mcp`
- MCP tools 10개 구현
- Dockerfile 포함
- KakaoCloud Git 소스 빌드 대응
- 공공데이터 API 실패 시 로컬 샘플 fallback
- 외부 생성형 AI API key 없이 사진·캡처 관찰 텍스트 구조화 지원
- JSON 파일 기반 MVP 기록 저장
- `npm test`, `npm run validate` 통과

## 주요 기능

- 음식 안전 확인
- 위험 음식 섭취 기록 및 병원 상담용 요약 생성
- 오늘 상태 분석
- 입력 정보가 부족한 상태에서도 임시 위험도, 확인 질문, 보호자 안내 생성
- 위험 상황을 `riskBadge`, `riskLabel`, `immediateAction`, `doNow`, `avoidActions`, `warningSignsToWatch`로 구조화해 보호자가 바로 알아볼 수 있게 표시
- 병원 접수/상담 시 그대로 복사해 보여줄 수 있는 `vetShareCard.copyableText` 생성
- 카카오톡 첫 답변, 가족 공유문, 병원 전화 문장, 다음 입력 예시를 묶은 `kakaoActionText` 생성
- 통합 일상 케어 노트 생성
- 식단, 물 섭취, 산책, 휴식 관리 추천
- 동물병원 상담용 증상 요약문 생성
- 호스트 AI가 캡처에서 읽어낸 `chatText` 기반 병원 상담용 요약 생성
- 지역 기반 동물병원 후보 안내
- 자연어 증상 표현 분류
- 보호자 또는 호스트 AI가 제공한 변/피부 관찰 텍스트 기록
- `dogProfile` 기반 이름, 나이, 몸무게, 평소 사료 자동 보정
- `recentRecords` 기반 반복·악화 가능성·호전 가능성 비교

## 의료 안전 원칙

- 병명을 단정하지 않습니다.
- 약을 처방하지 않습니다.
- “이 병입니다”, “이 약을 먹이세요”, “병원 안 가도 됩니다” 같은 표현을 사용하지 않습니다.
- 위험한 경우 “빠른 동물병원 상담 권장”, “동물병원 상담 권장”처럼 명확히 안내합니다.
- 사진 기능은 원본 이미지를 분석하지 않고 보호자 또는 호스트 AI가 제공한 관찰 텍스트를 구조화하는 기록 보조 기능입니다.
- 모든 MCP tool 응답에는 안전 문구가 포함됩니다.

공통 안전 문구는 `src/utils/safetyMessage.ts`에서 관리합니다.

## 호스트 AI 연동 구조

멍케어노트 MCP는 자체적으로 외부 생성형 AI API를 호출하지 않습니다. PlayMCP 또는 카카오톡 Agent의 AI가 사용자의 텍스트, 사진 설명, 캡처에서 읽어낸 내용을 MCP tool 입력으로 전달하면, MCP는 이를 바탕으로 반려견 상태 기록, 위험도 구조화, 병원 상담용 요약을 생성합니다. 이를 통해 별도 AI API key 없이도 보안성과 배포 안정성을 높입니다.

- 사진 원본의 해석은 PlayMCP/카카오톡 Agent 같은 호스트 AI의 책임입니다.
- MCP는 `visualNotes`, `observedSigns`, `relatedSymptoms`로 전달된 관찰 텍스트만 사용합니다.
- 캡처 OCR 또는 읽기는 호스트 AI의 책임이며, MCP는 전달된 `chatText`만 분석합니다.
- `imageBase64`가 전달되더라도 MCP는 내용을 분석하지 않고 원문을 저장하지 않습니다.

## 반려견 프로필 기반 자동 보정

멍케어노트 MCP는 `dogProfile`을 입력받아 반려견 이름, 나이, 몸무게, 평소 사료, 평소 변 상태 같은 기본 정보를 자동 보정할 수 있습니다. 이를 통해 보호자는 매번 같은 정보를 반복 입력하지 않아도 “몽이가 오늘 밥을 반만 먹었어”처럼 짧게 기록할 수 있습니다.

- 현재 요청에 명시한 값이 `dogProfile`보다 항상 우선합니다.
- 실제로 보정한 필드와 부족한 프로필 필드는 `dogProfileUsage`에서 확인할 수 있습니다.
- 평소 사료는 오늘 먹은 음식이 아니라 `평소 사료` 참고 정보로만 구분합니다.
- `knownConditions`와 `regularMedicationMemo`는 보호자가 제공한 기록일 뿐, 새로운 질환 판단이나 약 복용 지시에는 사용하지 않습니다.
- `dogProfile`이 없어도 기존 입력과 응답 동작은 유지됩니다.

`dogProfile`은 `analyze_daily_status`, `create_daily_care_note`, `summarize_pet_chat_for_vet`, `record_food_ingestion_event`, `record_pet_photo_observation` 입력에서 사용할 수 있습니다.

## 최근 기록 비교

`recentRecords`가 함께 제공되면 오늘 상태를 최근 기록과 비교해 반복 신호, 나빠진 것으로 보이는 변화, 나아진 것으로 보이는 변화를 `trendSummary`로 정리합니다. 이 기능은 진단이 아니라 보호자 기록 비교 보조이며, 증상이 반복되거나 상태 변화가 보일 때 수의사 상담 준비에 참고할 수 있습니다.

`trendSummary` 포함 정보:

- 최근 기록 비교 여부와 기록 수
- 반복된 신호 `repeatedSignals`
- 나빠진 것으로 보이는 변화 `worseningSignals`
- 나아진 것으로 보이는 변화 `improvingSignals`
- 추세 라벨과 보호자용 설명

최근 기록이 없으면 오늘 기록을 다음 비교를 위한 기준점으로 사용할 수 있다고 안내합니다. `recentRecords`는 `analyze_daily_status`, `create_daily_care_note`, `summarize_pet_chat_for_vet`에서 사용할 수 있습니다.

## MCP Tool 목록

| Tool | 역할 |
| --- | --- |
| `check_food_safety` | 음식명을 기준으로 `safe`, `caution`, `danger`, `unknown` 위험도를 분류하고 보호자 행동을 안내합니다. |
| `analyze_daily_status` | 식욕, 변, 구토, 활동량, 증상 기간, 위험 음식 섭취 여부를 바탕으로 오늘 상태 위험도를 분류합니다. 입력이 부족하면 확인 질문과 임시 판단을 함께 제공합니다. |
| `create_daily_care_note` | 오늘 상태 입력 한 번으로 위험도, 식단, 산책, 휴식, 관찰 항목, 병원 상담용 요약, 부족한 정보 질문을 함께 생성합니다. |
| `recommend_daily_care` | 위험도와 주요 증상을 바탕으로 오늘의 식단, 물 섭취, 산책, 휴식 관리 행동을 추천합니다. |
| `create_vet_visit_summary` | 동물병원 상담 시 보여줄 수 있는 증상 요약문과 질문 목록을 생성합니다. |
| `summarize_pet_chat_for_vet` | 호스트 Agent가 대화 또는 캡처에서 읽어낸 `chatText`를 바탕으로 반려견 상태를 정리하고 동물병원 상담용 요약을 생성합니다. MCP는 카카오톡을 조회하거나 캡처를 직접 OCR하지 않습니다. |
| `find_nearby_animal_hospitals` | 지역명 기반으로 동물병원 후보를 안내합니다. 공공데이터 API 또는 로컬 샘플 데이터를 사용합니다. |
| `classify_pet_symptom` | 보호자의 자연어 증상 표현을 증상명, 카테고리, 정규화된 표현으로 정리합니다. |
| `record_pet_photo_observation` | 사진 원본을 진단하거나 분석하지 않고, 보호자 또는 호스트 Agent가 제공한 관찰 텍스트를 기록해 이상 징후와 위험도를 구조화합니다. |
| `record_food_ingestion_event` | 위험할 수 있는 음식 섭취 상황을 구조화해 기록하고 병원 상담용 요약을 생성합니다. |

모든 tool은 PlayMCP 권장 metadata 규칙에 맞춰 `name`, `description`, `inputSchema`, `annotations`를 포함합니다.

## 위험 상황이 바로 보이는 응답

멍케어노트 MCP는 위험도를 단순 텍스트로만 표시하지 않고 `riskPresentation` 객체로 구조화해 제공합니다. 위험도 응답에는 다음 정보가 포함됩니다.

- `riskBadge`: 보호자가 바로 알아볼 수 있는 짧은 표시
- `riskLabel`: 위험도 라벨
- `severityOrder`: 1부터 4까지의 심각도 순서
- `urgencyTitle`: 현재 상황 요약
- `immediateAction`: 바로 해야 할 행동
- `doNow`: 지금 확인하거나 기록할 항목
- `avoidActions`: 피해야 할 행동
- `warningSignsToWatch`: 관찰할 위험 신호
- `vetContactGuidance`: 동물병원 상담 안내

표시 기준:

- 🚨 빠른 상담 권장: 위험 음식 섭취 가능성, 혈변, 반복 구토, 호흡 이상, 심한 무기력, 식욕이 전혀 없는 상태
- 🟠 상담 권장: 여러 이상 신호가 함께 있거나 증상이 지속되는 경우
- 🟡 관찰 필요: 가벼운 이상 신호가 있거나 정보가 부족한 경우
- 🟢 큰 이상 신호 적음: 현재 입력만으로 뚜렷한 이상 신호가 적은 경우
- ❔ 정보 확인 필요: 음식 성분이나 상황 정보가 부족해 위험도를 명확히 보기 어려운 경우

이 안내는 진단이나 처방이 아니며, 이상 증상이 심하거나 지속되면 수의사 상담을 권장합니다.

## 병원 공유용 요약 카드

멍케어노트 MCP의 주요 상담 관련 응답은 `vetShareCard`를 포함합니다. `vetShareCard.copyableText`는 보호자가 카카오톡에서 그대로 복사해 동물병원 접수, 상담, 수의사에게 보여줄 수 있는 형식입니다.

포함 정보:

- 반려견 이름, 나이, 몸무게
- 위험도와 바로 할 일
- 주요 증상
- 증상 시작 시점
- 식욕, 변, 구토, 활동량
- 먹은 음식/간식 또는 위험 음식 섭취 기록
- 부족한 추가 확인 정보
- 수의사에게 물어볼 질문
- 진단/처방이 아니라는 안전 고지

`vetShareCard`는 `create_vet_visit_summary`, `create_daily_care_note`, `record_food_ingestion_event`, `summarize_pet_chat_for_vet`, `record_pet_photo_observation` 응답에서 사용할 수 있습니다. 사진 관련 요약은 이미지 진단 결과가 아니라 보호자 또는 호스트 AI가 제공한 관찰 텍스트를 정리한 보조 정보입니다.

## 카카오톡 최적화 출력

멍케어노트 MCP는 실사용자가 카카오톡에서 바로 이해하고 공유할 수 있도록 주요 응답에 `kakaoActionText`를 포함합니다. 위험도 판단은 기존 `riskPresentation`을 재사용하고, 문장만 사용 목적에 맞게 재구성합니다.

포함 필드:

- `chatFirstReply`: 사용자가 가장 먼저 볼 4~7줄의 자연스러운 안내
- `familyShareText`: 가족방에 그대로 공유할 수 있는 행동 중심 요약
- `vetCallScript`: 동물병원에 전화할 때 읽을 수 있는 2~4문장
- `nextInputExample`: 다음 상태 기록을 쉽게 이어가기 위한 카카오톡 입력 예시
- `whyThisRisk`: 현재 위험도 판단에 사용한 기록 근거

적용 tool:

- `analyze_daily_status`
- `create_daily_care_note`
- `summarize_pet_chat_for_vet`
- `record_food_ingestion_event`
- `record_pet_photo_observation`

예시:

```text
🟠 상담 권장
몽이의 오늘 케어 기록을 정리했어요.
주요 기록: 식욕 감소, 묽은 변
바로 할 일: 식사, 배변, 구토, 활동량 기록을 정리해 동물병원 상담을 준비해 주세요.
```

`kakaoActionText` 역시 진단이나 처방을 제공하지 않으며 모든 tool 응답의 기존 `safetyMessage`를 유지합니다.

## 입력이 부족한 상태에서도 안내

카카오톡 대화에서는 보호자가 모든 필드를 한 번에 말하지 않는 경우가 많습니다. 멍케어노트 MCP는 `analyze_daily_status`와 `create_daily_care_note`에서 필수 입력이 부족해도 요청을 실패시키지 않고 다음 정보를 반환합니다.

- 현재 확인된 정보
- 부족한 정보 질문
- 보호자 문장에서 추정한 식욕, 변, 구토, 활동량 상태
- 현재 입력 기준의 임시 위험도 판단
- 오늘 바로 할 수 있는 관리 행동
- 병원 상담용 임시 요약

예를 들어 “우리 강아지가 좀 이상해요”만 입력해도 식욕, 변 상태, 구토 여부, 활동량, 증상 시작 시점, 최근 먹은 음식, 나이와 몸무게를 확인해 달라는 질문을 제공합니다. “밥을 반만 먹고 변이 묽어요. 구토는 없어요”처럼 일부 정보가 있으면 식욕 감소와 묽은 변을 추정하고, 부족한 활동량이나 시작 시점을 추가로 묻습니다.

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
- 위험도 표시 구조 `riskPresentation`
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

반려견의 오늘 상태를 바탕으로 위험도를 분류합니다. 보호자가 “우리 강아지가 좀 이상해요”, “밥을 안 먹어요”처럼 일부 정보만 말해도 서버가 실패하지 않고 현재까지 확인된 정보, 부족한 정보, 추가 질문, 임시 위험도 판단을 반환합니다.

입력:

- `dogName?: string`
- `ageYears?: number`
- `weightKg?: number`
- `appetite?: "normal" | "less" | "none" | "increased" | "unknown"`
- `stool?: "normal" | "soft" | "diarrhea" | "bloody" | "unknown"`
- `vomiting?: "none" | "once" | "multiple" | "unknown"`
- `energy?: "normal" | "low" | "very_low" | "unknown"`
- `coughing?: boolean`
- `itching?: boolean`
- `eyeDischarge?: boolean`
- `foodOrSnackToday?: string[]`
- `symptomStartedAt?: string`
- `ownerConcern?: string`

출력:

- 반려견 이름. 이름이 없으면 `반려견`으로 표시
- 위험도: `normal` | `watch` | `vet_consult` | `urgent`
- 판단 이유
- 주요 증상
- 확인된 정보 `knownInfo`
- 부족한 정보 질문 `missingInfoQuestions`
- 현재 임시 판단 `currentAssessment`
- 위험도 표시 구조 `riskPresentation`
- 오늘 관리 권장사항
- 안전 문구

위험도:

- `urgent`: 혈변, 반복 구토, 매우 무기력, 식욕 전혀 없음, 위험 음식 섭취
- `vet_consult`: 이상 신호 2개 이상, 증상 지속, 어린 강아지/노령견의 이상 신호
- `watch`: 이상 신호 1개 또는 묽은 변
- `normal`: 식욕, 변, 구토, 활동량이 명확히 정상으로 확인된 경우

### `create_daily_care_note`

카카오톡에서 가장 자연스럽게 쓰기 위한 통합 tool입니다. 보호자가 오늘 상태를 한 번에 말하면 위험도 분석, 오늘 관리 행동, 병원 상담용 요약을 함께 생성합니다. 입력이 부족해도 우선 관찰 또는 상담 필요 여부를 임시로 안내하고, 보호자가 이어서 답할 수 있는 질문을 제시합니다.

입력은 `analyze_daily_status`와 동일합니다. `ownerConcern`만 있어도 동작합니다.

출력:

- 반려견 이름
- 위험도
- 판단 이유
- 주요 증상
- 확인된 정보
- 부족한 정보 질문
- 현재 임시 판단
- 카카오톡에서 읽기 쉬운 보호자 안내문
- 위험도 표시 구조
- 오늘 식단/간식/물/산책/휴식 관리
- 관찰할 증상
- 병원 상담용 요약
- 병원 공유용 요약 카드 `vetShareCard`
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
- 위험도 표시 구조
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
- `missingInfoQuestions?: string[]`
- `riskLevel?: "normal" | "watch" | "vet_consult" | "urgent"`

출력:

- 병원 상담용 요약문
- 주요 증상
- 증상 시작 시점
- 먹은 음식
- 식욕/변/구토/활동량 상태
- 수의사에게 물어볼 질문 목록. 부족한 정보 질문이 있으면 함께 포함
- 병원 공유용 요약 카드 `vetShareCard`
- 안전 문구

### `summarize_pet_chat_for_vet`

호스트 Agent가 대화 또는 캡처에서 읽어낸 `chatText`를 분석해 병원 상담 전 보여줄 수 있는 요약을 생성합니다.

중요:

- 카카오톡 채팅방을 직접 조회하지 않습니다.
- 카카오톡 방 목록, 메시지, 가족방 대화 내역을 서버가 가져오지 않습니다.
- 캡처 이미지를 MCP가 직접 OCR하지 않습니다.
- 사용자가 직접 붙여넣은 텍스트 또는 호스트 Agent가 캡처에서 읽어낸 `chatText`만 분석합니다.
- 이미지 URL이나 `imageBase64`를 직접 입력받지 않습니다.
- 질병 진단이나 약 처방이 아니라 병원 상담 준비를 돕는 기능입니다.

입력:

- `dogName?: string`
- `ageYears?: number`
- `weightKg?: number`
- `sourceType: "pasted_text" | "screenshot_ocr" | "manual_memo"`
- `chatText: string`
- `chatStartedAt?: string`
- `chatEndedAt?: string`
- `screenshotTakenAt?: string`
- `ownerMemo?: string`

출력:

- 분석 텍스트 요약
- 추출된 시간 흐름
- 추출된 증상
- 식욕/변/구토/활동량 상태
- 음식 언급
- 위험도
- 판단 이유
- 위험도 표시 구조
- 부족한 정보 질문
- 병원 상담용 요약문
- 병원 공유용 요약 카드 `vetShareCard`
- 수의사에게 물어볼 질문
- 개인정보 주의 문구
- 안전 문구

개인정보 주의:

가족방 캡처나 대화 내용에는 개인정보가 포함될 수 있으므로 반려견 상태와 무관한 이름, 전화번호, 주소 등은 가리거나 제외한 뒤 사용하는 것을 권장합니다.

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

보호자 또는 호스트 Agent가 변/피부 사진에서 관찰해 전달한 텍스트를 기록하고 이상 징후를 구조화합니다.

중요:

- 사진 원본을 진단하거나 직접 분석하지 않습니다.
- PlayMCP/카카오톡 Agent가 사진을 이해한 뒤 `visualNotes`, `observedSigns`, `relatedSymptoms`로 전달한 내용만 사용합니다.
- 사진에 보이는 객관적 특징을 기록하고 위험도와 병원 상담용 요약으로 구조화하는 보조 기능입니다.
- `imageBase64`는 전체 저장하지 않고 preview 또는 `[base64 omitted]`로만 저장합니다.
- `imageBase64`와 `imageUrl`은 분석에 사용하지 않으며 외부 생성형 AI API로 전송하지 않습니다.

출력:

- 사진 기록 ID
- 관찰된 이상 징후
- 위험도
- 오늘 관리 행동
- 병원 상담용 요약
- 위험도 표시 구조
- 병원 공유용 요약 카드 `vetShareCard`
- 사진 기록 한계 안내
- 안전 문구

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
- 위험도 표시 구조
- 병원 상담용 요약문
- 병원 공유용 요약 카드 `vetShareCard`
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
│  │  ├─ chatSummaryRules.ts
│  │  ├─ dailyCareNoteRules.ts
│  │  ├─ dogProfileRules.ts
│  │  ├─ foodIngestionRules.ts
│  │  ├─ foodRules.ts
│  │  ├─ hospitalRules.ts
│  │  ├─ kakaoActionTextRules.ts
│  │  ├─ photoRules.ts
│  │  ├─ riskPresentationRules.ts
│  │  ├─ riskRules.ts
│  │  ├─ symptomRules.ts
│  │  ├─ trendSummaryRules.ts
│  │  └─ vetShareCardRules.ts
│  ├─ services/
│  │  ├─ foodIngestionRecordService.ts
│  │  ├─ jsonRecordStore.ts
│  │  ├─ photoRecordService.ts
│  │  ├─ publicDataHospitalService.ts
│  │  └─ publicDataSymptomService.ts
│  ├─ types/
│  │  ├─ dogProfile.ts
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
- 10개 tool 호출
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

## 사진·캡처 관찰 텍스트 처리

`record_pet_photo_observation`은 사진 원본을 직접 해석하지 않습니다. 호스트 AI가 사진에서 확인한 객관적 관찰 내용을 `visualNotes`, `observedSigns`, `relatedSymptoms`에 넣어 호출하면 MCP의 로컬 규칙이 위험도, 관리 행동, `vetShareCard`를 생성합니다.

`summarize_pet_chat_for_vet`도 캡처 이미지를 직접 OCR하지 않습니다. 호스트 AI가 캡처에서 읽어낸 내용을 `chatText`로 전달하면 MCP가 증상과 시간 흐름을 구조화합니다.

안전 원칙:

- 병명, 원인, 치료법을 단정하지 않습니다.
- 호스트 AI는 색상, 형태, 점액질/혈변처럼 보이는 부분, 붉은기, 각질, 탈모 범위 등 객관적 특징만 텍스트로 전달해야 합니다.
- MCP는 전달받은 관찰 텍스트만 로컬 규칙으로 구조화하며 외부 생성형 AI API를 호출하지 않습니다.
- `imageBase64` 원문은 저장하지 않고 짧은 preview 또는 `[base64 omitted]`만 기록합니다.

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
- 별도 생성형 AI API key가 없어도 서버 빌드와 MCP tool 실행 가능

## 데모 질문

자세한 시연 질문은 [demo-prompts.md](./demo-prompts.md)를 참고하세요.

1. 강아지가 포도 한 알 먹었어. 몸무게는 11kg이야.
2. 우리 강아지 6살 11kg인데 어제부터 밥을 반만 먹고 변이 묽어. 구토는 없어.
3. 강아지가 밥을 안 먹고 축 처져 있어. 증상으로 정리해줘.
4. 강아지 변 사진에서 묽은 변처럼 보인다고 확인했어. 어제부터 밥을 덜 먹은 내용과 함께 기록해줘.
5. 부산 진구 근처 동물병원 알려줘.
6. 방금 증상들을 동물병원에 보여줄 수 있게 정리해줘.
7. 호스트 Agent가 가족방 캡처에서 읽은 내용이야. 병원 가기 전에 정리해줘. 엄마: 몽이가 아침부터 밥을 거의 안 먹어. 동생: 변이 좀 묽은 것 같아. 나: 구토는 있었어? 엄마: 구토는 안 했는데 계속 누워 있어. 몽이는 6살이고 11kg이야.
8. 가족방에서 샤인머스캣 한 알을 30분 전에 먹었다고 했어. 아직 증상은 없대. 병원 상담용으로 정리해줘.

## 제출 요약

공모전 제출용 요약은 [submission-summary.md](./submission-summary.md)를 참고하세요.

## 의료 안전 고지

멍케어노트 MCP의 안내는 진단이나 처방이 아닙니다. 반려견의 이상 증상이 심하거나 지속되면 수의사 상담을 권장합니다.

혈변, 반복 구토, 매우 심한 무기력, 식욕이 전혀 없는 상태, 호흡 이상처럼 위험 신호가 보이면 빠른 동물병원 상담을 우선해야 합니다.
