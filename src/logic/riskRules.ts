import { checkFoodSafety } from "./foodRules.js";

export type AppetiteStatus = "normal" | "less" | "none" | "increased";
export type StoolStatus = "normal" | "soft" | "diarrhea" | "bloody" | "unknown";
export type VomitingStatus = "none" | "once" | "multiple";
export type EnergyStatus = "normal" | "low" | "very_low";
export type DailyRiskLevel = "normal" | "watch" | "vet_consult" | "urgent";

export interface DailyStatusInput {
  dogName: string;
  ageYears?: number;
  weightKg?: number;
  appetite: AppetiteStatus;
  stool: StoolStatus;
  vomiting: VomitingStatus;
  energy: EnergyStatus;
  coughing?: boolean;
  itching?: boolean;
  eyeDischarge?: boolean;
  foodOrSnackToday?: string[];
  symptomStartedAt?: string;
}

export interface DailyStatusAnalysis {
  dogName: string;
  riskLevel: DailyRiskLevel;
  reasons: string[];
  mainSymptoms: string[];
}

export function analyzeDailyStatus(input: DailyStatusInput): DailyStatusAnalysis {
  const urgentReasons = collectUrgentReasons(input);
  const dangerousFoodReasons = collectDangerousFoodReasons(input);

  if (urgentReasons.length > 0 || dangerousFoodReasons.length > 0) {
    const reasons = [
      "빠른 동물병원 상담 권장 신호가 포함되어 있습니다.",
      ...urgentReasons,
      ...dangerousFoodReasons,
    ];

    return {
      dogName: input.dogName,
      riskLevel: "urgent",
      reasons,
      mainSymptoms: removeIntroReason(reasons),
    };
  }

  const abnormalReasons = collectNonUrgentAbnormalReasons(input);
  const contextualReasons = collectContextualConcernReasons(input, abnormalReasons.length);
  const consultReasons = [...abnormalReasons, ...contextualReasons];

  if (abnormalReasons.length >= 2 || contextualReasons.length > 0) {
    return {
      dogName: input.dogName,
      riskLevel: "vet_consult",
      reasons: [
        abnormalReasons.length >= 2
          ? "관찰이 필요한 이상 신호가 2개 이상 함께 입력되었습니다."
          : "증상 기간이나 반려견 조건상 동물병원 상담 권장 단계로 분류했습니다.",
        ...consultReasons,
      ],
      mainSymptoms: consultReasons,
    };
  }

  if (abnormalReasons.length === 1) {
    return {
      dogName: input.dogName,
      riskLevel: "watch",
      reasons: abnormalReasons,
      mainSymptoms: abnormalReasons,
    };
  }

  return {
    dogName: input.dogName,
    riskLevel: "normal",
    reasons: ["식욕, 변, 구토, 활동량에서 뚜렷한 이상 신호가 입력되지 않았습니다."],
    mainSymptoms: [],
  };
}

function collectUrgentReasons(input: DailyStatusInput): string[] {
  const reasons: string[] = [];

  if (input.stool === "bloody") {
    reasons.push("혈변이 있습니다.");
  }

  if (input.vomiting === "multiple") {
    reasons.push("구토가 반복되었습니다.");
  }

  if (input.energy === "very_low") {
    reasons.push("매우 무기력합니다.");
  }

  if (input.appetite === "none") {
    reasons.push("식욕이 전혀 없습니다.");
  }

  return reasons;
}

function collectDangerousFoodReasons(input: DailyStatusInput): string[] {
  const foods = input.foodOrSnackToday ?? [];
  const dangerousFoods = foods.filter(
    (food) => checkFoodSafety({ foodName: food, dogWeightKg: input.weightKg }).riskLevel === "danger",
  );

  if (dangerousFoods.length === 0) {
    return [];
  }

  return [
    `오늘 먹은 음식/간식 중 위험 음식으로 분류되는 항목이 있습니다: ${dangerousFoods.join(", ")}.`,
  ];
}

function collectNonUrgentAbnormalReasons(input: DailyStatusInput): string[] {
  const reasons: string[] = [];

  if (input.stool === "diarrhea") {
    reasons.push("설사가 있습니다.");
  } else if (input.stool === "soft") {
    reasons.push("변이 묽습니다.");
  } else if (input.stool === "unknown") {
    reasons.push("변 상태를 아직 확인하지 못했습니다.");
  }

  if (input.vomiting === "once") {
    reasons.push("구토가 1회 있었습니다.");
  }

  if (input.appetite === "less") {
    reasons.push("식욕이 감소했습니다.");
  } else if (input.appetite === "increased") {
    reasons.push("식욕이 평소보다 증가했습니다.");
  }

  if (input.energy === "low") {
    reasons.push("활동량이 감소했습니다.");
  }

  if (input.coughing === true) {
    reasons.push("기침이 있습니다.");
  }

  if (input.itching === true) {
    reasons.push("가려움이 있습니다.");
  }

  if (input.eyeDischarge === true) {
    reasons.push("눈물이나 눈곱이 있습니다.");
  }

  return reasons;
}

function collectContextualConcernReasons(
  input: DailyStatusInput,
  abnormalReasonCount: number,
): string[] {
  if (abnormalReasonCount === 0) {
    return [];
  }

  const reasons: string[] = [];

  if (hasDurationConcern(input.symptomStartedAt)) {
    reasons.push("증상이 하루 이상 지속되었거나 계속되는 것으로 입력되었습니다.");
  }

  if (isSensitiveAge(input.ageYears)) {
    reasons.push("어린 강아지 또는 노령견은 같은 증상도 더 이르게 상담을 고려하는 것이 좋습니다.");
  }

  if (input.vomiting === "once" && (input.stool === "diarrhea" || input.energy === "low")) {
    reasons.push("구토가 다른 이상 신호와 함께 입력되어 관찰 강도를 높였습니다.");
  }

  return reasons;
}

function hasDurationConcern(symptomStartedAt: string | undefined): boolean {
  if (symptomStartedAt === undefined) {
    return false;
  }

  const normalized = symptomStartedAt.trim().toLowerCase().replace(/\s+/g, "");
  const durationKeywords = [
    "어제",
    "하루",
    "1일",
    "24시간",
    "이틀",
    "2일",
    "3일",
    "며칠",
    "계속",
    "지속",
    "밤부터",
  ];

  return durationKeywords.some((keyword) => normalized.includes(keyword));
}

function isSensitiveAge(ageYears: number | undefined): boolean {
  return ageYears !== undefined && (ageYears < 1 || ageYears >= 10);
}

function removeIntroReason(reasons: string[]): string[] {
  return reasons.slice(1);
}
