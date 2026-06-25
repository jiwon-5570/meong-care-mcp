import test from "node:test";
import assert from "node:assert/strict";

import { checkFoodSafety } from "../dist/logic/foodRules.js";
import { analyzeDailyStatus } from "../dist/logic/riskRules.js";
import {
  createVetVisitSummary,
  recommendDailyCare,
} from "../dist/logic/careRules.js";
import { classifyPetSymptom } from "../dist/logic/symptomRules.js";
import { analyzePhotoObservation } from "../dist/logic/photoRules.js";
import { findHospitalsByRegion } from "../dist/logic/hospitalRules.js";
import {
  analyzeFoodIngestionEvent,
  buildMissingInfoQuestions,
} from "../dist/logic/foodIngestionRules.js";
import { SAFETY_MESSAGE, withSafetyMessage } from "../dist/utils/safetyMessage.js";

test("food safety rules classify high-risk and common foods", () => {
  assert.equal(checkFoodSafety({ foodName: "샤인머스캣 두 알" }).riskLevel, "danger");
  assert.equal(checkFoodSafety({ foodName: "초코케이크" }).riskLevel, "danger");
  assert.equal(checkFoodSafety({ foodName: "양파 들어간 고기" }).riskLevel, "danger");
  assert.equal(checkFoodSafety({ foodName: "치즈" }).riskLevel, "caution");
  assert.equal(checkFoodSafety({ foodName: "강아지 사료" }).riskLevel, "safe");
  assert.equal(checkFoodSafety({ foodName: "처음 보는 재료" }).riskLevel, "unknown");
});

test("daily status rules elevate urgent and contextual consultation cases", () => {
  assert.equal(
    analyzeDailyStatus({
      dogName: "몽이",
      appetite: "normal",
      stool: "bloody",
      vomiting: "none",
      energy: "normal",
    }).riskLevel,
    "urgent",
  );

  const dangerousFood = analyzeDailyStatus({
    dogName: "몽이",
    weightKg: 11,
    appetite: "normal",
    stool: "normal",
    vomiting: "none",
    energy: "normal",
    foodOrSnackToday: ["포도 한 알"],
  });
  assert.equal(dangerousFood.riskLevel, "urgent");
  assert.match(dangerousFood.reasons.join(" "), /위험 음식/);

  const seniorPersistent = analyzeDailyStatus({
    dogName: "초코",
    ageYears: 12,
    appetite: "less",
    stool: "normal",
    vomiting: "none",
    energy: "normal",
    symptomStartedAt: "어제부터",
  });
  assert.equal(seniorPersistent.riskLevel, "vet_consult");
  assert.match(seniorPersistent.reasons.join(" "), /노령견/);

  assert.equal(
    analyzeDailyStatus({
      dogName: "몽이",
      appetite: "normal",
      stool: "soft",
      vomiting: "none",
      energy: "normal",
    }).riskLevel,
    "watch",
  );
});

test("daily care rules adapt guidance by symptoms and age", () => {
  const care = recommendDailyCare({
    dogName: "초코",
    riskLevel: "vet_consult",
    mainSymptoms: ["식욕이 감소했습니다.", "변이 묽습니다."],
    weightKg: 7,
    ageYears: 12,
  });

  assert.equal(care.riskLevel, "vet_consult");
  assert.match(care.dietManagement, /평소 먹던 사료/);
  assert.match(care.waterCheck, /7kg/);
  assert.match(care.restRecommendation, /노령견/);
});

test("vet summary keeps structured consultation fields", () => {
  const summary = createVetVisitSummary({
    dogName: "몽이",
    ageYears: 6,
    weightKg: 11,
    symptoms: ["식욕 감소", "묽은 변"],
    symptomStartedAt: "어제부터",
    appetite: "평소의 절반",
    stool: "묽음",
    vomiting: "없음",
    energy: "보통",
    foodOrSnackToday: ["사료"],
    ownerConcern: "어제부터 밥을 덜 먹습니다.",
  });

  assert.match(summary.vetVisitSummary, /반려견 정보/);
  assert.match(summary.vetVisitSummary, /어제부터/);
  assert.ok(summary.questionsForVet.length >= 3);
});

test("symptom classifier extracts built-in demo symptoms without external data", () => {
  const result = classifyPetSymptom(
    { text: "밥을 안 먹고 축 처져 있어요.", animalType: "dog" },
    [],
    "local_sample",
    "test",
  );

  assert.deepEqual(result.extractedSymptoms.sort(), ["무기력", "식욕저하"].sort());
});

test("photo observation rules classify stool and skin observations", () => {
  assert.equal(
    analyzePhotoObservation({
      photoType: "stool",
      visualNotes: "묽은 변처럼 보임",
      appetite: "less",
      vomiting: "none",
      energy: "normal",
    }).riskLevel,
    "watch",
  );

  assert.equal(
    analyzePhotoObservation({
      photoType: "skin",
      visualNotes: "피부에 진물이 있음",
      appetite: "normal",
      vomiting: "none",
      energy: "normal",
    }).riskLevel,
    "vet_consult",
  );
});

test("hospital search matches region tokens and filters closed hospitals", () => {
  const result = findHospitalsByRegion(
    { region: "부산 진구", maxResults: 5, onlyOpen: true },
    [
      {
        name: "부산진구 멍케어동물병원",
        address: "부산광역시 부산진구 중앙대로 000",
        businessStatus: "영업중",
        dataSource: "local_sample",
      },
      {
        name: "부산진구 폐업동물병원",
        address: "부산광역시 부산진구 서면로 000",
        businessStatus: "폐업",
        dataSource: "local_sample",
      },
    ],
    "test",
  );

  assert.equal(result.hospitals.length, 1);
  assert.equal(result.hospitals[0].name, "부산진구 멍케어동물병원");
});

test("food ingestion event produces missing questions and danger summary", () => {
  const missingQuestions = buildMissingInfoQuestions({ foodName: "포도" });
  assert.ok(missingQuestions.some((question) => question.includes("얼마나 먹었는지")));
  assert.ok(missingQuestions.some((question) => question.includes("언제 먹었는지")));
  assert.ok(missingQuestions.some((question) => question.includes("반려견 몸무게")));

  const analysis = analyzeFoodIngestionEvent({
    dogName: "몽이",
    weightKg: 11,
    foodName: "포도",
    foodDetail: "샤인머스캣",
    amount: "한 알",
    eatenAt: "30분 전",
    currentSymptoms: ["증상 없음"],
  });

  assert.equal(analysis.riskLevel, "danger");
  assert.match(analysis.vetSummary, /빠른 동물병원 상담 권장/);
  assert.ok(analysis.immediateGuide.some((guide) => guide.includes("임의로 약")));
});

test("safety message is attached consistently", () => {
  assert.match(SAFETY_MESSAGE, /진단이나 처방이 아니며/);
  assert.equal(withSafetyMessage({ ok: true }).safetyMessage, SAFETY_MESSAGE);
});
