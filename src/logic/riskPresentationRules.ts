import type { FoodRiskLevel } from "./foodRules.js";
import type { DailyRiskLevel } from "./riskRules.js";

export type DisplayRiskLevel = DailyRiskLevel | FoodRiskLevel;

export interface RiskPresentation {
  riskBadge: string;
  riskLabel: string;
  severityOrder: number;
  urgencyTitle: string;
  immediateAction: string;
  doNow: string[];
  avoidActions: string[];
  warningSignsToWatch: string[];
  vetContactGuidance: string;
}

export function buildDailyRiskPresentation(
  riskLevel: DailyRiskLevel,
  reasons: string[] = [],
  mainSymptoms: string[] = [],
): RiskPresentation {
  const base = buildDailyBasePresentation(riskLevel);
  return enrichPresentation(base, reasons, mainSymptoms);
}

export function buildFoodRiskPresentation(
  riskLevel: FoodRiskLevel,
  foodName?: string,
  guardianActions: string[] = [],
): RiskPresentation {
  const base = buildFoodBasePresentation(riskLevel, foodName);
  return enrichPresentation(base, guardianActions, foodName !== undefined ? [foodName] : []);
}

export function buildGenericRiskPresentation(
  riskLevel: DisplayRiskLevel,
  context: {
    reasons?: string[];
    mainSymptoms?: string[];
    foodName?: string;
    guardianActions?: string[];
  } = {},
): RiskPresentation {
  if (isFoodRiskLevel(riskLevel)) {
    return buildFoodRiskPresentation(riskLevel, context.foodName, context.guardianActions);
  }

  return buildDailyRiskPresentation(riskLevel, context.reasons, context.mainSymptoms);
}

function buildDailyBasePresentation(riskLevel: DailyRiskLevel): RiskPresentation {
  if (riskLevel === "urgent") {
    return {
      riskBadge: "🚨 빠른 상담 권장",
      riskLabel: "빠른 동물병원 상담 권장",
      severityOrder: 4,
      urgencyTitle: "위험 신호가 있어 빠른 상담이 필요할 수 있습니다.",
      immediateAction:
        "먹은 음식, 증상 시작 시점, 현재 증상, 사진/포장지 정보를 정리해 동물병원에 빠르게 문의해 주세요.",
      doNow: [
        "먹은 음식이나 간식의 종류와 양을 확인해 주세요.",
        "언제부터 증상이 시작됐는지 기록해 주세요.",
        "구토, 혈변, 호흡 이상, 심한 무기력 여부를 확인해 주세요.",
        "가능하면 사진이나 포장지 기록을 준비해 주세요.",
      ],
      avoidActions: [
        "보호자 판단으로 임의로 약을 먹이지 마세요.",
        "억지로 토하게 하거나 억지로 먹이거나 마시게 하지 마세요.",
        "새로운 간식이나 음식을 추가로 주지 마세요.",
      ],
      warningSignsToWatch: [
        "반복 구토",
        "혈변",
        "호흡 이상",
        "심한 무기력 또는 반응 저하",
        "식욕이 전혀 없는 상태",
      ],
      vetContactGuidance:
        "위험 음식 섭취 가능성이나 뚜렷한 위험 신호가 있으면 빠른 동물병원 상담을 권장합니다.",
    };
  }

  if (riskLevel === "vet_consult") {
    return {
      riskBadge: "🟠 상담 권장",
      riskLabel: "동물병원 상담 권장",
      severityOrder: 3,
      urgencyTitle: "상담을 고려할 만한 이상 신호가 있습니다.",
      immediateAction:
        "증상 변화와 식사, 배변, 구토, 활동량 기록을 정리해 동물병원 상담을 준비해 주세요.",
      doNow: [
        "식욕, 변 상태, 구토 여부를 시간대별로 기록해 주세요.",
        "물 섭취와 소변 횟수를 확인해 주세요.",
        "증상이 지속되거나 악화되면 상담을 앞당겨 주세요.",
      ],
      avoidActions: [
        "새로운 음식이나 간식은 잠시 피해주세요.",
        "보호자 판단으로 약을 먹이지 마세요.",
      ],
      warningSignsToWatch: [
        "구토 반복",
        "설사 지속",
        "활동량 추가 감소",
        "식욕 저하 지속",
      ],
      vetContactGuidance:
        "증상이 지속되거나 여러 이상 신호가 함께 있으면 동물병원 상담을 권장합니다.",
    };
  }

  if (riskLevel === "watch") {
    return {
      riskBadge: "🟡 관찰 필요",
      riskLabel: "관찰 필요",
      severityOrder: 2,
      urgencyTitle: "현재는 관찰이 필요한 상태입니다.",
      immediateAction:
        "오늘 식욕, 변 상태, 구토 여부, 활동량 변화를 기록해 주세요.",
      doNow: [
        "평소 먹던 음식 위주로 관리해 주세요.",
        "물 섭취와 변 상태를 확인해 주세요.",
        "증상이 늘어나거나 지속되면 상담을 고려해 주세요.",
      ],
      avoidActions: ["새로운 간식이나 기름진 음식은 피해주세요."],
      warningSignsToWatch: [
        "구토",
        "설사",
        "식욕 저하",
        "활동량 감소",
      ],
      vetContactGuidance:
        "관찰 중 증상이 악화되거나 하루 이상 지속되면 동물병원 상담을 권장합니다.",
    };
  }

  return {
    riskBadge: "🟢 큰 이상 신호 적음",
    riskLabel: "큰 이상 신호 적음",
    severityOrder: 1,
    urgencyTitle: "현재 입력만으로는 큰 이상 신호가 뚜렷하지 않습니다.",
    immediateAction:
      "평소 루틴을 유지하되 식욕, 변 상태, 구토 여부, 활동량 변화를 관찰해 주세요.",
    doNow: [
      "평소 식사와 물 섭취를 유지해 주세요.",
      "오늘 변 상태와 활동량을 가볍게 확인해 주세요.",
    ],
    avoidActions: ["갑작스러운 음식 변경은 피해주세요."],
    warningSignsToWatch: [
      "식욕 변화",
      "구토",
      "변 상태 변화",
      "활동량 감소",
    ],
    vetContactGuidance:
      "이상 증상이 새로 생기거나 지속되면 수의사 상담을 권장합니다.",
  };
}

function buildFoodBasePresentation(riskLevel: FoodRiskLevel, foodName?: string): RiskPresentation {
  const foodLabel = foodName !== undefined && foodName.trim().length > 0 ? foodName.trim() : "해당 음식";

  if (riskLevel === "danger") {
    return {
      riskBadge: "🚨 위험 음식 가능성",
      riskLabel: "위험 음식 섭취 가능성",
      severityOrder: 4,
      urgencyTitle: "위험 음식 섭취 가능성이 있어 빠른 상담을 권장합니다.",
      immediateAction:
        `${foodLabel} 섭취량, 섭취 시간, 몸무게, 현재 증상을 정리해 동물병원에 문의해 주세요.`,
      doNow: [
        "먹은 음식이나 간식의 종류와 양을 확인해 주세요.",
        "언제 먹었는지 기록해 주세요.",
        "구토, 설사, 무기력, 식욕 변화가 있는지 확인해 주세요.",
        "가능하면 음식이나 포장지 사진을 준비해 주세요.",
      ],
      avoidActions: [
        "보호자 판단으로 임의로 약을 먹이지 마세요.",
        "억지로 토하게 하거나 억지로 먹이거나 마시게 하지 마세요.",
        "새로운 간식이나 음식을 추가로 주지 마세요.",
      ],
      warningSignsToWatch: [
        "반복 구토",
        "혈변",
        "호흡 이상",
        "심한 무기력 또는 반응 저하",
        "식욕이 전혀 없는 상태",
      ],
      vetContactGuidance:
        "위험 음식 섭취 가능성이 있으면 섭취량이 적어 보여도 빠른 동물병원 상담을 권장합니다.",
    };
  }

  if (riskLevel === "caution") {
    return {
      riskBadge: "🟡 주의 필요",
      riskLabel: "주의 음식 가능성",
      severityOrder: 2,
      urgencyTitle: "소화기 부담이나 이상 반응을 관찰해야 할 수 있습니다.",
      immediateAction:
        "추가 급여를 피하고 변 상태, 구토, 식욕 변화를 관찰해 주세요.",
      doNow: [
        "오늘은 같은 음식을 추가로 주지 마세요.",
        "구토, 설사, 무기력 여부를 확인해 주세요.",
        "증상이 지속되거나 심해지면 동물병원 상담을 권장합니다.",
      ],
      avoidActions: [
        "새로운 간식이나 기름진 음식은 피해주세요.",
        "보호자 판단으로 약을 먹이지 마세요.",
      ],
      warningSignsToWatch: [
        "구토",
        "설사",
        "식욕 저하",
        "활동량 감소",
      ],
      vetContactGuidance:
        "주의 음식 섭취 뒤 이상 증상이 보이거나 지속되면 동물병원 상담을 권장합니다.",
    };
  }

  if (riskLevel === "safe") {
    return {
      riskBadge: "🟢 일반적으로 큰 위험 낮음",
      riskLabel: "일반적으로 큰 위험 낮음",
      severityOrder: 1,
      urgencyTitle: "현재 음식명 기준으로는 큰 위험 신호가 뚜렷하지 않습니다.",
      immediateAction:
        "처음 먹는 음식이라면 소량만 주고 변 상태와 구토 여부를 관찰해 주세요.",
      doNow: [
        "소량 급여 후 변 상태를 확인해 주세요.",
        "구토, 설사, 가려움, 식욕 변화를 관찰해 주세요.",
      ],
      avoidActions: ["양념, 소스, 씨앗, 뼈가 섞여 있다면 추가 급여를 피해주세요."],
      warningSignsToWatch: [
        "구토",
        "설사",
        "가려움",
        "식욕 변화",
      ],
      vetContactGuidance:
        "이상 증상이 새로 생기거나 지속되면 수의사 상담을 권장합니다.",
    };
  }

  return {
    riskBadge: "❔ 정보 확인 필요",
    riskLabel: "정보 확인 필요",
    severityOrder: 2,
    urgencyTitle: "현재 정보만으로는 위험도를 명확히 판단하기 어렵습니다.",
    immediateAction:
      "음식 성분, 먹은 양, 증상 여부, 반려견 몸무게를 추가로 확인해 주세요.",
    doNow: [
      "음식명과 성분표를 확인해 주세요.",
      "먹은 양과 시간을 기록해 주세요.",
      "구토, 설사, 무기력, 식욕 변화가 있는지 확인해 주세요.",
    ],
    avoidActions: [
      "성분이 확인될 때까지 같은 음식을 더 주지 마세요.",
      "보호자 판단으로 약을 먹이지 마세요.",
    ],
    warningSignsToWatch: [
      "구토",
      "설사",
      "식욕 저하",
      "활동량 감소",
    ],
    vetContactGuidance:
      "성분 확인이 어렵거나 이상 증상이 보이면 동물병원 상담을 권장합니다.",
  };
}

function enrichPresentation(
  presentation: RiskPresentation,
  reasons: string[],
  mainSymptoms: string[],
): RiskPresentation {
  const reasonNotes = reasons.filter((reason) => reason.trim().length > 0).slice(0, 2);
  const symptomNotes = mainSymptoms
    .filter((symptom) => symptom.trim().length > 0)
    .slice(0, 3)
    .map((symptom) => `현재 기록된 항목: ${symptom}`);

  return {
    ...presentation,
    doNow: uniqueStrings([...presentation.doNow, ...symptomNotes]),
    warningSignsToWatch: uniqueStrings([...presentation.warningSignsToWatch, ...reasonNotes]),
  };
}

function isFoodRiskLevel(riskLevel: DisplayRiskLevel): riskLevel is FoodRiskLevel {
  return ["safe", "caution", "danger", "unknown"].includes(riskLevel);
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
