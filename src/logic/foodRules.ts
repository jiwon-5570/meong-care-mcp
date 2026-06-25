export type FoodRiskLevel = "safe" | "caution" | "danger" | "unknown";

export interface FoodSafetyInput {
  foodName: string;
  amount?: string;
  dogWeightKg?: number;
}

export interface FoodSafetyResult {
  foodName: string;
  amount: string;
  dogWeightKg: number | null;
  riskLevel: FoodRiskLevel;
  guardianActions: string[];
}

interface FoodRule {
  keywords: string[];
  riskLevel: FoodRiskLevel;
  actions: string[];
}

const DANGER_FOOD_RULES: FoodRule[] = [
  {
    keywords: ["초콜릿", "chocolate"],
    riskLevel: "danger",
    actions: [
      "섭취한 제품명, 카카오 함량, 양, 시간을 기록하세요.",
      "초콜릿은 소량도 문제가 될 수 있어 빠른 동물병원 상담을 권장합니다.",
      "보호자 판단으로 억지로 토하게 하거나 약을 먹이지 마세요.",
    ],
  },
  {
    keywords: ["포도", "grape", "건포도", "raisin"],
    riskLevel: "danger",
    actions: [
      "포도나 건포도는 개에게 위험할 수 있어 빠른 진료 권장을 우선하세요.",
      "먹은 개수, 시간, 반려견 몸무게를 정리해 병원에 전달하세요.",
      "구토, 무기력, 식욕 변화가 보이면 즉시 상담하세요.",
    ],
  },
  {
    keywords: ["양파", "onion", "마늘", "garlic"],
    riskLevel: "danger",
    actions: [
      "양파와 마늘은 조리 여부와 관계없이 위험할 수 있습니다.",
      "섭취량과 시간을 기록하고 동물병원 상담 권장을 따르세요.",
      "빈혈, 무기력, 잇몸 색 변화 같은 이상 신호를 관찰하세요.",
    ],
  },
  {
    keywords: ["자일리톨", "xylitol"],
    riskLevel: "danger",
    actions: [
      "자일리톨은 매우 적은 양도 위험할 수 있어 빠른 진료 권장 상황입니다.",
      "껌, 사탕, 영양제 등 제품 포장과 섭취량을 챙기세요.",
      "처치를 기다리며 임의로 음식이나 약을 먹이지 마세요.",
    ],
  },
  {
    keywords: ["커피", "coffee", "카페인", "caffeine"],
    riskLevel: "danger",
    actions: [
      "카페인 섭취량과 시간을 기록하세요.",
      "흥분, 떨림, 빠른 호흡, 구토가 보이면 빠른 동물병원 상담이 필요합니다.",
      "남은 음료나 원두는 더 먹지 못하게 치우세요.",
    ],
  },
  {
    keywords: ["알코올", "술", "맥주", "소주", "와인", "alcohol"],
    riskLevel: "danger",
    actions: [
      "알코올은 개에게 위험할 수 있어 동물병원 상담 권장 상황입니다.",
      "마신 종류와 추정량, 시간을 정리하세요.",
      "비틀거림, 처짐, 구토, 호흡 이상이 있으면 빠른 진료를 권장합니다.",
    ],
  },
  {
    keywords: ["마카다미아", "macadamia"],
    riskLevel: "danger",
    actions: [
      "마카다미아 섭취량과 시간을 기록하세요.",
      "무기력, 떨림, 보행 이상, 구토 여부를 관찰하세요.",
      "증상이 있거나 섭취량이 불명확하면 동물병원 상담을 권장합니다.",
    ],
  },
  {
    keywords: ["아보카도", "avocado"],
    riskLevel: "danger",
    actions: [
      "아보카도 과육, 껍질, 씨 중 무엇을 먹었는지 확인하세요.",
      "씨를 삼켰다면 막힘 위험이 있어 빠른 상담을 권장합니다.",
      "구토, 설사, 복부 불편감, 처짐이 있는지 관찰하세요.",
    ],
  },
];

const CAUTION_FOOD_RULES: FoodRule[] = [
  {
    keywords: ["우유", "milk", "치즈", "cheese"],
    riskLevel: "caution",
    actions: [
      "유제품은 설사나 복부 불편감을 만들 수 있어 오늘은 추가 급여를 피하세요.",
      "변 상태, 구토, 복명음, 식욕 변화를 관찰하세요.",
      "증상이 심하거나 반복되면 동물병원 상담을 권장합니다.",
    ],
  },
  {
    keywords: ["닭뼈", "chicken bone", "닭 뼈"],
    riskLevel: "caution",
    actions: [
      "뼈는 입안 상처, 소화기 자극, 막힘 위험이 있어 주의가 필요합니다.",
      "구토, 침 흘림, 복통, 혈변, 배변 어려움이 있는지 관찰하세요.",
      "큰 조각을 삼켰거나 증상이 있으면 빠른 동물병원 상담을 권장합니다.",
    ],
  },
  {
    keywords: ["생고기", "raw meat", "날고기"],
    riskLevel: "caution",
    actions: [
      "생고기는 위장 불편이나 오염 위험이 있어 추가 급여를 피하세요.",
      "설사, 구토, 식욕 저하가 나타나는지 관찰하세요.",
      "어린 강아지, 노령견, 기저질환이 있는 경우 상담을 더 빨리 고려하세요.",
    ],
  },
  {
    keywords: ["기름진", "튀김", "삼겹살", "fatty", "fried"],
    riskLevel: "caution",
    actions: [
      "기름진 음식은 구토나 설사 등 위장 부담을 줄 수 있습니다.",
      "오늘은 간식을 제한하고 평소 먹던 사료 위주로 관리하세요.",
      "반복 구토, 심한 처짐, 복부 통증이 있으면 빠른 상담을 권장합니다.",
    ],
  },
  {
    keywords: ["매운", "고추", "spicy"],
    riskLevel: "caution",
    actions: [
      "매운 음식은 위장 자극을 줄 수 있어 추가 섭취를 막으세요.",
      "물 접근성을 확인하고 구토, 설사, 침 흘림을 관찰하세요.",
      "증상이 지속되면 동물병원 상담을 권장합니다.",
    ],
  },
  {
    keywords: ["짠", "소금", "salt", "salty"],
    riskLevel: "caution",
    actions: [
      "짠 음식은 갈증과 위장 부담을 만들 수 있어 추가 급여를 피하세요.",
      "물 섭취와 소변 상태, 구토 여부를 확인하세요.",
      "많이 먹었거나 이상 증상이 있으면 상담을 권장합니다.",
    ],
  },
];

const GENERALLY_SAFE_KEYWORDS = [
  "사료",
  "강아지 사료",
  "애견 사료",
  "삶은 닭가슴살",
  "닭가슴살",
  "삶은 고구마",
  "고구마",
  "단호박",
  "오이",
  "당근",
  "블루베리",
  "사과",
];

export function checkFoodSafety(input: FoodSafetyInput): FoodSafetyResult {
  const normalizedFoodName = normalizeFoodName(input.foodName);
  const matchedDangerRule = findRule(normalizedFoodName, DANGER_FOOD_RULES);

  if (matchedDangerRule) {
    return buildFoodSafetyResult(input, matchedDangerRule.riskLevel, matchedDangerRule.actions);
  }

  const matchedCautionRule = findRule(normalizedFoodName, CAUTION_FOOD_RULES);

  if (matchedCautionRule) {
    return buildFoodSafetyResult(input, matchedCautionRule.riskLevel, matchedCautionRule.actions);
  }

  const isGenerallySafe = GENERALLY_SAFE_KEYWORDS.some((keyword) =>
    normalizedFoodName.includes(normalizeFoodName(keyword)),
  );

  if (isGenerallySafe) {
    return buildFoodSafetyResult(input, "safe", [
      "일반적으로 소량 급여 가능한 음식으로 분류했습니다.",
      "처음 먹는 음식이라면 적은 양만 주고 구토, 설사, 가려움 여부를 관찰하세요.",
      "양념, 소스, 씨, 껍질, 뼈가 섞여 있으면 위험도가 달라질 수 있습니다.",
    ]);
  }

  return buildFoodSafetyResult(input, "unknown", [
    "현재 규칙만으로는 위험도를 명확히 판단하기 어렵습니다.",
    "음식의 재료, 양념 여부, 섭취량, 시간을 정리해 주세요.",
    "위험 식재료가 섞였거나 이상 증상이 보이면 동물병원 상담을 권장합니다.",
  ]);
}

function buildFoodSafetyResult(
  input: FoodSafetyInput,
  riskLevel: FoodRiskLevel,
  guardianActions: string[],
): FoodSafetyResult {
  return {
    foodName: input.foodName,
    amount: input.amount ?? "미입력",
    dogWeightKg: input.dogWeightKg ?? null,
    riskLevel,
    guardianActions,
  };
}

function findRule(foodName: string, rules: FoodRule[]): FoodRule | undefined {
  return rules.find((rule) =>
    rule.keywords.some((keyword) => foodName.includes(normalizeFoodName(keyword))),
  );
}

function normalizeFoodName(foodName: string): string {
  return foodName.trim().toLowerCase().replace(/\s+/g, "");
}
