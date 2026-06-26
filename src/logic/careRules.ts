import type { DailyRiskLevel } from "./riskRules.js";
import { buildDailyRiskPresentation, type RiskPresentation } from "./riskPresentationRules.js";
import { buildVetShareCard, type VetShareCard } from "./vetShareCardRules.js";

export interface DailyCareInput {
  dogName: string;
  riskLevel: DailyRiskLevel;
  mainSymptoms: string[];
  weightKg?: number;
  ageYears?: number;
}

export interface DailyCareRecommendation {
  dogName: string;
  riskLevel: DailyRiskLevel;
  dietManagement: string;
  snackRestriction: string;
  waterCheck: string;
  walkIntensity: string;
  restRecommendation: string;
  symptomsToMonitor: string[];
  riskPresentation?: RiskPresentation;
}

export interface VetVisitSummaryInput {
  dogName: string;
  ageYears?: number;
  weightKg?: number;
  symptoms: string[];
  symptomStartedAt?: string;
  appetite?: string;
  stool?: string;
  vomiting?: string;
  energy?: string;
  foodOrSnackToday?: string[];
  ownerConcern?: string;
  missingInfoQuestions?: string[];
  riskLevel?: DailyRiskLevel;
}

export interface VetVisitSummaryResult {
  vetVisitSummary: string;
  mainSymptoms: string[];
  symptomStartedAt: string;
  foodOrSnackToday: string[];
  status: {
    appetite: string;
    stool: string;
    vomiting: string;
    energy: string;
  };
  questionsForVet: string[];
  riskPresentation?: RiskPresentation;
  vetShareCard: VetShareCard;
}

export function recommendDailyCare(input: DailyCareInput): DailyCareRecommendation {
  const symptomContext = getSymptomContext(input.mainSymptoms);
  const ageNote = buildAgeCareNote(input.ageYears);
  const riskPresentation = buildDailyRiskPresentation(input.riskLevel, [], input.mainSymptoms);

  if (input.riskLevel === "urgent") {
    return {
      dogName: input.dogName,
      riskLevel: input.riskLevel,
      riskPresentation,
      dietManagement:
        "새로운 음식과 간식은 중단하고, 먹은 음식과 증상 시작 시간을 정리해 빠른 동물병원 상담을 우선해 주세요.",
      snackRestriction: "제한 권장: 상담 전에는 간식이나 새로운 음식을 추가하지 마세요.",
      waterCheck:
        "물을 마실 수 있는 상태인지 확인하되, 억지로 먹이거나 마시게 하지 마세요.",
      walkIntensity: "산책 중단 권장: 이동은 병원 방문 등 꼭 필요한 경우로 최소화해 주세요.",
      restRecommendation: withContextNote(
        "조용하고 안전한 곳에서 쉬게 하며 상태 변화를 계속 확인해 주세요.",
        ageNote,
      ),
      symptomsToMonitor: buildSymptomsToMonitor(input.mainSymptoms, [
        "호흡 이상",
        "반복 구토",
        "혈변",
        "급격한 처짐",
        "의식 저하",
      ]),
    };
  }

  if (input.riskLevel === "vet_consult") {
    return {
      dogName: input.dogName,
      riskLevel: input.riskLevel,
      riskPresentation,
      dietManagement: buildDietManagementForConsult(symptomContext),
      snackRestriction: "제한 권장: 증상이 안정될 때까지 간식은 줄이거나 중단해 주세요.",
      waterCheck: buildWaterCheck(symptomContext, input.weightKg),
      walkIntensity: buildWalkIntensityForConsult(symptomContext),
      restRecommendation: withContextNote(buildRestRecommendationForConsult(symptomContext), ageNote),
      symptomsToMonitor: buildSymptomsToMonitor(input.mainSymptoms, [
        "증상 증가",
        "식욕 저하 지속",
        "구토 반복",
        "설사 지속",
        "활동량 추가 감소",
      ]),
    };
  }

  if (input.riskLevel === "watch") {
    return {
      dogName: input.dogName,
      riskLevel: input.riskLevel,
      riskPresentation,
      dietManagement: symptomContext.hasDigestiveSignal
        ? "오늘은 평소 먹던 사료를 중심으로 단순하게 관리하고, 소화에 부담될 수 있는 음식은 피해주세요."
        : "평소 식단은 유지하되 새로운 음식은 소량이라도 신중하게 주세요.",
      snackRestriction: "가급적 제한: 증상이 사라질 때까지 간식은 적게 주는 편이 좋습니다.",
      waterCheck: buildWaterCheck(symptomContext, input.weightKg),
      walkIntensity: symptomContext.hasRespiratorySignal
        ? "기침이나 호흡 관련 증상이 있으면 산책은 짧게 줄이고 흥분하는 활동은 피해주세요."
        : "컨디션을 보며 짧고 편안한 산책으로 조절해 주세요.",
      restRecommendation: withContextNote("평소보다 조용하게 쉴 수 있는 시간을 마련해 주세요.", ageNote),
      symptomsToMonitor: buildSymptomsToMonitor(input.mainSymptoms, [
        "구토",
        "설사",
        "식욕 저하",
        "활동량 감소",
        "기침 또는 가려움 악화",
      ]),
    };
  }

  return {
    dogName: input.dogName,
    riskLevel: input.riskLevel,
    riskPresentation,
    dietManagement: "평소에 잘 맞던 사료와 식사 시간을 유지해 주세요.",
    snackRestriction: "과식하지 않는 범위에서 평소처럼 관리하고 간식 양을 확인해 주세요.",
    waterCheck: buildWaterCheck(symptomContext, input.weightKg),
    walkIntensity: "평소 컨디션에 맞춰 일반적인 산책을 진행해 주세요.",
    restRecommendation: withContextNote("충분한 수면과 휴식 시간을 유지해 주세요.", ageNote),
    symptomsToMonitor: [
      "식욕 변화",
      "변 상태 변화",
      "구토",
      "활동량 감소",
      "기침",
      "가려움",
      "눈물 또는 눈곱",
    ],
  };
}

export function createVetVisitSummary(input: VetVisitSummaryInput): VetVisitSummaryResult {
  const foodOrSnackToday = input.foodOrSnackToday ?? [];
  const startedAt = cleanText(input.symptomStartedAt) ?? "확인 필요";
  const symptoms = input.symptoms.length > 0 ? input.symptoms : ["확인 필요"];
  const profile = [
    input.dogName,
    input.ageYears !== undefined ? `${input.ageYears}살` : "나이 확인 필요",
    input.weightKg !== undefined ? `${input.weightKg}kg` : "몸무게 확인 필요",
  ].join(" / ");

  const status = {
    appetite: cleanText(input.appetite) ?? "확인 필요",
    stool: cleanText(input.stool) ?? "확인 필요",
    vomiting: cleanText(input.vomiting) ?? "확인 필요",
    energy: cleanText(input.energy) ?? "확인 필요",
  };

  const summaryParts = [
    `반려견 정보: ${profile}`,
    `주요 증상: ${symptoms.join(", ")}`,
    `증상 시작 시점: ${startedAt}`,
    `식욕: ${status.appetite}, 변: ${status.stool}, 구토: ${status.vomiting}, 활동량: ${status.energy}`,
    `오늘 먹은 음식/간식: ${foodOrSnackToday.length > 0 ? foodOrSnackToday.join(", ") : "확인 필요"}`,
  ];

  if (input.ownerConcern !== undefined && input.ownerConcern.trim().length > 0) {
    summaryParts.push(`보호자 걱정: ${input.ownerConcern.trim()}`);
  }

  const missingInfoQuestions = input.missingInfoQuestions ?? [];
  const riskPresentation = input.riskLevel !== undefined
    ? buildDailyRiskPresentation(input.riskLevel, [], symptoms)
    : undefined;
  const questionsForVet = uniqueStrings([
    "현재 증상에서 우선 확인해야 할 위험 신호가 무엇인지 상담하고 싶습니다.",
    "오늘 식단, 물 섭취, 산책은 어떻게 조절하면 좋을까요?",
    "어떤 변화가 보이면 바로 다시 연락하거나 방문해야 하나요?",
    "오늘 먹은 음식이나 간식이 현재 상태와 관련될 수 있는지 궁금합니다.",
    ...missingInfoQuestions.map((question) => `추가 확인 필요: ${question}`),
  ]);
  const vetShareCard = buildVetShareCard({
    source: "vet_visit_summary",
    dogName: input.dogName,
    ageYears: input.ageYears,
    weightKg: input.weightKg,
    riskLevel: input.riskLevel,
    riskPresentation,
    symptoms,
    symptomStartedAt: startedAt,
    appetite: status.appetite,
    stool: status.stool,
    vomiting: status.vomiting,
    energy: status.energy,
    foodOrSnackToday,
    ownerConcern: input.ownerConcern,
    missingInfoQuestions,
    questionsForVet,
  });

  return {
    vetVisitSummary: summaryParts.join("\n"),
    mainSymptoms: symptoms,
    symptomStartedAt: startedAt,
    foodOrSnackToday,
    status,
    questionsForVet,
    ...(riskPresentation !== undefined ? { riskPresentation } : {}),
    vetShareCard,
  };
}

interface SymptomContext {
  hasDigestiveSignal: boolean;
  hasSkinOrEyeSignal: boolean;
  hasRespiratorySignal: boolean;
  hasLowEnergySignal: boolean;
}

function getSymptomContext(mainSymptoms: string[]): SymptomContext {
  const symptomText = mainSymptoms.join(" ");

  return {
    hasDigestiveSignal: containsAny(symptomText, ["구토", "설사", "변", "식욕", "먹은", "음식"]),
    hasSkinOrEyeSignal: containsAny(symptomText, ["가려움", "눈물", "눈곱", "피부", "붉"]),
    hasRespiratorySignal: containsAny(symptomText, ["기침", "호흡", "켁켁", "콜록"]),
    hasLowEnergySignal: containsAny(symptomText, ["무기력", "활동량", "처짐", "기운"]),
  };
}

function buildDietManagementForConsult(context: SymptomContext): string {
  if (context.hasDigestiveSignal) {
    return "평소 먹던 사료를 중심으로 단순하게 관리하고, 기름진 음식이나 새로운 음식은 피해주세요.";
  }

  if (context.hasSkinOrEyeSignal) {
    return "새 간식이나 새 영양제처럼 최근 바뀐 음식이 있다면 기록하고 일시적으로 추가 급여를 피해주세요.";
  }

  return "평소 식단은 유지하되 새로운 음식 추가는 잠시 미뤄 주세요.";
}

function buildWaterCheck(context: SymptomContext, weightKg: number | undefined): string {
  const weightNote = weightKg !== undefined ? ` 현재 입력된 몸무게는 ${weightKg}kg입니다.` : "";

  if (context.hasDigestiveSignal) {
    return `물 섭취량과 소변 횟수가 평소보다 줄었는지 기록해 주세요.${weightNote}`;
  }

  return `신선한 물을 항상 마실 수 있게 두고 평소 섭취량과 크게 다른지 확인해 주세요.${weightNote}`;
}

function buildWalkIntensityForConsult(context: SymptomContext): string {
  if (context.hasRespiratorySignal) {
    return "기침이나 호흡 관련 증상이 있으면 산책은 짧게 줄이고 흥분하는 활동은 피해주세요.";
  }

  if (context.hasLowEnergySignal) {
    return "활동량이 줄었다면 산책은 배변 목적의 짧은 이동 정도로 제한해 주세요.";
  }

  return "짧고 가벼운 배변 산책 정도로 줄이고 무리한 이동은 피해주세요.";
}

function buildRestRecommendationForConsult(context: SymptomContext): string {
  if (context.hasSkinOrEyeSignal) {
    return "긁거나 핥는 행동이 늘어나는지 확인하고, 해당 부위를 과도하게 만지지 않게 해주세요.";
  }

  return "활동량을 줄이고 충분히 쉬게 하며 증상 변화를 시간대별로 기록해 주세요.";
}

function buildAgeCareNote(ageYears: number | undefined): string | undefined {
  if (ageYears === undefined) {
    return undefined;
  }

  if (ageYears < 1) {
    return "어린 강아지는 컨디션 변화가 빠를 수 있어 변화가 이어지면 더 이르게 상담을 고려해 주세요.";
  }

  if (ageYears >= 10) {
    return "노령견은 같은 증상도 부담이 될 수 있어 변화가 이어지면 더 이르게 상담을 고려해 주세요.";
  }

  return undefined;
}

function withContextNote(base: string, note: string | undefined): string {
  return note === undefined ? base : `${base} ${note}`;
}

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function buildSymptomsToMonitor(baseSymptoms: string[], fallbackSymptoms: string[]): string[] {
  return uniqueStrings([...baseSymptoms, ...fallbackSymptoms]);
}

function cleanText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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
