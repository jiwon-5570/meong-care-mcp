export type ToolChainToolName =
  | "check_food_safety"
  | "analyze_daily_status"
  | "create_daily_care_note"
  | "recommend_daily_care"
  | "create_vet_visit_summary"
  | "summarize_pet_chat_for_vet"
  | "find_nearby_animal_hospitals"
  | "classify_pet_symptom"
  | "record_pet_photo_observation"
  | "record_food_ingestion_event";

export type ToolChainPriority = "low" | "medium" | "high";
export type VetContactMode =
  | "existing_vet_first"
  | "ask_guardian_existing_vet"
  | "hospital_search_on_request"
  | "emergency_contact_needed";

export interface RecommendedNextTool {
  toolName: ToolChainToolName;
  reason: string;
  when: string;
  priority: ToolChainPriority;
  userConfirmationNeeded: boolean;
  prefilledInputHint?: Record<string, unknown>;
}

export interface VetContactGuide {
  mode: VetContactMode;
  existingVetName?: string;
  existingVetPhone?: string;
  primaryMessage: string;
  callScriptHint: string;
  hospitalSearchOptInPrompt: string;
  shouldAutoSearchHospital: false;
}

export interface ToolChainGuide {
  currentStep: string;
  recommendedNextTools: RecommendedNextTool[];
  vetContactGuide?: VetContactGuide;
  stopCondition: string;
  userConfirmationNeeded: boolean;
}

export interface ToolChainGuideInput {
  source:
    | "food_safety"
    | "daily_status"
    | "daily_care_note"
    | "food_ingestion"
    | "chat_summary"
    | "photo_observation"
    | "vet_visit_summary";
  riskLevel?: string;
  foodRiskLevel?: string;
  dogName?: string | null;
  region?: string | null;
  ownerRequestedHospitalSearch?: boolean;
  ownerRequestedNearbyHospital?: boolean;
  ownerRequestedEmergencyHospital?: boolean;
  vetClinicName?: string | null;
  vetPhone?: string | null;
  hasVetShareCard?: boolean;
  hasVetCallScript?: boolean;
  missingInfoQuestions?: string[];
}

const SOURCE_LABELS: Record<ToolChainGuideInput["source"], string> = {
  food_safety: "음식 안전 확인",
  daily_status: "오늘 상태 분석",
  daily_care_note: "오늘 케어 노트 생성",
  food_ingestion: "위험 음식 섭취 기록",
  chat_summary: "가족 대화 요약",
  photo_observation: "사진 관찰 기록",
  vet_visit_summary: "병원 상담용 요약 생성",
};

const HOSPITAL_SEARCH_KEYWORDS = [
  "병원찾아",
  "병원알려",
  "근처병원",
  "가까운병원",
  "가까운동물병원",
  "동물병원찾아",
  "야간병원",
  "응급병원",
  "지금갈수있는병원",
  "여행지근처병원",
];

const HOSPITAL_SEARCH_NEGATIONS = [
  "병원검색은아직하지마",
  "병원검색하지마",
  "병원은찾지마",
  "병원찾지마",
  "병원검색은하지마",
  "병원검색은아직하지않",
];

export function detectHospitalSearchRequest(text: string | undefined): boolean {
  const normalized = normalize(text ?? "");
  if (normalized.length === 0) return false;
  if (HOSPITAL_SEARCH_NEGATIONS.some((keyword) => normalized.includes(keyword))) return false;
  return HOSPITAL_SEARCH_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function detectEmergencyHospitalSearchRequest(text: string | undefined): boolean {
  const normalized = normalize(text ?? "");
  return detectHospitalSearchRequest(text) && ["야간병원", "응급병원", "지금갈수있는병원"].some(
    (keyword) => normalized.includes(keyword),
  );
}

export function buildToolChainGuide(input: ToolChainGuideInput): ToolChainGuide {
  const searchRequested = input.ownerRequestedHospitalSearch === true ||
    input.ownerRequestedNearbyHospital === true ||
    input.ownerRequestedEmergencyHospital === true;
  const recommendedNextTools = buildRecommendedNextTools(input, searchRequested);
  const vetContactGuide = buildVetContactGuide(input, searchRequested);

  return {
    currentStep: SOURCE_LABELS[input.source],
    recommendedNextTools,
    vetContactGuide,
    stopCondition: buildStopCondition(input, recommendedNextTools),
    userConfirmationNeeded: recommendedNextTools.some((tool) => tool.userConfirmationNeeded),
  };
}

function buildRecommendedNextTools(
  input: ToolChainGuideInput,
  searchRequested: boolean,
): RecommendedNextTool[] {
  const tools: RecommendedNextTool[] = [];
  const riskLevel = input.foodRiskLevel ?? input.riskLevel;
  const hasMissingInfo = (input.missingInfoQuestions?.length ?? 0) > 0;
  const needsVetPreparation = riskLevel === "vet_consult" || riskLevel === "urgent" || riskLevel === "danger";

  if (input.source === "food_safety" && riskLevel === "danger") {
    tools.push({
      toolName: "record_food_ingestion_event",
      reason: "위험할 수 있는 음식의 섭취량, 시간, 몸무게와 현재 증상을 병원 상담용으로 기록하기 위해 필요합니다.",
      when: "보호자가 실제 섭취 가능성을 확인했거나 기록을 남기려는 경우",
      priority: "high",
      userConfirmationNeeded: false,
    });
  }

  if (input.source === "daily_status" && hasMissingInfo) {
    tools.push({
      toolName: "create_daily_care_note",
      reason: "부족한 정보를 보완해 오늘 관리 행동과 병원 상담 준비를 한 번에 정리할 수 있습니다.",
      when: "보호자가 추가 상태 정보를 제공한 뒤",
      priority: "medium",
      userConfirmationNeeded: false,
    });
  }

  if (input.source === "daily_status" && needsVetPreparation) {
    tools.push({
      toolName: "create_vet_visit_summary",
      reason: "현재 기록을 동물병원 상담 때 보여줄 수 있는 형식으로 정리하기 위해 필요합니다.",
      when: "보호자가 병원 연락 또는 방문을 준비할 때",
      priority: riskLevel === "urgent" ? "high" : "medium",
      userConfirmationNeeded: false,
    });
  }

  if (input.source === "daily_care_note" && hasMissingInfo) {
    tools.push({
      toolName: "analyze_daily_status",
      reason: "확인되지 않은 식욕, 구토, 변 상태 또는 활동량을 추가해 위험도를 다시 구조화할 수 있습니다.",
      when: "보호자가 부족한 정보에 답한 뒤",
      priority: "medium",
      userConfirmationNeeded: false,
    });
  }

  if (input.source === "daily_care_note" && needsVetPreparation) {
    tools.push({
      toolName: "create_vet_visit_summary",
      reason: "오늘 케어 노트의 증상과 상태를 병원에 전달할 별도 상담 문장으로 정리할 수 있습니다.",
      when: "보호자가 기존 병원에 연락하거나 방문용 요약을 따로 준비하려는 경우",
      priority: riskLevel === "urgent" ? "high" : "medium",
      userConfirmationNeeded: false,
    });
  }

  if (input.source === "food_ingestion" && hasMissingInfo) {
    tools.push({
      toolName: "analyze_daily_status",
      reason: "음식 섭취 이후 식욕, 구토, 변 상태와 활동량을 함께 확인하기 위해 필요합니다.",
      when: "현재 증상이나 일상 상태 정보가 추가로 확인된 경우",
      priority: "medium",
      userConfirmationNeeded: false,
    });
  }

  if (input.source === "chat_summary") {
    tools.push({
      toolName: "create_daily_care_note",
      reason: "가족 대화에서 정리된 증상을 오늘 관리 행동과 연결할 수 있습니다.",
      when: "보호자가 오늘의 식단, 산책, 휴식 관리까지 함께 확인하려는 경우",
      priority: "medium",
      userConfirmationNeeded: false,
    });
  }

  if (input.source === "photo_observation" && hasMissingInfo) {
    tools.push({
      toolName: "analyze_daily_status",
      reason: "사진 관찰 외에 식욕, 구토, 변 상태와 활동량을 함께 구조화하기 위해 필요합니다.",
      when: "보호자가 부족한 일상 상태 정보를 제공한 뒤",
      priority: "medium",
      userConfirmationNeeded: false,
    });
  }

  if (input.source === "photo_observation" && needsVetPreparation) {
    tools.push({
      toolName: "create_vet_visit_summary",
      reason: "사진 관찰 텍스트와 동반 증상을 병원 상담용 문장으로 정리하기 위해 필요합니다.",
      when: "보호자가 기존 병원에 연락하거나 방문을 준비할 때",
      priority: riskLevel === "urgent" ? "high" : "medium",
      userConfirmationNeeded: false,
    });
  }

  if (searchRequested) {
    const emergencySearch = input.ownerRequestedEmergencyHospital === true;
    tools.push({
      toolName: "find_nearby_animal_hospitals",
      reason: emergencySearch
        ? "보호자가 야간 또는 응급 병원 후보 검색을 명시적으로 요청했습니다."
        : "보호자가 가까운 동물병원 후보 검색을 명시적으로 요청했습니다.",
      when: "보호자가 병원 검색을 명시적으로 요청했고 지역 정보가 제공되었거나 추가 확인 가능한 경우",
      priority: emergencySearch ? "high" : "medium",
      userConfirmationNeeded: true,
      ...(cleanText(input.region) !== undefined
        ? { prefilledInputHint: { region: cleanText(input.region) } }
        : {}),
    });
  }

  return uniqueTools(tools);
}

function buildVetContactGuide(
  input: ToolChainGuideInput,
  searchRequested: boolean,
): VetContactGuide {
  const existingVetName = cleanText(input.vetClinicName);
  const existingVetPhone = cleanText(input.vetPhone);
  const hasExistingVet = existingVetName !== undefined || existingVetPhone !== undefined;
  const urgent = input.riskLevel === "urgent" || input.foodRiskLevel === "danger";
  const existingVetLabel = [existingVetName, existingVetPhone]
    .filter((value): value is string => value !== undefined)
    .join(" / ");

  if (searchRequested) {
    return {
      mode: "hospital_search_on_request",
      ...(existingVetName !== undefined ? { existingVetName } : {}),
      ...(existingVetPhone !== undefined ? { existingVetPhone } : {}),
      primaryMessage: hasExistingVet
        ? `병원 검색 요청을 확인했습니다. 가능하면 먼저 평소 다니던 병원(${existingVetLabel})에 연락하고, 다른 병원 후보가 필요하면 지역을 확인해 검색해 주세요.`
        : "병원 검색 요청을 확인했습니다. 평소 다니던 병원이 있으면 먼저 연락하고, 주변 병원 후보는 지역을 확인한 뒤 검색해 주세요.",
      callScriptHint: buildCallScriptHint(input.hasVetCallScript),
      hospitalSearchOptInPrompt: "병원 후보 검색을 진행하려면 지역과 함께 검색 요청을 확인해 주세요.",
      shouldAutoSearchHospital: false,
    };
  }

  if (hasExistingVet) {
    return {
      mode: "existing_vet_first",
      ...(existingVetName !== undefined ? { existingVetName } : {}),
      ...(existingVetPhone !== undefined ? { existingVetPhone } : {}),
      primaryMessage: urgent
        ? `빠른 상담 권장 상황입니다. 먼저 평소 다니던 병원(${existingVetLabel})에 연락해 현재 상황을 설명해 주세요.`
        : `먼저 평소 다니던 병원(${existingVetLabel})에 연락해 현재 상황을 설명하는 것을 권장합니다.`,
      callScriptHint: buildCallScriptHint(input.hasVetCallScript),
      hospitalSearchOptInPrompt: "다른 병원이나 가까운 병원이 필요하면 “근처 동물병원 찾아줘”라고 요청해 주세요.",
      shouldAutoSearchHospital: false,
    };
  }

  return {
    mode: "ask_guardian_existing_vet",
    primaryMessage: urgent
      ? "빠른 상담 권장 상황입니다. 평소 다니던 동물병원이나 보호자가 신뢰하는 병원에 먼저 연락해 주세요."
      : "평소 다니던 동물병원이나 보호자가 신뢰하는 병원에 먼저 연락해 상담받는 것을 권장합니다.",
    callScriptHint: buildCallScriptHint(input.hasVetCallScript),
    hospitalSearchOptInPrompt: "주변 병원 후보가 필요하면 지역과 함께 “근처 동물병원 찾아줘”라고 요청해 주세요.",
    shouldAutoSearchHospital: false,
  };
}

function buildCallScriptHint(hasVetCallScript: boolean | undefined): string {
  return hasVetCallScript === true
    ? "kakaoActionText.vetCallScript를 전화 상담 때 그대로 읽으면 됩니다."
    : "현재 증상, 시작 시점, 먹은 음식과 활동량을 정리해 전화 상담 때 전달해 주세요.";
}

function buildStopCondition(
  input: ToolChainGuideInput,
  recommendedNextTools: RecommendedNextTool[],
): string {
  if (input.hasVetShareCard === true && input.hasVetCallScript === true) {
    return "기존 병원에 전달할 요약과 전화 문장이 준비되면 자동 tool chaining을 멈추고 보호자의 다음 요청을 기다립니다.";
  }

  if (recommendedNextTools.length === 0) {
    return "현재 안내를 제공한 뒤 보호자의 추가 정보나 명시적인 다음 요청을 기다립니다.";
  }

  return "추천된 다음 단계 결과를 제공한 뒤 추가 tool 호출은 보호자의 요청 또는 확인이 있을 때 진행합니다.";
}

function uniqueTools(tools: RecommendedNextTool[]): RecommendedNextTool[] {
  return tools.filter(
    (tool, index) => tools.findIndex((candidate) => candidate.toolName === tool.toolName) === index,
  );
}

function cleanText(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}
