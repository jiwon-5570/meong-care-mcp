import type { DailyRiskLevel } from "./riskRules.js";

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
}

export function recommendDailyCare(input: DailyCareInput): DailyCareRecommendation {
  const symptomText = input.mainSymptoms.join(" ");
  const hasDigestiveSignal = containsAny(symptomText, ["구토", "설사", "변", "식욕"]);
  const hasSkinOrEyeSignal = containsAny(symptomText, ["가려움", "눈물", "눈곱"]);
  const hasRespiratorySignal = containsAny(symptomText, ["기침"]);

  if (input.riskLevel === "urgent") {
    return {
      dogName: input.dogName,
      riskLevel: input.riskLevel,
      dietManagement:
        "새로운 음식과 간식은 중단하고, 섭취한 음식과 증상 시간을 정리해 빠른 진료 권장을 우선하세요.",
      snackRestriction: "제한 권장: 진료 상담 전에는 간식이나 새로운 음식을 추가하지 마세요.",
      waterCheck:
        "물을 마실 수 있는 상태인지 확인하되, 억지로 먹이거나 마시게 하지는 마세요.",
      walkIntensity: "산책 중단 권장: 이동은 병원 방문 등 필요한 경우에만 최소화하세요.",
      restRecommendation: "조용하고 안전한 곳에서 쉬게 하며 상태 변화를 계속 확인하세요.",
      symptomsToMonitor: buildSymptomsToMonitor(input.mainSymptoms, [
        "호흡 이상",
        "반복 구토",
        "혈변",
        "극심한 처짐",
        "의식 저하",
      ]),
    };
  }

  if (input.riskLevel === "vet_consult") {
    return {
      dogName: input.dogName,
      riskLevel: input.riskLevel,
      dietManagement: hasDigestiveSignal
        ? "평소 먹던 사료 위주로 단순하게 관리하고, 기름진 음식이나 새로운 음식은 피하세요."
        : "평소 식단을 유지하되 새로운 음식 추가는 잠시 미루세요.",
      snackRestriction: "제한 권장: 증상이 안정될 때까지 간식은 줄이거나 중단하세요.",
      waterCheck: "물 섭취량과 소변 횟수를 확인하고 평소보다 줄었는지 기록하세요.",
      walkIntensity: "짧고 가벼운 배변 산책 정도로 줄이고 무리한 운동은 피하세요.",
      restRecommendation: "활동을 줄이고 충분히 쉬게 하며, 증상 변화를 시간대별로 기록하세요.",
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
      dietManagement: hasDigestiveSignal
        ? "오늘은 평소 먹던 사료를 중심으로 주고, 소화에 부담이 큰 음식은 피하세요."
        : "평소 식단을 유지하며 새로운 음식은 소량이라도 신중히 주세요.",
      snackRestriction: "가급적 제한: 증상이 사라질 때까지 새 간식은 피하는 편이 좋습니다.",
      waterCheck: "물을 평소처럼 마시는지 확인하고, 줄거나 과하게 늘면 기록하세요.",
      walkIntensity: "컨디션을 보며 짧고 편안한 산책으로 조절하세요.",
      restRecommendation: "평소보다 조용히 쉴 수 있는 시간을 늘려 주세요.",
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
    dietManagement: "평소에 잘 맞던 사료와 식사 시간을 유지하세요.",
    snackRestriction: "과식하지 않는 범위에서 평소처럼 관리하되 새 간식은 소량부터 확인하세요.",
    waterCheck: "신선한 물을 항상 마실 수 있게 두고 평소 섭취량과 크게 다른지 확인하세요.",
    walkIntensity: "평소 컨디션에 맞춰 일반적인 산책을 진행하세요.",
    restRecommendation: "충분한 수면과 휴식 시간을 유지하세요.",
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
  const startedAt = input.symptomStartedAt ?? "미입력";
  const symptoms = input.symptoms.length > 0 ? input.symptoms : ["미입력"];
  const profile = [
    input.dogName,
    input.ageYears !== undefined ? `${input.ageYears}살` : undefined,
    input.weightKg !== undefined ? `${input.weightKg}kg` : undefined,
  ]
    .filter((item): item is string => item !== undefined)
    .join(" / ");

  const status = {
    appetite: input.appetite ?? "미입력",
    stool: input.stool ?? "미입력",
    vomiting: input.vomiting ?? "미입력",
    energy: input.energy ?? "미입력",
  };

  const summaryParts = [
    `반려견 정보: ${profile}`,
    `주요 증상: ${symptoms.join(", ")}`,
    `증상 시작 시점: ${startedAt}`,
    `식욕: ${status.appetite}, 변: ${status.stool}, 구토: ${status.vomiting}, 활동량: ${status.energy}`,
    `오늘 먹은 음식/간식: ${foodOrSnackToday.length > 0 ? foodOrSnackToday.join(", ") : "미입력"}`,
  ];

  if (input.ownerConcern !== undefined && input.ownerConcern.trim().length > 0) {
    summaryParts.push(`보호자 걱정: ${input.ownerConcern.trim()}`);
  }

  return {
    vetVisitSummary: summaryParts.join("\n"),
    mainSymptoms: symptoms,
    symptomStartedAt: startedAt,
    foodOrSnackToday,
    status,
    questionsForVet: [
      "현재 증상에서 우선 확인해야 할 위험 신호는 무엇인가요?",
      "오늘 식단, 물 섭취, 산책은 어떻게 조절하면 좋을까요?",
      "어떤 변화가 보이면 바로 다시 연락하거나 방문해야 하나요?",
      "오늘 먹은 음식이나 간식이 증상과 관련될 가능성이 있나요?",
    ],
  };
}

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function buildSymptomsToMonitor(baseSymptoms: string[], fallbackSymptoms: string[]): string[] {
  return Array.from(new Set([...baseSymptoms, ...fallbackSymptoms]));
}
