import "dotenv/config";
import express, { type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { checkFoodSafety } from "./logic/foodRules.js";
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
import { withSafetyMessage } from "./utils/safetyMessage.js";

const PORT = Number(process.env.PORT ?? 3000);
const MCP_ENDPOINT = "/mcp";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

const transports: Record<string, StreamableHTTPServerTransport> = {};

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
        "반려견이 먹은 음식의 위험도를 확인하고 보호자가 취해야 할 행동을 안내합니다.",
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
      description: "반려견의 오늘 상태를 바탕으로 위험도를 분류합니다.",
      inputSchema: {
        dogName: z.string().min(1, "반려견 이름을 입력해 주세요."),
        ageYears: z.number().min(0).optional(),
        weightKg: z.number().positive().optional(),
        appetite: z.enum(["normal", "less", "none", "increased"]),
        stool: z.enum(["normal", "soft", "diarrhea", "bloody", "unknown"]),
        vomiting: z.enum(["none", "once", "multiple"]),
        energy: z.enum(["normal", "low", "very_low"]),
        coughing: z.boolean().optional(),
        itching: z.boolean().optional(),
        eyeDischarge: z.boolean().optional(),
        foodOrSnackToday: z.array(z.string()).optional(),
        symptomStartedAt: z.string().optional(),
      },
    },
    async (input) => {
      const analysis = analyzeDailyStatus(input);
      const care = recommendDailyCare({
        dogName: input.dogName,
        riskLevel: analysis.riskLevel,
        mainSymptoms: analysis.mainSymptoms,
        weightKg: input.weightKg,
        ageYears: input.ageYears,
      });

      const result = withSafetyMessage({
        dogName: analysis.dogName,
        riskLevel: analysis.riskLevel,
        reasons: analysis.reasons,
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
    "recommend_daily_care",
    {
      title: "Recommend Daily Dog Care",
      description:
        "위험도와 주요 증상을 바탕으로 오늘의 식단, 산책, 휴식 관리 행동을 추천합니다.",
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
      description: "동물병원 상담 시 보여줄 수 있는 증상 요약문을 생성합니다.",
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
      },
    },
    async (input) => {
      const result = withSafetyMessage(createVetVisitSummary(input));
      return toToolResponse(result);
    },
  );

  server.registerTool(
    "find_nearby_animal_hospitals",
    {
      title: "Find Nearby Animal Hospitals",
      description:
        "공공데이터 또는 로컬 샘플 데이터를 사용해 입력 지역 근처 동물병원 후보를 안내합니다.",
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
        "보호자가 자연어로 입력한 증상 표현을 표준 증상명과 카테고리로 정리합니다. 질병명을 예측하지 않습니다.",
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
        "반려견 변 또는 피부 사진 기록을 저장하고, 보호자가 입력한 관찰 내용을 바탕으로 이상 징후와 위험도를 정리합니다.",
      inputSchema: {
        dogName: z.string().optional(),
        photoType: z.enum(["stool", "skin"]),
        imageUrl: z.string().url().optional(),
        imageBase64: z.string().optional(),
        takenAt: z.string().optional(),
        visualNotes: z.string().optional(),
        observedSigns: z.array(z.string()).optional(),
        relatedSymptoms: z.array(z.string()).optional(),
        appetite: z.enum(["normal", "less", "none", "unknown"]).optional(),
        vomiting: z.enum(["none", "once", "multiple", "unknown"]).optional(),
        energy: z.enum(["normal", "low", "very_low", "unknown"]).optional(),
      },
    },
    async (input) => {
      const result = withSafetyMessage(await recordPetPhotoObservation(input));
      return toToolResponse(result);
    },
  );

  return server;
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
