import type { DogProfile, DogProfileUsage } from "../types/dogProfile.js";

interface DogProfileMergeInput {
  dogName?: string;
  ageYears?: number;
  weightKg?: number;
  foodOrSnackToday?: string[];
  ownerConcern?: string;
  dogProfile?: DogProfile;
}

export function mergeDogProfile<T extends DogProfileMergeInput>(
  input: T,
): T & {
  dogName?: string;
  ageYears?: number;
  weightKg?: number;
  foodOrSnackToday?: string[];
  ownerConcern?: string;
  dogProfileUsage: DogProfileUsage;
} {
  const profile = input.dogProfile;
  const appliedFields: string[] = [];
  const dogName = preferExplicitText(input.dogName, profile?.dogName, "dogName", appliedFields);
  const ageYears = preferExplicitNumber(input.ageYears, profile?.ageYears, "ageYears", appliedFields);
  const weightKg = preferExplicitNumber(input.weightKg, profile?.weightKg, "weightKg", appliedFields);
  const inputFoods = normalizeList(input.foodOrSnackToday);
  const usualFood = cleanText(profile?.usualFood);
  const foodOrSnackToday = inputFoods.length > 0
    ? inputFoods
    : usualFood !== undefined
      ? [`평소 사료: ${usualFood}`]
      : [];

  if (inputFoods.length === 0 && usualFood !== undefined) {
    appliedFields.push("usualFood");
  }

  return {
    ...input,
    dogName,
    ageYears,
    weightKg,
    foodOrSnackToday,
    ownerConcern: cleanText(input.ownerConcern),
    dogProfileUsage: {
      applied: appliedFields.length > 0,
      appliedFields,
      missingProfileFields: buildMissingProfileFields(profile),
      profileSummary: buildProfileSummary(profile, { dogName, ageYears, weightKg }),
    },
  };
}

function preferExplicitText(
  explicitValue: string | undefined,
  profileValue: string | undefined,
  fieldName: string,
  appliedFields: string[],
): string | undefined {
  const explicit = cleanText(explicitValue);
  if (explicit !== undefined) {
    return explicit;
  }

  const fallback = cleanText(profileValue);
  if (fallback !== undefined) {
    appliedFields.push(fieldName);
  }

  return fallback;
}

function preferExplicitNumber(
  explicitValue: number | undefined,
  profileValue: number | undefined,
  fieldName: string,
  appliedFields: string[],
): number | undefined {
  if (explicitValue !== undefined) {
    return explicitValue;
  }

  if (profileValue !== undefined) {
    appliedFields.push(fieldName);
  }

  return profileValue;
}

function buildMissingProfileFields(profile: DogProfile | undefined): string[] {
  const missingFields: string[] = [];

  if (cleanText(profile?.dogName) === undefined) missingFields.push("dogName");
  if (profile?.ageYears === undefined) missingFields.push("ageYears");
  if (profile?.weightKg === undefined) missingFields.push("weightKg");
  if (cleanText(profile?.usualFood) === undefined) missingFields.push("usualFood");
  if (cleanText(profile?.usualStool) === undefined) missingFields.push("usualStool");

  return missingFields;
}

function buildProfileSummary(
  profile: DogProfile | undefined,
  effective: {
    dogName?: string;
    ageYears?: number;
    weightKg?: number;
  },
): string {
  if (profile === undefined) {
    return "dogProfile이 제공되지 않았습니다.";
  }

  const parts = [
    effective.dogName,
    effective.ageYears !== undefined ? `${effective.ageYears}살` : undefined,
    effective.weightKg !== undefined ? `${effective.weightKg}kg` : undefined,
    cleanText(profile.breed) !== undefined ? `품종: ${cleanText(profile.breed)}` : undefined,
    cleanText(profile.usualFood) !== undefined ? `평소 사료: ${cleanText(profile.usualFood)}` : undefined,
    cleanText(profile.usualStool) !== undefined ? `평소 변: ${cleanText(profile.usualStool)}` : undefined,
    normalizeList(profile.allergyOrSensitiveFoods).length > 0
      ? `민감 음식: ${normalizeList(profile.allergyOrSensitiveFoods).join(", ")}`
      : undefined,
    normalizeList(profile.knownConditions).length > 0
      ? `보호자 제공 기존 상태: ${normalizeList(profile.knownConditions).join(", ")}`
      : undefined,
    cleanText(profile.regularMedicationMemo) !== undefined ? "복용 메모: 보호자 제공 정보 있음" : undefined,
  ].filter((value): value is string => value !== undefined);

  return parts.length > 0 ? parts.slice(0, 8).join(" / ") : "입력된 dogProfile의 상세 정보가 부족합니다.";
}

function normalizeList(values: string[] | undefined): string[] {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );
}

function cleanText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
