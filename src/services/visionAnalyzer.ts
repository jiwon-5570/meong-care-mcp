import { analyzePhotoObservation } from "../logic/photoRules.js";
import type {
  PhotoObservationAnalysis,
  PhotoObservationInput,
  PhotoType,
} from "../types/photoRecord.js";

export interface VisionAnalyzer {
  analyze(input: PhotoObservationInput): Promise<PhotoObservationAnalysis>;
}

export interface PetImageAnalysisInput {
  imageBase64: string;
  photoType: PhotoType;
}

export interface PetImageAnalysisResult {
  visualNotes: string;
  observedSigns: string[];
}

interface AnthropicMessageResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
}

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";
const FAILED_IMAGE_ANALYSIS: PetImageAnalysisResult = {
  visualNotes: "사진 분석에 실패했습니다.",
  observedSigns: [],
};

const SYSTEM_PROMPT = `
너는 수의사를 보조하기 위해 반려견의 변이나 피부 사진을 관찰하는 AI 어시스턴트야.

[절대 지켜야 할 원칙]
- 병명, 원인, 치료법을 추측하거나 단정하지 마.
- 사진에 보이는 시각적이고 객관적인 사실만 묘사해. 예: 색상, 형태, 점액질 또는 혈변처럼 보이는 부분, 붉은기, 각질, 탈모 범위, 상처처럼 보이는 부분.
- 사진만으로 확인하기 어려운 내용은 "사진만으로는 확인하기 어렵습니다"라고 표현해.
- 수의사 상담을 돕기 위한 관찰 기록만 생성해.
- 출력은 반드시 구조화된 JSON 형식으로만 응답해.
- JSON schema는 반드시 {"visualNotes": string, "observedSigns": string[]} 형태를 지켜.
`.trim();

export async function analyzePetImage(
  input: PetImageAnalysisInput,
): Promise<PetImageAnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();

  if (apiKey === undefined || apiKey.length === 0 || input.imageBase64.trim().length === 0) {
    return FAILED_IMAGE_ANALYSIS;
  }

  try {
    const imageSource = parseImageBase64(input.imageBase64);
    const response = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        model: readAnthropicModel(),
        max_tokens: 700,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: imageSource.mediaType,
                  data: imageSource.data,
                },
              },
              {
                type: "text",
                text: buildUserPrompt(input.photoType),
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      return FAILED_IMAGE_ANALYSIS;
    }

    const body = (await response.json()) as AnthropicMessageResponse;
    return parseAnalysisResult(extractTextContent(body));
  } catch {
    return FAILED_IMAGE_ANALYSIS;
  }
}

export class RuleBasedVisionAnalyzer implements VisionAnalyzer {
  async analyze(input: PhotoObservationInput): Promise<PhotoObservationAnalysis> {
    if (input.imageBase64 === undefined || input.imageBase64.trim().length === 0) {
      return analyzePhotoObservation(input);
    }

    const aiObservation = await analyzePetImage({
      imageBase64: input.imageBase64,
      photoType: input.photoType,
    });

    if (aiObservation.visualNotes === FAILED_IMAGE_ANALYSIS.visualNotes) {
      return analyzePhotoObservation(input);
    }

    return analyzePhotoObservation({
      ...input,
      visualNotes: joinText(input.visualNotes, aiObservation.visualNotes),
      observedSigns: uniqueStrings([...(input.observedSigns ?? []), ...aiObservation.observedSigns]),
    });
  }
}

function buildUserPrompt(photoType: PhotoType): string {
  const target = photoType === "stool" ? "반려견의 변 사진" : "반려견의 피부 사진";

  return [
    `${target}을 관찰해 주세요.`,
    "진단하지 말고 사진에 보이는 객관적 특징만 정리해 주세요.",
    "반드시 JSON만 반환해 주세요.",
    '반환 예시: {"visualNotes":"갈색 변이며 일부 묽어 보입니다.","observedSigns":["묽은 변처럼 보임","점액질처럼 보이는 부분"]}',
  ].join("\n");
}

function parseImageBase64(imageBase64: string): { data: string; mediaType: string } {
  const trimmed = imageBase64.trim();
  const dataUrlMatch = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(trimmed);

  if (dataUrlMatch !== null) {
    return {
      mediaType: dataUrlMatch[1],
      data: dataUrlMatch[2].replace(/\s+/g, ""),
    };
  }

  return {
    mediaType: "image/jpeg",
    data: trimmed.replace(/\s+/g, ""),
  };
}

function readAnthropicModel(): string {
  const configuredModel = process.env.ANTHROPIC_MODEL?.trim();
  return configuredModel !== undefined && configuredModel.length > 0
    ? configuredModel
    : DEFAULT_ANTHROPIC_MODEL;
}

function extractTextContent(body: AnthropicMessageResponse): string {
  return (body.content ?? [])
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n")
    .trim();
}

function parseAnalysisResult(text: string): PetImageAnalysisResult {
  if (text.length === 0) {
    return FAILED_IMAGE_ANALYSIS;
  }

  try {
    const parsed = JSON.parse(stripMarkdownJsonFence(text)) as unknown;

    if (!isPetImageAnalysisResult(parsed)) {
      return FAILED_IMAGE_ANALYSIS;
    }

    return {
      visualNotes: parsed.visualNotes,
      observedSigns: parsed.observedSigns,
    };
  } catch {
    return FAILED_IMAGE_ANALYSIS;
  }
}

function stripMarkdownJsonFence(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function isPetImageAnalysisResult(value: unknown): value is PetImageAnalysisResult {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { visualNotes?: unknown }).visualNotes === "string" &&
    Array.isArray((value as { observedSigns?: unknown }).observedSigns) &&
    (value as { observedSigns: unknown[] }).observedSigns.every((item) => typeof item === "string")
  );
}

function joinText(left: string | undefined, right: string): string {
  if (left === undefined || left.trim().length === 0) {
    return right;
  }

  return `${left.trim()}\n${right}`;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );
}
