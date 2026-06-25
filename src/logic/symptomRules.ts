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

export function classifyPetSymptom(
  input: SymptomClassificationInput,
  dictionary: SymptomDictionaryEntry[],
  dataSource: SymptomDataSource,
  dataNotice: string,
): SymptomClassificationResult {
  const text = input.text.trim();
  const normalizedText = normalizeText(text);
  const matches = dictionary.filter((entry) =>
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

function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, "");
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
