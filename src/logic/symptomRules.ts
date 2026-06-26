export type AnimalType = "dog" | "cat" | "unknown";
export type SymptomDataSource = "public_api" | "local_sample";

export interface SymptomDictionaryEntry {
  canonicalSymptom: string;
  category: string;
  normalizedSymptom: string;
  keywords: string[];
}

export interface SymptomClassificationInput {
  text: string;
  animalType?: AnimalType;
}

export interface SymptomClassificationResult {
  originalText: string;
  animalType: AnimalType;
  extractedSymptoms: string[];
  symptomCategories: string[];
  normalizedSymptoms: string[];
  dataSource: SymptomDataSource;
  dataNotice: string;
}

const BUILT_IN_SYMPTOM_ENTRIES: SymptomDictionaryEntry[] = [
  {
    canonicalSymptom: "식욕저하",
    category: "소화기/식욕",
    normalizedSymptom: "식욕 감소 또는 식욕 없음",
    keywords: ["밥을 안 먹", "밥 안 먹", "사료 거부", "식욕부진", "식욕 저하", "식욕없", "입맛없"],
  },
  {
    canonicalSymptom: "무기력",
    category: "활동량/전신상태",
    normalizedSymptom: "활동량 감소 또는 무기력",
    keywords: ["축 처", "기운 없", "움직이지 않", "무기력", "활동량 감소", "힘이 없"],
  },
  {
    canonicalSymptom: "구토",
    category: "소화기",
    normalizedSymptom: "구토",
    keywords: ["토함", "토했", "구토", "게워", "토를"],
  },
  {
    canonicalSymptom: "설사/묽은 변",
    category: "배변",
    normalizedSymptom: "설사 또는 묽은 변",
    keywords: ["설사", "묽은 변", "무른 변", "변이 묽", "물변", "묽게"],
  },
  {
    canonicalSymptom: "혈변 의심",
    category: "배변",
    normalizedSymptom: "혈변 또는 붉은 변",
    keywords: ["피 섞인 변", "피가 섞", "혈변", "빨간 변", "붉은 변"],
  },
  {
    canonicalSymptom: "가려움",
    category: "피부",
    normalizedSymptom: "가려움",
    keywords: ["계속 긁", "가려워", "가려움", "핥아", "깨물"],
  },
  {
    canonicalSymptom: "눈 분비물",
    category: "눈",
    normalizedSymptom: "눈물 또는 눈곱",
    keywords: ["눈곱", "눈꼽", "눈물 많", "눈 분비물", "눈이 붉"],
  },
  {
    canonicalSymptom: "기침",
    category: "호흡기",
    normalizedSymptom: "기침",
    keywords: ["기침", "콜록", "켁켁", "목에 걸린"],
  },
];

export function classifyPetSymptom(
  input: SymptomClassificationInput,
  dictionary: SymptomDictionaryEntry[],
  dataSource: SymptomDataSource,
  dataNotice: string,
): SymptomClassificationResult {
  const text = input.text.trim();
  const normalizedText = normalizeText(text);
  const mergedDictionary = mergeDictionary(dictionary, BUILT_IN_SYMPTOM_ENTRIES);
  const matches = mergedDictionary.filter((entry) =>
    entry.keywords.some((keyword) => normalizedText.includes(normalizeText(keyword))),
  );

  return {
    originalText: text,
    animalType: input.animalType ?? "unknown",
    extractedSymptoms: unique(matches.map((match) => match.canonicalSymptom)),
    symptomCategories: unique(matches.map((match) => match.category)),
    normalizedSymptoms: unique(matches.map((match) => match.normalizedSymptom)),
    dataSource,
    dataNotice,
  };
}

function mergeDictionary(
  primary: SymptomDictionaryEntry[],
  fallback: SymptomDictionaryEntry[],
): SymptomDictionaryEntry[] {
  const seen = new Set<string>();
  const merged: SymptomDictionaryEntry[] = [];

  for (const entry of [...primary, ...fallback]) {
    const key = `${entry.canonicalSymptom}:${entry.category}`;

    if (!seen.has(key)) {
      seen.add(key);
      merged.push(entry);
    }
  }

  return merged;
}

function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, "");
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
