import type {
  PhotoObservationAnalysis,
  PhotoObservationInput,
  PhotoType,
} from "../types/photoRecord.js";
import { mergeDogProfile } from "./dogProfileRules.js";
import { buildKakaoActionText } from "./kakaoActionTextRules.js";
import { buildPhotoFollowUpGuide, type PhotoFollowUpGuide } from "./photoGuideRules.js";
import { buildDailyRiskPresentation } from "./riskPresentationRules.js";
import { buildVetShareCard } from "./vetShareCardRules.js";
import type { DailyRiskLevel } from "./riskRules.js";
import {
  buildToolChainGuide,
  detectEmergencyHospitalSearchRequest,
  detectHospitalSearchRequest,
} from "./toolChainGuideRules.js";
import type { DogProfileUsage } from "../types/dogProfile.js";

interface SignRule {
  sign: string;
  keywords: string[];
}

const STOOL_SIGN_RULES: SignRule[] = [
  { sign: "normal_like", keywords: ["정상", "단단", "모양있", "갈색"] },
  { sign: "soft", keywords: ["무른", "묽은", "질척", "말랑"] },
  { sign: "diarrhea_like", keywords: ["설사", "물변", "흐름", "물처럼"] },
  { sign: "blood_like", keywords: ["피", "혈", "빨간", "붉은", "선홍"] },
  { sign: "black_tarry_like", keywords: ["검은", "타르", "까맣", "흑색"] },
  { sign: "mucus_like", keywords: ["점액", "끈적", "젤리"] },
  { sign: "foreign_object_like", keywords: ["이물", "플라스틱", "장난감", "천", "뼈"] },
  { sign: "poor_quality", keywords: ["흐림", "어두움", "잘 안 보", "초점"] },
];

const SKIN_SIGN_RULES: SignRule[] = [
  { sign: "redness", keywords: ["붉", "빨갛", "발적"] },
  { sign: "hair_loss", keywords: ["털 빠", "탈모", "털이 없"] },
  { sign: "scaling", keywords: ["각질", "비듬", "하얗게 일어"] },
  { sign: "scab", keywords: ["딱지", "가피"] },
  { sign: "wound", keywords: ["상처", "피", "찢", "까짐"] },
  { sign: "discharge", keywords: ["진물", "고름", "분비물"] },
  { sign: "swelling", keywords: ["부음", "부어", "붓기"] },
  { sign: "lump", keywords: ["혹", "덩어리", "몽우리"] },
  { sign: "poor_quality", keywords: ["흐림", "어두움", "잘 안 보", "초점"] },
];

export function analyzePhotoObservation(input: PhotoObservationInput): PhotoObservationAnalysis {
  const merged = mergeDogProfile(input);
  const signs = extractSigns(merged);
  const riskLevel = classifyPhotoRisk(merged.photoType, signs, merged);
  const riskPresentation = buildDailyRiskPresentation(
    riskLevel,
    buildPhotoRiskReasons(merged.photoType, signs, riskLevel),
    signs.map(toPhotoDisplaySign),
  );
  const missingInfoQuestions = buildPhotoMissingInfoQuestions(merged, signs);
  const combinedObservedSigns = uniqueStrings([
    ...(merged.observedSigns ?? []),
    ...signs.map(toPhotoDisplaySign),
  ]);
  const photoFollowUpGuide = buildPhotoFollowUpGuide({
    photoType: merged.photoType,
    riskLevel,
    observedSigns: combinedObservedSigns,
    relatedSymptoms: merged.relatedSymptoms,
    visualNotes: merged.visualNotes,
    appetite: merged.appetite,
    vomiting: merged.vomiting,
    energy: merged.energy,
    hasImageUrl: merged.imageUrl !== undefined && merged.imageUrl.trim().length > 0,
    hasImageBase64: merged.imageBase64 !== undefined && merged.imageBase64.trim().length > 0,
  });
  const vetShareCard = buildVetShareCard({
    source: "photo_observation",
    dogName: merged.dogName,
    riskLevel,
    riskPresentation,
    symptoms: [...(merged.relatedSymptoms ?? []), ...combinedObservedSigns],
    observedSigns: combinedObservedSigns,
    photoType: merged.photoType,
    appetite: merged.appetite,
    vomiting: merged.vomiting,
    energy: merged.energy,
    ownerConcern: buildPhotoVetMemo(
      merged.visualNotes,
      merged.dogProfileUsage,
      photoFollowUpGuide,
    ),
    missingInfoQuestions,
    questionsForVet: buildPhotoQuestionsForVet(merged.photoType, riskLevel),
  });
  const hospitalRequestText = [
    merged.visualNotes,
    ...(merged.observedSigns ?? []),
    ...(merged.relatedSymptoms ?? []),
  ].filter((value): value is string => value !== undefined).join(" ");
  const ownerRequestedHospitalSearch = merged.ownerRequestedHospitalSearch ??
    detectHospitalSearchRequest(hospitalRequestText);
  const toolChainGuide = buildToolChainGuide({
    source: "photo_observation",
    riskLevel,
    dogName: merged.dogName,
    ownerRequestedHospitalSearch,
    ownerRequestedEmergencyHospital: ownerRequestedHospitalSearch &&
      detectEmergencyHospitalSearchRequest(hospitalRequestText),
    vetClinicName: merged.dogProfile?.vetClinicName,
    vetPhone: merged.dogProfile?.vetPhone,
    hasVetShareCard: true,
    hasVetCallScript: true,
    missingInfoQuestions,
  });
  const kakaoActionText = buildKakaoActionText({
    source: "photo_observation",
    dogName: merged.dogName,
    riskLevel,
    riskPresentation,
    mainSymptoms: [...(merged.relatedSymptoms ?? []), ...combinedObservedSigns],
    observedSigns: combinedObservedSigns,
    knownInfo: buildProfileKnownInfo(merged.dogProfileUsage),
    ownerConcern: merged.visualNotes,
    missingInfoQuestions,
    vetShareCard,
    dogProfileUsage: merged.dogProfileUsage,
    photoRecordUserMessage: photoFollowUpGuide.photoRecordUserMessage,
    nextPhotoGuide: photoFollowUpGuide.nextPhotoGuide,
    comparisonFocus: photoFollowUpGuide.comparisonFocus,
    photoType: merged.photoType,
    vetContactGuide: toolChainGuide.vetContactGuide,
  });

  return {
    observedAbnormalSigns: signs,
    riskLevel,
    todayCareActions: buildCareActions(merged.photoType, signs, riskLevel),
    vetSummary: buildVetSummary(merged, signs, riskLevel),
    riskPresentation,
    vetShareCard,
    kakaoActionText,
    dogProfileUsage: merged.dogProfileUsage,
    missingInfoQuestions,
    photoFollowUpGuide,
    photoQuality: photoFollowUpGuide.photoQuality,
    nextPhotoGuide: photoFollowUpGuide.nextPhotoGuide,
    followUpObservationGuide: photoFollowUpGuide.followUpObservationGuide,
    comparisonFocus: photoFollowUpGuide.comparisonFocus,
    photoRetakeRecommended: photoFollowUpGuide.photoRetakeRecommended,
    photoRecordUserMessage: photoFollowUpGuide.photoRecordUserMessage,
    toolChainGuide,
    photoLimitations:
      "MCP는 사진 원본을 분석하거나 진단하지 않습니다. 보호자 또는 호스트 AI가 제공한 관찰 텍스트를 기록 품질과 상담 준비 관점에서 구조화하며, 실제 상태가 심해 보이거나 증상이 지속되면 수의사 상담을 권장합니다.",
    hospitalSearchGuide:
      riskLevel === "vet_consult" || riskLevel === "urgent"
        ? "위험도가 vet_consult 이상이면 find_nearby_animal_hospitals tool로 가까운 동물병원을 찾고 방문 전 전화 확인을 권장합니다."
        : undefined,
  };
}

function buildProfileKnownInfo(dogProfileUsage: DogProfileUsage): string[] {
  return dogProfileUsage.profileSummary !== "dogProfile이 제공되지 않았습니다."
    ? [`프로필 참고: ${dogProfileUsage.profileSummary}`]
    : [];
}

function buildPhotoVetMemo(
  visualNotes: string | undefined,
  dogProfileUsage: DogProfileUsage,
  photoFollowUpGuide: PhotoFollowUpGuide,
): string | undefined {
  const parts = [
    visualNotes,
    ...buildProfileKnownInfo(dogProfileUsage),
    `사진 기록 품질: ${photoFollowUpGuide.photoQuality.level}`,
    `다음 비교 포인트: ${photoFollowUpGuide.comparisonFocus.slice(0, 5).join(", ")}`,
    "사진만으로 원인을 판단한 것이 아니라 관찰 텍스트 기반 요약입니다.",
  ].filter((value): value is string => value !== undefined && value.trim().length > 0);

  return parts.length > 0 ? parts.join(" / ") : undefined;
}

function buildPhotoMissingInfoQuestions(
  input: PhotoObservationInput,
  signs: string[],
): string[] {
  const questions: string[] = [];

  if (signs.length === 0) {
    questions.push("보호자 또는 호스트 AI가 관찰한 색, 형태, 범위 같은 내용을 텍스트로 추가해 주세요.");
  }

  if (input.appetite === undefined || input.appetite === "unknown") {
    questions.push("식욕 변화가 있는지 확인해 주세요.");
  }

  if (input.vomiting === undefined || input.vomiting === "unknown") {
    questions.push("구토 여부를 확인해 주세요.");
  }

  if (input.energy === undefined || input.energy === "unknown") {
    questions.push("활동량이나 무기력 여부를 확인해 주세요.");
  }

  return questions;
}

function buildPhotoQuestionsForVet(photoType: PhotoType, riskLevel: DailyRiskLevel): string[] {
  const target = photoType === "stool" ? "변 사진 기록" : "피부 사진 기록";
  const questions = [
    `${target}에서 우선 확인해야 할 위험 신호가 있는지 상담하고 싶습니다.`,
    "사진과 함께 어떤 증상 변화를 관찰해야 하는지 알고 싶습니다.",
    "현재 식사, 산책, 휴식 관리를 어떻게 조절하면 좋을까요?",
  ];

  if (riskLevel === "urgent" || riskLevel === "vet_consult") {
    questions.unshift("현재 기록만으로도 빠른 상담이나 방문이 필요한지 확인하고 싶습니다.");
  }

  return questions;
}

function buildPhotoRiskReasons(
  photoType: PhotoType,
  signs: string[],
  riskLevel: DailyRiskLevel,
): string[] {
  const target = photoType === "stool" ? "변 사진" : "피부 사진";
  const signsText = signs.length > 0
    ? signs.map(toPhotoDisplaySign).join(", ")
    : "뚜렷한 이상 징후 미입력";

  if (riskLevel === "urgent") {
    return [`${target} 기록에서 빠른 상담을 고려할 만한 징후가 있습니다: ${signsText}`];
  }

  if (riskLevel === "vet_consult") {
    return [`${target} 기록에서 동물병원 상담을 고려할 만한 징후가 있습니다: ${signsText}`];
  }

  if (riskLevel === "watch") {
    return [`${target} 기록에서 관찰이 필요한 징후가 있습니다: ${signsText}`];
  }

  return [`${target} 기록에서 현재 입력 기준 큰 이상 신호가 많지 않습니다.`];
}

function extractSigns(input: PhotoObservationInput): string[] {
  const rules = input.photoType === "stool" ? STOOL_SIGN_RULES : SKIN_SIGN_RULES;
  const freeText = [input.visualNotes, ...(input.observedSigns ?? []), ...(input.relatedSymptoms ?? [])]
    .filter((value): value is string => value !== undefined)
    .join(" ");
  const normalizedText = normalize(freeText);
  const matchedSigns = rules
    .filter((rule) => rule.keywords.some((keyword) => normalizedText.includes(normalize(keyword))))
    .map((rule) => rule.sign);

  if (matchedSigns.length === 0 && input.observedSigns !== undefined) {
    return input.observedSigns;
  }

  return Array.from(new Set(matchedSigns));
}

function classifyPhotoRisk(
  photoType: PhotoType,
  signs: string[],
  input: PhotoObservationInput,
): DailyRiskLevel {
  if (photoType === "stool") {
    return classifyStoolRisk(signs, input);
  }

  return classifySkinRisk(signs, input);
}

function classifyStoolRisk(signs: string[], input: PhotoObservationInput): DailyRiskLevel {
  if (hasAny(signs, ["blood_like", "black_tarry_like"])) {
    return "urgent";
  }

  if (signs.includes("foreign_object_like")) {
    return input.energy === "very_low" || input.vomiting === "multiple" ? "urgent" : "vet_consult";
  }

  if (signs.includes("diarrhea_like")) {
    if (input.appetite === "none" || input.vomiting === "once" || input.vomiting === "multiple") {
      return "vet_consult";
    }

    if (input.energy === "very_low") {
      return "urgent";
    }

    return "watch";
  }

  if (hasAny(signs, ["soft", "mucus_like", "poor_quality"])) {
    return "watch";
  }

  if (signs.includes("normal_like") || signs.length === 0) {
    return "normal";
  }

  return "watch";
}

function classifySkinRisk(signs: string[], input: PhotoObservationInput): DailyRiskLevel {
  if (input.energy === "very_low" && hasAny(signs, ["wound", "discharge", "swelling", "lump"])) {
    return "urgent";
  }

  if (hasAny(signs, ["wound", "discharge", "swelling", "lump"])) {
    return "vet_consult";
  }

  if (
    signs.includes("redness") &&
    signs.includes("hair_loss") &&
    hasRelatedItching(input.relatedSymptoms)
  ) {
    return "vet_consult";
  }

  if (hasAny(signs, ["redness", "hair_loss", "scaling", "scab", "poor_quality"])) {
    return "watch";
  }

  return "normal";
}

function buildCareActions(
  photoType: PhotoType,
  signs: string[],
  riskLevel: DailyRiskLevel,
): string[] {
  if (photoType === "stool") {
    const actions = [
      "새로운 간식과 기름진 음식은 중단하고 평소 먹던 식단 위주로 관리해 주세요.",
      "물 섭취량을 확인하고 다음 배변 상태를 기록해 주세요.",
      "보호자 판단으로 사람 약을 먹이지 마세요.",
    ];

    if (riskLevel === "vet_consult" || riskLevel === "urgent") {
      actions.push("설사, 혈변, 구토, 무기력이 함께 보이면 동물병원 상담 권장 상황입니다.");
    }

    if (signs.includes("poor_quality")) {
      actions.push("사진이 흐리다면 밝은 곳에서 초점을 맞춰 다시 기록해 주세요.");
    }

    return actions;
  }

  const actions = [
    "해당 부위를 계속 핥거나 긁는지 관찰해 주세요.",
    "사람 연고, 소독약, 임의 제품 사용은 피해주세요.",
    "향이 강한 제품이나 새 목욕 제품은 잠시 줄이는 편이 좋습니다.",
  ];

  if (riskLevel === "vet_consult" || riskLevel === "urgent") {
    actions.push("진물, 붓기, 빠른 번짐, 심한 통증이 있으면 동물병원 상담 권장 상황입니다.");
  }

  if (signs.includes("poor_quality")) {
    actions.push("사진이 흐리다면 밝은 곳에서 병변 전체가 보이게 다시 기록해 주세요.");
  }

  return actions;
}

function buildVetSummary(
  input: PhotoObservationInput,
  signs: string[],
  riskLevel: DailyRiskLevel,
): string {
  const dogName = input.dogName ?? "이름 미입력";
  const takenAt = input.takenAt ?? "촬영 시점 미입력";
  const signsText = signs.length > 0
    ? signs.map(toPhotoDisplaySign).join(", ")
    : "뚜렷한 이상 징후 미입력";
  const relatedSymptoms =
    input.relatedSymptoms !== undefined && input.relatedSymptoms.length > 0
      ? input.relatedSymptoms.join(", ")
      : "미입력";

  return [
    `반려견: ${dogName}`,
    `사진 종류: ${input.photoType}`,
    `촬영 시점: ${takenAt}`,
    `보호자 관찰 이상 징후: ${signsText}`,
    `관련 증상: ${relatedSymptoms}`,
    `식욕: ${input.appetite ?? "unknown"}, 구토: ${input.vomiting ?? "unknown"}, 활동량: ${input.energy ?? "unknown"}`,
    `기록 기준 위험도: ${riskLevel}`,
  ].join("\n");
}

function hasAny(values: string[], candidates: string[]): boolean {
  return candidates.some((candidate) => values.includes(candidate));
}

function toPhotoDisplaySign(sign: string): string {
  const labels: Record<string, string> = {
    normal_like: "평소와 비슷한 형태",
    soft: "묽은 변",
    diarrhea_like: "설사처럼 보이는 변",
    blood_like: "피처럼 보이는 붉은 부분",
    black_tarry_like: "검고 타르처럼 보이는 변",
    mucus_like: "점액처럼 보이는 부분",
    foreign_object_like: "이물질처럼 보이는 부분",
    poor_quality: "사진 품질 설명 부족",
    redness: "붉은기",
    hair_loss: "털 빠짐",
    scaling: "각질",
    scab: "딱지",
    wound: "상처",
    discharge: "진물 또는 분비물",
    swelling: "붓기",
    lump: "혹처럼 보이는 변화",
  };

  return labels[sign] ?? sign;
}

function hasRelatedItching(relatedSymptoms: string[] | undefined): boolean {
  if (relatedSymptoms === undefined) {
    return false;
  }

  return relatedSymptoms.some((symptom) => normalize(symptom).includes("가려"));
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );
}
