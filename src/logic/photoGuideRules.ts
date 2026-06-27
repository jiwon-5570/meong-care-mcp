import type { PhotoType } from "../types/photoRecord.js";
import type { DailyRiskLevel } from "./riskRules.js";

export type PhotoQualityLevel = "good_enough" | "needs_more_context" | "poor_quality" | "text_only";

export interface PhotoQuality {
  level: PhotoQualityLevel;
  reasons: string[];
  userMessage: string;
}

export interface PhotoFollowUpGuide {
  photoQuality: PhotoQuality;
  nextPhotoGuide: string[];
  followUpObservationGuide: string[];
  comparisonFocus: string[];
  photoRetakeRecommended: boolean;
  photoRecordUserMessage: string;
}

export interface PhotoFollowUpGuideInput {
  photoType: PhotoType;
  riskLevel: DailyRiskLevel;
  observedSigns: string[];
  relatedSymptoms?: string[];
  visualNotes?: string;
  appetite?: string;
  vomiting?: string;
  energy?: string;
  hasImageUrl?: boolean;
  hasImageBase64?: boolean;
}

interface QualityAssessment {
  photoQuality: PhotoQuality;
  photoRetakeRecommended: boolean;
}

const POOR_QUALITY_KEYWORDS = ["흐림", "흐리고", "어두움", "어두워", "초점", "잘 안 보", "잘안보", "멀리", "가림"];
const CLUE_GROUPS: Array<{ label: string; keywords: string[] }> = [
  {
    label: "색",
    keywords: ["갈색", "검은", "까만", "빨간", "붉은", "노란", "하얀", "피", "혈"],
  },
  {
    label: "형태",
    keywords: ["묽은", "물변", "단단", "점액", "덩어리", "상처", "딱지", "탈모", "붓기", "진물"],
  },
  {
    label: "범위 또는 위치",
    keywords: ["배", "귀", "발", "등", "꼬리", "항문", "넓어", "작게", "부분", "부위", "쪽"],
  },
  {
    label: "횟수 또는 시간",
    keywords: ["오늘", "아침", "저녁", "어제", "1회", "한 번", "두 번", "계속", "방금"],
  },
];

export function buildPhotoFollowUpGuide(input: PhotoFollowUpGuideInput): PhotoFollowUpGuide {
  const quality = assessPhotoRecordQuality(input);
  const nextPhotoGuide = buildNextPhotoGuide(input.photoType);
  const followUpObservationGuide = buildFollowUpObservationGuide(input.riskLevel, input.photoType);
  const comparisonFocus = buildComparisonFocus(input.photoType);

  return {
    photoQuality: quality.photoQuality,
    nextPhotoGuide,
    followUpObservationGuide,
    comparisonFocus,
    photoRetakeRecommended: quality.photoRetakeRecommended,
    photoRecordUserMessage: buildPhotoRecordUserMessage(
      input,
      quality,
      nextPhotoGuide,
      followUpObservationGuide,
    ),
  };
}

function assessPhotoRecordQuality(input: PhotoFollowUpGuideInput): QualityAssessment {
  const observationText = buildObservationText(input);
  const normalizedText = normalize(observationText);
  const hasImageReference = input.hasImageUrl === true || input.hasImageBase64 === true;

  if (normalizedText.length === 0) {
    return {
      photoQuality: {
        level: "needs_more_context",
        reasons: ["관찰 텍스트가 부족합니다."],
        userMessage:
          "사진 자체를 MCP가 분석하지 않으므로 색, 형태, 범위 같은 관찰 내용을 텍스트로 추가하면 기록 품질이 좋아집니다.",
      },
      photoRetakeRecommended: true,
    };
  }

  const poorQualityMentions = POOR_QUALITY_KEYWORDS.filter((keyword) =>
    normalizedText.includes(normalize(keyword)),
  );
  if (poorQualityMentions.length > 0) {
    return {
      photoQuality: {
        level: "poor_quality",
        reasons: ["기록에 흐림, 어두움, 초점 또는 가림과 관련된 표현이 있습니다."],
        userMessage:
          "사진이 흐리거나 어둡다는 기록이 있어, 기록 품질을 높이려면 밝은 곳에서 같은 대상을 다시 남기는 것이 좋습니다.",
      },
      photoRetakeRecommended: true,
    };
  }

  const clueLabels = CLUE_GROUPS
    .filter((group) => group.keywords.some((keyword) => normalizedText.includes(normalize(keyword))))
    .map((group) => group.label);

  if (clueLabels.length >= 2) {
    return {
      photoQuality: {
        level: "good_enough",
        reasons: [`관찰 텍스트에 ${clueLabels.join(", ")} 단서가 포함되어 있습니다.`],
        userMessage:
          "현재 관찰 텍스트에는 비교에 필요한 단서가 포함되어 있습니다. 다음에도 같은 조건으로 기록하면 변화 비교에 도움이 됩니다.",
      },
      photoRetakeRecommended: false,
    };
  }

  if (!hasImageReference) {
    return {
      photoQuality: {
        level: "text_only",
        reasons: ["사진 참조 없이 관찰 텍스트만 제공되었습니다."],
        userMessage:
          "텍스트 기록을 기준으로 정리했습니다. 다음에는 같은 대상의 사진과 색, 형태, 범위 설명을 함께 남기면 비교에 도움이 됩니다.",
      },
      photoRetakeRecommended: false,
    };
  }

  return {
    photoQuality: {
      level: "needs_more_context",
      reasons: ["관찰 텍스트에 색, 형태, 범위, 시간 단서가 충분하지 않습니다."],
      userMessage:
        "사진 원본은 MCP가 분석하지 않으므로 색, 형태, 범위, 위치, 횟수 중 하나 이상을 추가로 적어 주세요.",
    },
    photoRetakeRecommended: false,
  };
}

function buildNextPhotoGuide(photoType: PhotoType): string[] {
  if (photoType === "stool") {
    return [
      "기록 품질을 높이기 위해 밝은 곳에서 변 전체가 보이도록 찍어 주세요.",
      "색, 형태, 묽기, 점액이나 피처럼 보이는 부분이 있는지 함께 적어 주세요.",
      "가능하면 배변 시간과 횟수를 같이 기록해 주세요.",
      "같은 날 다시 변을 보면 이전 사진과 비교할 수 있게 비슷한 거리에서 기록해 주세요.",
    ];
  }

  return [
    "기록 품질을 높이기 위해 밝은 곳에서 같은 피부 부위가 잘 보이도록 찍어 주세요.",
    "붉은기, 털 빠짐, 상처, 딱지, 진물, 붓기 범위를 함께 적어 주세요.",
    "다음 기록 때 같은 부위를 비슷한 거리와 각도에서 찍어 주세요.",
    "핥거나 긁는 행동이 늘었는지도 같이 기록해 주세요.",
  ];
}

function buildFollowUpObservationGuide(
  riskLevel: DailyRiskLevel,
  photoType: PhotoType,
): string[] {
  if (riskLevel === "urgent") {
    return [
      "구토, 혈변, 호흡 이상, 심한 무기력 여부를 바로 확인해 주세요.",
      "먹은 음식이나 증상 시작 시점을 함께 정리해 동물병원 상담을 준비해 주세요.",
      "보호자 판단으로 약을 먹이거나 억지로 토하게 하지 마세요.",
    ];
  }

  if (riskLevel === "vet_consult") {
    return [
      "오늘과 내일 같은 부위 또는 배변 상태를 다시 기록해 주세요.",
      "식욕, 물 섭취, 구토, 활동량 변화를 함께 확인해 주세요.",
      "증상이 지속되거나 범위가 넓어지면 동물병원 상담을 권장합니다.",
    ];
  }

  if (riskLevel === "watch") {
    return [
      photoType === "stool"
        ? "다음 배변을 다시 관찰해 변화가 있는지 확인해 주세요."
        : "같은 피부 부위를 다시 관찰해 변화가 있는지 확인해 주세요.",
      "식욕, 구토, 활동량 변화가 함께 있는지 기록해 주세요.",
    ];
  }

  return [
    "평소와 달라지는 변화가 있으면 다시 기록해 주세요.",
    "같은 조건으로 기록하면 다음 비교에 도움이 됩니다.",
  ];
}

function buildComparisonFocus(photoType: PhotoType): string[] {
  if (photoType === "stool") {
    return [
      "변 색 변화",
      "묽기 또는 설사 여부",
      "점액이나 피처럼 보이는 부분",
      "배변 횟수",
      "구토, 식욕, 활동량 동반 변화",
    ];
  }

  return [
    "붉은기 범위",
    "털 빠짐 범위",
    "상처, 딱지, 진물 여부",
    "붓기 또는 혹처럼 보이는 변화",
    "핥기, 긁기, 통증 반응",
  ];
}

function buildPhotoRecordUserMessage(
  input: PhotoFollowUpGuideInput,
  quality: QualityAssessment,
  nextPhotoGuide: string[],
  followUpObservationGuide: string[],
): string {
  const signText = input.observedSigns.length > 0
    ? input.observedSigns.slice(0, 3).join(", ")
    : "구체적인 관찰 단서가 아직 부족함";
  const lines = [
    "사진 관찰 기록을 정리했어요.",
    "사진 원본을 판단한 것이 아니라 보호자 또는 호스트 AI가 제공한 관찰 텍스트를 기준으로 정리했습니다.",
    buildRiskMessage(input.riskLevel, signText),
  ];

  if (quality.photoQuality.level !== "good_enough") {
    lines.push(quality.photoQuality.userMessage);
  }

  lines.push(
    quality.photoRetakeRecommended
      ? nextPhotoGuide[0]
      : followUpObservationGuide[0],
  );

  return lines.slice(0, 5).join("\n");
}

function buildRiskMessage(riskLevel: DailyRiskLevel, signText: string): string {
  if (riskLevel === "urgent") {
    return `현재 기록에는 ${signText} 등 빠른 상담을 고려할 만한 신호가 포함되어 있습니다.`;
  }

  if (riskLevel === "vet_consult") {
    return `현재 기록에는 ${signText} 등 동물병원 상담을 고려할 신호가 포함되어 있습니다.`;
  }

  if (riskLevel === "watch") {
    return `현재 기록에는 ${signText} 단서가 있어 변화 관찰이 필요합니다.`;
  }

  return `현재 기록에서는 큰 이상 신호가 뚜렷하지 않지만 평소와 다른 변화가 있는지 관찰해 주세요.`;
}

function buildObservationText(input: PhotoFollowUpGuideInput): string {
  return [
    input.visualNotes,
    ...input.observedSigns,
    ...(input.relatedSymptoms ?? []),
  ]
    .filter((value): value is string => value !== undefined && value.trim().length > 0)
    .join(" ");
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}
