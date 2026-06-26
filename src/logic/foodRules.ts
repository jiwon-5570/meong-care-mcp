import { buildFoodRiskPresentation, type RiskPresentation } from "./riskPresentationRules.js";

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
  riskPresentation: RiskPresentation;
}

interface FoodRule {
  keywords: string[];
  riskLevel: FoodRiskLevel;
  actions: string[];
}

const DANGER_FOOD_RULES: FoodRule[] = [
  {
    keywords: [
      "초콜릿",
      "초코",
      "초코볼",
      "다크초콜릿",
      "카카오",
      "코코아",
      "초코케이크",
      "초코과자",
      "chocolate",
      "cocoa",
    ],
    riskLevel: "danger",
    actions: [
      "초콜릿 종류, 카카오 함량, 먹은 양, 먹은 시간을 기록해 주세요.",
      "초콜릿은 적은 양도 문제가 될 수 있어 빠른 동물병원 상담 권장 상황입니다.",
      "보호자 판단으로 임의로 약을 먹이거나 토하게 하지 말고 병원에 문의해 주세요.",
    ],
  },
  {
    keywords: [
      "포도",
      "샤인머스캣",
      "거봉",
      "청포도",
      "건포도",
      "포도즙",
      "포도주스",
      "grape",
      "raisin",
    ],
    riskLevel: "danger",
    actions: [
      "포도와 건포도는 개체별 반응 차이가 커서 섭취량이 적어 보여도 빠른 동물병원 상담 권장 상황입니다.",
      "먹은 개수, 먹은 시간, 반려견 몸무게, 현재 증상을 정리해 병원에 전달해 주세요.",
      "구토, 무기력, 식욕 변화, 소변 변화가 보이면 바로 상담해 주세요.",
    ],
  },
  {
    keywords: ["양파", "마늘", "대파", "쪽파", "부추", "onion", "garlic", "scallion", "chive"],
    riskLevel: "danger",
    actions: [
      "양파, 마늘, 파류가 들어간 음식은 익힌 정도와 무관하게 주의가 필요한 음식입니다.",
      "들어간 재료와 먹은 양, 먹은 시간을 기록하고 동물병원에 문의하는 것을 권장합니다.",
      "창백함, 무기력, 식욕 저하, 구토, 설사 같은 변화가 있는지 관찰해 주세요.",
    ],
  },
  {
    keywords: ["자일리톨", "무설탕껌", "무설탕 캔디", "껌", "xylitol"],
    riskLevel: "danger",
    actions: [
      "자일리톨은 매우 적은 양도 위험할 수 있어 빠른 동물병원 상담 권장 상황입니다.",
      "껌, 사탕, 영양제, 비타민 등 제품 포장지와 먹은 양을 챙겨 주세요.",
      "상담 전 보호자 판단으로 음식이나 약을 추가로 먹이지 마세요.",
    ],
  },
  {
    keywords: ["커피", "카페인", "에너지드링크", "녹차", "홍차", "coffee", "caffeine", "energy drink"],
    riskLevel: "danger",
    actions: [
      "카페인이 들어간 음료나 식품의 종류와 먹은 양을 기록해 주세요.",
      "흥분, 떨림, 빠른 호흡, 구토가 보이면 빠른 동물병원 상담이 필요할 수 있습니다.",
      "남은 음료나 제품은 더 먹지 못하게 치워 주세요.",
    ],
  },
  {
    keywords: ["알코올", "술", "맥주", "소주", "와인", "막걸리", "alcohol"],
    riskLevel: "danger",
    actions: [
      "알코올은 반려견에게 위험할 수 있어 동물병원 상담 권장 상황입니다.",
      "마신 종류, 추정량, 마신 시간을 정리해 주세요.",
      "비틀거림, 처짐, 구토, 호흡 이상이 있으면 빠른 상담을 우선해 주세요.",
    ],
  },
  {
    keywords: ["마카다미아", "macadamia"],
    riskLevel: "danger",
    actions: [
      "마카다미아 섭취량과 시간을 기록해 주세요.",
      "무기력, 떨림, 보행 이상, 구토 여부를 확인해 주세요.",
      "증상이 있거나 섭취량이 불분명하면 동물병원 상담을 권장합니다.",
    ],
  },
  {
    keywords: ["아보카도", "avocado"],
    riskLevel: "danger",
    actions: [
      "아보카도 과육, 껍질, 씨 중 무엇을 먹었는지 확인해 주세요.",
      "씨를 삼켰을 가능성이 있으면 막힘 위험이 있어 빠른 상담을 권장합니다.",
      "구토, 설사, 복부 불편감, 처짐이 있는지 관찰해 주세요.",
    ],
  },
  {
    keywords: ["이스트", "발효반죽", "생반죽", "yeast dough", "raw dough"],
    riskLevel: "danger",
    actions: [
      "이스트가 들어간 생반죽은 위장 팽창 위험이 있어 빠른 동물병원 상담 권장 상황입니다.",
      "먹은 양과 시간을 기록하고, 배가 부풀거나 흔들려 보이는지 확인해 주세요.",
      "보호자 판단으로 토하게 하거나 약을 먹이지 마세요.",
    ],
  },
];

const CAUTION_FOOD_RULES: FoodRule[] = [
  {
    keywords: ["우유", "치즈", "요거트", "유제품", "milk", "cheese", "yogurt", "dairy"],
    riskLevel: "caution",
    actions: [
      "유제품은 설사나 복부 불편감을 만들 수 있어 오늘은 추가 급여를 피해주세요.",
      "변 상태, 구토, 배에서 소리가 나는지, 식욕 변화를 관찰해 주세요.",
      "증상이 심해지거나 반복되면 동물병원 상담을 권장합니다.",
    ],
  },
  {
    keywords: ["닭뼈", "생선뼈", "갈비뼈", "익힌 뼈", "뼈간식", "chicken bone", "fish bone", "cooked bone"],
    riskLevel: "caution",
    actions: [
      "뼈는 입안 상처, 소화기 자극, 막힘 위험이 있어 주의가 필요합니다.",
      "구토, 침 흘림, 복통, 혈변, 배변 어려움이 있는지 관찰해 주세요.",
      "날카로운 조각을 삼켰거나 이상 증상이 있으면 빠른 동물병원 상담을 권장합니다.",
    ],
  },
  {
    keywords: ["생고기", "날고기", "육회", "raw meat"],
    riskLevel: "caution",
    actions: [
      "생고기는 위장 불편이나 병원체 노출 가능성이 있어 추가 급여를 피해주세요.",
      "설사, 구토, 식욕 저하, 처짐이 나타나는지 관찰해 주세요.",
      "어린 강아지, 노령견, 기존 질환이 있는 경우 상담을 더 이르게 고려해 주세요.",
    ],
  },
  {
    keywords: ["기름진", "튀김", "삼겹살", "치킨", "감자튀김", "버터", "크림", "fatty", "fried"],
    riskLevel: "caution",
    actions: [
      "기름진 음식은 구토나 설사 등 위장 부담을 줄 수 있어 오늘은 간식을 제한해 주세요.",
      "평소 먹던 사료와 물 위주로 관리하고 활동량을 무리하게 늘리지 마세요.",
      "반복 구토, 심한 처짐, 복부 통증이 보이면 빠른 상담을 권장합니다.",
    ],
  },
  {
    keywords: ["매운", "고추", "마라", "떡볶이", "김치", "spicy", "pepper"],
    riskLevel: "caution",
    actions: [
      "매운 음식은 위장 자극을 줄 수 있어 추가 섭취를 막아 주세요.",
      "물 접근성을 확인하고 구토, 설사, 침 흘림을 관찰해 주세요.",
      "증상이 지속되면 동물병원 상담을 권장합니다.",
    ],
  },
  {
    keywords: ["짠", "소금", "간장", "젓갈", "햄", "소시지", "salt", "salty"],
    riskLevel: "caution",
    actions: [
      "짠 음식은 갈증과 위장 부담을 만들 수 있어 추가 급여를 피해주세요.",
      "물 섭취와 소변 상태, 구토 여부를 확인해 주세요.",
      "많이 먹었거나 이상 증상이 있으면 상담을 권장합니다.",
    ],
  },
];

const GENERALLY_SAFE_KEYWORDS = [
  "사료",
  "강아지 사료",
  "강아지 간식",
  "전용 간식",
  "고구마",
  "단호박",
  "오이",
  "당근",
  "블루베리",
  "사과",
  "바나나",
  "삶은 닭가슴살",
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
      "처음 먹는 음식이라면 적은 양만 주고 구토, 설사, 가려움, 식욕 변화를 관찰해 주세요.",
      "양념, 소스, 껍질, 씨, 뼈가 섞여 있으면 위험도가 달라질 수 있습니다.",
    ]);
  }

  return buildFoodSafetyResult(input, "unknown", [
    "현재 규칙만으로는 위험도를 명확히 판단하기 어렵습니다.",
    "음식의 재료, 양념 여부, 먹은 양, 먹은 시간을 더 확인해 주세요.",
    "위험한 재료가 포함됐거나 이상 증상이 보이면 동물병원 상담을 권장합니다.",
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
    riskPresentation: buildFoodRiskPresentation(riskLevel, input.foodName, guardianActions),
  };
}

function findRule(foodName: string, rules: FoodRule[]): FoodRule | undefined {
  return rules.find((rule) =>
    rule.keywords.some((keyword) => foodName.includes(normalizeFoodName(keyword))),
  );
}

function normalizeFoodName(foodName: string): string {
  return foodName.trim().toLowerCase().replace(/[\s,./\\(){}\[\]_-]+/g, "");
}
