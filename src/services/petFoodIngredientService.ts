import { readFile } from "node:fs/promises";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";

import type {
  PetFoodIngredient,
  PetFoodIngredientLoadResult,
} from "../types/petFoodIngredient.js";

interface PetFoodServiceConfig {
  apiUrl?: string;
  serviceKey?: string;
  usePublicDataApi: boolean;
}

const SAMPLE_DATA_PATHS = [
  path.join(process.cwd(), "data", "petFoodIngredients.sample.json"),
  path.join(process.cwd(), "src", "data", "petFoodIngredients.sample.json"),
  path.join(process.cwd(), "dist", "data", "petFoodIngredients.sample.json"),
];

const NUMBER_FIELDS: Array<{
  target: keyof PetFoodIngredient;
  keys: string[];
}> = [
  { target: "priceWonPerKg", keys: ["원료가격(원/kg)", "priceWonPerKg", "원료가격", "mtralPc"] },
  { target: "dryMatterPercent", keys: ["건물(%)", "dryMatterPercent", "건물", "dryMatter"] },
  { target: "moisturePercent", keys: ["수분(%)", "moisturePercent", "수분", "mitrQy"] },
  { target: "proteinPercent", keys: ["단백질(%)", "proteinPercent", "단백질", "protQy"] },
  { target: "tryptophanPercent", keys: ["트립토판(%)", "tryptophanPercent", "트립토판", "trypQy"] },
  { target: "calciumPercent", keys: ["칼슘(%)", "calciumPercent", "칼슘", "clciQy"] },
  { target: "phosphorusPercent", keys: ["인(%)", "phosphorusPercent", "인", "phphQy"] },
  { target: "fatPercent", keys: ["지방(%)", "fatPercent", "지방", "fatQy"] },
  { target: "linoleicAcidPercent", keys: ["리놀레산(%)", "linoleicAcidPercent", "리놀레산", "lnacQy"] },
  { target: "linolenicAcidPercent", keys: ["리놀렌산(%)", "linolenicAcidPercent", "리놀렌산", "liacQy"] },
  { target: "ashPercent", keys: ["회분(%)", "ashPercent", "회분", "ashsQy"] },
  { target: "vitaminAREPer100g", keys: ["비타민 A(RE/100g)", "vitaminAREPer100g", "비타민A", "vtmaQy"] },
  { target: "carbohydratePercent", keys: ["탄수화물(%)", "carbohydratePercent", "탄수화물", "crbQy"] },
  { target: "crudeFiberPercent", keys: ["조섬유(%)", "crudeFiberPercent", "조섬유", "crfbQy"] },
  { target: "totalDietaryFiberPercent", keys: ["총식이섬유(%)", "totalDietaryFiberPercent", "총식이섬유", "totEdblfibrQy"] },
  { target: "insolubleFiberPercent", keys: ["불용성식이섬유(%)", "insolubleFiberPercent", "불용성식이섬유", "inslbltyEdblfibrQy"] },
  { target: "solubleFiberPercent", keys: ["수용성식이섬유(%)", "solubleFiberPercent", "수용성식이섬유", "slwtEdblfibrQy"] },
  { target: "sodiumPercent", keys: ["나트륨(%)", "sodiumPercent", "나트륨", "naQy"] },
  { target: "potassiumPercent", keys: ["칼륨(%)", "potassiumPercent", "칼륨", "ptssQy"] },
];

export async function loadPetFoodIngredients(
  query?: string,
): Promise<PetFoodIngredientLoadResult> {
  const config = readPetFoodServiceConfig();

  if (config.usePublicDataApi && config.apiUrl !== undefined) {
    try {
      const ingredients = await fetchPublicPetFoodIngredients(query, config);

      if (ingredients.length > 0) {
        return {
          ingredients,
          dataNotice: "농사로/공공데이터 API 조회 결과를 기준으로 원료 성분을 정리합니다.",
        };
      }

      return {
        ingredients: await loadSamplePetFoodIngredients(query),
        dataNotice:
          "공공데이터 API에서 조건에 맞는 원료를 찾지 못해 로컬 시연용 샘플을 기준으로 정리합니다. 실제 식단 변경 전 원본 데이터와 수의사 상담으로 확인해 주세요.",
      };
    } catch {
      return {
        ingredients: await loadSamplePetFoodIngredients(query),
        dataNotice:
          "공공데이터 API 호출 또는 응답 파싱에 실패해 로컬 시연용 샘플을 기준으로 정리합니다. 실제 식단 변경 전 원본 데이터와 수의사 상담으로 확인해 주세요.",
      };
    }
  }

  return {
    ingredients: await loadSamplePetFoodIngredients(query),
    dataNotice:
      "공공데이터 API 사용이 꺼져 있어 로컬 시연용 샘플을 기준으로 정리합니다. 실제 식단 변경 전 원본 데이터와 수의사 상담으로 확인해 주세요.",
  };
}

export function readPetFoodServiceConfig(): PetFoodServiceConfig {
  return {
    apiUrl: optionalEnv("PUBLIC_DATA_PET_FOOD_API_URL"),
    serviceKey: optionalEnv("PUBLIC_DATA_PET_FOOD_SERVICE_KEY") ??
      optionalEnv("PUBLIC_DATA_SERVICE_KEY"),
    usePublicDataApi: process.env.USE_PET_FOOD_PUBLIC_DATA === "true",
  };
}

export function normalizePetFoodIngredient(
  rawItem: unknown,
  source: PetFoodIngredient["source"],
): PetFoodIngredient | undefined {
  const item = asRecord(rawItem);

  if (item === undefined) {
    return undefined;
  }

  const feedName = pickString(item, ["feedNm"]);
  const feedCategory = pickString(item, ["feedClCodeNm"]);
  const ingredientPath = pickString(item, [
    "ingredientPath",
    "원료",
    "ingredient",
    "원료경로",
    "ingredientName",
    "원료명",
  ]) ?? [feedCategory, feedName].filter((value): value is string => value !== undefined).join(" > ");

  if (ingredientPath === undefined) {
    return undefined;
  }

  const parsedPath = parseIngredientPath(ingredientPath);
  const explicitName = pickString(item, ["ingredientName", "원료명"]);
  const ingredientName = explicitName !== undefined && !explicitName.includes(">")
    ? explicitName.split(",")[0]?.trim() ?? parsedPath.ingredientName
    : parsedPath.ingredientName;

  if (ingredientName.length === 0) {
    return undefined;
  }

  const normalized: PetFoodIngredient = {
    source,
    ingredientPath,
    ingredientName,
    category: pickString(item, ["category", "대분류"]) ?? parsedPath.category,
    subCategory: pickString(item, ["subCategory", "중분류"]) ?? parsedPath.subCategory,
    partOrForm: pickString(item, ["partOrForm", "부위형태"]) ?? parsedPath.partOrForm,
    originSource: pickString(item, ["originSource", "출처", "source", "originNm"]),
    ingredientRoleTags: pickStringArray(item, ["ingredientRoleTags", "roleTags"]),
    cautionTags: pickStringArray(item, ["cautionTags", "주의태그"]),
    notForMainMealAlone: pickBoolean(item, ["notForMainMealAlone", "단독주식불가"]),
  };

  for (const field of NUMBER_FIELDS) {
    const value = pickNumber(item, field.keys);
    if (value !== undefined) {
      Object.assign(normalized, { [field.target]: value });
    }
  }

  return removeUndefinedAndEmptyArrays(normalized);
}

async function fetchPublicPetFoodIngredients(
  query: string | undefined,
  config: PetFoodServiceConfig,
): Promise<PetFoodIngredient[]> {
  if (config.apiUrl === undefined) {
    return [];
  }

  const url = new URL(config.apiUrl);
  url.searchParams.set("numOfRows", "100");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("returnType", "json");

  if (config.serviceKey !== undefined) {
    url.searchParams.set("serviceKey", config.serviceKey);
    url.searchParams.set("apiKey", config.serviceKey);
  }

  const cleanQuery = cleanText(query);
  if (cleanQuery !== undefined) {
    url.searchParams.set("keyword", cleanQuery);
    url.searchParams.set("searchKeyword", cleanQuery);
    url.searchParams.set("q", cleanQuery);
    url.searchParams.set("원료명", cleanQuery);
    url.searchParams.set("sFeedNm", cleanQuery);
  }

  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });

  if (!response.ok) {
    throw new Error(`Public pet food ingredient API failed with ${response.status}`);
  }

  const body = parsePetFoodResponse(
    await response.text(),
    response.headers.get("content-type"),
  );
  assertSuccessfulPublicResponse(body);
  const normalized = extractCandidateItems(body)
    .map((item) => normalizePetFoodIngredient(item, "public_data"))
    .filter((item): item is PetFoodIngredient => item !== undefined);

  return filterIngredients(normalized, query, false);
}

export function parsePetFoodResponse(body: string, contentType: string | null): unknown {
  const trimmed = body.trim();
  const isJson = contentType?.toLowerCase().includes("json") === true ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[");

  if (isJson) {
    return JSON.parse(trimmed);
  }

  return new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: true,
  }).parse(trimmed) as unknown;
}

function assertSuccessfulPublicResponse(body: unknown): void {
  const response = asRecord(asRecord(body)?.response);
  const header = asRecord(response?.header);
  const resultCode = pickString(header ?? {}, ["resultCode"]);

  if (resultCode !== undefined && resultCode !== "00") {
    throw new Error(`Public pet food ingredient API returned resultCode ${resultCode}`);
  }
}

async function loadSamplePetFoodIngredients(query: string | undefined): Promise<PetFoodIngredient[]> {
  const body = await readFirstExistingFile(SAMPLE_DATA_PATHS);

  if (body === undefined) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const normalized = parsed
    .map((item) => normalizePetFoodIngredient(item, "local_sample"))
    .filter((item): item is PetFoodIngredient => item !== undefined);

  return filterIngredients(normalized, query, true);
}

function filterIngredients(
  ingredients: PetFoodIngredient[],
  query: string | undefined,
  returnAllWhenNoMatch: boolean,
): PetFoodIngredient[] {
  const normalizedQuery = normalizeForMatch(query ?? "");
  if (normalizedQuery.length === 0) return ingredients;

  const matches = ingredients.filter((ingredient) => {
    const name = normalizeForMatch(ingredient.ingredientName);
    const pathValue = normalizeForMatch(ingredient.ingredientPath);
    return normalizedQuery.includes(name) || name.includes(normalizedQuery) || pathValue.includes(normalizedQuery);
  });

  return matches.length > 0 || !returnAllWhenNoMatch ? matches : ingredients;
}

function parseIngredientPath(value: string): {
  category?: string;
  subCategory?: string;
  ingredientName: string;
  partOrForm?: string;
} {
  const segments = value
    .split(">")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  const finalSegment = segments.at(-1) ?? value.trim();
  const finalParts = finalSegment
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  return {
    category: segments[0],
    subCategory: segments.length >= 2 ? segments[1] : undefined,
    ingredientName: finalParts[0] ?? finalSegment,
    partOrForm: finalParts.length > 1 ? finalParts.slice(1).join(", ") : undefined,
  };
}

function extractCandidateItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;

  const record = asRecord(value);
  if (record === undefined) return [];

  const candidates = [
    asRecord(asRecord(record.response)?.body)?.items,
    asRecord(asRecord(asRecord(record.response)?.body)?.items)?.item,
    asRecord(record.response)?.body,
    asRecord(record.body)?.items,
    record.items,
    record.item,
    record.data,
    record.records,
    record.rows,
  ];

  for (const candidate of candidates) {
    const extracted = extractCandidateItems(candidate);
    if (extracted.length > 0) return extracted;
  }

  return [];
}

async function readFirstExistingFile(paths: string[]): Promise<string | undefined> {
  for (const filePath of paths) {
    try {
      return await readFile(filePath, "utf8");
    } catch {
      // Try the next runtime path.
    }
  }

  return undefined;
}

function removeUndefinedAndEmptyArrays(value: PetFoodIngredient): PetFoodIngredient {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) =>
      fieldValue !== undefined && (!Array.isArray(fieldValue) || fieldValue.length > 0)),
  ) as unknown as PetFoodIngredient;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function pickStringArray(record: Record<string, unknown>, keys: string[]): string[] | undefined {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
      return items.length > 0 ? items : undefined;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      return value.split(/[,|]/).map((item) => item.trim()).filter((item) => item.length > 0);
    }
  }
  return undefined;
}

function pickNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const cleaned = value.replace(/[,%\s]/g, "").trim();
      if (cleaned.length === 0 || cleaned === "-") continue;
      const parsed = Number(cleaned);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function pickBoolean(record: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
    if (value === "true" || value === "Y" || value === "1") return true;
    if (value === "false" || value === "N" || value === "0") return false;
  }
  return undefined;
}

function cleanText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : undefined;
}

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[\s,./\\(){}\[\]_-]+/g, "");
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value !== undefined && value.trim().length > 0 ? value.trim() : undefined;
}
