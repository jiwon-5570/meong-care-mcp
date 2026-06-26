import type { FoodRiskLevel } from "./foodRules.js";
import type { DailyRiskLevel } from "./riskRules.js";
import type { RiskPresentation } from "./riskPresentationRules.js";
import { SAFETY_MESSAGE } from "../utils/safetyMessage.js";

export type VetShareCardSource =
  | "daily_status"
  | "daily_care_note"
  | "vet_visit_summary"
  | "food_ingestion"
  | "chat_summary"
  | "photo_observation";

export interface VetShareCardInput {
  source: VetShareCardSource;
  dogName?: string | null;
  ageYears?: number | null;
  weightKg?: number | null;
  riskLevel?: DailyRiskLevel | FoodRiskLevel;
  riskPresentation?: RiskPresentation;
  symptoms?: string[];
  symptomStartedAt?: string | null;
  appetite?: string | null;
  stool?: string | null;
  vomiting?: string | null;
  energy?: string | null;
  foodOrSnackToday?: string[];
  eatenFood?: string | null;
  eatenAmount?: string | null;
  eatenAt?: string | null;
  currentSymptoms?: string[];
  ownerConcern?: string | null;
  observedSigns?: string[];
  photoType?: string | null;
  timeline?: string[];
  missingInfoQuestions?: string[];
  questionsForVet?: string[];
  privacyNote?: string;
}

export interface VetShareCard {
  title: string;
  copyableText: string;
  oneLineSummary: string;
  patientInfo: string[];
  keySymptoms: string[];
  timeline: string[];
  foodAndExposure: string[];
  currentStatus: string[];
  riskNote: string;
  preparedQuestions: string[];
  missingInfoForVet: string[];
  guardianMemo: string[];
  safetyNote: string;
}

const CARD_TITLE = "멍케어노트 병원 상담용 요약";
const SAFETY_NOTE =
  "이 요약은 보호자가 입력한 기록을 정리한 것이며 진단이나 처방이 아닙니다. " +
  SAFETY_MESSAGE;

export function buildVetShareCard(input: VetShareCardInput): VetShareCard {
  const patientInfo = buildPatientInfo(input);
  const keySymptoms = buildKeySymptoms(input);
  const timeline = buildTimeline(input);
  const foodAndExposure = buildFoodAndExposure(input);
  const currentStatus = buildCurrentStatus(input);
  const riskNote = buildRiskNote(input);
  const preparedQuestions = buildPreparedQuestions(input);
  const missingInfoForVet = normalizeList(input.missingInfoQuestions);
  const guardianMemo = buildGuardianMemo(input);
  const oneLineSummary = buildOneLineSummary(input, keySymptoms, foodAndExposure);
  const copyableText = buildCopyableText({
    oneLineSummary,
    patientInfo,
    keySymptoms,
    timeline,
    foodAndExposure,
    currentStatus,
    riskNote,
    preparedQuestions,
    missingInfoForVet,
    guardianMemo,
  });

  return {
    title: CARD_TITLE,
    copyableText,
    oneLineSummary,
    patientInfo,
    keySymptoms,
    timeline,
    foodAndExposure,
    currentStatus,
    riskNote,
    preparedQuestions,
    missingInfoForVet,
    guardianMemo,
    safetyNote: SAFETY_NOTE,
  };
}

function buildPatientInfo(input: VetShareCardInput): string[] {
  return [
    `이름: ${formatText(input.dogName)}`,
    `나이: ${input.ageYears !== undefined && input.ageYears !== null ? `${input.ageYears}살` : "확인 필요"}`,
    `몸무게: ${input.weightKg !== undefined && input.weightKg !== null ? `${input.weightKg}kg` : "확인 필요"}`,
  ];
}

function buildKeySymptoms(input: VetShareCardInput): string[] {
  const symptoms = [
    ...(input.symptoms ?? []),
    ...(input.currentSymptoms ?? []),
    ...(input.observedSigns ?? []),
  ];

  return normalizeList(symptoms, ["확인 필요"]);
}

function buildTimeline(input: VetShareCardInput): string[] {
  const timeline = [
    input.symptomStartedAt !== undefined && input.symptomStartedAt !== null
      ? `증상 시작 시점: ${input.symptomStartedAt}`
      : undefined,
    input.eatenAt !== undefined && input.eatenAt !== null
      ? `섭취 시점: ${input.eatenAt}`
      : undefined,
    ...(input.timeline ?? []),
  ];

  return normalizeList(timeline, ["확인 필요"]);
}

function buildFoodAndExposure(input: VetShareCardInput): string[] {
  const foodItems: string[] = [];

  if (hasText(input.eatenFood)) {
    foodItems.push(`먹은 음식: ${input.eatenFood}`);
  }

  if (hasText(input.eatenAmount)) {
    foodItems.push(`섭취량: ${input.eatenAmount}`);
  }

  if (hasText(input.eatenAt)) {
    foodItems.push(`섭취 시점: ${input.eatenAt}`);
  }

  for (const food of input.foodOrSnackToday ?? []) {
    foodItems.push(`최근 음식/간식: ${food}`);
  }

  return normalizeList(foodItems, ["확인 필요"]);
}

function buildCurrentStatus(input: VetShareCardInput): string[] {
  const status = [
    `식욕: ${formatText(input.appetite)}`,
    `변 상태: ${formatText(input.stool)}`,
    `구토: ${formatText(input.vomiting)}`,
    `활동량: ${formatText(input.energy)}`,
  ];

  if (hasText(input.photoType)) {
    status.push(`사진 기록 종류: ${input.photoType}`);
  }

  return status;
}

function buildRiskNote(input: VetShareCardInput): string {
  if (input.riskPresentation !== undefined) {
    return `${input.riskPresentation.riskBadge} ${input.riskPresentation.riskLabel}: ${input.riskPresentation.immediateAction}`;
  }

  if (input.riskLevel !== undefined) {
    return `위험도: ${input.riskLevel}. 자세한 판단은 확인 필요입니다.`;
  }

  return "위험도: 확인 필요";
}

function buildPreparedQuestions(input: VetShareCardInput): string[] {
  const questions = normalizeList(input.questionsForVet);

  if (questions.length >= 3) {
    return questions;
  }

  const defaults = [
    "현재 기록에서 우선 확인해야 할 위험 신호가 있는지 상담하고 싶습니다.",
    "오늘 식사, 물 섭취, 산책, 휴식은 어떻게 조절하면 좋을까요?",
    "어떤 변화가 보이면 바로 다시 연락하거나 방문해야 하는지 알고 싶습니다.",
  ];

  if (input.riskLevel === "danger" || input.riskLevel === "urgent") {
    defaults.unshift("지금 바로 내원이 필요한 상황인지 확인하고 싶습니다.");
  }

  return uniqueStrings([...questions, ...defaults]).slice(0, 6);
}

function buildGuardianMemo(input: VetShareCardInput): string[] {
  const memo = [
    hasText(input.ownerConcern) ? `보호자 메모: ${input.ownerConcern}` : undefined,
    input.source === "chat_summary"
      ? "가족 대화/캡처 텍스트 기반 요약입니다. 카카오톡을 직접 조회한 내용은 아닙니다."
      : undefined,
    input.source === "photo_observation"
      ? "사진만으로 확인한 판단이 아니라 보호자가 입력한 관찰 내용을 정리한 것입니다."
      : undefined,
    input.privacyNote,
  ];

  return normalizeList(memo);
}

function buildOneLineSummary(
  input: VetShareCardInput,
  keySymptoms: string[],
  foodAndExposure: string[],
): string {
  const dogName = formatText(input.dogName);
  const symptomText = keySymptoms.join(", ");
  const exposureText = foodAndExposure[0] !== "확인 필요" ? ` 음식/노출: ${foodAndExposure.join(", ")}.` : "";
  const riskText = input.riskPresentation?.riskLabel ?? input.riskLevel ?? "확인 필요";

  return `${dogName} 기록 요약: 위험도는 ${riskText}이며, 주요 증상/상태는 ${symptomText}입니다.${exposureText}`;
}

function buildCopyableText(parts: {
  oneLineSummary: string;
  patientInfo: string[];
  keySymptoms: string[];
  timeline: string[];
  foodAndExposure: string[];
  currentStatus: string[];
  riskNote: string;
  preparedQuestions: string[];
  missingInfoForVet: string[];
  guardianMemo: string[];
}): string {
  return [
    `[${CARD_TITLE}]`,
    `위험도: ${parts.riskNote}`,
    `한 줄 요약: ${parts.oneLineSummary}`,
    "",
    buildSection("반려견 정보", parts.patientInfo),
    "",
    buildSection("주요 증상/상태", parts.keySymptoms),
    "",
    buildSection("시간 정보", parts.timeline),
    "",
    buildSection("음식/노출 정보", parts.foodAndExposure),
    "",
    buildSection("식욕/변/구토/활동량", parts.currentStatus),
    "",
    buildSection("보호자가 추가로 확인할 정보", parts.missingInfoForVet, ["확인 필요"]),
    "",
    buildSection("수의사에게 물어볼 질문", parts.preparedQuestions),
    "",
    buildSection("보호자 메모", parts.guardianMemo, ["없음"]),
    "",
    `※ ${SAFETY_NOTE}`,
  ].join("\n");
}

function buildSection(title: string, items: string[], fallback: string[] = ["확인 필요"]): string {
  const normalizedItems = normalizeList(items, fallback);
  return [`[${title}]`, ...normalizedItems.map((item) => `- ${item}`)].join("\n");
}

function formatText(value: string | null | undefined): string {
  return hasText(value) ? value.trim() : "확인 필요";
}

function hasText(value: string | null | undefined): value is string {
  return value !== undefined && value !== null && value.trim().length > 0;
}

function normalizeList(
  values: Array<string | null | undefined> | undefined,
  fallback: string[] = [],
): string[] {
  const normalized = uniqueStrings(
    (values ?? [])
      .filter((value): value is string => value !== undefined && value !== null)
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );

  return normalized.length > 0 ? normalized : fallback;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
