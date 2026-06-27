import { checkFoodSafety } from "./foodRules.js";
import { mergeDogProfile } from "./dogProfileRules.js";
import { buildKakaoActionText, type KakaoActionText } from "./kakaoActionTextRules.js";
import { buildDailyRiskPresentation, type RiskPresentation } from "./riskPresentationRules.js";
import { buildTrendSummary, type RecentDailyStatusRecord, type TrendSummary } from "./trendSummaryRules.js";
import { buildVetShareCard, type VetShareCard } from "./vetShareCardRules.js";
import type { DogProfile, DogProfileUsage } from "../types/dogProfile.js";
import type {
  AppetiteStatus,
  DailyRiskLevel,
  EnergyStatus,
  StoolStatus,
} from "./riskRules.js";

export type ChatSummarySourceType = "pasted_text" | "screenshot_ocr" | "manual_memo";
export type ChatVomitingStatus = "none" | "once" | "multiple" | "unknown";
export type ChatAppetiteStatus = AppetiteStatus | "unknown";
export type ChatEnergyStatus = EnergyStatus | "unknown";

export interface PetChatSummaryInput {
  dogName?: string;
  ageYears?: number;
  weightKg?: number;
  sourceType: ChatSummarySourceType;
  chatText: string;
  chatStartedAt?: string;
  chatEndedAt?: string;
  screenshotTakenAt?: string;
  ownerMemo?: string;
  dogProfile?: DogProfile;
  recentRecords?: RecentDailyStatusRecord[];
}

export interface PetChatSummaryResult {
  sourceType: ChatSummarySourceType;
  dogName: string | null;
  ageYears: number | null;
  weightKg: number | null;
  analyzedTextSummary: string;
  extractedTimeline: string[];
  extractedSymptoms: string[];
  appetiteStatus: ChatAppetiteStatus;
  stoolStatus: StoolStatus;
  vomitingStatus: ChatVomitingStatus;
  energyStatus: ChatEnergyStatus;
  foodMentions: string[];
  riskLevel: DailyRiskLevel;
  riskReasons: string[];
  riskPresentation: RiskPresentation;
  missingInfoQuestions: string[];
  dogProfileUsage: DogProfileUsage;
  trendSummary: TrendSummary;
  vetVisitSummary: string;
  vetShareCard: VetShareCard;
  kakaoActionText: KakaoActionText;
  questionsForVet: string[];
  privacyNotice: string;
}

interface ExtractedChatSignals {
  appetiteStatus: ChatAppetiteStatus;
  stoolStatus: StoolStatus;
  vomitingStatus: ChatVomitingStatus;
  energyStatus: ChatEnergyStatus;
  hasRespiratoryConcern: boolean;
  foodMentions: string[];
  dangerousFoodMentions: string[];
  extractedSymptoms: string[];
}

const PRIVACY_NOTICE =
  "이 기능은 카카오톡 채팅방을 직접 조회하지 않고, 사용자가 제공한 대화 내용 또는 캡처에서 추출된 텍스트만 분석합니다. 가족 이름, 전화번호, 주소 등 반려견 상태와 무관한 개인정보는 제외하거나 가린 뒤 사용하는 것을 권장합니다.";

const FOOD_KEYWORDS = [
  "포도",
  "샤인머스캣",
  "거봉",
  "건포도",
  "초콜릿",
  "초코",
  "양파",
  "마늘",
  "자일리톨",
  "카페인",
  "커피",
  "알코올",
  "술",
  "마카다미아",
  "아보카도",
  "생반죽",
  "닭가슴살",
  "사료",
  "간식",
  "우유",
  "치즈",
  "닭뼈",
  "고기",
];

export function summarizePetChatForVet(input: PetChatSummaryInput): PetChatSummaryResult {
  const merged = mergeDogProfile(input);
  const text = merged.chatText.trim();
  const normalizedText = normalize(text);
  const signals = extractSignals(text, normalizedText);
  const risk = classifyChatRisk(merged, signals, normalizedText);
  const riskPresentation = buildDailyRiskPresentation(
    risk.riskLevel,
    risk.riskReasons,
    signals.extractedSymptoms,
  );
  const timeline = extractTimeline(merged, text, normalizedText);
  const missingInfoQuestions = buildMissingInfoQuestions(merged, signals, timeline, normalizedText);
  const analyzedTextSummary = buildAnalyzedTextSummary(merged, signals, risk.riskLevel, riskPresentation);
  const questionsForVet = buildQuestionsForVet(signals, risk.riskLevel);
  const trendSummary = buildTrendSummary({
    dogName: normalizeOptional(merged.dogName) ?? "반려견",
    riskLevel: risk.riskLevel,
    mainSymptoms: signals.extractedSymptoms,
    appetite: signals.appetiteStatus,
    stool: signals.stoolStatus,
    vomiting: signals.vomitingStatus,
    energy: signals.energyStatus,
    recentRecords: merged.recentRecords,
  });
  const vetShareCard = buildVetShareCard({
    source: "chat_summary",
    dogName: merged.dogName,
    ageYears: merged.ageYears,
    weightKg: merged.weightKg,
    riskLevel: risk.riskLevel,
    riskPresentation,
    symptoms: signals.extractedSymptoms,
    timeline,
    appetite: signals.appetiteStatus,
    stool: signals.stoolStatus,
    vomiting: signals.vomitingStatus,
    energy: signals.energyStatus,
    foodOrSnackToday: signals.foodMentions,
    ownerConcern: buildProfileAwareMemo(merged.ownerMemo, merged.dogProfileUsage),
    missingInfoQuestions,
    questionsForVet,
    privacyNote: PRIVACY_NOTICE,
  });
  const kakaoActionText = buildKakaoActionText({
    source: "chat_summary",
    dogName: merged.dogName,
    riskLevel: risk.riskLevel,
    riskPresentation,
    mainSymptoms: signals.extractedSymptoms,
    knownInfo: buildProfileKnownInfo(merged.dogProfileUsage),
    missingInfoQuestions,
    foodName: signals.foodMentions.join(", "),
    familyContext: merged.sourceType === "screenshot_ocr"
      ? "가족 대화 캡처에서 호스트 Agent가 읽어낸 텍스트 기반"
      : "보호자가 제공한 대화 텍스트 기반",
    ownerConcern: merged.ownerMemo,
    vetShareCard,
    dogProfileUsage: merged.dogProfileUsage,
    trendSummary,
  });

  return {
    sourceType: merged.sourceType,
    dogName: normalizeOptional(merged.dogName),
    ageYears: merged.ageYears ?? null,
    weightKg: merged.weightKg ?? null,
    analyzedTextSummary,
    extractedTimeline: timeline,
    extractedSymptoms: signals.extractedSymptoms,
    appetiteStatus: signals.appetiteStatus,
    stoolStatus: signals.stoolStatus,
    vomitingStatus: signals.vomitingStatus,
    energyStatus: signals.energyStatus,
    foodMentions: signals.foodMentions,
    riskLevel: risk.riskLevel,
    riskReasons: risk.riskReasons,
    riskPresentation,
    missingInfoQuestions,
    dogProfileUsage: merged.dogProfileUsage,
    trendSummary,
    vetVisitSummary: buildVetVisitSummary(
      merged,
      signals,
      risk.riskLevel,
      risk.riskReasons,
      riskPresentation,
      timeline,
    ),
    vetShareCard,
    kakaoActionText,
    questionsForVet,
    privacyNotice: PRIVACY_NOTICE,
  };
}

function buildProfileKnownInfo(dogProfileUsage: DogProfileUsage): string[] {
  return dogProfileUsage.profileSummary !== "dogProfile이 제공되지 않았습니다."
    ? [`프로필 참고: ${dogProfileUsage.profileSummary}`]
    : [];
}

function buildProfileAwareMemo(
  ownerMemo: string | undefined,
  dogProfileUsage: DogProfileUsage,
): string | undefined {
  const parts = [
    normalizeOptional(ownerMemo),
    ...buildProfileKnownInfo(dogProfileUsage),
  ].filter((value): value is string => value !== null && value.length > 0);

  return parts.length > 0 ? parts.join(" / ") : undefined;
}

function extractSignals(text: string, normalizedText: string): ExtractedChatSignals {
  const appetiteStatus = extractAppetiteStatus(normalizedText);
  const stoolStatus = extractStoolStatus(normalizedText);
  const vomitingStatus = extractVomitingStatus(normalizedText);
  const energyStatus = extractEnergyStatus(normalizedText);
  const hasRespiratoryConcern = hasAny(normalizedText, [
    "숨을헐떡",
    "호흡이상",
    "숨이가빠",
    "숨이차",
    "캑캑",
    "켁켁",
  ]);
  const foodMentions = extractFoodMentions(text, normalizedText);
  const dangerousFoodMentions = foodMentions.filter(
    (food) => checkFoodSafety({ foodName: food }).riskLevel === "danger",
  );
  const extractedSymptoms = buildExtractedSymptoms({
    appetiteStatus,
    stoolStatus,
    vomitingStatus,
    energyStatus,
    hasRespiratoryConcern,
    foodMentions,
    dangerousFoodMentions,
  });

  return {
    appetiteStatus,
    stoolStatus,
    vomitingStatus,
    energyStatus,
    hasRespiratoryConcern,
    foodMentions,
    dangerousFoodMentions,
    extractedSymptoms,
  };
}

function extractAppetiteStatus(normalizedText: string): ChatAppetiteStatus {
  if (hasAny(normalizedText, ["전혀안먹", "하나도안먹", "아예안먹", "아무것도안먹"])) {
    return "none";
  }

  if (
    hasAny(normalizedText, [
      "밥을안먹",
      "밥안먹",
      "사료안먹",
      "사료를안먹",
      "식욕없",
      "식욕저하",
      "식욕부진",
      "거의안먹",
      "반만먹",
      "조금만먹",
      "덜먹",
      "입맛없",
    ])
  ) {
    return "less";
  }

  if (hasAny(normalizedText, ["식욕정상", "밥잘먹", "사료잘먹", "평소처럼먹"])) {
    return "normal";
  }

  return "unknown";
}

function extractStoolStatus(normalizedText: string): StoolStatus {
  if (hasAny(normalizedText, ["혈변", "피가섞", "피섞인변", "빨간변", "붉은변", "검붉은변"])) {
    return "bloody";
  }

  if (hasAny(normalizedText, ["설사", "물설사", "물변"])) {
    return "diarrhea";
  }

  if (hasAny(normalizedText, ["묽은변", "변이묽", "무른변", "변이무르", "묽은", "묽어", "무른", "물적"])) {
    return "soft";
  }

  if (hasAny(normalizedText, ["변정상", "정상변", "똥정상"])) {
    return "normal";
  }

  return "unknown";
}

function extractVomitingStatus(normalizedText: string): ChatVomitingStatus {
  if (hasAny(normalizedText, ["계속토", "여러번토", "반복구토", "구토여러번", "토를여러번"])) {
    return "multiple";
  }

  if (hasAny(normalizedText, ["한번토", "1번토", "구토한번", "구토1번", "토한번"])) {
    return "once";
  }

  if (hasAny(normalizedText, ["구토는없", "구토없", "토는안", "토안했", "토하지않", "토는없"])) {
    return "none";
  }

  return "unknown";
}

function extractEnergyStatus(normalizedText: string): ChatEnergyStatus {
  if (hasAny(normalizedText, ["일어나지못", "반응이없", "축늘어", "의식없", "쓰러", "기절"])) {
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
      "계속엎드려",
      "처져있",
    ])
  ) {
    return "low";
  }

  if (hasAny(normalizedText, ["활동량정상", "잘놀", "평소처럼움직"])) {
    return "normal";
  }

  return "unknown";
}

function extractFoodMentions(text: string, normalizedText: string): string[] {
  const mentions = FOOD_KEYWORDS.filter((keyword) => normalizedText.includes(normalize(keyword)));
  const foodSentences = splitTextUnits(text).filter((unit) =>
    hasAny(normalize(unit), ["먹었", "먹은", "먹", "삼켰", "씹", "간식", "사료"]),
  );

  for (const sentence of foodSentences) {
    const compactSentence = sentence.trim();
    if (compactSentence.length > 0 && compactSentence.length <= 80) {
      mentions.push(compactSentence);
    }
  }

  return uniqueStrings(mentions);
}

function buildExtractedSymptoms(signals: Omit<ExtractedChatSignals, "extractedSymptoms">): string[] {
  const symptoms: string[] = [];

  if (signals.appetiteStatus === "less") symptoms.push("식욕저하");
  if (signals.appetiteStatus === "none") symptoms.push("식욕 없음");
  if (signals.stoolStatus === "soft") symptoms.push("묽은 변");
  if (signals.stoolStatus === "diarrhea") symptoms.push("설사");
  if (signals.stoolStatus === "bloody") symptoms.push("혈변 의심");
  if (signals.vomitingStatus === "once") symptoms.push("구토 1회");
  if (signals.vomitingStatus === "multiple") symptoms.push("반복 구토");
  if (signals.energyStatus === "low") symptoms.push("활동량 감소/무기력");
  if (signals.energyStatus === "very_low") symptoms.push("심한 무기력");
  if (signals.hasRespiratoryConcern) symptoms.push("호흡 이상 의심");
  if (signals.dangerousFoodMentions.length > 0) symptoms.push("위험 음식 섭취 가능성");

  return uniqueStrings(symptoms);
}

function classifyChatRisk(
  input: PetChatSummaryInput,
  signals: ExtractedChatSignals,
  normalizedText: string,
): { riskLevel: DailyRiskLevel; riskReasons: string[] } {
  const urgentReasons: string[] = [];

  if (signals.stoolStatus === "bloody") urgentReasons.push("혈변으로 보이는 표현이 있습니다.");
  if (signals.vomitingStatus === "multiple") urgentReasons.push("반복 구토로 보이는 표현이 있습니다.");
  if (signals.hasRespiratoryConcern) urgentReasons.push("호흡 이상으로 보이는 표현이 있습니다.");
  if (signals.energyStatus === "very_low") urgentReasons.push("심한 무기력 또는 반응 저하로 보이는 표현이 있습니다.");
  if (signals.dangerousFoodMentions.length > 0) {
    urgentReasons.push(
      `위험 음식 섭취 가능성이 있습니다: ${signals.dangerousFoodMentions.join(", ")}. 빠른 동물병원 상담 권장 상황입니다.`,
    );
  }

  if (urgentReasons.length > 0) {
    return {
      riskLevel: "urgent",
      riskReasons: ["빠른 동물병원 상담 권장 신호가 포함되어 있습니다.", ...urgentReasons],
    };
  }

  const consultReasons: string[] = [];
  const hasDurationConcern = hasAny(normalizedText, ["어제", "하루", "24시간", "계속", "지속", "이틀", "며칠"]);
  const hasDigestiveCombo =
    signals.appetiteStatus !== "unknown" &&
    signals.appetiteStatus !== "normal" &&
    (signals.stoolStatus === "soft" || signals.stoolStatus === "diarrhea");

  if (signals.appetiteStatus === "none") {
    consultReasons.push("식욕이 없는 것으로 보이는 표현이 있습니다.");
  }

  if (hasDigestiveCombo && (signals.energyStatus === "low" || hasDurationConcern)) {
    consultReasons.push("식욕 변화와 변 상태 변화가 함께 있고, 지속 또는 활동량 감소 표현이 있습니다.");
  }

  if (
    input.ageYears !== undefined &&
    input.ageYears >= 10 &&
    (signals.appetiteStatus === "less" || signals.energyStatus === "low")
  ) {
    consultReasons.push("노령견의 식욕 저하 또는 활동량 감소 표현이 있어 상담을 고려하는 것이 좋습니다.");
  }

  if (signals.stoolStatus === "diarrhea" && hasDurationConcern) {
    consultReasons.push("설사로 보이는 표현과 지속 시간 표현이 함께 있습니다.");
  }

  if (consultReasons.length > 0) {
    return { riskLevel: "vet_consult", riskReasons: consultReasons };
  }

  if (
    signals.stoolStatus === "soft" ||
    signals.stoolStatus === "diarrhea" ||
    signals.appetiteStatus === "less" ||
    signals.energyStatus === "low" ||
    signals.vomitingStatus === "once"
  ) {
    return {
      riskLevel: "watch",
      riskReasons: ["관찰이 필요한 이상 신호가 일부 포함되어 있습니다."],
    };
  }

  if (signals.extractedSymptoms.length === 0 && hasAny(normalizedText, ["정상", "괜찮", "평소"])) {
    return {
      riskLevel: "normal",
      riskReasons: ["제공된 텍스트에서 뚜렷한 이상 신호가 확인되지 않았습니다."],
    };
  }

  return {
    riskLevel: "watch",
    riskReasons: ["정보가 부족하여 보수적으로 관찰 단계로 분류했습니다."],
  };
}

function extractTimeline(
  input: PetChatSummaryInput,
  text: string,
  normalizedText: string,
): string[] {
  const timeline: string[] = [];

  if (input.chatStartedAt !== undefined) timeline.push(`대화 시작: ${input.chatStartedAt}`);
  if (input.chatEndedAt !== undefined) timeline.push(`대화 종료: ${input.chatEndedAt}`);
  if (input.screenshotTakenAt !== undefined) timeline.push(`캡처 시점: ${input.screenshotTakenAt}`);

  for (const unit of splitTextUnits(text)) {
    const normalizedUnit = normalize(unit);
    if (
      hasAny(normalizedUnit, [
        "방금",
        "오늘",
        "아침",
        "점심",
        "저녁",
        "밤",
        "어제",
        "30분",
        "1시간",
        "2시간",
        "하루",
        "계속",
        "지속",
      ])
    ) {
      timeline.push(unit.trim());
    }
  }

  if (timeline.length === 0 && hasAny(normalizedText, ["언제", "부터"])) {
    timeline.push("대화 안에 증상 시작 시점으로 보이는 표현이 있으나 구체적인 시간은 불분명합니다.");
  }

  return uniqueStrings(timeline).slice(0, 8);
}

function buildMissingInfoQuestions(
  input: PetChatSummaryInput,
  signals: ExtractedChatSignals,
  timeline: string[],
  normalizedText: string,
): string[] {
  const questions: string[] = [];

  if (timeline.length === 0) {
    questions.push("증상이 정확히 언제부터 시작됐나요?");
  }

  if (!hasAny(normalizedText, ["물", "수분", "음수"])) {
    questions.push("오늘 물은 평소처럼 마셨나요?");
  }

  if (signals.stoolStatus === "unknown") {
    questions.push("변 상태와 배변 횟수를 확인해 주세요.");
  } else if (signals.stoolStatus === "soft" || signals.stoolStatus === "diarrhea") {
    questions.push("묽은 변이나 설사는 몇 번 있었나요?");
  }

  if (signals.vomitingStatus === "unknown") {
    questions.push("구토가 있었다면 몇 번, 언제 있었나요?");
  }

  if (!signals.hasRespiratoryConcern && signals.energyStatus !== "very_low" && signals.stoolStatus !== "bloody") {
    questions.push("혈변, 호흡 이상, 심한 무기력 같은 변화가 있었나요?");
  }

  if (signals.foodMentions.length === 0) {
    questions.push("최근 먹은 음식이나 간식, 위험할 수 있는 음식이 있었나요?");
  }

  if (input.ageYears === undefined || input.weightKg === undefined) {
    questions.push("반려견 나이와 몸무게를 확인해 주세요.");
  }

  return uniqueStrings(questions);
}

function buildAnalyzedTextSummary(
  input: PetChatSummaryInput,
  signals: ExtractedChatSignals,
  riskLevel: DailyRiskLevel,
  riskPresentation: RiskPresentation,
): string {
  const sourceLabel = sourceTypeToKorean(input.sourceType);
  const profileLabel = [
    normalizeOptional(input.dogName) ?? "반려견",
    input.ageYears !== undefined ? `${input.ageYears}살` : null,
    input.weightKg !== undefined ? `${input.weightKg}kg` : null,
  ].filter((value): value is string => value !== null).join(" / ");
  const symptomText = signals.extractedSymptoms.length > 0 ? signals.extractedSymptoms.join(", ") : "뚜렷한 증상 표현 없음";
  const foodText = signals.foodMentions.length > 0 ? signals.foodMentions.join(", ") : "음식 언급 없음";

  return `${riskPresentation.riskBadge}: ${profileLabel}의 ${sourceLabel}에서 ${symptomText}을 확인했고, 음식 관련 언급은 ${foodText}입니다. 현재 기록 기준 위험도는 ${riskLevel}이며, ${riskPresentation.riskLabel} 단계입니다.`;
}

function buildVetVisitSummary(
  input: PetChatSummaryInput,
  signals: ExtractedChatSignals,
  riskLevel: DailyRiskLevel,
  riskReasons: string[],
  riskPresentation: RiskPresentation,
  timeline: string[],
): string {
  const profile = [
    input.dogName ?? "이름 미입력 반려견",
    input.ageYears !== undefined ? `${input.ageYears}살` : "나이 미입력",
    input.weightKg !== undefined ? `${input.weightKg}kg` : "몸무게 미입력",
  ].join(" / ");
  const sourceLabel = sourceTypeToKorean(input.sourceType);
  const symptoms = signals.extractedSymptoms.length > 0 ? signals.extractedSymptoms.join(", ") : "대화에서 뚜렷한 증상 표현은 확인되지 않음";
  const foods = signals.foodMentions.length > 0 ? signals.foodMentions.join(", ") : "음식 관련 언급 없음";
  const timelineText = timeline.length > 0 ? timeline.join(" / ") : "증상 시작 시점 미확인";
  const reasons = riskReasons.length > 0 ? riskReasons.join(" ") : "추가 확인 필요.";
  const memo = input.ownerMemo !== undefined && input.ownerMemo.trim().length > 0
    ? ` 보호자 메모: ${input.ownerMemo.trim()}`
    : "";

  return `${riskPresentation.riskBadge} ${riskPresentation.riskLabel}. ${profile}입니다. 보호자가 제공한 ${sourceLabel} 내용을 기준으로 ${symptoms} 표현이 확인되었습니다. 식욕 상태: ${signals.appetiteStatus}, 변 상태: ${signals.stoolStatus}, 구토: ${signals.vomitingStatus}, 활동량: ${signals.energyStatus}. 시간 관련 내용: ${timelineText}. 음식 관련 언급: ${foods}. 기록 기준 위험도는 ${riskLevel}이며, 판단 이유는 ${reasons} 바로 할 일: ${riskPresentation.immediateAction}${memo} 이 내용은 보호자 제공 텍스트 기반 요약이므로 정확한 판단은 수의사 상담이 필요합니다.`;
}

function buildQuestionsForVet(signals: ExtractedChatSignals, riskLevel: DailyRiskLevel): string[] {
  const questions = [
    "현재 기록된 증상에서 우선 확인해야 할 위험 신호가 무엇인지 상담하고 싶습니다.",
    "오늘 중 병원 방문이 필요한 상태인지 확인이 필요합니다.",
    "수분 섭취와 배변 횟수를 어떻게 관찰하면 좋을까요?",
  ];

  if (signals.foodMentions.length > 0) {
    questions.push("최근 먹은 음식이 현재 상태와 관련될 수 있는지 상담하고 싶습니다.");
  }

  if (riskLevel === "urgent") {
    questions.push("빠른 진료가 필요한 상황인지 바로 확인하고 싶습니다.");
  } else {
    questions.push("어떤 변화가 보이면 바로 다시 연락하거나 방문해야 하는지 알고 싶습니다.");
  }

  return questions.slice(0, 5);
}

function sourceTypeToKorean(sourceType: ChatSummarySourceType): string {
  if (sourceType === "pasted_text") return "붙여넣은 대화 텍스트";
  if (sourceType === "screenshot_ocr") return "캡처에서 추출된 텍스트";
  return "보호자 직접 메모";
}

function splitTextUnits(text: string): string[] {
  return text
    .split(/[\n.!?。！？]+/)
    .map((unit) => unit.trim())
    .filter((unit) => unit.length > 0);
}

function hasAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(normalize(keyword)));
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

function normalizeOptional(value: string | undefined): string | null {
  if (value === undefined || value.trim().length === 0) {
    return null;
  }

  return value.trim();
}
