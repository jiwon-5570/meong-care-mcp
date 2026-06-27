import "dotenv/config";
import express, { type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { summarizePetChatForVet } from "./logic/chatSummaryRules.js";
import { createDailyCareNote } from "./logic/dailyCareNoteRules.js";
import { checkFoodSafety } from "./logic/foodRules.js";
import { buildKakaoActionText } from "./logic/kakaoActionTextRules.js";
import {
  analyzeDailyStatus,
  type DailyRiskLevel,
} from "./logic/riskRules.js";
import {
  createVetVisitSummary,
  recommendDailyCare,
} from "./logic/careRules.js";
import { findHospitalsByRegion } from "./logic/hospitalRules.js";
import { classifyPetSymptom } from "./logic/symptomRules.js";
import { loadAnimalHospitals } from "./services/publicDataHospitalService.js";
import { loadSymptomDictionary } from "./services/publicDataSymptomService.js";
import { recordPetPhotoObservation } from "./services/photoRecordService.js";
import { recordFoodIngestionEvent } from "./services/foodIngestionRecordService.js";
import { withSafetyMessage } from "./utils/safetyMessage.js";

const PORT = parsePort(process.env.PORT);
const MCP_ENDPOINT = "/mcp";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "10mb" }));

const transports: Record<string, StreamableHTTPServerTransport> = {};

const dogProfileSchema = z.object({
  dogName: z.string().optional(),
  ageYears: z.number().min(0).optional(),
  weightKg: z.number().positive().optional(),
  breed: z.string().optional(),
  sex: z.enum(["male", "female", "unknown"]).optional(),
  neutered: z.boolean().optional(),
  usualFood: z.string().optional(),
  usualAppetite: z.string().optional(),
  usualStool: z.string().optional(),
  usualEnergy: z.string().optional(),
  allergyOrSensitiveFoods: z.array(z.string()).optional(),
  knownConditions: z.array(z.string()).optional(),
  regularMedicationMemo: z.string().optional(),
  vetClinicName: z.string().optional(),
  vetPhone: z.string().optional(),
  guardianMemo: z.string().optional(),
}).optional();

const recentDailyStatusRecordSchema = z.object({
  recordedAt: z.string().optional(),
  dogName: z.string().optional(),
  riskLevel: z.enum(["normal", "watch", "vet_consult", "urgent"]).optional(),
  mainSymptoms: z.array(z.string()).optional(),
  appetite: z.string().optional(),
  stool: z.string().optional(),
  vomiting: z.string().optional(),
  energy: z.string().optional(),
  ownerConcern: z.string().optional(),
});

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    service: "meong-care-note-mcp",
    mcpEndpoint: MCP_ENDPOINT,
  });
});

app.post(MCP_ENDPOINT, async (req: Request, res: Response) => {
  try {
    const sessionId = getMcpSessionId(req);
    let transport: StreamableHTTPServerTransport;

    if (sessionId !== undefined && transports[sessionId] !== undefined) {
      transport = transports[sessionId];
    } else if (sessionId === undefined && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId: string) => {
          transports[newSessionId] = transport;
        },
      });

      transport.onclose = () => {
        if (transport.sessionId !== undefined) {
          delete transports[transport.sessionId];
        }
      };

      const server = createMcpServer();
      await server.connect(transport);
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: invalid or missing MCP session id.",
        },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    handleServerError(res, error);
  }
});

app.get(MCP_ENDPOINT, handleExistingMcpSession);
app.delete(MCP_ENDPOINT, handleExistingMcpSession);

app.listen(PORT, () => {
  console.log(`멍케어노트 MCP server is running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`MCP endpoint: http://localhost:${PORT}${MCP_ENDPOINT}`);
});

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "meong-care-note-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "check_food_safety",
    {
      title: "Check Dog Food Safety",
      description:
        "Checks dog food safety risk and guardian actions in MeongCareNote MCP(멍케어노트 MCP).",
      annotations: {
        title: "Check Dog Food Safety",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
      inputSchema: {
        foodName: z.string().min(1, "음식명을 입력해 주세요."),
        amount: z.string().optional(),
        dogWeightKg: z.number().positive().optional(),
      },
    },
    async (input) => {
      const result = withSafetyMessage(checkFoodSafety(input));
      return toToolResponse(result);
    },
  );

  server.registerTool(
    "analyze_daily_status",
    {
      title: "Analyze Daily Dog Status",
      description:
        "Classifies a dog's daily care risk level and can apply dogProfile defaults or compare recentRecords in MeongCareNote MCP(멍케어노트 MCP).",
      annotations: {
        title: "Analyze Daily Dog Status",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
      inputSchema: dailyStatusSchema(),
    },
    async (input) => {
      const analysis = analyzeDailyStatus(input);
      const care = recommendDailyCare({
        dogName: analysis.dogName,
        riskLevel: analysis.riskLevel,
        mainSymptoms: analysis.mainSymptoms,
        weightKg: input.weightKg,
        ageYears: input.ageYears,
      });

      const result = withSafetyMessage({
        dogName: analysis.dogName,
        riskLevel: analysis.riskLevel,
        reasons: analysis.reasons,
        mainSymptoms: analysis.mainSymptoms,
        knownInfo: analysis.knownInfo,
        missingInfoQuestions: analysis.missingInfoQuestions,
        currentAssessment: analysis.currentAssessment,
        riskPresentation: analysis.riskPresentation,
        dogProfileUsage: analysis.dogProfileUsage,
        trendSummary: analysis.trendSummary,
        kakaoActionText: buildKakaoActionText({
          source: "daily_status",
          dogName: analysis.dogName,
          riskLevel: analysis.riskLevel,
          riskPresentation: analysis.riskPresentation,
          mainSymptoms: analysis.mainSymptoms,
          knownInfo: analysis.knownInfo,
          missingInfoQuestions: analysis.missingInfoQuestions,
          ownerConcern: input.ownerConcern,
          dogProfileUsage: analysis.dogProfileUsage,
          trendSummary: analysis.trendSummary,
        }),
        todayCareRecommendations: [
          care.dietManagement,
          care.snackRestriction,
          care.waterCheck,
          care.walkIntensity,
          care.restRecommendation,
        ],
      });

      return toToolResponse(result);
    },
  );

  server.registerTool(
    "create_daily_care_note",
    {
      title: "Create Daily Dog Care Note",
      description:
        "Creates a combined daily care note with dogProfile defaults, recent-record trends, care guidance, and a vet summary in MeongCareNote MCP(멍케어노트 MCP).",
      annotations: {
        title: "Create Daily Dog Care Note",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
      inputSchema: dailyStatusSchema(),
    },
    async (input) => {
      const result = withSafetyMessage(createDailyCareNote(input));
      return toToolResponse(result);
    },
  );

  server.registerTool(
    "recommend_daily_care",
    {
      title: "Recommend Daily Dog Care",
      description:
        "Recommends daily diet, water, walk, and rest actions from risk level and symptoms in MeongCareNote MCP(멍케어노트 MCP).",
      annotations: {
        title: "Recommend Daily Dog Care",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
      inputSchema: {
        dogName: z.string().min(1, "반려견 이름을 입력해 주세요."),
        riskLevel: z.enum(["normal", "watch", "vet_consult", "urgent"]),
        mainSymptoms: z.array(z.string()),
        weightKg: z.number().positive().optional(),
        ageYears: z.number().min(0).optional(),
      },
    },
    async (input) => {
      const result = withSafetyMessage(
        recommendDailyCare({
          ...input,
          riskLevel: input.riskLevel as DailyRiskLevel,
        }),
      );
      return toToolResponse(result);
    },
  );

  server.registerTool(
    "create_vet_visit_summary",
    {
      title: "Create Vet Visit Summary",
      description:
        "Creates a concise veterinary visit summary from symptoms and care context in MeongCareNote MCP(멍케어노트 MCP).",
      annotations: {
        title: "Create Vet Visit Summary",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
      inputSchema: {
        dogName: z.string().min(1, "반려견 이름을 입력해 주세요."),
        ageYears: z.number().min(0).optional(),
        weightKg: z.number().positive().optional(),
        symptoms: z.array(z.string()),
        symptomStartedAt: z.string().optional(),
        appetite: z.string().optional(),
        stool: z.string().optional(),
        vomiting: z.string().optional(),
        energy: z.string().optional(),
        foodOrSnackToday: z.array(z.string()).optional(),
        ownerConcern: z.string().optional(),
        missingInfoQuestions: z.array(z.string()).optional(),
        riskLevel: z.enum(["normal", "watch", "vet_consult", "urgent"]).optional(),
      },
    },
    async (input) => {
      const result = withSafetyMessage(createVetVisitSummary(input));
      return toToolResponse(result);
    },
  );

  server.registerTool(
    "summarize_pet_chat_for_vet",
    {
      title: "Summarize Pet Chat For Vet",
      description:
        "Structures host-provided chatText with optional dogProfile and recentRecords into a veterinary consultation note. MeongCareNote MCP(멍케어노트 MCP) does not access KakaoTalk, perform OCR, diagnose disease, or prescribe treatment.",
      annotations: {
        title: "Summarize Pet Chat For Vet",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
      inputSchema: {
        dogName: z.string().optional(),
        ageYears: z.number().min(0).optional(),
        weightKg: z.number().positive().optional(),
        sourceType: z.enum(["pasted_text", "screenshot_ocr", "manual_memo"]),
        chatText: z
          .string()
          .min(1, "호스트 Agent가 대화 또는 캡처에서 읽어낸 텍스트를 입력해 주세요.")
          .describe("Text read from a conversation or screenshot by the host Agent; MCP does not perform OCR."),
        chatStartedAt: z.string().optional(),
        chatEndedAt: z.string().optional(),
        screenshotTakenAt: z.string().optional(),
        ownerMemo: z.string().optional(),
        dogProfile: dogProfileSchema,
        recentRecords: z.array(recentDailyStatusRecordSchema).optional(),
      },
    },
    async (input) => {
      const result = withSafetyMessage(summarizePetChatForVet(input));
      return toToolResponse(result);
    },
  );

  server.registerTool(
    "find_nearby_animal_hospitals",
    {
      title: "Find Nearby Animal Hospitals",
      description:
        "Finds animal hospital candidates by region using public data or local fallback data in MeongCareNote MCP(멍케어노트 MCP).",
      annotations: {
        title: "Find Nearby Animal Hospitals",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
        idempotentHint: true,
      },
      inputSchema: {
        region: z.string().min(1, "검색할 지역을 입력해 주세요."),
        maxResults: z.number().int().min(1).max(10).optional(),
        onlyOpen: z.boolean().optional(),
      },
    },
    async (input) => {
      const loaded = await loadAnimalHospitals(input.region, input.maxResults);
      const result = withSafetyMessage(
        findHospitalsByRegion(input, loaded.hospitals, loaded.dataNotice),
      );
      return toToolResponse(result);
    },
  );

  server.registerTool(
    "classify_pet_symptom",
    {
      title: "Classify Pet Symptom",
      description:
        "Normalizes guardian symptom text into symptom names and categories without diagnosis in MeongCareNote MCP(멍케어노트 MCP).",
      annotations: {
        title: "Classify Pet Symptom",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
        idempotentHint: true,
      },
      inputSchema: {
        text: z.string().min(1, "증상 표현을 입력해 주세요."),
        animalType: z.enum(["dog", "cat", "unknown"]).optional(),
      },
    },
    async (input) => {
      const loaded = await loadSymptomDictionary();
      const result = withSafetyMessage(
        classifyPetSymptom(input, loaded.dictionary, loaded.dataSource, loaded.dataNotice),
      );
      return toToolResponse(result);
    },
  );

  server.registerTool(
    "record_pet_photo_observation",
    {
      title: "Record Pet Photo Observation",
      description:
        "Records guardian or host-Agent observation text with optional dogProfile context without inspecting or diagnosing the original photo in MeongCareNote MCP(멍케어노트 MCP).",
      annotations: {
        title: "Record Pet Photo Observation",
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: false,
      },
      inputSchema: {
        dogName: z.string().optional(),
        photoType: z.enum(["stool", "skin"]),
        imageUrl: z
          .string()
          .url()
          .optional()
          .describe("Optional photo reference only; MCP does not fetch or analyze the image."),
        imageBase64: z
          .string()
          .optional()
          .describe("Optional photo presence record only; MCP does not analyze or store the full base64 data."),
        takenAt: z.string().optional(),
        visualNotes: z
          .string()
          .optional()
          .describe("Objective visual observations written by the guardian or extracted by the host Agent."),
        observedSigns: z
          .array(z.string())
          .optional()
          .describe("Observed signs supplied as text by the guardian or host Agent."),
        relatedSymptoms: z
          .array(z.string())
          .optional()
          .describe("Related symptoms supplied as text by the guardian or host Agent."),
        appetite: z.enum(["normal", "less", "none", "unknown"]).optional(),
        vomiting: z.enum(["none", "once", "multiple", "unknown"]).optional(),
        energy: z.enum(["normal", "low", "very_low", "unknown"]).optional(),
        dogProfile: dogProfileSchema,
      },
    },
    async (input) => {
      const result = withSafetyMessage(await recordPetPhotoObservation(input));
      return toToolResponse(result);
    },
  );

  server.registerTool(
    "record_food_ingestion_event",
    {
      title: "Record Food Ingestion Event",
      description:
        "Records a dog food ingestion event, applies optional dogProfile basics, and prepares a veterinary consultation summary in MeongCareNote MCP(멍케어노트 MCP).",
      annotations: {
        title: "Record Food Ingestion Event",
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: false,
      },
      inputSchema: {
        dogName: z.string().optional(),
        weightKg: z.number().positive().optional(),
        foodName: z.string().min(1, "음식명을 입력해 주세요."),
        foodDetail: z.string().optional(),
        amount: z.string().optional(),
        eatenAt: z.string().optional(),
        photoUrl: z.string().url().optional(),
        imageBase64: z.string().optional(),
        currentSymptoms: z.array(z.string()).optional(),
        ownerMemo: z.string().optional(),
        dogProfile: dogProfileSchema,
      },
    },
    async (input) => {
      const result = withSafetyMessage(await recordFoodIngestionEvent(input));
      return toToolResponse(result);
    },
  );

  return server;
}

function dailyStatusSchema() {
  return {
    dogName: z.string().optional(),
    ageYears: z.number().min(0).optional(),
    weightKg: z.number().positive().optional(),
    appetite: z.enum(["normal", "less", "none", "increased", "unknown"]).optional(),
    stool: z.enum(["normal", "soft", "diarrhea", "bloody", "unknown"]).optional(),
    vomiting: z.enum(["none", "once", "multiple", "unknown"]).optional(),
    energy: z.enum(["normal", "low", "very_low", "unknown"]).optional(),
    coughing: z.boolean().optional(),
    itching: z.boolean().optional(),
    eyeDischarge: z.boolean().optional(),
    foodOrSnackToday: z.array(z.string()).optional(),
    symptomStartedAt: z.string().optional(),
    ownerConcern: z.string().optional(),
    dogProfile: dogProfileSchema,
    recentRecords: z.array(recentDailyStatusRecordSchema).optional(),
  };
}

async function handleExistingMcpSession(req: Request, res: Response): Promise<void> {
  try {
    const sessionId = getMcpSessionId(req);

    if (sessionId === undefined || transports[sessionId] === undefined) {
      res.status(400).send("Invalid or missing MCP session id.");
      return;
    }

    await transports[sessionId].handleRequest(req, res);
  } catch (error) {
    handleServerError(res, error);
  }
}

function getMcpSessionId(req: Request): string | undefined {
  const rawSessionId = req.headers["mcp-session-id"];

  if (Array.isArray(rawSessionId)) {
    return rawSessionId[0];
  }

  return rawSessionId;
}

function parsePort(value: string | undefined): number {
  if (value === undefined || value.trim().length === 0) {
    return 3000;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    console.warn(`Invalid PORT value "${value}". Falling back to 3000.`);
    return 3000;
  }

  return parsed;
}

function toToolResponse(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function handleServerError(res: Response, error: unknown): void {
  console.error("MCP server error:", error);

  if (res.headersSent) {
    return;
  }

  res.status(500).json({
    jsonrpc: "2.0",
    error: {
      code: -32603,
      message: "Internal server error.",
    },
    id: null,
  });
}
