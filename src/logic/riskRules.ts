import { checkFoodSafety } from "./foodRules.js";
import { mergeDogProfile } from "./dogProfileRules.js";
import { buildDailyRiskPresentation, type RiskPresentation } from "./riskPresentationRules.js";
import { buildTrendSummary, type RecentDailyStatusRecord, type TrendSummary } from "./trendSummaryRules.js";
import {
  buildToolChainGuide,
  detectEmergencyHospitalSearchRequest,
  detectHospitalSearchRequest,
  type ToolChainGuide,
} from "./toolChainGuideRules.js";
import type { DogProfile, DogProfileUsage } from "../types/dogProfile.js";

export type AppetiteStatus = "normal" | "less" | "none" | "increased" | "unknown";
export type StoolStatus = "normal" | "soft" | "diarrhea" | "bloody" | "unknown";
export type VomitingStatus = "none" | "once" | "multiple" | "unknown";
export type EnergyStatus = "normal" | "low" | "very_low" | "unknown";
export type DailyRiskLevel = "normal" | "watch" | "vet_consult" | "urgent";

export interface DailyStatusInput {
  dogName?: string;
  ageYears?: number;
  weightKg?: number;
  appetite?: AppetiteStatus;
  stool?: StoolStatus;
  vomiting?: VomitingStatus;
  energy?: EnergyStatus;
  coughing?: boolean;
  itching?: boolean;
  eyeDischarge?: boolean;
  foodOrSnackToday?: string[];
  symptomStartedAt?: string;
  ownerConcern?: string;
  dogProfile?: DogProfile;
  recentRecords?: RecentDailyStatusRecord[];
  ownerRequestedHospitalSearch?: boolean;
}

export interface NormalizedDailyStatusInput {
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
  foodOrSnackToday: string[];
  symptomStartedAt?: string;
  ownerConcern?: string;
  dogProfileUsage: DogProfileUsage;
  recentRecords: RecentDailyStatusRecord[];
}

export interface DailyStatusAnalysis {
  dogName: string;
  riskLevel: DailyRiskLevel;
  reasons: string[];
  mainSymptoms: string[];
  knownInfo: string[];
  missingInfoQuestions: string[];
  currentAssessment: string;
  riskPresentation: RiskPresentation;
  dogProfileUsage: DogProfileUsage;
  trendSummary: TrendSummary;
  toolChainGuide: ToolChainGuide;
}

interface DangerousFoodSignal {
  foods: string[];
  reason: string;
}

const DANGEROUS_FOOD_KEYWORDS = [
  "초콜릿",
  "초코",
  "다크초콜릿",
  "카카오",
  "포도",
  "샤인머스캣",
  "건포도",
  "포도즙",
  "포도주스",
  "양파",
  "마늘",
  "대파",
  "쪽파",
  "자일리톨",
  "커피",
  "카페인",
  "알코올",
  "술",
  "맥주",
  "마카다미아",
  "아보카도",
  "이스트",
  "발효반죽",
];

export function normalizeDailyStatusInput(input: DailyStatusInput): NormalizedDailyStatusInput {
  const merged = mergeDogProfile(input);
  const ownerConcern = cleanOptional(merged.ownerConcern);
  const normalizedConcern = normalizeText(ownerConcern ?? "");

  return {
    dogName: cleanOptional(merged.dogName) ?? "반려견",
    ageYears: merged.ageYears,
    weightKg: merged.weightKg,
    appetite: merged.appetite ?? inferAppetiteStatus(normalizedConcern) ?? "unknown",
    stool: merged.stool ?? inferStoolStatus(normalizedConcern) ?? "unknown",
    vomiting: merged.vomiting ?? inferVomitingStatus(normalizedConcern) ?? "unknown",
    energy: merged.energy ?? inferEnergyStatus(normalizedConcern) ?? "unknown",
    coughing: merged.coughing ?? inferBooleanSignal(normalizedConcern, ["기침", "콜록", "켁켁", "숨소리"]),
    itching: merged.itching ?? inferBooleanSignal(normalizedConcern, ["가려", "긁", "핥", "피부"]),
    eyeDischarge: merged.eyeDischarge ?? inferBooleanSignal(normalizedConcern, ["눈곱", "눈물", "눈이붉", "눈충혈"]),
    foodOrSnackToday: normalizeStringList(merged.foodOrSnackToday),
    symptomStartedAt: cleanOptional(merged.symptomStartedAt),
    ownerConcern,
    dogProfileUsage: merged.dogProfileUsage,
    recentRecords: merged.recentRecords ?? [],
  };
}

export function analyzeDailyStatus(input: DailyStatusInput): DailyStatusAnalysis {
  const normalized = normalizeDailyStatusInput(input);
  const dangerousFoodSignal = collectDangerousFoodSignal(normalized);
  const urgentReasons = collectUrgentReasons(normalized, dangerousFoodSignal);
  const abnormalReasons = collectNonUrgentAbnormalReasons(normalized);
  const contextualReasons = collectContextualConcernReasons(normalized, abnormalReasons.length);
  const missingInfoQuestions = buildMissingInfoQuestions(input, normalized, dangerousFoodSignal);
  const knownInfo = buildKnownInfo(input, normalized, dangerousFoodSignal);
  const hasVagueConcernOnly = hasVagueConcern(normalized.ownerConcern) && abnormalReasons.length === 0;

  if (urgentReasons.length > 0) {
    const reasons = [
      "빠른 동물병원 상담 권장 신호가 포함되어 있습니다.",
      ...urgentReasons,
    ];
    const mainSymptoms = buildMainSymptoms(normalized, dangerousFoodSignal, urgentReasons);

    return {
      dogName: normalized.dogName,
      riskLevel: "urgent",
      reasons,
      mainSymptoms,
      knownInfo,
      missingInfoQuestions,
      currentAssessment: buildCurrentAssessment("urgent"),
      riskPresentation: buildDailyRiskPresentation("urgent", reasons, mainSymptoms),
      dogProfileUsage: normalized.dogProfileUsage,
      trendSummary: summarizeTrend(normalized, "urgent", mainSymptoms),
      toolChainGuide: buildDailyStatusToolChain(input, normalized, "urgent", missingInfoQuestions),
    };
  }

  if (countConsultSignals(normalized) >= 2 || contextualReasons.length > 0) {
    const reasons = [
      countConsultSignals(normalized) >= 2
        ? "동물병원 상담을 고려할 만한 이상 신호가 2개 이상 입력되었거나 추정됩니다."
        : "증상 기간, 나이, 상태 조합상 동물병원 상담을 고려하는 것이 좋습니다.",
      ...abnormalReasons,
      ...contextualReasons,
    ];
    const mainSymptoms = buildMainSymptoms(normalized, dangerousFoodSignal, abnormalReasons);

    return {
      dogName: normalized.dogName,
      riskLevel: "vet_consult",
      reasons,
      mainSymptoms,
      knownInfo,
      missingInfoQuestions,
      currentAssessment: buildCurrentAssessment("vet_consult"),
      riskPresentation: buildDailyRiskPresentation("vet_consult", reasons, mainSymptoms),
      dogProfileUsage: normalized.dogProfileUsage,
      trendSummary: summarizeTrend(normalized, "vet_consult", mainSymptoms),
      toolChainGuide: buildDailyStatusToolChain(input, normalized, "vet_consult", missingInfoQuestions),
    };
  }

  if (abnormalReasons.length > 0 || hasVagueConcernOnly || hasOnlyMissingInformation(normalized, input)) {
    const reasons = abnormalReasons.length > 0
      ? abnormalReasons
      : ["구체적인 증상 정보가 부족해 보수적으로 관찰 단계로 분류했습니다."];
    const mainSymptoms = buildMainSymptoms(normalized, dangerousFoodSignal, reasons);

    return {
      dogName: normalized.dogName,
      riskLevel: "watch",
      reasons,
      mainSymptoms,
      knownInfo,
      missingInfoQuestions,
      currentAssessment: buildCurrentAssessment("watch"),
      riskPresentation: buildDailyRiskPresentation("watch", reasons, mainSymptoms),
      dogProfileUsage: normalized.dogProfileUsage,
      trendSummary: summarizeTrend(normalized, "watch", mainSymptoms),
      toolChainGuide: buildDailyStatusToolChain(input, normalized, "watch", missingInfoQuestions),
    };
  }

  const reasons = ["식욕, 변, 구토, 활동량에 뚜렷한 이상 신호가 입력되지 않았습니다."];

  return {
    dogName: normalized.dogName,
    riskLevel: "normal",
    reasons,
    mainSymptoms: [],
    knownInfo,
    missingInfoQuestions,
    currentAssessment: buildCurrentAssessment("normal"),
    riskPresentation: buildDailyRiskPresentation("normal", reasons, []),
    dogProfileUsage: normalized.dogProfileUsage,
    trendSummary: summarizeTrend(normalized, "normal", []),
    toolChainGuide: buildDailyStatusToolChain(input, normalized, "normal", missingInfoQuestions),
  };
}

function buildDailyStatusToolChain(
  original: DailyStatusInput,
  normalized: NormalizedDailyStatusInput,
  riskLevel: DailyRiskLevel,
  missingInfoQuestions: string[],
): ToolChainGuide {
  const ownerRequestedHospitalSearch = original.ownerRequestedHospitalSearch ??
    detectHospitalSearchRequest(normalized.ownerConcern);

  return buildToolChainGuide({
    source: "daily_status",
    riskLevel,
    dogName: normalized.dogName,
    ownerRequestedHospitalSearch,
    ownerRequestedEmergencyHospital: ownerRequestedHospitalSearch &&
      detectEmergencyHospitalSearchRequest(normalized.ownerConcern),
    vetClinicName: original.dogProfile?.vetClinicName,
    vetPhone: original.dogProfile?.vetPhone,
    hasVetShareCard: false,
    hasVetCallScript: true,
    missingInfoQuestions,
  });
}

function collectUrgentReasons(
  input: NormalizedDailyStatusInput,
  dangerousFoodSignal: DangerousFoodSignal,
): string[] {
  const reasons: string[] = [];

  if (input.stool === "bloody") {
    reasons.push("혈변으로 보이는 변 상태가 입력되었거나 추정됩니다.");
  }

  if (input.vomiting === "multiple") {
    reasons.push("구토가 반복된 것으로 입력되었거나 추정됩니다.");
  }

  if (input.energy === "very_low") {
    reasons.push("매우 무기력하거나 반응이 떨어지는 상태로 입력되었거나 추정됩니다.");
  }

  if (input.appetite === "none") {
    reasons.push("식욕이 전혀 없는 상태로 입력되었거나 추정됩니다.");
  }

  if (dangerousFoodSignal.foods.length > 0) {
    reasons.push(dangerousFoodSignal.reason);
  }

  return reasons;
}

function collectDangerousFoodSignal(input: NormalizedDailyStatusInput): DangerousFoodSignal {
  const foodCandidates = [
    ...input.foodOrSnackToday.filter((food) => !isUsualFoodReference(food)),
    ...(input.ownerConcern !== undefined ? [input.ownerConcern] : []),
  ];
  const dangerousFoods = new Set<string>();

  for (const candidate of foodCandidates) {
    const result = checkFoodSafety({ foodName: candidate, dogWeightKg: input.weightKg });

    if (result.riskLevel === "danger") {
      const extracted = extractDangerousFoodMentions(candidate);
      if (extracted.length === 0) {
        dangerousFoods.add(candidate);
      } else {
        for (const food of extracted) {
          dangerousFoods.add(food);
        }
      }
    }
  }

  const foods = Array.from(dangerousFoods);

  return {
    foods,
    reason: foods.length > 0
      ? `위험 음식 섭취 가능성이 있습니다: ${foods.join(", ")}. 빠른 동물병원 상담 권장 상황입니다.`
      : "",
  };
}

function collectNonUrgentAbnormalReasons(input: NormalizedDailyStatusInput): string[] {
  const reasons: string[] = [];

  if (input.stool === "diarrhea") {
    reasons.push("설사가 입력되었거나 추정됩니다.");
  } else if (input.stool === "soft") {
    reasons.push("변이 묽거나 무른 상태로 입력되었거나 추정됩니다.");
  }

  if (input.vomiting === "once") {
    reasons.push("구토가 1회 있었던 것으로 입력되었거나 추정됩니다.");
  }

  if (input.appetite === "less") {
    reasons.push("식욕 감소가 입력되었거나 추정됩니다.");
  } else if (input.appetite === "increased") {
    reasons.push("식욕이 평소보다 증가한 것으로 입력되었거나 추정됩니다.");
  }

  if (input.energy === "low") {
    reasons.push("활동량 감소 또는 무기력이 입력되었거나 추정됩니다.");
  }

  if (input.coughing === true) {
    reasons.push("기침이 입력되었거나 추정됩니다.");
  }

  if (input.itching === true) {
    reasons.push("가려움 또는 피부 불편감이 입력되었거나 추정됩니다.");
  }

  if (input.eyeDischarge === true) {
    reasons.push("눈물 또는 눈곱이 입력되었거나 추정됩니다.");
  }

  return reasons;
}

function countConsultSignals(input: NormalizedDailyStatusInput): number {
  let count = 0;

  if (input.stool === "diarrhea" || input.stool === "soft") count += 1;
  if (input.vomiting === "once") count += 1;
  if (input.appetite === "less") count += 1;
  if (input.energy === "low") count += 1;
  if (input.coughing === true) count += 1;
  if (input.itching === true) count += 1;
  if (input.eyeDischarge === true) count += 1;

  return count;
}

function collectContextualConcernReasons(
  input: NormalizedDailyStatusInput,
  abnormalReasonCount: number,
): string[] {
  if (abnormalReasonCount === 0) {
    return [];
  }

  const reasons: string[] = [];

  if (hasDurationConcern(input.symptomStartedAt) || hasDurationConcern(input.ownerConcern)) {
    reasons.push("증상이 하루 이상 지속되었거나 계속되는 것으로 보이는 표현이 있습니다.");
  }

  if (isSensitiveAge(input.ageYears)) {
    reasons.push("어린 강아지 또는 노령견은 같은 증상도 더 이르게 상담을 고려하는 것이 좋습니다.");
  }

  if (input.vomiting === "once" && (input.stool === "diarrhea" || input.energy === "low")) {
    reasons.push("구토가 다른 이상 신호와 함께 입력되어 관찰 강도를 높였습니다.");
  }

  return reasons;
}

function buildKnownInfo(
  original: DailyStatusInput,
  input: NormalizedDailyStatusInput,
  dangerousFoodSignal: DangerousFoodSignal,
): string[] {
  const knownInfo: string[] = [];

  if (input.dogProfileUsage.profileSummary !== "dogProfile이 제공되지 않았습니다.") {
    knownInfo.push(`프로필 참고: ${input.dogProfileUsage.profileSummary}`);
  }

  if (cleanOptional(original.dogName) !== undefined) {
    knownInfo.push(`이름: ${input.dogName}`);
  }

  if (input.ageYears !== undefined) {
    knownInfo.push(`나이: ${input.ageYears}살`);
  }

  if (input.weightKg !== undefined) {
    knownInfo.push(`몸무게: ${input.weightKg}kg`);
  }

  if (input.appetite !== "unknown") {
    knownInfo.push(`식욕: ${appetiteToKorean(input.appetite)}로 추정합니다.`);
  }

  if (input.stool !== "unknown") {
    knownInfo.push(`변 상태: ${stoolToKorean(input.stool)}로 추정합니다.`);
  }

  if (input.vomiting !== "unknown") {
    knownInfo.push(`구토: ${vomitingToKorean(input.vomiting)}로 추정합니다.`);
  }

  if (input.energy !== "unknown") {
    knownInfo.push(`활동량: ${energyToKorean(input.energy)}로 추정합니다.`);
  }

  if (input.symptomStartedAt !== undefined) {
    knownInfo.push(`증상 시작 시점: ${input.symptomStartedAt}`);
  } else if (hasDurationConcern(input.ownerConcern)) {
    knownInfo.push("증상 기간: 보호자 표현에 지속 또는 시작 시점 단서가 있습니다.");
  }

  const recentFoods = input.foodOrSnackToday.filter((food) => !isUsualFoodReference(food));
  if (recentFoods.length > 0) {
    knownInfo.push(`최근 음식/간식: ${recentFoods.join(", ")}`);
  }

  if (dangerousFoodSignal.foods.length > 0) {
    knownInfo.push(`위험 음식 가능성: ${dangerousFoodSignal.foods.join(", ")}`);
  }

  if (input.ownerConcern !== undefined) {
    knownInfo.push(`보호자 메모: ${truncate(input.ownerConcern, 80)}`);
  }

  if (knownInfo.length === 0) {
    knownInfo.push("구체적으로 확인된 정보가 아직 부족합니다.");
  }

  return knownInfo;
}

function buildMissingInfoQuestions(
  original: DailyStatusInput,
  input: NormalizedDailyStatusInput,
  dangerousFoodSignal: DangerousFoodSignal,
): string[] {
  const questions: string[] = [];

  if (input.dogName === "반려견") {
    questions.push("반려견 이름을 알려주세요.");
  }

  if (input.symptomStartedAt === undefined && !hasDurationConcern(input.ownerConcern)) {
    questions.push("증상이 언제 시작됐는지 알려주세요. 예: 방금, 30분 전, 어제부터");
  }

  if (input.appetite === "unknown") {
    questions.push("식욕은 어떤가요? 예: 평소와 같음, 덜 먹음, 전혀 안 먹음");
  }

  if (input.stool === "unknown") {
    questions.push("변 상태를 알려주세요. 예: 정상, 묽은 변, 설사, 혈변, 확인 못함");
  }

  if (input.vomiting === "unknown") {
    questions.push("구토가 있었는지 알려주세요. 예: 없음, 1회, 여러 번");
  }

  if (input.energy === "unknown") {
    questions.push("활동량은 어떤가요? 예: 평소와 같음, 낮음, 매우 무기력함");
  }

  if (
    input.foodOrSnackToday.filter((food) => !isUsualFoodReference(food)).length === 0 &&
    dangerousFoodSignal.foods.length === 0
  ) {
    questions.push("최근 먹은 음식이나 간식, 위험할 수 있는 음식 섭취 여부를 알려주세요.");
  }

  if (input.ageYears === undefined && input.weightKg === undefined) {
    questions.push("반려견 나이와 몸무게를 알려주세요.");
  } else if (input.ageYears === undefined) {
    questions.push("반려견 나이를 알려주세요.");
  } else if (input.weightKg === undefined) {
    questions.push("반려견 몸무게를 알려주세요.");
  }

  return uniqueStrings(questions);
}

function buildMainSymptoms(
  input: NormalizedDailyStatusInput,
  dangerousFoodSignal: DangerousFoodSignal,
  fallbackReasons: string[],
): string[] {
  const symptoms: string[] = [];

  if (input.appetite === "less") symptoms.push("식욕 감소");
  if (input.appetite === "none") symptoms.push("식욕 없음");
  if (input.appetite === "increased") symptoms.push("식욕 증가");
  if (input.stool === "soft") symptoms.push("묽은 변");
  if (input.stool === "diarrhea") symptoms.push("설사");
  if (input.stool === "bloody") symptoms.push("혈변");
  if (input.vomiting === "once") symptoms.push("구토 1회");
  if (input.vomiting === "multiple") symptoms.push("반복 구토");
  if (input.energy === "low") symptoms.push("활동량 감소");
  if (input.energy === "very_low") symptoms.push("매우 무기력");
  if (input.coughing === true) symptoms.push("기침");
  if (input.itching === true) symptoms.push("가려움");
  if (input.eyeDischarge === true) symptoms.push("눈물/눈곱");

  for (const food of dangerousFoodSignal.foods) {
    symptoms.push(`위험 음식 섭취 가능성: ${food}`);
  }

  if (symptoms.length === 0 && hasVagueConcern(input.ownerConcern)) {
    symptoms.push("보호자 걱정 또는 평소와 다른 상태");
  }

  if (symptoms.length === 0 && fallbackReasons.length > 0) {
    symptoms.push(...fallbackReasons);
  }

  return uniqueStrings(symptoms);
}

function buildCurrentAssessment(riskLevel: DailyRiskLevel): string {
  if (riskLevel === "urgent") {
    return "현재 입력에는 빠른 동물병원 상담을 권장할 수 있는 신호가 포함되어 있습니다.";
  }

  if (riskLevel === "vet_consult") {
    return "현재 입력에는 동물병원 상담을 고려할 만한 이상 신호가 있습니다.";
  }

  if (riskLevel === "watch") {
    return "현재 입력만으로는 관찰이 필요한 상태로 보이며, 추가 정보 확인이 필요합니다.";
  }

  return "현재 입력만으로는 뚜렷한 이상 신호가 많지 않지만, 부족한 정보를 확인해 주세요.";
}

function inferAppetiteStatus(normalizedText: string): AppetiteStatus | undefined {
  if (hasAny(normalizedText, ["전혀안먹", "하나도안먹", "아예안먹"])) {
    return "none";
  }

  if (
    hasAny(normalizedText, [
      "밥을안먹",
      "밥안먹",
      "사료안먹",
      "사료를안먹",
      "식욕없음",
      "식욕이없",
      "거의안먹",
      "반만먹",
      "덜먹",
      "조금만먹",
      "입맛없",
    ])
  ) {
    return "less";
  }

  if (hasAny(normalizedText, ["식욕정상", "밥잘먹", "사료잘먹", "평소처럼먹"])) {
    return "normal";
  }

  if (hasAny(normalizedText, ["식욕증가", "계속먹", "많이먹", "먹을걸찾"])) {
    return "increased";
  }

  return undefined;
}

function inferStoolStatus(normalizedText: string): StoolStatus | undefined {
  if (hasAny(normalizedText, ["혈변", "피가섞", "피섞인변", "검붉은변", "붉은변"])) {
    return "bloody";
  }

  if (hasAny(normalizedText, ["설사", "물설사", "물이많은변"])) {
    return "diarrhea";
  }

  if (hasAny(normalizedText, ["묽은변", "변이묽", "무른변", "물적", "묽어", "변이무르"])) {
    return "soft";
  }

  if (hasAny(normalizedText, ["변정상", "정상변", "응가정상"])) {
    return "normal";
  }

  return undefined;
}

function inferVomitingStatus(normalizedText: string): VomitingStatus | undefined {
  if (hasAny(normalizedText, ["계속토", "여러번토", "반복구토", "구토여러번", "토를여러번", "구토반복"])) {
    return "multiple";
  }

  if (hasAny(normalizedText, ["한번토", "한번토했", "1번토", "구토한번", "구토1회", "토한번"])) {
    return "once";
  }

  if (hasAny(normalizedText, ["구토는없어", "구토없음", "토는안", "토하지않", "토는없어", "구토안함"])) {
    return "none";
  }

  return undefined;
}

function inferEnergyStatus(normalizedText: string): EnergyStatus | undefined {
  if (hasAny(normalizedText, ["일어나지못", "반응이없", "축늘어", "쓰러", "의식", "기절"])) {
    return "very_low";
  }

  if (
    hasAny(normalizedText, [
      "축처져",
      "기운없",
      "계속누워",
      "움직이지",
      "힘이없",
      "무기력",
      "활동량감소",
      "처져있",
    ])
  ) {
    return "low";
  }

  if (hasAny(normalizedText, ["활동량정상", "잘놀", "평소처럼움직"])) {
    return "normal";
  }

  return undefined;
}

function inferBooleanSignal(normalizedText: string, keywords: string[]): boolean | undefined {
  if (normalizedText.length === 0) {
    return undefined;
  }

  return hasAny(normalizedText, keywords) ? true : undefined;
}

function hasDurationConcern(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }

  return hasAny(normalizeText(value), [
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
    "밤새",
    "아침부터",
    "점심부터",
    "저녁부터",
    "전부터",
  ]);
}

function hasVagueConcern(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }

  return hasAny(normalizeText(value), ["이상해", "평소와달라", "걱정돼", "걱정되", "상태가안좋", "컨디션이안좋"]);
}

function hasOnlyMissingInformation(input: NormalizedDailyStatusInput, original: DailyStatusInput): boolean {
  const allUnknown =
    input.appetite === "unknown" &&
    input.stool === "unknown" &&
    input.vomiting === "unknown" &&
    input.energy === "unknown" &&
    input.coughing !== true &&
    input.itching !== true &&
    input.eyeDischarge !== true &&
    input.foodOrSnackToday.filter((food) => !isUsualFoodReference(food)).length === 0;

  return allUnknown && (
    Object.keys(original).length === 0 ||
    original.ownerConcern !== undefined ||
    original.dogName !== undefined ||
    original.ageYears !== undefined ||
    original.weightKg !== undefined ||
    original.dogProfile !== undefined ||
    original.recentRecords !== undefined
  );
}

function summarizeTrend(
  input: NormalizedDailyStatusInput,
  riskLevel: DailyRiskLevel,
  mainSymptoms: string[],
): TrendSummary {
  return buildTrendSummary({
    dogName: input.dogName,
    riskLevel,
    mainSymptoms,
    appetite: input.appetite,
    stool: input.stool,
    vomiting: input.vomiting,
    energy: input.energy,
    recentRecords: input.recentRecords,
  });
}

function isUsualFoodReference(value: string): boolean {
  return normalizeText(value).startsWith("평소사료:");
}

function isSensitiveAge(ageYears: number | undefined): boolean {
  return ageYears !== undefined && (ageYears < 1 || ageYears >= 10);
}

function extractDangerousFoodMentions(text: string): string[] {
  const normalizedText = normalizeText(text);
  return DANGEROUS_FOOD_KEYWORDS.filter((keyword) => normalizedText.includes(normalizeText(keyword)));
}

function appetiteToKorean(value: AppetiteStatus): string {
  const labels: Record<AppetiteStatus, string> = {
    normal: "정상",
    less: "감소",
    none: "없음",
    increased: "증가",
    unknown: "확인 필요",
  };

  return labels[value];
}

function stoolToKorean(value: StoolStatus): string {
  const labels: Record<StoolStatus, string> = {
    normal: "정상",
    soft: "묽은 변",
    diarrhea: "설사",
    bloody: "혈변",
    unknown: "확인 필요",
  };

  return labels[value];
}

function vomitingToKorean(value: VomitingStatus): string {
  const labels: Record<VomitingStatus, string> = {
    none: "없음",
    once: "1회",
    multiple: "반복",
    unknown: "확인 필요",
  };

  return labels[value];
}

function energyToKorean(value: EnergyStatus): string {
  const labels: Record<EnergyStatus, string> = {
    normal: "정상",
    low: "낮음",
    very_low: "매우 낮음",
    unknown: "확인 필요",
  };

  return labels[value];
}

function normalizeStringList(values: string[] | undefined): string[] {
  return uniqueStrings(values ?? []);
}

function hasAny(normalizedText: string, keywords: string[]): boolean {
  return keywords.some((keyword) => normalizedText.includes(normalizeText(keyword)));
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function cleanOptional(value: string | undefined): string | undefined {
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

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
}
