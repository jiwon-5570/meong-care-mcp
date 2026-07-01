import test from "node:test";
import assert from "node:assert/strict";

import { createDailyCareNote } from "../dist/logic/dailyCareNoteRules.js";
import { summarizePetChatForVet } from "../dist/logic/chatSummaryRules.js";
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
import {
  buildIngredientNutritionSummary,
  buildIngredientSelectionGuide,
  findMatchingIngredient,
  shouldBuildIngredientSelectionGuide,
} from "../dist/logic/ingredientSelectionRules.js";
import {
  loadPetFoodIngredients,
  normalizePetFoodIngredient,
  parsePetFoodResponse,
} from "../dist/services/petFoodIngredientService.js";
import { normalizeSymptomDictionaryItem } from "../dist/services/publicDataSymptomService.js";

test("public symptom data maps official Korean fields into the MCP dictionary", () => {
  assert.deepEqual(
    normalizeSymptomDictionaryItem({
      "증상명": "귀의 화농성, 점액성 분비물, 과도한 이구(귀밥), 악취",
      "증상목록코드": "a003",
      "증상분류 영어": "Acoustic",
      "증상분류 한글": "청각기관 증상",
      "증상코드": "a",
    }),
    {
      canonicalSymptom: "귀의 화농성",
      category: "청각기관 증상",
      normalizedSymptom: "귀의 화농성, 점액성 분비물, 과도한 이구(귀밥), 악취",
      keywords: ["귀의 화농성", "점액성 분비물", "과도한 이구(귀밥)"],
    },
  );
});

test("food safety rules classify high-risk and common foods", () => {
  assert.equal(checkFoodSafety({ foodName: "샤인머스캣 포도" }).riskLevel, "danger");
  assert.equal(checkFoodSafety({ foodName: "초코케이크" }).riskLevel, "danger");
  assert.equal(checkFoodSafety({ foodName: "양파 들어간 고기" }).riskLevel, "danger");
  assert.equal(checkFoodSafety({ foodName: "치즈" }).riskLevel, "caution");
  assert.equal(checkFoodSafety({ foodName: "강아지 사료" }).riskLevel, "safe");
  assert.equal(checkFoodSafety({ foodName: "처음 보는 재료" }).riskLevel, "unknown");
});

test("food safety rules include visible risk presentation for dangerous food", () => {
  const result = checkFoodSafety({ foodName: "샤인머스캣 포도", dogWeightKg: 11 });

  assert.equal(result.riskLevel, "danger");
  assert.match(result.riskPresentation.riskBadge, /🚨/);
  assert.match(result.riskPresentation.riskLabel, /위험/);
  assert.match(result.riskPresentation.immediateAction, /동물병원/);
  assert.equal(result.riskPresentation.severityOrder, 4);
  assertToolChainGuide(result.toolChainGuide);
  assert.ok(result.toolChainGuide.recommendedNextTools.some((tool) => tool.toolName === "record_food_ingestion_event"));
  assert.ok(!hasRecommendedTool(result.toolChainGuide, "find_nearby_animal_hospitals"));
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
  assert.match(seniorPersistent.reasons.join(" "), /노령견|지속/);

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

test("daily status urgent result includes visible risk presentation", () => {
  const analysis = analyzeDailyStatus({
    dogName: "몽이",
    weightKg: 11,
    ownerConcern: "샤인머스캣 한 알을 30분 전에 먹었어요. 아직 증상은 없어요.",
  });

  assert.equal(analysis.riskLevel, "urgent");
  assert.match(analysis.riskPresentation.riskBadge, /🚨/);
  assert.match(analysis.riskPresentation.riskLabel, /빠른/);
  assert.match(analysis.riskPresentation.immediateAction, /동물병원/);
  assert.ok(analysis.riskPresentation.doNow.length >= 3);
  assert.ok(
    analysis.riskPresentation.avoidActions.some((action) => action.includes("약")) ||
      analysis.riskPresentation.avoidActions.some((action) => action.includes("토하게")),
  );
});

test("daily status analysis handles vague or incomplete guardian input", () => {
  const vague = analyzeDailyStatus({
    ownerConcern: "우리 강아지가 좀 이상해요.",
  });

  assert.equal(vague.dogName, "반려견");
  assert.equal(vague.riskLevel, "watch");
  assert.ok(vague.missingInfoQuestions.length >= 4);
  assert.match(vague.currentAssessment, /추가 정보|관찰/);

  const appetiteOnly = analyzeDailyStatus({
    dogName: "몽이",
    ownerConcern: "몽이가 아침부터 밥을 거의 안 먹어요.",
  });

  assert.ok(["watch", "vet_consult"].includes(appetiteOnly.riskLevel));
  assert.ok(
    appetiteOnly.mainSymptoms.some((symptom) => symptom.includes("식욕")) ||
      appetiteOnly.knownInfo.some((info) => info.includes("식욕") && info.includes("감소")),
  );
  assert.ok(appetiteOnly.missingInfoQuestions.some((question) => question.includes("구토")));
  assert.ok(appetiteOnly.missingInfoQuestions.some((question) => question.includes("변 상태")));
  assert.ok(appetiteOnly.missingInfoQuestions.some((question) => question.includes("활동량")));
});

test("daily status analysis infers mixed digestive symptoms from owner concern", () => {
  const analysis = analyzeDailyStatus({
    dogName: "몽이",
    ageYears: 6,
    weightKg: 11,
    ownerConcern: "밥을 반만 먹고 변이 묽어요. 구토는 없어요.",
  });

  assert.equal(analysis.riskLevel, "vet_consult");
  assert.ok(analysis.knownInfo.some((info) => info.includes("식욕") && info.includes("감소")));
  assert.ok(analysis.knownInfo.some((info) => info.includes("변 상태") && info.includes("묽은 변")));
  assert.ok(analysis.knownInfo.some((info) => info.includes("구토") && info.includes("없음")));
  assert.ok(
    analysis.missingInfoQuestions.some((question) => question.includes("증상이 언제")) ||
      analysis.missingInfoQuestions.some((question) => question.includes("활동량")),
  );
});

test("daily status analysis elevates dangerous food mention in owner concern", () => {
  const analysis = analyzeDailyStatus({
    dogName: "몽이",
    weightKg: 11,
    ownerConcern: "샤인머스캣 한 알을 30분 전에 먹었어요. 아직 증상은 없어요.",
  });

  assert.equal(analysis.riskLevel, "urgent");
  assert.match(analysis.reasons.join(" "), /위험 음식|빠른 동물병원 상담 권장/);
  assert.ok(
    analysis.knownInfo.some((info) => info.includes("샤인머스캣")) ||
      analysis.mainSymptoms.some((symptom) => symptom.includes("샤인머스캣")),
  );
});

test("daily status normal result includes low severity risk presentation", () => {
  const analysis = analyzeDailyStatus({
    dogName: "몽이",
    appetite: "normal",
    stool: "normal",
    vomiting: "none",
    energy: "normal",
  });

  assert.equal(analysis.riskLevel, "normal");
  assert.match(analysis.riskPresentation.riskBadge, /🟢/);
  assert.equal(analysis.riskPresentation.severityOrder, 1);
  assert.equal(analysis.trendSummary.comparedWithRecentRecords, false);
  assert.equal(analysis.trendSummary.trendLabel, "no_recent_data");
});

test("daily status fills missing basics from dogProfile", () => {
  const analysis = analyzeDailyStatus({
    dogProfile: {
      dogName: "몽이",
      ageYears: 6,
      weightKg: 11,
      usualFood: "닭고기 사료",
      usualStool: "보통",
    },
    ownerConcern: "오늘 밥을 반만 먹고 변이 묽어요. 구토는 없어요.",
  });

  assert.equal(analysis.dogName, "몽이");
  assert.equal(analysis.dogProfileUsage.applied, true);
  assert.ok(analysis.dogProfileUsage.appliedFields.includes("dogName"));
  assert.ok(analysis.dogProfileUsage.appliedFields.includes("ageYears"));
  assert.ok(analysis.dogProfileUsage.appliedFields.includes("weightKg"));
  assert.match(`${analysis.knownInfo.join(" ")} ${analysis.dogProfileUsage.profileSummary}`, /몽이/);
  assert.doesNotMatch(analysis.missingInfoQuestions.join(" "), /몸무게/);
  assert.ok(["watch", "vet_consult"].includes(analysis.riskLevel));
});

test("explicit daily status values take priority over dogProfile", () => {
  const analysis = analyzeDailyStatus({
    dogName: "초코",
    weightKg: 7,
    dogProfile: {
      dogName: "몽이",
      weightKg: 11,
    },
    ownerConcern: "밥을 안 먹어요.",
  });

  assert.equal(analysis.dogName, "초코");
  assert.match(`${analysis.knownInfo.join(" ")} ${analysis.dogProfileUsage.profileSummary}`, /7kg/);
  assert.ok(!analysis.dogProfileUsage.appliedFields.includes("dogName"));
  assert.ok(!analysis.dogProfileUsage.appliedFields.includes("weightKg"));
  assert.doesNotMatch(analysis.missingInfoQuestions.join(" "), /몸무게/);
});

test("daily care note compares repeated signals with recent records", async () => {
  const note = await createDailyCareNote({
    dogProfile: {
      dogName: "몽이",
      ageYears: 6,
      weightKg: 11,
    },
    ownerConcern: "오늘도 밥을 거의 안 먹고 변이 묽어요.",
    recentRecords: [
      {
        recordedAt: "어제",
        dogName: "몽이",
        riskLevel: "watch",
        mainSymptoms: ["식욕 감소", "묽은 변"],
        appetite: "less",
        stool: "soft",
        vomiting: "none",
        energy: "normal",
      },
    ],
  });

  assert.equal(note.trendSummary.comparedWithRecentRecords, true);
  assert.ok(note.trendSummary.repeatedSignals.some((signal) => /식욕 감소|묽은 변/.test(signal)));
  assert.ok(["repeated", "worsening", "mixed"].includes(note.trendSummary.trendLabel));
  assert.match(note.userFriendlyGuide, /최근 기록|반복/);
  assert.match(note.kakaoActionText.whyThisRisk.join(" "), /최근 기록|반복|나빠진/);
});

test("daily care prioritizes existing vet without automatic hospital search", async () => {
  const note = await createDailyCareNote({
    dogProfile: {
      dogName: "몽이",
      ageYears: 6,
      weightKg: 11,
      vetClinicName: "몽이동물병원",
      vetPhone: "051-000-0000",
    },
    ownerConcern: "오늘 밥을 거의 안 먹고 계속 누워 있어요. 병원 검색은 아직 하지 말고 기존 병원 연락부터 준비해줘.",
  });

  assertToolChainGuide(note.toolChainGuide);
  assert.equal(note.toolChainGuide.vetContactGuide.mode, "existing_vet_first");
  assert.equal(note.toolChainGuide.vetContactGuide.existingVetName, "몽이동물병원");
  assert.equal(note.toolChainGuide.vetContactGuide.shouldAutoSearchHospital, false);
  assert.ok(!hasRecommendedTool(note.toolChainGuide, "find_nearby_animal_hospitals"));
  assert.match(`${note.kakaoActionText.chatFirstReply} ${note.kakaoActionText.vetCallScript}`, /몽이동물병원|평소 다니던/);
});

test("daily care recommends hospital search only after explicit request", async () => {
  const note = await createDailyCareNote({
    dogProfile: {
      dogName: "몽이",
      weightKg: 11,
    },
    ownerConcern: "몽이가 축 처져 있어요. 근처 동물병원 찾아줘.",
    ownerRequestedHospitalSearch: true,
  });
  const hospitalTool = note.toolChainGuide.recommendedNextTools.find(
    (tool) => tool.toolName === "find_nearby_animal_hospitals",
  );

  assert.ok(hospitalTool !== undefined);
  assert.equal(hospitalTool.userConfirmationNeeded, true);
  assert.ok(["medium", "high"].includes(hospitalTool.priority));
  assert.equal(note.toolChainGuide.vetContactGuide.mode, "hospital_search_on_request");
  assert.equal(note.toolChainGuide.vetContactGuide.shouldAutoSearchHospital, false);
});

test("daily care detects a region-based hospital search request from text", async () => {
  const note = await createDailyCareNote({
    dogProfile: {
      dogName: "몽이",
      weightKg: 11,
    },
    ownerConcern: "몽이가 축 처져 있어요. 부산 동물병원 찾아줘.",
  });

  assert.ok(hasRecommendedTool(note.toolChainGuide, "find_nearby_animal_hospitals"));
  assert.equal(note.toolChainGuide.vetContactGuide.mode, "hospital_search_on_request");
});

test("daily trend reports higher risk than recent record", () => {
  const analysis = analyzeDailyStatus({
    dogProfile: { dogName: "몽이", weightKg: 11 },
    ownerConcern: "오늘은 계속 토하고 축 처져 있어요.",
    recentRecords: [
      {
        recordedAt: "어제",
        dogName: "몽이",
        riskLevel: "watch",
        mainSymptoms: ["식욕 감소"],
        appetite: "less",
        vomiting: "none",
        energy: "normal",
      },
    ],
  });

  assert.equal(analysis.riskLevel, "urgent");
  assert.ok(analysis.trendSummary.worseningSignals.length >= 1);
  assert.ok(["worsening", "mixed"].includes(analysis.trendSummary.trendLabel));
  assert.match(analysis.trendSummary.userMessage, /최근 기록/);
});

test("daily care note combines analysis, care guidance, and vet summary", async () => {
  const note = await createDailyCareNote({
    dogName: "몽이",
    ageYears: 6,
    weightKg: 11,
    appetite: "less",
    stool: "soft",
    vomiting: "none",
    energy: "normal",
    symptomStartedAt: "어제부터",
    ownerConcern: "밥을 반만 먹어요.",
  });

  assert.equal(note.riskLevel, "vet_consult");
  assert.match(note.nextAction, /동물병원 상담 권장/);
  assert.match(note.vetConsultPreparation.vetVisitSummary, /몽이/);
  assert.ok(note.todayCare.symptomsToMonitor.length > 0);
  assertKakaoActionText(note.kakaoActionText);
  assert.match(note.kakaoActionText.chatFirstReply, /몽이/);
  assert.match(note.kakaoActionText.familyShareText, /몽이/);
  assert.match(note.kakaoActionText.vetCallScript, /안녕하세요/);
  assert.match(note.kakaoActionText.nextInputExample, /다음/);
  assert.ok(note.kakaoActionText.whyThisRisk.length >= 2);
});

test("daily care note handles incomplete concern with friendly guide", async () => {
  const note = await createDailyCareNote({
    ownerConcern: "우리 강아지가 밥을 안 먹고 계속 누워 있어요.",
  });

  assert.equal(note.dogName, "반려견");
  assert.ok(["watch", "vet_consult"].includes(note.riskLevel));
  assert.equal(typeof note.userFriendlyGuide, "string");
  assert.match(note.userFriendlyGuide, /🟡|🟠|🚨/);
  assert.match(note.userFriendlyGuide, /vetShareCard\.copyableText/);
  assert.equal(typeof note.riskPresentation, "object");
  assert.equal(typeof note.vetShareCard, "object");
  assert.match(note.vetShareCard.copyableText, /병원 상담용 요약/);
  assert.ok(note.missingInfoQuestions.length >= 3);
  assert.ok(
    note.nextAction.includes(note.riskPresentation.immediateAction) ||
      /동물병원|관찰|기록/.test(note.nextAction),
  );
  assert.equal(typeof note.vetConsultPreparation.vetVisitSummary, "string");

  const serialized = JSON.stringify(note);
  assert.doesNotMatch(serialized, /이 병입니다|이 약을 먹이세요|병원 안 가도 됩니다|진단했습니다|처방합니다|정상 괜찮습니다|완치/);
});

test("pet food ingredient service normalizes paths and numeric strings", () => {
  const ingredient = normalizePetFoodIngredient({
    출처: "식품 DB",
    원료: "농산물 > 당근 > 당근, 뿌리, 생것",
    "원료가격(원/kg)": "5,075.000\n",
    "수분(%)": "91.100",
    "지방(%)": "0.130",
  }, "public_data");

  assert.equal(ingredient?.ingredientName, "당근");
  assert.equal(ingredient?.category, "농산물");
  assert.equal(ingredient?.subCategory, "당근");
  assert.equal(ingredient?.partOrForm, "뿌리, 생것");
  assert.equal(ingredient?.priceWonPerKg, 5075);
  assert.equal(ingredient?.moisturePercent, 91.1);
  assert.equal(shouldBuildIngredientSelectionGuide({
    dogName: "몽이",
    appetite: "normal",
    stool: "normal",
    vomiting: "none",
    energy: "normal",
  }), false);
});

test("pet food ingredient service parses official Nongsaro XML fields", () => {
  const parsed = parsePetFoodResponse(`
    <response>
      <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE</resultMsg></header>
      <body><items><item>
        <originNm>식품 DB</originNm>
        <feedClCodeNm>농산물 &gt; 당근</feedClCodeNm>
        <feedNm>당근, 뿌리, 생것</feedNm>
        <mtralPc>5075</mtralPc>
        <dryMatter>8.9</dryMatter>
        <mitrQy>91.1</mitrQy>
        <protQy>1.02</protQy>
        <fatQy>0.13</fatQy>
      </item></items></body>
    </response>
  `, "text/xml;charset=UTF-8");
  const item = parsed.response.body.items.item;
  const ingredient = normalizePetFoodIngredient(item, "public_data");

  assert.equal(ingredient?.ingredientName, "당근");
  assert.equal(ingredient?.ingredientPath, "농산물 > 당근 > 당근, 뿌리, 생것");
  assert.equal(ingredient?.originSource, "식품 DB");
  assert.equal(ingredient?.priceWonPerKg, 5075);
  assert.equal(ingredient?.proteinPercent, 1.02);
  assert.equal(ingredient?.fatPercent, 0.13);
});

test("pet food ingredient service falls back when public API fails", async () => {
  const previousUse = process.env.USE_PET_FOOD_PUBLIC_DATA;
  const previousUrl = process.env.PUBLIC_DATA_PET_FOOD_API_URL;
  const previousKey = process.env.PUBLIC_DATA_SERVICE_KEY;

  try {
    process.env.USE_PET_FOOD_PUBLIC_DATA = "true";
    process.env.PUBLIC_DATA_PET_FOOD_API_URL = "http://127.0.0.1:1/pet-food";
    delete process.env.PUBLIC_DATA_SERVICE_KEY;

    const loaded = await loadPetFoodIngredients();
    assert.ok(loaded.ingredients.length >= 10);
    assert.match(loaded.dataNotice, /실패.*로컬|로컬.*샘플/);
  } finally {
    restoreEnv("USE_PET_FOOD_PUBLIC_DATA", previousUse);
    restoreEnv("PUBLIC_DATA_PET_FOOD_API_URL", previousUrl);
    restoreEnv("PUBLIC_DATA_SERVICE_KEY", previousKey);
  }
});

test("daily care note conditionally includes ingredient selection guide", async () => {
  const note = await createDailyCareNote({
    dogProfile: {
      dogName: "몽이",
      ageYears: 6,
      weightKg: 11,
      usualFood: "닭고기 사료",
    },
    ownerConcern: "몽이가 오늘 밥을 반만 먹고 변이 묽어요. 집밥 재료는 어떤 기준으로 봐야 할까요?",
    includeIngredientGuide: true,
    ingredientGoal: "sensitive_stomach",
  });

  assert.equal(note.ingredientSelectionGuide?.mode, "daily_status_based_ingredient_guide");
  assert.ok(Array.isArray(note.ingredientSelectionGuide?.possibleIngredients));
  assert.ok(Array.isArray(note.ingredientSelectionGuide?.cautionIngredients));
  assert.ok((note.ingredientSelectionGuide?.possibleIngredients.length ?? 0) >= 3);
  assert.ok((note.ingredientSelectionGuide?.cautionIngredients.length ?? 0) >= 3);
  assert.match(note.ingredientSelectionGuide?.recommendedCriteria.join(" ") ?? "", /새 원료|소량/);
  assert.match(note.ingredientSelectionGuide?.avoidCriteria.join(" ") ?? "", /지방/);
  assert.match(note.ingredientSelectionGuide?.safetyNote ?? "", /진단|처방|치료식 추천이 아닙니다/);
  assert.match(note.ingredientSelectionGuide?.familyShareText ?? "", /몽이/);
  assert.match(note.userFriendlyGuide, /식단 원료 가이드/);
  assertIngredientGuideSafety(note.ingredientSelectionGuide);
});

test("ingredient selection compares requested carrot and cod", async () => {
  const loaded = await loadPetFoodIngredients();
  assert.ok(loaded.ingredients.length >= 10);

  const guide = buildIngredientSelectionGuide({
    dogName: "몽이",
    stool: "soft",
    requestedIngredientNames: ["당근", "대구"],
    includeIngredientGuide: true,
    dataNotice: loaded.dataNotice,
  }, loaded.ingredients);
  const candidates = [...guide.possibleIngredients, ...guide.cautionIngredients];

  assert.equal(guide.mode, "ingredient_comparison");
  assert.ok(candidates.some((candidate) => /당근/.test(candidate.ingredientName)));
  assert.ok(candidates.some((candidate) => /대구/.test(candidate.ingredientName)));
  assert.ok(candidates.some((candidate) => /수분|단백질|지방/.test(candidate.nutritionSummary)));
  assertIngredientGuideSafety(guide);
});

test("ingredient selection places high-fat pork intestine in caution list", async () => {
  const loaded = await loadPetFoodIngredients("돼지 대창");
  const guide = buildIngredientSelectionGuide({
    dogName: "몽이",
    stool: "soft",
    goal: "sensitive_stomach",
    requestedIngredientNames: ["돼지 대창"],
    includeIngredientGuide: true,
    dataNotice: loaded.dataNotice,
  }, loaded.ingredients);

  assert.ok(guide.cautionIngredients.some((candidate) => candidate.ingredientName === "돼지 대창"));
  assert.match(
    guide.cautionIngredients.flatMap((candidate) => [...candidate.reasons, ...candidate.cautionNotes]).join(" "),
    /지방/,
  );
  assertIngredientGuideSafety(guide);
});

test("food safety nutrition context never lowers dangerous food risk", async () => {
  const loaded = await loadPetFoodIngredients("당근");
  const carrot = findMatchingIngredient("당근", loaded.ingredients);
  const carrotSafety = checkFoodSafety({ foodName: "당근", includeIngredientGuide: true });
  const summary = carrot !== undefined
    ? buildIngredientNutritionSummary(carrot, loaded.dataNotice)
    : undefined;
  const grapeSafety = checkFoodSafety({ foodName: "포도", includeIngredientGuide: true });

  assert.equal(carrotSafety.riskLevel, "safe");
  assert.match(summary?.nutritionSummary ?? "", /수분|단백질|지방/);
  assert.doesNotMatch(JSON.stringify(summary), /먹이세요/);
  assert.equal(grapeSafety.riskLevel, "danger");
  assert.match(JSON.stringify(grapeSafety), /빠른 동물병원 상담 권장/);
});

test("pet chat summary extracts symptoms and creates vet summary", () => {
  const summary = summarizePetChatForVet({
    dogName: "몽이",
    ageYears: 6,
    weightKg: 11,
    sourceType: "screenshot_ocr",
    chatText: `
엄마: 몽이가 아침부터 밥을 거의 안 먹어.
동생: 변이 좀 묽은 것 같아.
나: 구토는 있었어?
엄마: 구토는 안 했는데 계속 누워 있어.
동생: 어제 닭가슴살 조금 먹었대.
    `,
    ownerMemo: "가족방 캡처에서 읽은 내용",
  });

  assert.ok(summary.extractedSymptoms.some((symptom) => symptom.includes("식욕")));
  assert.ok(summary.extractedSymptoms.some((symptom) => symptom.includes("묽은 변")));
  assert.ok(summary.extractedSymptoms.some((symptom) => symptom.includes("무기력") || symptom.includes("활동량")));
  assert.ok(["less", "none"].includes(summary.appetiteStatus));
  assert.equal(summary.stoolStatus, "soft");
  assert.equal(summary.vomitingStatus, "none");
  assert.ok(["low", "very_low"].includes(summary.energyStatus));
  assert.ok(summary.foodMentions.some((food) => food.includes("닭가슴살")));
  assert.ok(["watch", "vet_consult"].includes(summary.riskLevel));
  assert.equal(typeof summary.vetVisitSummary, "string");
  assert.match(summary.privacyNotice, /직접 조회하지/);
  assertVetShareCardText(summary.vetShareCard);
  assert.match(summary.vetShareCard.copyableText, /캡처|가족 대화/);
  assert.match(summary.vetShareCard.copyableText, /식욕|변|구토/);
  assertKakaoActionText(summary.kakaoActionText);
  assert.match(summary.kakaoActionText.familyShareText, /가족|정리/);
  assert.match(summary.kakaoActionText.vetCallScript, /밥|식욕/);
  assert.match(summary.kakaoActionText.nextInputExample, /구토/);
  assert.ok(summary.kakaoActionText.whyThisRisk.length >= 2);
});

test("pet chat summary elevates dangerous food mention to urgent", () => {
  const summary = summarizePetChatForVet({
    dogName: "몽이",
    weightKg: 11,
    sourceType: "manual_memo",
    chatText: "샤인머스캣 한 알을 30분 전에 먹었대. 아직 증상은 없어.",
  });

  assert.equal(summary.riskLevel, "urgent");
  assert.match(summary.riskPresentation.riskBadge, /🚨/);
  assert.match(`${summary.analyzedTextSummary} ${summary.vetVisitSummary}`, /빠른 상담|위험 음식/);
  assert.match(summary.vetShareCard.copyableText, /병원 상담용 요약/);
  assert.match(summary.vetShareCard.copyableText, /샤인머스캣/);
  assert.ok(summary.foodMentions.some((food) => food.includes("샤인머스캣")));
  assert.match(summary.riskReasons.join(" "), /위험 음식|빠른 동물병원 상담 권장/);
});

test("pet chat summary fills profile and keeps share outputs", () => {
  const summary = summarizePetChatForVet({
    sourceType: "screenshot_ocr",
    dogProfile: {
      dogName: "몽이",
      ageYears: 6,
      weightKg: 11,
    },
    chatText: "엄마: 아침부터 밥을 거의 안 먹어. 동생: 변도 좀 묽어. 엄마: 구토는 안 했어.",
  });

  assert.equal(summary.dogName, "몽이");
  assert.equal(summary.ageYears, 6);
  assert.equal(summary.weightKg, 11);
  assert.equal(summary.dogProfileUsage.applied, true);
  assert.match(summary.analyzedTextSummary, /몽이.*6살.*11kg/);
  assert.match(summary.vetShareCard.copyableText, /몽이/);
  assert.match(summary.kakaoActionText.familyShareText, /몽이/);
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
  assert.ok(Array.isArray(care.dietIngredientHints));
  assert.match(care.dietIngredientHints.join(" "), /새 원료|지방/);
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
  assertVetShareCardText(summary.vetShareCard);
});

test("vet summary creates copyable consultation share card", () => {
  const summary = createVetVisitSummary({
    dogName: "몽이",
    ageYears: 6,
    weightKg: 11,
    symptoms: ["식욕 감소", "묽은 변"],
    symptomStartedAt: "어제부터",
    appetite: "감소",
    stool: "묽은 변",
    vomiting: "없음",
    energy: "낮음",
    foodOrSnackToday: ["사료"],
    ownerConcern: "어제부터 밥을 덜 먹고 변이 묽습니다.",
    riskLevel: "vet_consult",
    missingInfoQuestions: ["물은 평소처럼 마셨나요?"],
  });

  assertVetShareCardText(summary.vetShareCard);
  assert.match(summary.vetShareCard.copyableText, /몽이/);
  assert.match(summary.vetShareCard.copyableText, /식욕 감소/);
  assert.match(summary.vetShareCard.copyableText, /묽은 변/);
  assert.ok(summary.vetShareCard.preparedQuestions.length >= 3);
});

test("symptom classifier extracts built-in demo symptoms without external data", () => {
  const result = classifyPetSymptom(
    { text: "밥을 안 먹고 축 처져 있어요", animalType: "dog" },
    [],
    "local_sample",
    "test",
  );

  assert.deepEqual(result.extractedSymptoms.sort(), ["무기력", "식욕저하"].sort());
});

test("photo observation rules classify stool and skin observations", () => {
  const stoolPhoto = analyzePhotoObservation({
      photoType: "stool",
      visualNotes: "묽은 변처럼 보임",
      appetite: "less",
      vomiting: "none",
      energy: "normal",
    });
  assert.equal(stoolPhoto.riskLevel, "watch");
  assertVetShareCardText(stoolPhoto.vetShareCard);
  assertKakaoActionText(stoolPhoto.kakaoActionText);
  assertPhotoFollowUpGuide(stoolPhoto);

  assert.equal(
    analyzePhotoObservation({
      photoType: "skin",
      visualNotes: "진물이 있고 붉음",
      appetite: "normal",
      vomiting: "none",
      energy: "normal",
    }).riskLevel,
    "vet_consult",
  );
});

test("stool photo observation includes next recording guidance", () => {
  const result = analyzePhotoObservation({
    dogName: "몽이",
    photoType: "stool",
    visualNotes: "묽은 변처럼 보이고 색은 갈색입니다.",
    observedSigns: ["묽은 변"],
    relatedSymptoms: ["식욕 감소"],
    appetite: "less",
    vomiting: "none",
    energy: "normal",
  });

  assertPhotoFollowUpGuide(result);
  assert.match(result.nextPhotoGuide.join(" "), /변|배변/);
  assert.match(result.comparisonFocus.join(" "), /변 색 변화|묽기/);
  assert.match(result.photoRecordUserMessage, /사진|관찰/);
  assert.equal(typeof result.photoRetakeRecommended, "boolean");
});

test("poor quality skin observation recommends another record", () => {
  const result = analyzePhotoObservation({
    dogName: "몽이",
    photoType: "skin",
    visualNotes: "사진이 흐리고 어두워서 잘 안 보이지만 배 쪽에 붉은기가 있는 것 같아요.",
    observedSigns: ["붉은기", "흐림"],
    relatedSymptoms: ["가려움"],
    appetite: "normal",
    vomiting: "none",
    energy: "normal",
  });

  assert.ok(["poor_quality", "needs_more_context"].includes(result.photoQuality.level));
  assert.equal(result.photoRetakeRecommended, true);
  assert.match(result.nextPhotoGuide.join(" "), /밝은 곳/);
  assert.ok(result.comparisonFocus.includes("붉은기 범위"));
});

test("urgent stool observation keeps consultation and safety guidance", () => {
  const result = analyzePhotoObservation({
    dogName: "몽이",
    photoType: "stool",
    visualNotes: "피가 섞인 것처럼 붉은 변입니다.",
    observedSigns: ["혈변 의심"],
    relatedSymptoms: ["식욕 없음"],
    appetite: "none",
    vomiting: "none",
    energy: "low",
  });
  const response = withSafetyMessage(result);

  assert.equal(result.riskLevel, "urgent");
  assert.match(result.riskPresentation.riskBadge, /🚨/);
  assert.match(result.followUpObservationGuide.join(" "), /혈변|동물병원/);
  assert.match(result.photoRecordUserMessage, /상담/);
  assert.equal(response.safetyMessage, SAFETY_MESSAGE);
});

test("photo observation without text asks for context and omits raw base64", () => {
  const result = analyzePhotoObservation({
    dogName: "몽이",
    photoType: "stool",
    imageBase64: "dGVzdC1pbWFnZS1kYXRh",
    appetite: "unknown",
    vomiting: "unknown",
    energy: "unknown",
  });

  assert.ok(["text_only", "needs_more_context"].includes(result.photoQuality.level));
  assert.equal(result.photoRetakeRecommended, true);
  assert.match(result.missingInfoQuestions.join(" "), /관찰|텍스트/);
  assert.match(result.photoLimitations, /사진 원본을 분석하거나 진단하지 않/);
  assert.doesNotMatch(JSON.stringify(result), /dGVzdC1pbWFnZS1kYXRh/);
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
  assertVetShareCardText(analysis.vetShareCard);
  assert.match(analysis.vetShareCard.copyableText, /샤인머스캣/);
  assert.match(analysis.vetShareCard.copyableText, /한 알/);
  assert.match(analysis.vetShareCard.copyableText, /30분 전/);
  assert.match(analysis.vetShareCard.copyableText, /빠른|동물병원/);
  assertKakaoActionText(analysis.kakaoActionText);
  assert.match(analysis.kakaoActionText.chatFirstReply, /🚨|빠른/);
  assert.match(analysis.kakaoActionText.vetCallScript, /샤인머스캣/);
  assert.match(analysis.kakaoActionText.vetCallScript, /30분 전/);
  assert.match(analysis.kakaoActionText.vetCallScript, /동물병원|상담/);
  assert.match(analysis.kakaoActionText.whyThisRisk.join(" "), /위험 음식|포도|샤인머스캣/);
});

test("food ingestion event fills dog name and weight from dogProfile", () => {
  const analysis = analyzeFoodIngestionEvent({
    dogProfile: {
      dogName: "몽이",
      weightKg: 11,
    },
    foodName: "포도",
    foodDetail: "샤인머스캣",
    amount: "두 알",
    eatenAt: "30분 전",
    currentSymptoms: ["증상 없음"],
  });

  assert.equal(analysis.recordedSummary.dogName, "몽이");
  assert.equal(analysis.recordedSummary.weightKg, 11);
  assert.equal(analysis.dogProfileUsage.applied, true);
  assert.equal(analysis.riskLevel, "danger");
  assert.match(analysis.vetShareCard.copyableText, /몽이/);
  assert.match(analysis.kakaoActionText.vetCallScript, /몽이/);
});

test("food ingestion event adds ingredient context for a matched non-danger food", async () => {
  const loaded = await loadPetFoodIngredients("당근");
  const analysis = analyzeFoodIngestionEvent({
    dogProfile: {
      dogName: "몽이",
      weightKg: 11,
      usualFood: "닭고기 사료",
    },
    foodName: "당근",
    foodDetail: "뿌리, 생것",
    amount: "조금",
    eatenAt: "방금",
    currentSymptoms: ["증상 없음"],
    includeIngredientGuide: true,
    ingredientGoal: "normal_daily",
  }, loaded);

  assert.equal(analysis.riskLevel, "safe");
  assert.match(analysis.ingredientNutritionSummary?.nutritionSummary ?? "", /수분|단백질|지방/);
  assert.equal(analysis.ingredientSelectionGuide?.mode, "food_ingestion_context");
  assertIngredientGuideSafety(analysis.ingredientSelectionGuide);
});

test("dangerous food prioritizes existing vet without hospital search", () => {
  const analysis = analyzeFoodIngestionEvent({
    dogProfile: {
      dogName: "몽이",
      weightKg: 11,
      vetClinicName: "몽이동물병원",
      vetPhone: "051-000-0000",
    },
    foodName: "포도",
    foodDetail: "샤인머스캣",
    amount: "두 알",
    eatenAt: "30분 전",
    currentSymptoms: ["증상 없음"],
  });

  assert.equal(analysis.riskLevel, "danger");
  assert.equal(analysis.toolChainGuide.vetContactGuide.mode, "existing_vet_first");
  assert.ok(!hasRecommendedTool(analysis.toolChainGuide, "find_nearby_animal_hospitals"));
  assert.match(analysis.toolChainGuide.vetContactGuide.primaryMessage, /평소 다니던 병원|기존 병원/);
  assert.equal(typeof analysis.kakaoActionText.vetCallScript, "string");
});

test("dangerous food adds hospital search only when guardian asks", () => {
  const analysis = analyzeFoodIngestionEvent({
    dogProfile: {
      dogName: "몽이",
      weightKg: 11,
    },
    foodName: "포도",
    foodDetail: "샤인머스캣",
    amount: "두 알",
    eatenAt: "30분 전",
    currentSymptoms: ["증상 없음"],
    ownerMemo: "근처 병원 찾아줘",
  });

  assert.equal(analysis.riskLevel, "danger");
  assert.ok(hasRecommendedTool(analysis.toolChainGuide, "find_nearby_animal_hospitals"));
  assert.equal(analysis.toolChainGuide.vetContactGuide.mode, "hospital_search_on_request");
  assert.equal(analysis.toolChainGuide.vetContactGuide.shouldAutoSearchHospital, false);
});

test("urgent photo observation keeps existing-vet-first opt-in flow", () => {
  const result = analyzePhotoObservation({
    dogProfile: {
      dogName: "몽이",
      vetClinicName: "몽이동물병원",
    },
    photoType: "stool",
    visualNotes: "피가 섞인 것처럼 붉은 변입니다.",
    observedSigns: ["혈변 의심"],
    appetite: "none",
    vomiting: "none",
    energy: "low",
  });

  assert.equal(result.riskLevel, "urgent");
  assert.equal(result.toolChainGuide.vetContactGuide.mode, "existing_vet_first");
  assert.ok(!hasRecommendedTool(result.toolChainGuide, "find_nearby_animal_hospitals"));
  assert.equal(typeof result.photoFollowUpGuide, "object");
  assert.equal(typeof result.vetShareCard, "object");
});

function assertKakaoActionText(kakaoActionText) {
  assert.equal(typeof kakaoActionText, "object");
  assert.equal(typeof kakaoActionText.chatFirstReply, "string");
  assert.equal(typeof kakaoActionText.familyShareText, "string");
  assert.equal(typeof kakaoActionText.vetCallScript, "string");
  assert.equal(typeof kakaoActionText.nextInputExample, "string");
  assert.ok(Array.isArray(kakaoActionText.whyThisRisk));
  assert.ok(kakaoActionText.whyThisRisk.length >= 2);
  assert.ok(kakaoActionText.chatFirstReply.split("\n").length >= 4);
  assert.ok(kakaoActionText.chatFirstReply.split("\n").length <= 7);
  assert.ok(kakaoActionText.familyShareText.split("\n").filter((line) => line.startsWith("- ")).length >= 2);
  assert.ok(kakaoActionText.familyShareText.split("\n").filter((line) => line.startsWith("- ")).length <= 4);

  const serialized = JSON.stringify(kakaoActionText);
  assert.doesNotMatch(
    serialized,
    /이 병입니다|이 약을 먹이세요|병원 안 가도 됩니다|진단했습니다|처방합니다|정상 괜찮습니다|확실히 괜찮습니다|완치/,
  );
}

function assertPhotoFollowUpGuide(result) {
  assert.equal(typeof result.photoFollowUpGuide, "object");
  assert.equal(typeof result.photoQuality, "object");
  assert.equal(typeof result.photoQuality.level, "string");
  assert.ok(Array.isArray(result.nextPhotoGuide));
  assert.ok(Array.isArray(result.followUpObservationGuide));
  assert.ok(Array.isArray(result.comparisonFocus));
  assert.equal(typeof result.photoRetakeRecommended, "boolean");
  assert.equal(typeof result.photoRecordUserMessage, "string");
  assert.doesNotMatch(
    JSON.stringify(result.photoFollowUpGuide),
    /이 병입니다|이 약을 먹이세요|병원 안 가도 됩니다|진단했습니다|처방합니다|확실히 괜찮습니다|완치/,
  );
}

function assertToolChainGuide(toolChainGuide) {
  assert.equal(typeof toolChainGuide, "object");
  assert.equal(typeof toolChainGuide.currentStep, "string");
  assert.ok(Array.isArray(toolChainGuide.recommendedNextTools));
  assert.equal(typeof toolChainGuide.stopCondition, "string");
  assert.equal(typeof toolChainGuide.userConfirmationNeeded, "boolean");
  assert.equal(typeof toolChainGuide.vetContactGuide, "object");
  assert.equal(toolChainGuide.vetContactGuide.shouldAutoSearchHospital, false);
  assert.equal(typeof toolChainGuide.vetContactGuide.primaryMessage, "string");
  assert.equal(typeof toolChainGuide.vetContactGuide.hospitalSearchOptInPrompt, "string");

  const serialized = JSON.stringify(toolChainGuide);
  assert.doesNotMatch(
    serialized,
    /이 병입니다|이 약을 먹이세요|병원 안 가도 됩니다|진단했습니다|처방합니다|확실히 괜찮습니다|완치/,
  );
}

function assertIngredientGuideSafety(ingredientSelectionGuide) {
  assert.equal(typeof ingredientSelectionGuide, "object");
  assert.ok(Array.isArray(ingredientSelectionGuide.recommendedCriteria));
  assert.ok(Array.isArray(ingredientSelectionGuide.avoidCriteria));
  assert.ok(Array.isArray(ingredientSelectionGuide.possibleIngredients));
  assert.ok(Array.isArray(ingredientSelectionGuide.cautionIngredients));
  assert.ok(Array.isArray(ingredientSelectionGuide.transitionGuide));
  assert.equal(typeof ingredientSelectionGuide.familyShareText, "string");
  assert.equal(typeof ingredientSelectionGuide.safetyNote, "string");
  assert.doesNotMatch(
    JSON.stringify(ingredientSelectionGuide),
    /이 병입니다|이 약을 먹이세요|병원 안 가도 됩니다|진단했습니다|처방합니다|확실히 괜찮습니다|완치|먹이면 낫습니다|치료됩니다|주식으로 대체하세요|처방식 대신/,
  );
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function hasRecommendedTool(toolChainGuide, toolName) {
  return toolChainGuide.recommendedNextTools.some((tool) => tool.toolName === toolName);
}

function assertVetShareCardText(vetShareCard) {
  assert.equal(typeof vetShareCard, "object");
  assert.equal(typeof vetShareCard.copyableText, "string");
  assert.match(vetShareCard.copyableText, /멍케어노트 병원 상담용 요약/);
  assert.match(vetShareCard.copyableText, /진단이나 처방이 아닙니다/);
  assert.doesNotMatch(
    vetShareCard.copyableText,
    /이 병입니다|이 약을 먹이세요|병원 안 가도 됩니다|진단했습니다|처방합니다|정상 괜찮습니다|확실히 괜찮습니다|완치/,
  );
}

test("safety message is attached consistently", () => {
  assert.match(SAFETY_MESSAGE, /진단이나 처방이 아니며/);
  assert.equal(withSafetyMessage({ ok: true }).safetyMessage, SAFETY_MESSAGE);
});

test("photo observation uses host-provided text without inspecting imageBase64", () => {
  const result = analyzePhotoObservation({
    photoType: "stool",
    imageBase64: "not-an-image-and-must-not-be-analyzed",
    visualNotes: "호스트 Agent 관찰: 갈색의 묽은 변처럼 보임",
    observedSigns: ["묽은 변"],
    relatedSymptoms: ["식욕 감소"],
    appetite: "less",
    vomiting: "none",
    energy: "normal",
  });

  assert.equal(result.riskLevel, "watch");
  assert.ok(result.observedAbnormalSigns.includes("soft"));
  assert.match(result.photoLimitations, /사진 원본을 분석하거나 진단하지 않습니다/);
  assertKakaoActionText(result.kakaoActionText);
  assert.match(result.kakaoActionText.chatFirstReply, /사진|관찰/);
  assert.match(result.kakaoActionText.familyShareText, /묽은 변/);
  assert.match(result.kakaoActionText.vetCallScript, /관찰|기록/);
});
