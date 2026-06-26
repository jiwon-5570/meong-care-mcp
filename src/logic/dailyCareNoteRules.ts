import {
  createVetVisitSummary,
  recommendDailyCare,
  type DailyCareRecommendation,
  type VetVisitSummaryResult,
} from "./careRules.js";
import {
  analyzeDailyStatus,
  normalizeDailyStatusInput,
  type AppetiteStatus,
  type DailyRiskLevel,
  type DailyStatusInput,
  type EnergyStatus,
  type StoolStatus,
  type VomitingStatus,
} from "./riskRules.js";

export type DailyCareNoteInput = DailyStatusInput;

export interface DailyCareNoteResult {
  dogName: string;
  riskLevel: DailyRiskLevel;
  reasons: string[];
  mainSymptoms: string[];
  knownInfo: string[];
  missingInfoQuestions: string[];
  currentAssessment: string;
  userFriendlyGuide: string;
  todayCare: DailyCareRecommendation;
  vetConsultPreparation: VetVisitSummaryResult;
  nextAction: string;
}

export function createDailyCareNote(input: DailyCareNoteInput): DailyCareNoteResult {
  const analysis = analyzeDailyStatus(input);
  const normalized = normalizeDailyStatusInput(input);
  const symptomsForSummary = analysis.mainSymptoms.length > 0
    ? analysis.mainSymptoms
    : ["보호자 걱정 또는 정보 부족"];
  const todayCare = recommendDailyCare({
    dogName: analysis.dogName,
    riskLevel: analysis.riskLevel,
    mainSymptoms: symptomsForSummary,
    weightKg: normalized.weightKg,
    ageYears: normalized.ageYears,
  });
  const vetConsultPreparation = createVetVisitSummary({
    dogName: analysis.dogName,
    ageYears: normalized.ageYears,
    weightKg: normalized.weightKg,
    symptoms: symptomsForSummary,
    symptomStartedAt: normalized.symptomStartedAt,
    appetite: formatAppetiteStatus(normalized.appetite),
    stool: formatStoolStatus(normalized.stool),
    vomiting: formatVomitingStatus(normalized.vomiting),
    energy: formatEnergyStatus(normalized.energy),
    foodOrSnackToday: normalized.foodOrSnackToday,
    ownerConcern: normalized.ownerConcern,
    missingInfoQuestions: analysis.missingInfoQuestions,
  });

  return {
    dogName: analysis.dogName,
    riskLevel: analysis.riskLevel,
    reasons: analysis.reasons,
    mainSymptoms: analysis.mainSymptoms,
    knownInfo: analysis.knownInfo,
    missingInfoQuestions: analysis.missingInfoQuestions,
    currentAssessment: analysis.currentAssessment,
    userFriendlyGuide: buildUserFriendlyGuide(
      analysis.dogName,
      analysis.riskLevel,
      analysis.currentAssessment,
      symptomsForSummary,
      analysis.missingInfoQuestions,
    ),
    todayCare,
    vetConsultPreparation,
    nextAction: buildNextAction(analysis.riskLevel, analysis.missingInfoQuestions),
  };
}

function buildNextAction(riskLevel: DailyRiskLevel, missingInfoQuestions: string[]): string {
  if (riskLevel === "urgent") {
    return "빠른 동물병원 상담 권장: 먹은 음식, 증상 시작 시점, 현재 증상, 사진이나 포장지 정보를 정리해 바로 문의해 주세요.";
  }

  if (riskLevel === "vet_consult") {
    return "동물병원 상담 권장: 식욕, 변, 구토, 활동량 변화와 증상 시작 시점을 정리해 상담해 주세요.";
  }

  if (riskLevel === "watch") {
    if (missingInfoQuestions.length > 0) {
      return `오늘은 관찰을 강화하고 추가 정보를 확인해 주세요: ${missingInfoQuestions.slice(0, 3).join(" / ")}`;
    }

    return "오늘은 관찰을 강화하고 식욕, 변, 구토, 활동량 변화를 기록해 주세요.";
  }

  if (missingInfoQuestions.length > 0) {
    return `평소 루틴을 유지하되 부족한 정보를 확인해 주세요: ${missingInfoQuestions.slice(0, 3).join(" / ")}`;
  }

  return "평소 루틴 유지: 식사, 물 섭취, 산책, 휴식을 평소처럼 관리해 주세요.";
}

function buildUserFriendlyGuide(
  dogName: string,
  riskLevel: DailyRiskLevel,
  currentAssessment: string,
  symptoms: string[],
  missingInfoQuestions: string[],
): string {
  const symptomText = symptoms.length > 0 ? symptoms.join(", ") : "뚜렷한 증상 정보 없음";
  const missingText = missingInfoQuestions.length > 0
    ? `추가로 ${missingInfoQuestions.slice(0, 3).join(" ")}`
    : "추가로 확인할 큰 누락 정보는 많지 않습니다.";

  if (riskLevel === "urgent") {
    return `${dogName}의 기록에는 빠른 동물병원 상담을 권장할 만한 신호가 있습니다. 주요 내용은 ${symptomText}입니다. ${missingText}`;
  }

  if (riskLevel === "vet_consult") {
    return `${dogName}의 현재 기록은 동물병원 상담을 고려할 만한 상태입니다. ${currentAssessment} 주요 내용은 ${symptomText}입니다. ${missingText}`;
  }

  if (riskLevel === "watch") {
    return `${dogName}의 현재 기록은 관찰이 필요한 상태로 보입니다. ${currentAssessment} 주요 내용은 ${symptomText}입니다. ${missingText}`;
  }

  return `${dogName}의 현재 기록에는 뚜렷한 이상 신호가 많지 않습니다. ${currentAssessment} ${missingText}`;
}

function formatAppetiteStatus(value: AppetiteStatus): string {
  const labels: Record<AppetiteStatus, string> = {
    normal: "정상",
    less: "감소",
    none: "없음",
    increased: "증가",
    unknown: "확인 필요",
  };

  return labels[value];
}

function formatStoolStatus(value: StoolStatus): string {
  const labels: Record<StoolStatus, string> = {
    normal: "정상",
    soft: "묽은 변",
    diarrhea: "설사",
    bloody: "혈변",
    unknown: "확인 필요",
  };

  return labels[value];
}

function formatVomitingStatus(value: VomitingStatus): string {
  const labels: Record<VomitingStatus, string> = {
    none: "없음",
    once: "1회",
    multiple: "반복",
    unknown: "확인 필요",
  };

  return labels[value];
}

function formatEnergyStatus(value: EnergyStatus): string {
  const labels: Record<EnergyStatus, string> = {
    normal: "정상",
    low: "낮음",
    very_low: "매우 낮음",
    unknown: "확인 필요",
  };

  return labels[value];
}
