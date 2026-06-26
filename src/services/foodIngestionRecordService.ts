import { analyzeFoodIngestionEvent } from "../logic/foodIngestionRules.js";
import { appendJsonRecord, resolveRecordFilePath } from "./jsonRecordStore.js";
import type {
  FoodIngestionEventInput,
  FoodIngestionEventResult,
  StoredFoodIngestionRecord,
} from "../types/foodIngestionRecord.js";
import { SAFETY_MESSAGE } from "../utils/safetyMessage.js";

const DEFAULT_RECORDS_PATH = "src/data/foodIngestionRecords.json";
const BASE64_PREVIEW_LENGTH = 32;

export async function recordFoodIngestionEvent(
  input: FoodIngestionEventInput,
): Promise<FoodIngestionEventResult> {
  const now = new Date();
  const analysis = analyzeFoodIngestionEvent(input);
  const recordId = createRecordId(now);
  const record: StoredFoodIngestionRecord = {
    id: recordId,
    createdAt: now.toISOString(),
    dogName: analysis.recordedSummary.dogName,
    weightKg: analysis.recordedSummary.weightKg,
    foodName: input.foodName,
    foodDetail: input.foodDetail ?? null,
    amount: input.amount ?? null,
    eatenAt: input.eatenAt ?? null,
    photoUrl: input.photoUrl ?? null,
    imageBase64: createBase64Preview(input.imageBase64),
    currentSymptoms: analysis.recordedSummary.currentSymptoms,
    ownerMemo: input.ownerMemo ?? null,
    riskLevel: analysis.riskLevel,
    vetSummary: analysis.vetSummary,
  };

  try {
    await appendRecord(record);
  } catch {
    analysis.missingInfoQuestions.push(
      "기록 파일 저장에 실패해 이번 응답에서만 섭취 정보를 확인할 수 있습니다.",
    );
  }

  return {
    recordId,
    riskLevel: analysis.riskLevel,
    recordedSummary: analysis.recordedSummary,
    missingInfoQuestions: analysis.missingInfoQuestions,
    immediateGuide: analysis.immediateGuide,
    riskPresentation: analysis.riskPresentation,
    vetSummary: analysis.vetSummary,
    safetyNotice: SAFETY_MESSAGE,
  };
}

async function appendRecord(record: StoredFoodIngestionRecord): Promise<void> {
  await appendJsonRecord(
    resolveRecordFilePath("FOOD_INGESTION_RECORDS_PATH", DEFAULT_RECORDS_PATH),
    record,
    isStoredFoodIngestionRecord,
  );
}

function isStoredFoodIngestionRecord(value: unknown): value is StoredFoodIngestionRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { id?: unknown }).id === "string"
  );
}

function createRecordId(now: Date): string {
  const timestamp = now.toISOString().replace(/[-:.TZ]/g, "");
  const random = Math.random().toString(36).slice(2, 8);
  return `food_${timestamp}_${random}`;
}

function createBase64Preview(imageBase64: string | undefined): string | null {
  if (imageBase64 === undefined || imageBase64.trim().length === 0) {
    return null;
  }

  if (imageBase64.length <= BASE64_PREVIEW_LENGTH) {
    return "[base64 omitted]";
  }

  return `${imageBase64.slice(0, BASE64_PREVIEW_LENGTH)}...[base64 omitted]`;
}
