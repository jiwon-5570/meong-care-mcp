import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { RuleBasedVisionAnalyzer } from "./visionAnalyzer.js";
import type {
  PhotoObservationInput,
  PhotoObservationResult,
  StoredPhotoRecord,
} from "../types/photoRecord.js";

const DEFAULT_PHOTO_RECORDS_PATH = path.join(process.cwd(), "src", "data", "photoRecords.json");
const BASE64_PREVIEW_LENGTH = 32;

export async function recordPetPhotoObservation(
  input: PhotoObservationInput,
): Promise<PhotoObservationResult> {
  const analyzer = new RuleBasedVisionAnalyzer();
  const analysis = await analyzer.analyze(input);
  const now = new Date();
  const takenAt = input.takenAt ?? now.toISOString();
  const id = createPhotoRecordId(now);
  const record: StoredPhotoRecord = {
    id,
    dogName: input.dogName ?? null,
    photoType: input.photoType,
    imageUrl: input.imageUrl ?? null,
    hasImageBase64: input.imageBase64 !== undefined,
    imageBase64Preview: createBase64Preview(input.imageBase64),
    takenAt,
    visualNotes: input.visualNotes ?? null,
    observedSigns: input.observedSigns ?? [],
    relatedSymptoms: input.relatedSymptoms ?? [],
    appetite: input.appetite ?? "unknown",
    vomiting: input.vomiting ?? "unknown",
    energy: input.energy ?? "unknown",
    analysis,
    createdAt: now.toISOString(),
  };

  try {
    await appendPhotoRecord(record);
  } catch {
    analysis.photoLimitations = `${analysis.photoLimitations} 사진 기록 파일 저장에 실패해 이번 응답에서만 기록 정보를 제공합니다.`;
  }

  return {
    photoRecordId: id,
    dogName: record.dogName,
    photoType: record.photoType,
    takenAt,
    ...analysis,
  };
}

async function appendPhotoRecord(record: StoredPhotoRecord): Promise<void> {
  const photoRecordsPath = getPhotoRecordsPath();
  await mkdir(path.dirname(photoRecordsPath), { recursive: true });
  const records = await readExistingPhotoRecords();
  records.push(record);
  await writeFile(photoRecordsPath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
}

async function readExistingPhotoRecords(): Promise<StoredPhotoRecord[]> {
  try {
    const body = await readFile(getPhotoRecordsPath(), "utf8");
    const parsed: unknown = JSON.parse(body);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isStoredPhotoRecord);
  } catch {
    return [];
  }
}

function getPhotoRecordsPath(): string {
  const configuredPath = process.env.PHOTO_RECORDS_PATH?.trim();

  if (configuredPath !== undefined && configuredPath.length > 0) {
    return path.isAbsolute(configuredPath)
      ? configuredPath
      : path.join(process.cwd(), configuredPath);
  }

  return DEFAULT_PHOTO_RECORDS_PATH;
}

function isStoredPhotoRecord(value: unknown): value is StoredPhotoRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { id?: unknown }).id === "string"
  );
}

function createPhotoRecordId(now: Date): string {
  const timestamp = now.toISOString().replace(/[-:.TZ]/g, "");
  const random = Math.random().toString(36).slice(2, 8);
  return `photo_${timestamp}_${random}`;
}

function createBase64Preview(imageBase64: string | undefined): string | null {
  if (imageBase64 === undefined) {
    return null;
  }

  if (imageBase64.length <= BASE64_PREVIEW_LENGTH) {
    return "[base64 omitted]";
  }

  return `${imageBase64.slice(0, BASE64_PREVIEW_LENGTH)}...[base64 omitted]`;
}
