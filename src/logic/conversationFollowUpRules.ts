export type ConversationFollowUpSource =
  | "daily_status"
  | "daily_care_note"
  | "food_safety"
  | "food_ingestion"
  | "chat_summary"
  | "photo_observation"
  | "vet_visit_summary";

export interface ConversationFollowUpInput {
  source: ConversationFollowUpSource;
  dogName?: string | null;
  riskLevel?: string;
  foodRiskLevel?: string;
  photoType?: "stool" | "skin";
  mainSymptoms?: string[];
  observedSigns?: string[];
  missingInfoQuestions?: string[];
  hasVetShareCard?: boolean;
  hasVetCallScript?: boolean;
  hasFamilyShareText?: boolean;
  hasPhotoFollowUpGuide?: boolean;
  hasIngredientSelectionGuide?: boolean;
  hasIngredientNutritionSummary?: boolean;
  ownerRequestedHospitalSearch?: boolean;
}

export interface ConversationFollowUp {
  assistantFollowUpQuestion: string;
  suggestedUserReplies: string[];
  nextBestActionLabel: string;
  nextBestActionReason: string;
  shouldAskFollowUp: boolean;
}

interface FollowUpContent {
  assistantFollowUpQuestion: string;
  suggestedUserReplies: string[];
  nextBestActionLabel: string;
  nextBestActionReason: string;
}

export function buildConversationFollowUp(
  input: ConversationFollowUpInput,
): ConversationFollowUp {
  const content = buildSourceContent(input);
  const suggestedUserReplies = addHospitalSearchReply(
    addIngredientReply(content.suggestedUserReplies, input),
    input,
  );

  return {
    ...content,
    suggestedUserReplies,
    shouldAskFollowUp: true,
  };
}

function buildSourceContent(input: ConversationFollowUpInput): FollowUpContent {
  switch (input.source) {
    case "photo_observation":
      return buildPhotoFollowUp(input);
    case "food_ingestion":
      return buildFoodIngestionFollowUp(input);
    case "daily_status":
    case "daily_care_note":
      return buildDailyFollowUp(input);
    case "chat_summary":
      return {
        assistantFollowUpQuestion:
          "가족방 내용 기준으로 병원에 보여줄 요약문을 더 짧게 정리해드릴까요?",
        suggestedUserReplies: [
          "응, 병원에 보여줄 요약으로 정리해줘",
          "가족방에 다시 보낼 말로 정리해줘",
          "오늘 케어 체크리스트 만들어줘",
        ],
        nextBestActionLabel: "병원 공유용 요약 다듬기",
        nextBestActionReason:
          "가족 대화에서 확인된 상태와 시간 흐름을 짧게 정리하면 병원 상담 때 전달하기 쉽습니다.",
      };
    case "food_safety":
      return buildFoodSafetyFollowUp(input);
    case "vet_visit_summary":
      return {
        assistantFollowUpQuestion:
          "이 내용을 병원 접수나 전화 상담 때 바로 읽을 수 있게 더 짧게 정리해드릴까요?",
        suggestedUserReplies: [
          "응, 전화용으로 더 짧게 정리해줘",
          "가족방 공유용으로 바꿔줘",
          "수의사에게 물어볼 질문만 모아줘",
        ],
        nextBestActionLabel: "병원 전화용 문장 만들기",
        nextBestActionReason:
          "핵심 증상과 시작 시점을 짧게 정리하면 접수나 전화 상담 때 빠뜨리지 않고 전달할 수 있습니다.",
      };
  }
}

function buildPhotoFollowUp(input: ConversationFollowUpInput): FollowUpContent {
  if (isConsultPriority(input)) {
    return {
      assistantFollowUpQuestion:
        "병원에 바로 전달할 수 있도록 현재 관찰 내용과 전화 상담 문장을 정리해드릴까요?",
      suggestedUserReplies: [
        "응, 병원 상담용으로 정리해줘",
        "가족방에 공유할 말로 정리해줘",
        "다음에 어떻게 관찰하면 좋을지 알려줘",
      ],
      nextBestActionLabel: "병원 상담용 요약 만들기",
      nextBestActionReason: buildSignalReason(
        input,
        "주의가 필요한 관찰 내용이 있어 병원에 전달할 정보를 미리 정리하면 상담이 쉬워집니다.",
      ),
    };
  }

  if (input.photoType === "skin") {
    return {
      assistantFollowUpQuestion:
        "병원에 상담받으실 수 있도록 피부 관찰 내용과 상담 문장을 정리해드릴까요?",
      suggestedUserReplies: [
        "응, 병원 상담용으로 정리해줘",
        "가족방에 공유할 말로 정리해줘",
        "다음에 같은 부위를 어떻게 찍으면 좋을지 알려줘",
      ],
      nextBestActionLabel: "피부 관찰 기록 정리하기",
      nextBestActionReason: buildSignalReason(
        input,
        "같은 부위의 범위와 색 변화를 이어서 기록하면 상담과 변화 비교에 도움이 됩니다.",
      ),
    };
  }

  return {
    assistantFollowUpQuestion:
      "다음 배변 기록과 비교할 수 있도록 관찰 포인트를 정리해드릴까요?",
    suggestedUserReplies: [
      "응, 다음 관찰 포인트 알려줘",
      "병원 상담용 요약 만들어줘",
      "가족방에 공유할 말로 정리해줘",
    ],
    nextBestActionLabel: "다음 배변 비교 항목 만들기",
    nextBestActionReason: buildSignalReason(
      input,
      "변의 색, 형태, 횟수를 같은 기준으로 기록하면 다음 배변과 비교하기 쉽습니다.",
    ),
  };
}

function buildFoodIngestionFollowUp(input: ConversationFollowUpInput): FollowUpContent {
  if (resolveRiskLevel(input) === "danger") {
    return {
      assistantFollowUpQuestion:
        "병원에 전화하실 수 있도록 먹은 음식, 양, 시간, 현재 증상을 상담 문장으로 정리해드릴까요?",
      suggestedUserReplies: [
        "응, 병원 전화 문장 만들어줘",
        "가족방에 공유할 말로 정리해줘",
        "먹은 양과 시간을 추가로 기록할게",
      ],
      nextBestActionLabel: "병원 전화 상담 준비하기",
      nextBestActionReason:
        "위험할 수 있는 음식 섭취는 음식 종류, 양, 시간, 현재 증상을 빠르게 전달할 준비가 중요합니다.",
    };
  }

  return {
    assistantFollowUpQuestion: "먹은 음식과 이후 관찰할 증상을 기록해드릴까요?",
    suggestedUserReplies: [
      "응, 관찰할 증상 정리해줘",
      "가족방에 공유할 말로 정리해줘",
      "먹은 양과 시간을 추가로 기록할게",
    ],
    nextBestActionLabel: "섭취 후 관찰 기록 만들기",
    nextBestActionReason:
      "먹은 내용과 이후 상태 변화를 함께 기록하면 이상 신호를 비교하고 상담할 때 도움이 됩니다.",
  };
}

function buildDailyFollowUp(input: ConversationFollowUpInput): FollowUpContent {
  const riskLevel = resolveRiskLevel(input);

  if (riskLevel === "normal") {
    return {
      assistantFollowUpQuestion:
        "오늘 기록을 기준점으로 남기고, 다음 기록 때 비교할 포인트를 정리해드릴까요?",
      suggestedUserReplies: [
        "응, 오늘 기록을 기준으로 남겨줘",
        "다음 기록 때 비교할 항목 알려줘",
        "가족방에 공유할 말 만들어줘",
      ],
      nextBestActionLabel: "오늘 상태를 기준 기록으로 남기기",
      nextBestActionReason:
        "현재 상태를 기준으로 남겨두면 식욕, 변, 구토, 활동량의 변화를 다음 기록에서 비교하기 쉽습니다.",
    };
  }

  if (riskLevel === "watch") {
    return {
      assistantFollowUpQuestion:
        "오늘 저녁이나 내일 아침에 다시 확인할 항목을 체크리스트로 정리해드릴까요?",
      suggestedUserReplies: [
        "응, 다음 확인 항목 알려줘",
        "가족방에 공유할 말 만들어줘",
        "병원 상담용 기록도 준비해줘",
      ],
      nextBestActionLabel: "재확인 체크리스트 만들기",
      nextBestActionReason: buildSignalReason(
        input,
        "현재 관찰 신호가 변하는지 같은 기준으로 다시 확인하면 다음 판단에 도움이 됩니다.",
      ),
    };
  }

  return {
    assistantFollowUpQuestion:
      "병원에 상담받으실 수 있도록 증상과 상담 내용을 정리해드릴까요?",
    suggestedUserReplies: [
      "응, 병원 상담용으로 정리해줘",
      "가족방에 공유할 말 만들어줘",
      "다음 확인 항목 알려줘",
    ],
    nextBestActionLabel: "병원 상담용 요약 만들기",
    nextBestActionReason: buildSignalReason(
      input,
      "상담을 고려할 신호가 있어 증상과 시작 시점, 현재 상태를 미리 정리하면 전달하기 쉽습니다.",
    ),
  };
}

function buildFoodSafetyFollowUp(input: ConversationFollowUpInput): FollowUpContent {
  if (resolveRiskLevel(input) === "danger") {
    return {
      assistantFollowUpQuestion:
        "실제로 먹은 양과 시간을 기록해서 병원 상담용 문장으로 정리해드릴까요?",
      suggestedUserReplies: [
        "응, 병원 상담용으로 정리해줘",
        "먹은 양과 시간을 추가할게",
        "가족방에 공유할 말 만들어줘",
      ],
      nextBestActionLabel: "위험 음식 섭취 기록 만들기",
      nextBestActionReason:
        "먹은 양과 시간, 몸무게, 현재 증상을 함께 정리하면 병원에 빠르게 전달할 수 있습니다.",
    };
  }

  if (input.hasIngredientNutritionSummary === true) {
    return {
      assistantFollowUpQuestion:
        "이 원료의 영양성분 기준으로 급여 전 주의점과 관찰 포인트를 정리해드릴까요?",
      suggestedUserReplies: [
        "응, 급여 전 주의점 알려줘",
        "다른 원료와 비교해줘",
        "가족방에 공유할 식단 주의사항으로 정리해줘",
      ],
      nextBestActionLabel: "원료 급여 전 확인사항 정리하기",
      nextBestActionReason:
        "영양성분과 실제 급여량, 처음 먹는지 여부를 함께 확인하면 변화 관찰 기준을 세우기 쉽습니다.",
    };
  }

  return {
    assistantFollowUpQuestion:
      "급여 전에 확인할 양, 처음 먹는지 여부, 이후 관찰 포인트를 정리해드릴까요?",
    suggestedUserReplies: [
      "응, 급여 전 확인사항 알려줘",
      "처음 먹을 때 관찰할 항목 알려줘",
      "가족방에 공유할 말 만들어줘",
    ],
    nextBestActionLabel: "급여 전 확인사항 정리하기",
    nextBestActionReason:
      "급여량과 기존 섭취 경험, 이후 상태 변화를 함께 확인하면 일상 식단 기록에 도움이 됩니다.",
  };
}

function addIngredientReply(
  replies: string[],
  input: ConversationFollowUpInput,
): string[] {
  const ingredientReply = input.hasIngredientSelectionGuide === true
    ? "가족방에 공유할 식단 주의사항으로 정리해줘"
    : input.hasIngredientNutritionSummary === true
      ? "이 원료를 다른 원료와 비교해줘"
      : undefined;
  const merged = ingredientReply !== undefined ? [...replies, ingredientReply] : replies;
  return Array.from(new Set(merged)).slice(0, 4);
}

function addHospitalSearchReply(
  replies: string[],
  input: ConversationFollowUpInput,
): string[] {
  const riskLevel = resolveRiskLevel(input);

  if (riskLevel !== "vet_consult" && riskLevel !== "urgent") {
    return replies;
  }

  const hospitalSearchReply = "근처 동물병원 찾아줘";
  return Array.from(
    new Set([
      ...replies.slice(0, 2),
      hospitalSearchReply,
      ...replies.slice(2),
    ]),
  ).slice(0, 4);
}

function isConsultPriority(input: ConversationFollowUpInput): boolean {
  const riskLevel = resolveRiskLevel(input);
  return riskLevel === "urgent" || riskLevel === "vet_consult" || riskLevel === "danger";
}

function resolveRiskLevel(input: ConversationFollowUpInput): string {
  return (input.foodRiskLevel ?? input.riskLevel ?? "unknown").trim().toLowerCase();
}

function buildSignalReason(
  input: ConversationFollowUpInput,
  fallback: string,
): string {
  const signals = Array.from(
    new Set([...(input.mainSymptoms ?? []), ...(input.observedSigns ?? [])]),
  ).filter((value) => value.trim().length > 0);

  if (signals.length === 0) return fallback;
  return `${signals.slice(0, 3).join(", ")} 항목이 기록되어 있어 다음 관찰이나 상담에 전달할 내용을 정리하면 도움이 됩니다.`;
}
