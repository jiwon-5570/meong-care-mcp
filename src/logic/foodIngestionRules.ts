import { checkFoodSafety, type FoodRiskLevel } from "./foodRules.js";
import type {
  FoodIngestionEventInput,
  FoodIngestionRecordedSummary,
} from "../types/foodIngestionRecord.js";

export interface FoodIngestionAnalysis {
  riskLevel: FoodRiskLevel;
  recordedSummary: FoodIngestionRecordedSummary;
  missingInfoQuestions: string[];
  immediateGuide: string[];
  vetSummary: string;
}

export function analyzeFoodIngestionEvent(input: FoodIngestionEventInput): FoodIngestionAnalysis {
  const currentSymptoms = normalizeSymptoms(input.currentSymptoms);
  const recordedSummary = buildRecordedSummary(input, currentSymptoms);
  const foodSafety = checkFoodSafety({
    foodName: buildRiskTargetName(input),
    amount: input.amount,
    dogWeightKg: input.weightKg,
  });

  return {
    riskLevel: foodSafety.riskLevel,
    recordedSummary,
    missingInfoQuestions: buildMissingInfoQuestions(input),
    immediateGuide: buildImmediateGuide(foodSafety.riskLevel, recordedSummary),
    vetSummary: buildVetSummary(recordedSummary, foodSafety.riskLevel),
  };
}

export function buildMissingInfoQuestions(input: FoodIngestionEventInput): string[] {
  const questions: string[] = [];

  if (isBlank(input.foodDetail)) {
    questions.push("어떤 음식인지 더 자세히 알려주세요. 예: 일반 포도, 샤인머스캣, 건포도, 포도즙");
  }

  if (isBlank(input.amount)) {
    questions.push("얼마나 먹었는지 알려주세요. 예: 한 알, 두 알, 조금, 정확히 모름");
  }

  if (isBlank(input.eatenAt)) {
    questions.push("언제 먹었는지 알려주세요. 예: 방금, 30분 전, 2시간 전");
  }

  if (input.weightKg === undefined) {
    questions.push("반려견 몸무게를 알려주세요.");
  }

  if (input.currentSymptoms === undefined || input.currentSymptoms.length === 0) {
    questions.push("구토, 설사, 무기력, 식욕 변화 같은 증상이 있는지 알려주세요.");
  }

  if (isBlank(input.photoUrl) && isBlank(input.imageBase64)) {
    questions.push("가능하다면 먹은 음식이나 포장지 사진을 함께 기록해 주세요.");
  }

  return questions;
}

export function buildImmediateGuide(
  riskLevel: FoodRiskLevel,
  summary?: FoodIngestionRecordedSummary,
): string[] {
  const symptomGuide = buildSymptomGuide(summary?.currentSymptoms ?? []);

  if (riskLevel === "danger") {
    return [
      "빠른 동물병원 상담 권장: 음식 종류, 섭취량, 섭취 시간을 정리해 바로 문의하세요.",
      "먹은 음식이나 포장지 사진이 있다면 병원 상담 시 함께 보여 주세요.",
      symptomGuide,
      "보호자 판단으로 임의로 약을 먹이거나 토하게 하지 마세요.",
    ];
  }

  if (riskLevel === "caution") {
    return [
      "구토, 설사, 무기력, 식욕 변화가 있는지 관찰해 주세요.",
      "새로운 음식이나 간식은 중단하고 평소 식단 위주로 관리해 주세요.",
      "증상이 지속되거나 심해지면 동물병원에 문의하는 것을 권장합니다.",
      symptomGuide,
    ];
  }

  if (riskLevel === "safe") {
    return [
      "평소와 다른 증상이 있는지 관찰해 주세요.",
      "처음 먹은 음식이라면 소량 섭취 후 구토, 설사, 가려움, 식욕 변화를 기록해 주세요.",
      "양념, 소스, 껍질, 씨, 뼈가 섞여 있으면 위험도가 달라질 수 있습니다.",
    ];
  }

  return [
    "안전성을 확정하기 어려우므로 음식명, 성분, 양념 여부를 더 확인해 주세요.",
    "성분표나 포장지 사진을 기록해 병원 상담 시 보여 주세요.",
    "이상 증상이 있거나 성분 확인이 어렵다면 동물병원 상담을 권장합니다.",
  ];
}

function buildRecordedSummary(
  input: FoodIngestionEventInput,
  currentSymptoms: string[],
): FoodIngestionRecordedSummary {
  return {
    dogName: normalizeOptional(input.dogName),
    weightKg: input.weightKg ?? null,
    foodName: input.foodName.trim(),
    foodDetail: normalizeOptional(input.foodDetail) ?? "미입력",
    amount: normalizeOptional(input.amount) ?? "미입력",
    eatenAt: normalizeOptional(input.eatenAt) ?? "미입력",
    photoUrl: normalizeOptional(input.photoUrl),
    hasImageBase64: !isBlank(input.imageBase64),
    currentSymptoms,
    ownerMemo: normalizeOptional(input.ownerMemo),
  };
}

function buildVetSummary(
  summary: FoodIngestionRecordedSummary,
  riskLevel: FoodRiskLevel,
): string {
  const dogLabel = summary.dogName ?? "이름 미입력 반려견";
  const weightLabel = summary.weightKg !== null ? `${summary.weightKg}kg` : "몸무게 미입력";
  const foodLabel = buildFoodLabel(summary.foodName, summary.foodDetail);
  const symptomLabel = summary.currentSymptoms.join(", ");
  const photoLabel = summary.photoUrl !== null || summary.hasImageBase64
    ? "음식 또는 포장지 사진 기록 있음"
    : "음식 또는 포장지 사진 미기록";
  const memoLabel = summary.ownerMemo !== null ? ` 보호자 메모: ${summary.ownerMemo}` : "";
  const riskGuide = buildVetRiskGuide(riskLevel);

  return `${weightLabel} ${dogLabel}이 ${summary.eatenAt}에 ${foodLabel} ${summary.amount}을 섭취한 것으로 기록됨. 현재 확인된 증상: ${symptomLabel}. ${photoLabel}.${memoLabel} ${riskGuide}`;
}

function buildRiskTargetName(input: FoodIngestionEventInput): string {
  return [input.foodName, input.foodDetail]
    .map((value) => value?.trim())
    .filter((value): value is string => value !== undefined && value.length > 0)
    .join(" ");
}

function buildFoodLabel(foodName: string, foodDetail: string): string {
  if (foodDetail === "미입력") {
    return foodName;
  }

  if (foodDetail.includes(foodName)) {
    return foodDetail;
  }

  return `${foodDetail}(${foodName})`;
}

function buildVetRiskGuide(riskLevel: FoodRiskLevel): string {
  if (riskLevel === "danger") {
    return "위험 음식 섭취 가능성이 있어 빠른 동물병원 상담 권장.";
  }

  if (riskLevel === "caution") {
    return "주의가 필요한 음식으로 분류되어 증상 변화 관찰 및 필요 시 동물병원 상담 권장.";
  }

  if (riskLevel === "safe") {
    return "현재 규칙상 일반적으로 낮은 위험으로 분류되지만, 이상 증상 발생 시 상담 권장.";
  }

  return "안전성을 확정하기 어려워 성분 확인과 이상 증상 관찰 후 동물병원 상담 필요 여부 확인 권장.";
}

function buildSymptomGuide(symptoms: string[]): string {
  if (symptoms.length === 0 || symptoms.every((symptom) => symptom === "미입력")) {
    return "구토, 설사, 무기력, 식욕 변화, 침 흘림 같은 현재 증상을 확인해 기록해 주세요.";
  }

  if (symptoms.some((symptom) => normalizeForMatch(symptom).includes("없"))) {
    return "현재 증상이 없더라도 이후 구토, 설사, 무기력, 식욕 변화가 생기는지 관찰해 주세요.";
  }

  return `현재 증상(${symptoms.join(", ")})의 시작 시점과 변화 여부를 함께 기록해 주세요.`;
}

function normalizeSymptoms(symptoms: string[] | undefined): string[] {
  if (symptoms === undefined || symptoms.length === 0) {
    return ["미입력"];
  }

  const normalizedSymptoms = symptoms
    .map((symptom) => symptom.trim())
    .filter((symptom) => symptom.length > 0);

  return normalizedSymptoms.length > 0 ? normalizedSymptoms : ["미입력"];
}

function normalizeOptional(value: string | undefined): string | null {
  if (value === undefined || value.trim().length === 0) {
    return null;
  }

  return value.trim();
}

function normalizeForMatch(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim().length === 0;
}
