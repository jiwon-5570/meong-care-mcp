import { readFile } from "node:fs/promises";
import path from "node:path";

import type { AnimalHospital, HospitalDataSource } from "../logic/hospitalRules.js";

interface HospitalServiceConfig {
  apiUrl?: string;
  serviceKey?: string;
  usePublicDataApi: boolean;
}

interface HospitalLoadResult {
  hospitals: AnimalHospital[];
  dataNotice: string;
}

const SAMPLE_DATA_PATHS = [
  path.join(process.cwd(), "data", "animalHospitals.sample.json"),
  path.join(process.cwd(), "src", "data", "animalHospitals.sample.json"),
  path.join(process.cwd(), "dist", "data", "animalHospitals.sample.json"),
];

export async function loadAnimalHospitals(
  region: string,
  maxResults: number | undefined,
): Promise<HospitalLoadResult> {
  const config = readHospitalServiceConfig();

  if (config.usePublicDataApi && config.apiUrl !== undefined) {
    try {
      const publicHospitals = await fetchPublicAnimalHospitals(region, maxResults, config);

      if (publicHospitals.length > 0) {
        return {
          hospitals: publicHospitals,
          dataNotice: "공공데이터 API 조회 결과를 기준으로 안내합니다.",
        };
      }

      return {
        hospitals: await loadSampleHospitals(),
        dataNotice:
          "공공데이터 API에서 조건에 맞는 결과를 찾지 못해 로컬 샘플 데이터를 기준으로 안내합니다.",
      };
    } catch {
      return {
        hospitals: await loadSampleHospitals(),
        dataNotice:
          "공공데이터 API 연결에 실패해 로컬 샘플 데이터를 기준으로 안내합니다.",
      };
    }
  }

  return {
    hospitals: await loadSampleHospitals(),
    dataNotice: "공공데이터 API 사용이 꺼져 있어 로컬 샘플 데이터를 기준으로 안내합니다.",
  };
}

export function normalizeHospitalItem(
  rawItem: unknown,
  dataSource: HospitalDataSource,
): AnimalHospital | undefined {
  const item = asRecord(rawItem);

  if (item === undefined) {
    return undefined;
  }

  const name = pickString(item, [
    "name",
    "hospitalName",
    "businessName",
    "bplcNm",
    "BPLC_NM",
    "사업장명",
    "병원명",
  ]);
  const address = pickString(item, [
    "address",
    "roadAddress",
    "siteWhlAddr",
    "rdnWhlAddr",
    "ROAD_NM_ADDR",
    "LOTNO_ADDR",
    "소재지전체주소",
    "도로명전체주소",
    "주소",
  ]);

  if (name === undefined || address === undefined) {
    return undefined;
  }

  return {
    name,
    address,
    businessStatus:
      pickString(item, [
        "businessStatus",
        "trdStateNm",
        "DTL_SALS_STTS_NM",
        "SALS_STTS_NM",
        "상세영업상태명",
        "영업상태명",
      ]) ?? "상태 미확인",
    phoneNumber: pickString(item, ["phoneNumber", "siteTel", "TELNO", "전화번호", "tel"]),
    licenseDate: pickString(item, ["licenseDate", "apvPermYmd", "LCPMT_YMD", "인허가일자"]),
    dataSource,
  };
}

async function fetchPublicAnimalHospitals(
  region: string,
  maxResults: number | undefined,
  config: HospitalServiceConfig,
): Promise<AnimalHospital[]> {
  if (config.apiUrl === undefined) {
    return [];
  }

  const url = new URL(config.apiUrl);
  url.searchParams.set("numOfRows", String(maxResults ?? 20));
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("returnType", "json");
  url.searchParams.set("cond[ROAD_NM_ADDR::LIKE]", region);

  if (config.serviceKey !== undefined && config.serviceKey.length > 0) {
    url.searchParams.set("serviceKey", config.serviceKey);
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Public animal hospital API failed with ${response.status}`);
  }

  const body: unknown = await response.json();
  return extractCandidateItems(body)
    .map((item) => normalizeHospitalItem(item, "public_api"))
    .filter((item): item is AnimalHospital => item !== undefined);
}

async function loadSampleHospitals(): Promise<AnimalHospital[]> {
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
    .map((item) => normalizeHospitalItem(item, "local_sample"))
    .filter((item): item is AnimalHospital => item !== undefined);
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

function readHospitalServiceConfig(): HospitalServiceConfig {
  return {
    apiUrl: optionalEnv("PUBLIC_DATA_ANIMAL_HOSPITAL_API_URL"),
    serviceKey: optionalEnv("PUBLIC_DATA_SERVICE_KEY"),
    usePublicDataApi: process.env.USE_PUBLIC_DATA_API === "true",
  };
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

    if (typeof value === "number") {
      return String(value);
    }
  }

  return undefined;
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value !== undefined && value.trim().length > 0 ? value.trim() : undefined;
}
