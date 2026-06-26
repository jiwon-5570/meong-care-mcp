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
import { analyzePetImage } from "../dist/services/visionAnalyzer.js";
import { SAFETY_MESSAGE, withSafetyMessage } from "../dist/utils/safetyMessage.js";

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
});

test("daily care note combines analysis, care guidance, and vet summary", () => {
  const note = createDailyCareNote({
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
});

test("daily care note handles incomplete concern with friendly guide", () => {
  const note = createDailyCareNote({
    ownerConcern: "우리 강아지가 밥을 안 먹고 계속 누워 있어요.",
  });

  assert.equal(note.dogName, "반려견");
  assert.ok(["watch", "vet_consult"].includes(note.riskLevel));
  assert.equal(typeof note.userFriendlyGuide, "string");
  assert.match(note.userFriendlyGuide, /🟡|🟠|🚨/);
  assert.equal(typeof note.riskPresentation, "object");
  assert.ok(note.missingInfoQuestions.length >= 3);
  assert.ok(
    note.nextAction.includes(note.riskPresentation.immediateAction) ||
      /동물병원|관찰|기록/.test(note.nextAction),
  );
  assert.equal(typeof note.vetConsultPreparation.vetVisitSummary, "string");

  const serialized = JSON.stringify(note);
  assert.doesNotMatch(serialized, /이 병입니다|이 약을 먹이세요|병원 안 가도 됩니다|진단했습니다|처방합니다|정상 괜찮습니다|완치/);
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
  assert.ok(summary.foodMentions.some((food) => food.includes("샤인머스캣")));
  assert.match(summary.riskReasons.join(" "), /위험 음식|빠른 동물병원 상담 권장/);
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
    { text: "밥을 안 먹고 축 처져 있어요", animalType: "dog" },
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
      visualNotes: "진물이 있고 붉음",
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

test("analyzePetImage returns fallback without Anthropic API key", async () => {
  const originalApiKey = process.env.ANTHROPIC_API_KEY;

  try {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await analyzePetImage({
      imageBase64: "dGVzdA==",
      photoType: "stool",
    });

    assert.deepEqual(result, {
      visualNotes: "사진 분석에 실패했습니다.",
      observedSigns: [],
    });
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    }
  }
});

test("analyzePetImage parses structured Anthropic JSON response", async () => {
  const originalApiKey = process.env.ANTHROPIC_API_KEY;
  const originalModel = process.env.ANTHROPIC_MODEL;
  const originalFetch = globalThis.fetch;

  try {
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.ANTHROPIC_MODEL = "test-model";
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));

      assert.equal(body.model, "test-model");
      assert.equal(body.messages[0].content[0].type, "image");
      assert.equal(body.messages[0].content[0].source.data, "dGVzdA==");

      return new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                visualNotes: "갈색 변이며 일부 묽어 보입니다.",
                observedSigns: ["묽은 변처럼 보임"],
              }),
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const result = await analyzePetImage({
      imageBase64: "data:image/png;base64,dGVzdA==",
      photoType: "stool",
    });

    assert.deepEqual(result, {
      visualNotes: "갈색 변이며 일부 묽어 보입니다.",
      observedSigns: ["묽은 변처럼 보임"],
    });
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    }

    if (originalModel === undefined) {
      delete process.env.ANTHROPIC_MODEL;
    } else {
      process.env.ANTHROPIC_MODEL = originalModel;
    }

    globalThis.fetch = originalFetch;
  }
});
