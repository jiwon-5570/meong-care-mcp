import type {
  IngredientCandidate,
  IngredientNutritionSummary,
  IngredientSelectionGuide,
  PetFoodIngredient,
} from "../types/petFoodIngredient.js";

export type IngredientGoal =
  | "normal_daily"
  | "sensitive_stomach"
  | "weight_control"
  | "senior"
  | "skin_coat"
  | "after_vet_advice";

export interface IngredientSelectionInput {
  dogName: string;
  ageYears?: number;
  weightKg?: number;
  appetite?: string;
  stool?: string;
  vomiting?: string;
  energy?: string;
  itching?: boolean;
  ownerConcern?: string;
  mainSymptoms?: string[];
  foodOrSnackToday?: string[];
  usualFood?: string;
  allergyOrSensitiveFoods?: string[];
  knownConditions?: string[];
  goal?: IngredientGoal;
  requestedIngredientNames?: string[];
  includeIngredientGuide?: boolean;
  dataNotice?: string;
  mode?: IngredientSelectionGuide["mode"];
}

const SAFETY_NOTE =
  "이 안내는 집밥 원료 선택 기준을 정리한 것이며 진단, 처방, 치료식 추천이 아닙니다. 기존 질환이 있거나 이상 증상이 지속되면 수의사와 식이 상담을 권장합니다.";

const GUIDE_KEYWORDS = ["사료", "집밥", "재료", "원료", "먹여도", "식단", "추천", "비교"];
const SYMPTOM_KEYWORDS = ["묽은 변", "설사", "식욕 감소", "식욕저하", "가려움", "체중"];

export function shouldBuildIngredientSelectionGuide(input: IngredientSelectionInput): boolean {
  if (input.includeIngredientGuide === true) return true;
  if (input.goal !== undefined) return true;
  if ((input.requestedIngredientNames?.length ?? 0) > 0) return true;
  if (containsAny(input.ownerConcern ?? "", GUIDE_KEYWORDS)) return true;
  if (containsAny((input.mainSymptoms ?? []).join(" "), SYMPTOM_KEYWORDS)) return true;
  if (["soft", "diarrhea", "bloody"].includes(input.stool ?? "")) return true;
  if (["less", "none"].includes(input.appetite ?? "")) return true;
  if (["once", "multiple"].includes(input.vomiting ?? "")) return true;
  return false;
}

export function buildIngredientSelectionGuide(
  input: IngredientSelectionInput,
  ingredients: PetFoodIngredient[],
): IngredientSelectionGuide {
  const goal = resolveGoal(input);
  const requestedNames = normalizeList(input.requestedIngredientNames);
  const consideredIngredients = requestedNames.length > 0
    ? ingredients.filter((ingredient) => requestedNames.some((name) => ingredientMatches(ingredient, name)))
    : ingredients;
  const candidates = consideredIngredients.map((ingredient) => buildCandidate(ingredient, input, goal));
  const possibleIngredients = candidates
    .filter((candidate) => candidate.matchLevel === "good_candidate" || candidate.matchLevel === "possible_candidate")
    .slice(0, 5);
  const cautionIngredients = candidates
    .filter((candidate) => candidate.matchLevel === "caution_for_now")
    .slice(0, 5);

  if (requestedNames.length > 0) {
    for (const name of requestedNames) {
      if (!consideredIngredients.some((ingredient) => ingredientMatches(ingredient, name))) {
        cautionIngredients.push({
          ingredientName: name,
          matchLevel: "need_more_info",
          nutritionSummary: "현재 데이터에서 일치하는 영양성분을 찾지 못했습니다.",
          reasons: ["원료명, 가공 형태, 부위를 더 구체적으로 확인해야 합니다."],
          cautionNotes: ["성분표나 포장지 정보를 확인한 뒤 비교해 주세요."],
          dataSource: "user_label",
        });
      }
    }
  }

  return {
    mode: resolveMode(input, requestedNames),
    dogName: input.dogName,
    basedOn: buildBasedOn(input, goal),
    recommendedCriteria: buildRecommendedCriteria(goal),
    avoidCriteria: buildAvoidCriteria(goal),
    possibleIngredients,
    cautionIngredients: cautionIngredients.slice(0, 5),
    transitionGuide: [
      "기존 식단을 유지하면서 새 원료는 한 번에 한 가지씩 소량으로 확인해 주세요.",
      "식단 변경 전후의 식욕, 변, 구토, 가려움과 활동량을 같은 기준으로 기록해 주세요.",
      "이상 신호가 나타나거나 기존 증상이 심해지면 새 원료 추가를 중단하고 수의사와 상담해 주세요.",
    ],
    questionsForVet: buildQuestionsForVet(input, goal),
    familyShareText: buildFamilyShareText(input.dogName, goal),
    dataNotice: input.dataNotice ?? "제공된 원료 영양성분 데이터를 기준으로 비교했습니다.",
    safetyNote: SAFETY_NOTE,
  };
}

export function findMatchingIngredient(
  foodName: string,
  ingredients: PetFoodIngredient[],
): PetFoodIngredient | undefined {
  const matches = ingredients.filter((ingredient) => ingredientMatches(ingredient, foodName));
  return matches.sort((left, right) => matchScore(right, foodName) - matchScore(left, foodName))[0];
}

export function buildIngredientNutritionSummary(
  ingredient: PetFoodIngredient,
  dataNotice: string,
): IngredientNutritionSummary {
  return {
    ingredientName: formatIngredientLabel(ingredient),
    nutritionSummary: formatNutritionSummary(ingredient),
    dataNotice,
    cautionNotes: buildCautionNotes(ingredient, undefined),
  };
}

export function formatNutritionSummary(ingredient: PetFoodIngredient): string {
  const nutrients = [
    formatPercent("수분", ingredient.moisturePercent),
    formatPercent("단백질", ingredient.proteinPercent),
    formatPercent("지방", ingredient.fatPercent),
    formatPercent("탄수화물", ingredient.carbohydratePercent),
    formatPercent("총식이섬유", ingredient.totalDietaryFiberPercent),
    formatPercent("칼슘", ingredient.calciumPercent),
    formatPercent("인", ingredient.phosphorusPercent),
    formatPercent("나트륨", ingredient.sodiumPercent),
    formatPercent("칼륨", ingredient.potassiumPercent),
  ].filter((value): value is string => value !== undefined);

  return nutrients.length > 0
    ? `${formatIngredientLabel(ingredient)}: ${nutrients.join(", ")}`
    : `${formatIngredientLabel(ingredient)}: 현재 데이터에서 세부 영양 수치를 확인하지 못했습니다.`;
}

function buildCandidate(
  ingredient: PetFoodIngredient,
  input: IngredientSelectionInput,
  goal: IngredientGoal,
): IngredientCandidate {
  const reasons = buildCandidateReasons(ingredient, goal);
  const cautionNotes = buildCautionNotes(ingredient, input);
  const cautionForNow = shouldCautionIngredient(ingredient, input, goal);
  const goodCandidate = !cautionForNow && ingredient.fatPercent !== undefined && ingredient.fatPercent <= 3;

  return {
    ingredientName: ingredient.ingredientName,
    ingredientPath: ingredient.ingredientPath,
    matchLevel: cautionForNow
      ? "caution_for_now"
      : goodCandidate
        ? "good_candidate"
        : "possible_candidate",
    nutritionSummary: formatNutritionSummary(ingredient),
    reasons,
    cautionNotes,
    dataSource: ingredient.source,
  };
}

function shouldCautionIngredient(
  ingredient: PetFoodIngredient,
  input: IngredientSelectionInput,
  goal: IngredientGoal,
): boolean {
  const tags = new Set([...(ingredient.ingredientRoleTags ?? []), ...(ingredient.cautionTags ?? [])]);
  const sensitiveFood = (input.allergyOrSensitiveFoods ?? []).some((food) => ingredientMatches(ingredient, food));
  const highFiber = (ingredient.totalDietaryFiberPercent ?? 0) >= 8 || (ingredient.crudeFiberPercent ?? 0) >= 5;

  return sensitiveFood ||
    (ingredient.fatPercent ?? 0) >= 8 ||
    tags.has("organ_meat") ||
    (goal === "sensitive_stomach" && highFiber);
}

function buildCandidateReasons(ingredient: PetFoodIngredient, goal: IngredientGoal): string[] {
  const reasons: string[] = [];
  const tags = new Set(ingredient.ingredientRoleTags ?? []);

  if ((ingredient.fatPercent ?? Number.POSITIVE_INFINITY) <= 3) {
    reasons.push("데이터상 지방 비율이 3% 이하인 원료입니다.");
  }
  if ((ingredient.proteinPercent ?? 0) >= 15) {
    reasons.push("데이터상 단백질 비율이 15% 이상입니다.");
  }
  if (tags.has("high_moisture")) reasons.push("수분이 높은 원료로 분류되어 있습니다.");
  if (tags.has("fiber_source")) reasons.push("식이섬유 원료로 비교할 수 있습니다.");
  if (goal === "weight_control" && tags.has("low_fat")) reasons.push("체중 관리 목적에서 지방 수치를 비교하기 좋은 후보입니다.");
  if (goal === "skin_coat" && tags.has("novel_protein")) reasons.push("새 단백질원 후보로 분류되지만 한 가지씩 확인해야 합니다.");

  return reasons.length > 0 ? reasons : ["현재 목표와 성분표를 함께 비교할 수 있는 원료입니다."];
}

function buildCautionNotes(
  ingredient: PetFoodIngredient,
  input: IngredientSelectionInput | undefined,
): string[] {
  const notes: string[] = [];
  const tags = new Set([...(ingredient.ingredientRoleTags ?? []), ...(ingredient.cautionTags ?? [])]);
  const fat = ingredient.fatPercent;

  if (fat !== undefined && fat >= 15) {
    notes.push(`지방 ${formatNumber(fat)}%로 매우 높은 편이어서 현재는 강한 주의가 필요합니다.`);
  } else if (fat !== undefined && fat >= 8) {
    notes.push(`지방 ${formatNumber(fat)}%로 높은 편이어서 소화 상태를 우선 확인해야 합니다.`);
  }
  if (tags.has("organ_meat") || tags.has("high_vitamin_a")) {
    notes.push("내장 원료는 비타민 A와 무기질 수치를 확인하고 소량 기준을 수의사와 상의해 주세요.");
  }
  if (tags.has("raw_food_caution")) notes.push("생것 형태는 위생과 소화 부담을 추가로 확인해야 합니다.");
  if (tags.has("sodium_caution")) notes.push("말린 형태는 나트륨 농도를 확인해 주세요.");
  if (tags.has("phosphorus_caution") || tags.has("mineral_balance_caution")) {
    notes.push("칼슘과 인 균형이 중요하므로 기존 질환이 있으면 수의사 식이 상담을 우선해 주세요.");
  }
  if ((input?.allergyOrSensitiveFoods ?? []).some((food) => ingredientMatches(ingredient, food))) {
    notes.push("보호자가 제공한 민감 음식 목록과 겹쳐 현재 후보에서 제외하는 편이 안전합니다.");
  }
  if (ingredient.notForMainMealAlone === true) {
    notes.push("이 원료 한 가지만으로 한 끼 전체를 구성하지 마세요.");
  }

  return notes.length > 0 ? notes : ["처음 추가하는 원료라면 한 번에 한 가지씩 소량으로 확인해 주세요."];
}

function buildRecommendedCriteria(goal: IngredientGoal): string[] {
  if (goal === "sensitive_stomach") {
    return [
      "새 원료를 갑자기 많이 추가하지 않기",
      "기존 식단을 유지하면서 한 가지 원료만 소량 확인하기",
      "다음 배변 상태를 기록하기",
    ];
  }
  if (goal === "weight_control") {
    return [
      "지방 비율이 낮은 원료 위주로 비교하기",
      "간식성 원료와 식사 보조 원료를 구분하기",
      "급여량과 체중 변화를 함께 기록하기",
    ];
  }
  if (goal === "skin_coat") {
    return [
      "새 단백질원은 하나씩 소량으로 확인하기",
      "가려움, 붉은기, 귀 상태와 변 상태를 함께 기록하기",
    ];
  }
  if (goal === "senior") {
    return [
      "갑작스러운 식단 변경을 피하기",
      "소화 상태와 활동량을 함께 기록하기",
      "기존 질환이 있으면 수의사 식이 상담을 우선하기",
    ];
  }
  if (goal === "after_vet_advice") {
    return [
      "수의사와 합의한 식단 범위 안에서 원료 성분을 비교하기",
      "변경 전후 식욕, 변, 구토와 활동량을 기록하기",
    ];
  }
  return [
    "평소 잘 맞던 식단을 기준으로 한 가지 원료씩 비교하기",
    "수분, 단백질, 지방과 식이섬유 수치를 함께 확인하기",
    "새 원료는 소량부터 확인하고 상태 변화를 기록하기",
  ];
}

function buildAvoidCriteria(goal: IngredientGoal): string[] {
  const common = ["여러 새 원료를 한 번에 추가하지 않기"];

  if (goal === "sensitive_stomach") {
    return [
      "지방 비율이 높은 원료는 우선 주의",
      "처음 먹는 단백질원을 한 번에 많이 추가하지 않기",
      "섬유가 높은 원료도 과량으로 추가하지 않기",
      ...common,
    ];
  }
  if (goal === "weight_control") {
    return ["고지방 부산물 원료 과량 사용 주의", "가격만 보고 고르지 않기", ...common];
  }
  if (goal === "skin_coat") {
    return [
      "기존에 민감했던 단백질원이나 알레르기 의심 성분은 피하기",
      "피부 상태가 달라질 것이라고 단정하지 않기",
      ...common,
    ];
  }
  if (goal === "senior") {
    return ["고지방 원료 과량 사용 주의", "기존 식이 지침을 임의로 바꾸지 않기", ...common];
  }
  return ["고지방 원료와 내장 원료를 양 확인 없이 추가하지 않기", ...common];
}

function buildQuestionsForVet(input: IngredientSelectionInput, goal: IngredientGoal): string[] {
  const questions = [
    "현재 식욕, 변 상태와 활동량을 고려할 때 식단 변경을 미뤄야 하는지 궁금합니다.",
    "비교 중인 원료에서 지방, 단백질, 칼슘과 인 중 무엇을 우선 확인해야 하나요?",
    "새 원료를 추가한다면 어떤 상태 변화를 기록해야 하나요?",
  ];

  if ((input.knownConditions?.length ?? 0) > 0 || goal === "senior") {
    questions.unshift("보호자가 제공한 기존 상태를 고려할 때 피해야 할 원료 성분이 있는지 확인하고 싶습니다.");
  }

  return questions;
}

function buildFamilyShareText(dogName: string, goal: IngredientGoal): string {
  if (goal === "sensitive_stomach") {
    return `${dogName} 오늘 식단은 기존 사료 위주로 유지하자. 묽은 변이나 식욕 변화가 있어 지방 높은 원료는 우선 피하고, 새 원료는 한 가지씩 소량만 확인하면서 변 상태를 기록하자.`;
  }
  if (goal === "weight_control") {
    return `${dogName} 식단 원료는 지방 수치와 실제 급여량을 함께 비교하자. 간식성 원료와 식사 보조 원료를 구분하고 체중 변화를 기록하자.`;
  }
  if (goal === "skin_coat") {
    return `${dogName} 새 단백질 원료는 한 번에 하나씩 소량으로 확인하자. 가려움, 붉은기, 귀 상태와 변 변화를 함께 기록하자.`;
  }
  if (goal === "senior") {
    return `${dogName}는 식단을 갑자기 바꾸지 말고 소화 상태와 활동량을 함께 기록하자. 기존 상태가 있으면 원료 변경 전에 수의사와 식이 상담부터 하자.`;
  }
  return `${dogName} 식단은 평소 잘 맞던 사료를 기준으로 유지하고, 새 원료는 한 가지씩 소량으로 확인하면서 식욕과 변 상태를 기록하자.`;
}

function buildBasedOn(input: IngredientSelectionInput, goal: IngredientGoal): string[] {
  return uniqueStrings([
    `식단 목표: ${goal}`,
    input.ageYears !== undefined ? `나이: ${input.ageYears}살` : "",
    input.weightKg !== undefined ? `몸무게: ${input.weightKg}kg` : "",
    input.appetite !== undefined ? `식욕: ${input.appetite}` : "",
    input.stool !== undefined ? `변 상태: ${input.stool}` : "",
    input.vomiting !== undefined ? `구토: ${input.vomiting}` : "",
    ...(input.mainSymptoms ?? []).map((symptom) => `관찰 신호: ${symptom}`),
    ...(input.knownConditions ?? []).map((condition) => `보호자 제공 기존 상태: ${condition}`),
  ]);
}

function resolveGoal(input: IngredientSelectionInput): IngredientGoal {
  if (input.goal !== undefined) return input.goal;
  const text = `${input.ownerConcern ?? ""} ${(input.mainSymptoms ?? []).join(" ")}`;
  if (input.ageYears !== undefined && input.ageYears >= 10) return "senior";
  if (input.itching === true || containsAny(text, ["가려움", "피부", "붉은기"])) return "skin_coat";
  if (containsAny(text, ["체중", "다이어트", "감량"])) return "weight_control";
  if (["soft", "diarrhea", "bloody"].includes(input.stool ?? "") ||
    ["less", "none"].includes(input.appetite ?? "") ||
    ["once", "multiple"].includes(input.vomiting ?? "") ||
    containsAny(text, ["묽은 변", "설사", "구토", "식욕 감소", "식욕저하"])) {
    return "sensitive_stomach";
  }
  return "normal_daily";
}

function resolveMode(
  input: IngredientSelectionInput,
  requestedNames: string[],
): IngredientSelectionGuide["mode"] {
  if (input.mode !== undefined) return input.mode;
  return requestedNames.length >= 2 ? "ingredient_comparison" : "daily_status_based_ingredient_guide";
}

function ingredientMatches(ingredient: PetFoodIngredient, value: string): boolean {
  const target = normalizeForMatch(value);
  if (target.length === 0) return false;
  const name = normalizeForMatch(ingredient.ingredientName);
  const path = normalizeForMatch(ingredient.ingredientPath);
  return target.includes(name) || name.includes(target) || path.includes(target);
}

function matchScore(ingredient: PetFoodIngredient, foodName: string): number {
  const target = normalizeForMatch(foodName);
  const label = normalizeForMatch(formatIngredientLabel(ingredient));
  const name = normalizeForMatch(ingredient.ingredientName);
  if (target === label) return 4;
  if (target === name) return 3;
  if (label.includes(target) || target.includes(label)) return 2;
  return target.includes(name) || name.includes(target) ? 1 : 0;
}

function formatIngredientLabel(ingredient: PetFoodIngredient): string {
  return ingredient.partOrForm !== undefined
    ? `${ingredient.ingredientName} (${ingredient.partOrForm})`
    : ingredient.ingredientName;
}

function formatPercent(label: string, value: number | undefined): string | undefined {
  return value !== undefined ? `${label} ${formatNumber(value)}%` : undefined;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function normalizeList(values: string[] | undefined): string[] {
  return uniqueStrings(values ?? []);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)));
}

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[\s,./\\(){}\[\]_-]+/g, "");
}
