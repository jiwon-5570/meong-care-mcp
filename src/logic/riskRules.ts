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

  if (urgentReasons.length > 0) {
    return {
      dogName: input.dogName,
      riskLevel: "urgent",
      reasons: urgentReasons,
      mainSymptoms: urgentReasons,
    };
  }

  const abnormalReasons = collectNonUrgentAbnormalReasons(input);

  if (abnormalReasons.length >= 2) {
    return {
      dogName: input.dogName,
      riskLevel: "vet_consult",
      reasons: [
        "중등도 이상 관찰 신호가 2개 이상 함께 나타났습니다.",
        ...abnormalReasons,
      ],
      mainSymptoms: abnormalReasons,
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

function collectNonUrgentAbnormalReasons(input: DailyStatusInput): string[] {
  const reasons: string[] = [];

  if (input.stool === "diarrhea") {
    reasons.push("설사가 있습니다.");
  } else if (input.stool === "soft") {
    reasons.push("변이 묽습니다.");
  } else if (input.stool === "unknown") {
    reasons.push("변 상태를 확인하지 못했습니다.");
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
