import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  SymptomDataSource,
  SymptomDictionaryEntry,
} from "../logic/symptomRules.js";

interface SymptomServiceConfig {
  apiUrl?: string;
  serviceKey?: string;
  usePublicDataApi: boolean;
}

interface SymptomDictionaryLoadResult {
  dictionary: SymptomDictionaryEntry[];
  dataSource: SymptomDataSource;
  dataNotice: string;
}

const SAMPLE_DATA_PATHS = [
  path.join(process.cwd(), "data", "symptomDictionary.sample.json"),
  path.join(process.cwd(), "src", "data", "symptomDictionary.sample.json"),
  path.join(process.cwd(), "dist", "data", "symptomDictionary.sample.json"),
];

const SHORT_STANDALONE_SYMPTOMS = new Set([
  "구토",
  "설사",
  "혈변",
  "기침",
  "발열",
  "경련",
  "탈모",
  "부종",
  "통증",
  "변비",
  "황달",
  "콧물",
  "혈뇨",
  "빈뇨",
]);

export async function loadSymptomDictionary(): Promise<SymptomDictionaryLoadResult> {
  const config = readSymptomServiceConfig();

  if (config.usePublicDataApi && config.apiUrl !== undefined) {
    try {
      const dictionary = await fetchPublicSymptomDictionary(config.apiUrl, config.serviceKey);

      if (dictionary.length > 0) {
        return {
          dictionary,
          dataSource: "public_api",
          dataNotice: "공공데이터 API 조회 결과를 기준으로 증상 표현을 정리합니다.",
        };
      }

      throw new Error("Public symptom API returned no valid symptom entries.");
    } catch {
      return {
        dictionary: await loadLocalSymptomDictionary(),
        dataSource: "local_sample",
        dataNotice:
          "공공데이터 API 연결에 실패해 로컬 증상 사전을 기준으로 표현을 정리합니다.",
      };
    }
  }

  return {
    dictionary: await loadLocalSymptomDictionary(),
    dataSource: "local_sample",
    dataNotice: "공공데이터 API 사용이 꺼져 있어 로컬 증상 사전을 기준으로 표현을 정리합니다.",
  };
}

export function normalizeSymptomDictionaryItem(rawItem: unknown): SymptomDictionaryEntry | undefined {
  const item = asRecord(rawItem);

  if (item === undefined) {
    return undefined;
  }

  const publicSymptomName = pickString(item, ["증상명"]);
  const publicCategory = pickString(item, ["증상분류 한글"]);

  if (publicSymptomName !== undefined && publicCategory !== undefined) {
    const split = splitKeywords(publicSymptomName);
    const safeKeywords = split.filter(isSafePublicKeyword);
    const keywords = safeKeywords.length > 0 ? safeKeywords : [publicSymptomName];

    if (keywords.length === 0) {
      return undefined;
    }

    return {
      canonicalSymptom: keywords[0],
      category: publicCategory,
      normalizedSymptom: publicSymptomName,
      keywords,
    };
  }

  const canonicalSymptom = pickString(item, ["canonicalSymptom", "symptomName", "name", "증상명"]);
  const category = pickString(item, ["category", "symptomCategory", "분류", "카테고리"]);
  const normalizedSymptom = pickString(item, [
    "normalizedSymptom",
    "standardExpression",
    "표준증상",
    "정규화증상",
  ]);
  const keywords = pickStringArray(item, ["keywords", "aliases", "terms", "표현"]);

  if (
    canonicalSymptom === undefined ||
    category === undefined ||
    normalizedSymptom === undefined ||
    keywords.length === 0
  ) {
    return undefined;
  }

  return {
    canonicalSymptom,
    category,
    normalizedSymptom,
    keywords,
  };
}

async function fetchPublicSymptomDictionary(
  apiUrl: string,
  serviceKey: string | undefined,
): Promise<SymptomDictionaryEntry[]> {
  const url = new URL(apiUrl);

  setDefaultSearchParam(url, "page", "1");
  setDefaultSearchParam(url, "perPage", "1000");
  setDefaultSearchParam(url, "returnType", "JSON");

  if (serviceKey !== undefined && !url.searchParams.has("serviceKey")) {
    url.searchParams.set("serviceKey", serviceKey);
  }

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    throw new Error(`Public symptom API failed with ${response.status}`);
  }

  const body: unknown = await response.json();
  return extractCandidateItems(body)
    .map(normalizeSymptomDictionaryItem)
    .filter((item): item is SymptomDictionaryEntry => item !== undefined);
}

async function loadLocalSymptomDictionary(): Promise<SymptomDictionaryEntry[]> {
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

  return parsed
    .map(normalizeSymptomDictionaryItem)
    .filter((item): item is SymptomDictionaryEntry => item !== undefined);
}

async function readFirstExistingFile(paths: string[]): Promise<string | undefined> {
  for (const filePath of paths) {
    try {
      return await readFile(filePath, "utf8");
    } catch {
      // Try the next known runtime path.
    }
  }

  return undefined;
}

function readSymptomServiceConfig(): SymptomServiceConfig {
  return {
    apiUrl: optionalEnv("PUBLIC_DATA_SYMPTOM_API_URL"),
    serviceKey: optionalEnv("PUBLIC_DATA_SERVICE_KEY"),
    usePublicDataApi: process.env.USE_SYMPTOM_PUBLIC_DATA === "true",
  };
}

function setDefaultSearchParam(url: URL, name: string, value: string): void {
  if (!url.searchParams.has(name)) {
    url.searchParams.set(name, value);
  }
}

function extractCandidateItems(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  const record = asRecord(value);

  if (record === undefined) {
    return [];
  }

  const candidates = [
    record.items,
    record.item,
    record.data,
    record.records,
    record.rows,
    asRecord(record.response)?.body,
    asRecord(asRecord(record.response)?.body)?.items,
    asRecord(asRecord(asRecord(record.response)?.body)?.items)?.item,
  ];

  for (const candidate of candidates) {
    const extracted = extractCandidateItems(candidate);

    if (extracted.length > 0) {
      return extracted;
    }
  }

  return [];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function pickStringArray(record: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const value = record[key];

    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string");
    }

    if (typeof value === "string" && value.trim().length > 0) {
      return value
        .split(/[,|]/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    }
  }

  return [];
}

function splitKeywords(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,|;/]/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  );
}

function isSafePublicKeyword(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[^가-힣a-z0-9]/g, "");
  return normalized.length >= 3 || SHORT_STANDALONE_SYMPTOMS.has(normalized);
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value !== undefined && value.trim().length > 0 ? value.trim() : undefined;
}
