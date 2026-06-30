import type { FoodRiskLevel } from "./foodRules.js";
import type { RiskPresentation } from "./riskPresentationRules.js";
import type { DailyRiskLevel } from "./riskRules.js";
import type { TrendSummary } from "./trendSummaryRules.js";
import type { VetContactGuide } from "./toolChainGuideRules.js";
import type { VetShareCard } from "./vetShareCardRules.js";
import type { DogProfileUsage } from "../types/dogProfile.js";

export type KakaoActionSource =
  | "daily_status"
  | "daily_care_note"
  | "food_safety"
  | "food_ingestion"
  | "chat_summary"
  | "photo_observation"
  | "vet_visit_summary";

export interface KakaoActionTextInput {
  source: KakaoActionSource;
  dogName?: string | null;
  riskLevel?: DailyRiskLevel | FoodRiskLevel;
  riskPresentation?: RiskPresentation;
  mainSymptoms?: string[];
  knownInfo?: string[];
  missingInfoQuestions?: string[];
  foodName?: string | null;
  eatenAmount?: string | null;
  eatenAt?: string | null;
  currentSymptoms?: string[];
  observedSigns?: string[];
  familyContext?: string | null;
  ownerConcern?: string | null;
  vetShareCard?: VetShareCard;
  dogProfileUsage?: DogProfileUsage;
  trendSummary?: TrendSummary;
  photoRecordUserMessage?: string;
  nextPhotoGuide?: string[];
  comparisonFocus?: string[];
  photoType?: "stool" | "skin";
  vetContactGuide?: VetContactGuide;
}

export interface KakaoActionText {
  chatFirstReply: string;
  familyShareText: string;
  vetCallScript: string;
  nextInputExample: string;
  whyThisRisk: string[];
}

interface RiskText {
  badge: string;
  label: string;
  immediateAction: string;
  vetContactGuidance: string;
}

const SOURCE_LABELS: Record<KakaoActionSource, string> = {
  daily_status: "오늘 상태",
  daily_care_note: "오늘 케어 기록",
  food_safety: "음식 안전 확인",
  food_ingestion: "위험 음식 섭취 기록",
  chat_summary: "가족 대화 내용",
  photo_observation: "사진 관찰 기록",
  vet_visit_summary: "병원 상담 준비 기록",
};

const BANNED_REPLACEMENTS: Array<[RegExp, string]> = [
  [/이 병입니다/g, "특정 질환으로 단정할 수 없습니다"],
  [/이 약을 먹이세요/g, "약 사용은 수의사와 상담해 주세요"],
  [/병원 안 가도 됩니다/g, "상태 변화가 있으면 수의사 상담을 권장합니다"],
  [/진단했습니다/g, "관찰 내용을 정리했습니다"],
  [/처방합니다/g, "수의사와 상담해 주세요"],
  [/정상 괜찮습니다/g, "현재 입력에서는 큰 이상 신호가 뚜렷하지 않습니다"],
  [/확실히 괜찮습니다/g, "현재 입력에서는 큰 이상 신호가 뚜렷하지 않습니다"],
  [/완치/g, "상태 회복"],
];

export function buildKakaoActionText(input: KakaoActionTextInput): KakaoActionText {
  const dogName = cleanText(input.dogName) ?? "반려견";
  const sourceLabel = SOURCE_LABELS[input.source];
  const riskText = resolveRiskText(input);
  const symptoms = uniqueStrings([
    ...(input.mainSymptoms ?? []),
    ...(input.currentSymptoms ?? []),
    ...(input.observedSigns ?? []),
  ]);
  const missingInfoQuestions = uniqueStrings(input.missingInfoQuestions ?? []);
  const focusText = buildFocusText(input, symptoms);

  return {
    chatFirstReply: sanitizeGeneratedText(
      input.source === "photo_observation" && cleanText(input.photoRecordUserMessage) !== undefined
        ? buildPhotoChatFirstReply(
          riskText,
          input.photoRecordUserMessage,
          input.vetContactGuide,
        )
        : buildChatFirstReply(
          dogName,
          sourceLabel,
          riskText,
          focusText,
          missingInfoQuestions,
          input.familyContext,
          input.dogProfileUsage,
          input.trendSummary,
          input.vetContactGuide,
        ),
    ),
    familyShareText: sanitizeGeneratedText(
      buildFamilyShareText(
        dogName,
        sourceLabel,
        riskText,
        focusText,
        missingInfoQuestions,
        input.familyContext,
        input.trendSummary,
        input.source,
        input.nextPhotoGuide,
        input.comparisonFocus,
      ),
    ),
    vetCallScript: sanitizeGeneratedText(
      buildVetCallScript(input, dogName, riskText, symptoms),
    ),
    nextInputExample: sanitizeGeneratedText(
      buildNextInputExample(
        input.source,
        dogName,
        missingInfoQuestions,
        input.dogProfileUsage,
        input.photoType,
      ),
    ),
    whyThisRisk: buildWhyThisRisk(input, riskText, symptoms).map(sanitizeGeneratedText),
  };
}

function buildPhotoChatFirstReply(
  riskText: RiskText,
  photoRecordUserMessage: string | undefined,
  vetContactGuide: VetContactGuide | undefined,
): string {
  const messageLines = cleanText(photoRecordUserMessage)?.split("\n") ?? [];
  const contactLine = buildVetContactLine(vetContactGuide);
  return [riskText.badge, ...messageLines, ...(contactLine !== undefined ? [contactLine] : [])]
    .slice(0, 7)
    .join("\n");
}

function buildChatFirstReply(
  dogName: string,
  sourceLabel: string,
  riskText: RiskText,
  focusText: string,
  missingInfoQuestions: string[],
  familyContext: string | null | undefined,
  dogProfileUsage: DogProfileUsage | undefined,
  trendSummary: TrendSummary | undefined,
  vetContactGuide: VetContactGuide | undefined,
): string {
  const lines = [
    riskText.badge,
    dogProfileUsage?.applied === true
      ? `${dogName} 프로필을 참고해 ${sourceLabel}을 정리했어요.`
      : `${dogName}의 ${sourceLabel}을 정리했어요.`,
  ];

  const context = cleanText(familyContext);
  if (context !== undefined) {
    lines.push(`${truncate(context, 90)}으로 정리했습니다.`);
  }

  if (trendSummary?.comparedWithRecentRecords === true) {
    lines.push(`최근 기록 비교: ${truncate(trendSummary.trendRiskReason, 100)}`);
  }

  lines.push(focusText);
  lines.push(`바로 할 일: ${riskText.immediateAction}`);

  const contactLine = buildVetContactLine(vetContactGuide);
  if (contactLine !== undefined) {
    lines.push(contactLine);
  }

  if (missingInfoQuestions.length > 0) {
    lines.push(`추가 확인: ${truncate(missingInfoQuestions[0], 110)}`);
  }

  return lines.slice(0, 7).join("\n");
}

function buildVetContactLine(vetContactGuide: VetContactGuide | undefined): string | undefined {
  if (vetContactGuide === undefined) return undefined;
  return `병원 안내: ${vetContactGuide.primaryMessage} ${vetContactGuide.hospitalSearchOptInPrompt}`;
}

function buildFamilyShareText(
  dogName: string,
  sourceLabel: string,
  riskText: RiskText,
  focusText: string,
  missingInfoQuestions: string[],
  familyContext: string | null | undefined,
  trendSummary: TrendSummary | undefined,
  source: KakaoActionSource,
  nextPhotoGuide: string[] | undefined,
  comparisonFocus: string[] | undefined,
): string {
  const context = cleanText(familyContext);
  const title = context !== undefined
    ? `${dogName} ${sourceLabel}을 가족에게 공유할 수 있게 정리했어요.`
    : `${dogName} ${sourceLabel} 공유 내용이에요.`;
  const bullets = [
    `- ${focusText}`,
  ];

  if (trendSummary?.comparedWithRecentRecords === true) {
    bullets.push(`- 최근 기록 비교: ${truncate(trendSummary.trendRiskReason, 90)}`);
  }

  if (source === "photo_observation") {
    const focus = uniqueStrings(comparisonFocus ?? []).slice(0, 2).join(", ");
    const guide = cleanText(nextPhotoGuide?.[0]);
    bullets.push(
      focus.length > 0
        ? `- 다음에 같은 조건으로 다시 기록하며 ${focus} 항목을 비교하면 도움이 됩니다.`
        : `- ${guide ?? "다음에 같은 조건으로 다시 기록하면 변화 비교에 도움이 됩니다."}`,
    );
  }

  bullets.push(`- 현재 단계: ${riskText.label}`);
  bullets.push(`- 지금 할 일: ${riskText.immediateAction}`);

  if (missingInfoQuestions.length > 0) {
    bullets.push(`- 추가 확인: ${truncate(missingInfoQuestions[0], 100)}`);
  } else {
    bullets.push(`- 관찰 중 상태가 달라지면 다시 기록하고 ${riskText.vetContactGuidance}`);
  }

  return [title, ...bullets.slice(0, 4)].join("\n");
}

function buildVetCallScript(
  input: KakaoActionTextInput,
  dogName: string,
  riskText: RiskText,
  symptoms: string[],
): string {
  const weight = findPatientInfo(input, "몸무게");
  const patient = weight !== undefined
    ? `${weight} 반려견 ${dogName}`
    : `몸무게는 확인이 필요한 반려견 ${dogName}`;
  const symptomText = symptoms.length > 0
    ? symptoms.slice(0, 4).join(", ")
    : "현재 증상은 추가 확인이 필요함";
  const foodName = cleanText(input.foodName);
  const eatenAmount = cleanText(input.eatenAmount) ?? "섭취량 확인 필요";
  const eatenAt = cleanText(input.eatenAt) ?? "섭취 시간 확인 필요";
  const timeline = firstMeaningful(input.vetShareCard?.timeline);
  const sentences = [
    `안녕하세요. ${patient}의 상태 상담을 요청드립니다.`,
  ];

  if (foodName !== undefined) {
    sentences.push(
      `${eatenAt}에 ${foodName} ${eatenAmount}을 먹은 것으로 기록했고, 현재 증상 기록은 ${symptomText}입니다.`,
    );
  } else {
    const timelineText = timeline !== undefined ? `${timeline}부터 ` : "";
    sentences.push(
      `${timelineText}${symptomText}이 기록되었고 현재 ${riskText.label} 단계로 안내받았습니다.`,
    );
  }

  sentences.push(
    input.riskLevel === "urgent" || input.riskLevel === "danger"
      ? "빠른 상담이나 내원이 필요한지 확인 부탁드립니다."
      : "진료 시점과 추가로 확인할 항목을 상담받고 싶습니다.",
  );

  return sentences.join(" ");
}

function buildNextInputExample(
  source: KakaoActionSource,
  dogName: string,
  missingInfoQuestions: string[],
  dogProfileUsage: DogProfileUsage | undefined,
  photoType: "stool" | "skin" | undefined,
): string {
  const missingHint = missingInfoQuestions.length > 0
    ? ` 추가로 확인할 내용: ${truncate(missingInfoQuestions[0], 90)}`
    : "";

  if (source === "food_ingestion" || source === "food_safety") {
    return dogProfileUsage?.applied === true
      ? `다음에는 프로필 정보를 반복하지 않고 이렇게 알려주세요: ${dogName}이 30분 전에 포도 한 알을 먹었고 현재 구토나 무기력은 없어요.${missingHint}`
      : `다음에는 이렇게 알려주세요: ${dogName}이 30분 전에 포도 한 알을 먹었고, 몸무게는 11kg이며 현재 구토나 무기력은 없어요.${missingHint}`;
  }

  if (source === "photo_observation") {
    const example = photoType === "skin"
      ? `${dogName} 피부 사진 기록, 오늘 저녁, 배 쪽 붉은기 범위는 동전 크기, 털 빠짐 있음, 진물 없음, 긁기 증가`
      : `${dogName} 변 사진 기록, 오늘 저녁, 묽은 변 1회, 색은 갈색, 점액 없음, 구토 없음, 활동량 보통`;
    return `다음에는 ${dogProfileUsage?.applied === true ? "프로필 정보를 반복하지 않고 " : ""}이렇게 알려주세요: ${example}.${missingHint}`;
  }

  return `다음에는 ${dogProfileUsage?.applied === true ? "프로필 정보를 반복하지 않고 " : ""}이렇게 알려주세요: ${dogName} 오늘 기록, 밥은 평소의 절반, 묽은 변 1회, 구토 없음, 활동량은 낮고 증상은 오늘 아침부터예요.${missingHint}`;
}

function buildWhyThisRisk(
  input: KakaoActionTextInput,
  riskText: RiskText,
  symptoms: string[],
): string[] {
  const reasons: string[] = [];
  const foodName = cleanText(input.foodName);

  if (foodName !== undefined) {
    reasons.push(`${foodName} 섭취 정보가 기록되어 ${riskText.label} 단계로 분류했습니다.`);
  }

  if (input.trendSummary?.comparedWithRecentRecords === true) {
    reasons.push(input.trendSummary.trendRiskReason);
  }

  for (const symptom of symptoms.slice(0, 2)) {
    reasons.push(`${truncate(symptom, 80)} 항목이 현재 기록에 포함되어 있습니다.`);
  }

  for (const info of uniqueStrings(input.knownInfo ?? []).slice(0, 2)) {
    reasons.push(`확인된 정보: ${truncate(info, 100)}`);
  }

  const concern = cleanText(input.ownerConcern);
  if (reasons.length < 2 && concern !== undefined) {
    reasons.push(`보호자가 전달한 내용에 ${truncate(concern, 90)}이 포함되어 있습니다.`);
  }

  if (reasons.length < 2) {
    reasons.push(`현재 입력된 상태 정보를 함께 고려해 ${riskText.label} 단계로 정리했습니다.`);
  }

  if (reasons.length < 2) {
    reasons.push(`추가 정보나 상태 변화에 따라 상담 권장 수준이 달라질 수 있습니다.`);
  }

  return uniqueStrings(reasons).slice(0, 5);
}

function buildFocusText(input: KakaoActionTextInput, symptoms: string[]): string {
  const foodName = cleanText(input.foodName);
  if (foodName !== undefined) {
    const eatenAmount = cleanText(input.eatenAmount) ?? "섭취량 확인 필요";
    const eatenAt = cleanText(input.eatenAt) ?? "섭취 시간 확인 필요";
    return `먹은 음식: ${foodName}, 양: ${eatenAmount}, 시간: ${eatenAt}`;
  }

  if (symptoms.length > 0) {
    return `주요 기록: ${symptoms.slice(0, 4).join(", ")}`;
  }

  const knownInfo = firstMeaningful(input.knownInfo);
  if (knownInfo !== undefined) {
    return `확인된 내용: ${truncate(knownInfo, 110)}`;
  }

  return "현재 입력만으로는 구체적인 증상 정보가 부족해 추가 확인이 필요해요.";
}

function resolveRiskText(input: KakaoActionTextInput): RiskText {
  if (input.riskPresentation !== undefined) {
    return {
      badge: input.riskPresentation.riskBadge,
      label: input.riskPresentation.riskLabel,
      immediateAction: input.riskPresentation.immediateAction,
      vetContactGuidance: input.riskPresentation.vetContactGuidance,
    };
  }

  if (input.riskLevel === "urgent" || input.riskLevel === "danger") {
    return {
      badge: "🚨 빠른 상담 권장",
      label: "빠른 동물병원 상담 권장",
      immediateAction: "기록한 음식, 시간, 증상을 정리해 동물병원에 빠르게 문의해 주세요.",
      vetContactGuidance: "빠른 동물병원 상담을 권장합니다.",
    };
  }

  if (input.riskLevel === "vet_consult") {
    return {
      badge: "🟠 상담 권장",
      label: "동물병원 상담 권장",
      immediateAction: "증상 변화와 식사, 배변, 활동량 기록을 정리해 상담을 준비해 주세요.",
      vetContactGuidance: "동물병원 상담을 권장합니다.",
    };
  }

  if (input.riskLevel === "watch" || input.riskLevel === "caution") {
    return {
      badge: "🟡 관찰 필요",
      label: "관찰 필요",
      immediateAction: "오늘 식욕, 변 상태, 구토 여부, 활동량 변화를 기록해 주세요.",
      vetContactGuidance: "증상이 지속되거나 심해지면 동물병원 상담을 권장합니다.",
    };
  }

  if (input.riskLevel === "normal" || input.riskLevel === "safe") {
    return {
      badge: "🟢 큰 이상 신호 적음",
      label: "큰 이상 신호 적음",
      immediateAction: "평소 루틴을 유지하며 식욕, 변 상태, 구토 여부, 활동량을 관찰해 주세요.",
      vetContactGuidance: "새로운 이상 증상이 생기거나 지속되면 수의사 상담을 권장합니다.",
    };
  }

  return {
    badge: "❔ 정보 확인 필요",
    label: "정보 확인 필요",
    immediateAction: "증상, 시작 시점, 먹은 음식, 몸무게를 추가로 확인해 주세요.",
    vetContactGuidance: "정보 확인이 어렵거나 이상 증상이 있으면 동물병원 상담을 권장합니다.",
  };
}

function findPatientInfo(input: KakaoActionTextInput, label: string): string | undefined {
  const source = input.vetShareCard?.patientInfo ?? input.knownInfo ?? [];
  const value = source.find((item) => item.trim().startsWith(`${label}:`));

  if (value === undefined || value.includes("확인 필요")) {
    return undefined;
  }

  return value.slice(value.indexOf(":") + 1).trim();
}

function firstMeaningful(values: string[] | undefined): string | undefined {
  return uniqueStrings(values ?? []).find((value) => !value.includes("확인 필요"));
}

function sanitizeGeneratedText(value: string): string {
  return BANNED_REPLACEMENTS.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    value,
  );
}

function cleanText(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) {
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
