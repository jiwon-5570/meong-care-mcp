import { spawn } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = process.env.VALIDATE_MCP_PORT ?? "3177";
const ENDPOINT = `http://127.0.0.1:${PORT}/mcp`;
const REQUIRED_ANNOTATIONS = [
  "title",
  "readOnlyHint",
  "destructiveHint",
  "openWorldHint",
  "idempotentHint",
];
const BANNED_PHRASES = [
  "이 병입니다",
  "이 약을 먹이세요",
  "병원 안 가도 됩니다",
];
const EXPECTED_SAFETY_MESSAGE_PART = "진단이나 처방이 아니며";
const MOJIBAKE_HINTS = ["\u5360", "\u7b4c", "\u7670", "\ufffd", "\uf9ce", "\u8e42", "\u8adb", "\u6e72"];

const photoRecordsPath = path.join(tmpdir(), `meong-photo-records-${Date.now()}.json`);
const foodRecordsPath = path.join(tmpdir(), `meong-food-records-${Date.now()}.json`);

const toolCases = [
  {
    name: "check_food_safety",
    args: {
      foodName: "포도",
      amount: "한 알",
      dogWeightKg: 11,
    },
    assert: (payload) => {
      assert(payload.riskLevel === "danger", "check_food_safety should classify grape as danger.");
      assert(
        JSON.stringify(payload).includes("빠른 동물병원 상담 권장"),
        "check_food_safety should include fast vet consultation guidance for grape.",
      );
    },
  },
  {
    name: "analyze_daily_status",
    args: {
      dogName: "몽이",
      ageYears: 6,
      weightKg: 11,
      appetite: "less",
      stool: "soft",
      vomiting: "none",
      energy: "normal",
    },
    assert: (payload) => {
      assert(["watch", "vet_consult"].includes(payload.riskLevel), "analyze_daily_status returned unexpected riskLevel.");
    },
  },
  {
    name: "analyze_daily_status",
    args: {
      dogName: "몽이",
      ageYears: 6,
      weightKg: 11,
      appetite: "normal",
      stool: "normal",
      vomiting: "none",
      energy: "normal",
      foodOrSnackToday: ["포도 한 알"],
    },
    assert: (payload) => {
      assert(payload.riskLevel === "urgent", "analyze_daily_status should elevate dangerous food ingestion to urgent.");
      assert(
        JSON.stringify(payload).includes("위험 음식"),
        "analyze_daily_status should explain dangerous food context.",
      );
    },
  },
  {
    name: "analyze_daily_status",
    args: {
      dogName: "초코",
      ageYears: 12,
      weightKg: 7,
      appetite: "less",
      stool: "normal",
      vomiting: "none",
      energy: "normal",
      symptomStartedAt: "어제부터",
    },
    assert: (payload) => {
      assert(payload.riskLevel === "vet_consult", "analyze_daily_status should elevate persistent senior appetite loss to vet_consult.");
      assert(
        JSON.stringify(payload).includes("노령견") && JSON.stringify(payload).includes("지속"),
        "analyze_daily_status should explain senior and duration context.",
      );
    },
  },
  {
    name: "create_daily_care_note",
    args: {
      dogName: "몽이",
      ageYears: 6,
      weightKg: 11,
      appetite: "less",
      stool: "soft",
      vomiting: "none",
      energy: "normal",
      symptomStartedAt: "어제부터",
      ownerConcern: "밥을 반만 먹고 변이 묽어요.",
    },
    assert: (payload) => {
      assert(payload.riskLevel === "vet_consult", "create_daily_care_note should classify persistent symptoms as vet_consult.");
      assert(typeof payload.nextAction === "string", "create_daily_care_note should include nextAction.");
      assert(typeof payload.vetConsultPreparation?.vetVisitSummary === "string", "create_daily_care_note should include vet summary.");
    },
  },
  {
    name: "recommend_daily_care",
    args: {
      dogName: "몽이",
      riskLevel: "vet_consult",
      mainSymptoms: ["식욕 감소", "변이 묽음"],
      weightKg: 11,
      ageYears: 6,
    },
    assert: (payload) => {
      assert(Array.isArray(payload.symptomsToMonitor), "recommend_daily_care should include symptomsToMonitor.");
    },
  },
  {
    name: "create_vet_visit_summary",
    args: {
      dogName: "몽이",
      ageYears: 6,
      weightKg: 11,
      symptoms: ["식욕 감소", "묽은 변"],
      symptomStartedAt: "어제",
      appetite: "평소의 절반",
      stool: "묽음",
      vomiting: "없음",
      energy: "보통",
      foodOrSnackToday: ["사료"],
      ownerConcern: "어제부터 밥을 덜 먹습니다.",
    },
    assert: (payload) => {
      assert(typeof payload.vetVisitSummary === "string", "create_vet_visit_summary should include vetVisitSummary.");
    },
  },
  {
    name: "summarize_pet_chat_for_vet",
    args: {
      dogName: "몽이",
      ageYears: 6,
      weightKg: 11,
      sourceType: "screenshot_ocr",
      chatText:
        "엄마: 몽이가 아침부터 밥을 거의 안 먹어. 동생: 변이 좀 묽은 것 같아. 나: 구토는 있었어? 엄마: 구토는 안 했는데 계속 누워 있어. 동생: 어제 닭가슴살 조금 먹었대.",
      ownerMemo: "가족방 캡처에서 읽은 내용",
    },
    assert: (payload) => {
      assert(Array.isArray(payload.extractedSymptoms), "summarize_pet_chat_for_vet should include extractedSymptoms.");
      assert(typeof payload.vetVisitSummary === "string", "summarize_pet_chat_for_vet should include vetVisitSummary.");
      assert(typeof payload.privacyNotice === "string", "summarize_pet_chat_for_vet should include privacyNotice.");
      assert(
        ["watch", "vet_consult"].includes(payload.riskLevel),
        "summarize_pet_chat_for_vet should classify demo chat as watch or vet_consult.",
      );
    },
  },
  {
    name: "find_nearby_animal_hospitals",
    args: {
      region: "부산 진구",
      maxResults: 3,
    },
    assert: (payload) => {
      assert(Array.isArray(payload.hospitals), "find_nearby_animal_hospitals should include hospitals array.");
    },
  },
  {
    name: "classify_pet_symptom",
    args: {
      text: "밥을 안 먹고 축 처져 있어요",
      animalType: "dog",
    },
    assert: (payload) => {
      assert(Array.isArray(payload.extractedSymptoms), "classify_pet_symptom should include extractedSymptoms array.");
      assert(
        payload.extractedSymptoms.includes("식욕저하") && payload.extractedSymptoms.includes("무기력"),
        "classify_pet_symptom should extract appetite loss and lethargy from demo text.",
      );
    },
  },
  {
    name: "record_pet_photo_observation",
    args: {
      dogName: "몽이",
      photoType: "stool",
      imageBase64: "dGVzdC1pbWFnZS1kYXRh",
      takenAt: "오늘",
      visualNotes: "묽은 변처럼 보임",
      observedSigns: ["묽은 변"],
      relatedSymptoms: ["식욕 감소"],
      appetite: "less",
      vomiting: "none",
      energy: "normal",
    },
    assert: (payload) => {
      assert(typeof payload.photoRecordId === "string", "record_pet_photo_observation should include photoRecordId.");
    },
  },
  {
    name: "record_food_ingestion_event",
    args: {
      dogName: "몽이",
      weightKg: 11,
      foodName: "포도",
      foodDetail: "샤인머스캣",
      amount: "한 알",
      eatenAt: "30분 전",
      currentSymptoms: ["증상 없음"],
    },
    assert: (payload) => {
      assert(payload.riskLevel === "danger", "record_food_ingestion_event should classify grape as danger.");
      assert(
        JSON.stringify(payload).includes("빠른 동물병원 상담 권장"),
        "record_food_ingestion_event should include fast vet consultation guidance for danger.",
      );
      assert(typeof payload.safetyNotice === "string", "record_food_ingestion_event should include safetyNotice.");
    },
  },
];

let child;

try {
  await Promise.all([
    writeFile(photoRecordsPath, "{ invalid photo records json", "utf8"),
    writeFile(foodRecordsPath, "{ invalid food ingestion records json", "utf8"),
  ]);

  child = spawn(process.execPath, ["dist/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT,
      PHOTO_RECORDS_PATH: photoRecordsPath,
      FOOD_INGESTION_RECORDS_PATH: foodRecordsPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let serverOutput = "";
  child.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });

  await waitForServer();

  const sessionId = await initializeSession();
  await sendInitialized(sessionId);

  const tools = await listTools(sessionId);
  validateToolMetadata(tools);

  for (const toolCase of toolCases) {
    const payload = await callTool(sessionId, toolCase.name, toolCase.args);
    validateToolPayload(toolCase.name, payload);
    toolCase.assert(payload);
  }

  await validateRecordFiles();

  console.log("MCP validation passed.");
  console.log(`Validated ${tools.length} tools: ${tools.map((tool) => tool.name).join(", ")}`);
} catch (error) {
  console.error("MCP validation failed.");
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
} finally {
  if (child !== undefined) {
    child.kill();
  }

  await Promise.all([
    unlink(photoRecordsPath).catch(() => undefined),
    unlink(foodRecordsPath).catch(() => undefined),
  ]);
}

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (response.ok) {
        return;
      }
      lastError = new Error(`Health check returned ${response.status}.`);
    } catch (error) {
      lastError = error;
    }

    await sleep(250);
  }

  throw new Error(`Server did not become healthy. ${formatError(lastError)}`);
}

async function initializeSession() {
  const response = await postMcp(undefined, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: {
        name: "meong-care-validator",
        version: "0.1.0",
      },
    },
  });
  const sessionId = response.headers.get("mcp-session-id");

  assert(response.ok, `initialize failed with status ${response.status}.`);
  assert(sessionId !== null && sessionId.length > 0, "initialize did not return mcp-session-id.");

  return sessionId;
}

async function sendInitialized(sessionId) {
  const response = await postMcp(sessionId, {
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {},
  });

  assert(response.ok, `notifications/initialized failed with status ${response.status}.`);
}

async function listTools(sessionId) {
  const response = await postMcp(sessionId, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  });
  const body = await parseMcpBody(response);
  const tools = body?.result?.tools;

  assert(response.ok, `tools/list failed with status ${response.status}.`);
  assert(Array.isArray(tools), "tools/list did not return result.tools array.");

  return tools;
}

async function callTool(sessionId, name, args) {
  const response = await postMcp(sessionId, {
    jsonrpc: "2.0",
    id: `call-${name}`,
    method: "tools/call",
    params: {
      name,
      arguments: args,
    },
  });
  const body = await parseMcpBody(response);
  const text = body?.result?.content?.[0]?.text;

  assert(response.ok, `${name} call failed with status ${response.status}.`);
  assert(typeof text === "string", `${name} did not return text content.`);

  return JSON.parse(text);
}

async function postMcp(sessionId, body) {
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };

  if (sessionId !== undefined) {
    headers["mcp-session-id"] = sessionId;
  }

  return fetch(ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function parseMcpBody(response) {
  const text = await response.text();

  if (text.length === 0) {
    return undefined;
  }

  const dataLine = text.split(/\r?\n/).find((line) => line.startsWith("data: "));
  if (dataLine !== undefined) {
    return JSON.parse(dataLine.slice("data: ".length));
  }

  return JSON.parse(text);
}

function validateToolMetadata(tools) {
  assert(tools.length <= 20, "MCP server must not expose more than 20 tools.");
  assert(tools.length >= 3 && tools.length <= 10, "Recommended MCP tool count is 3 to 10.");

  const names = tools.map((tool) => tool.name);
  assert(new Set(names).size === names.length, "Tool names must be unique.");

  for (const tool of tools) {
    assert(typeof tool.name === "string" && tool.name.length >= 1, "Tool name is required.");
    assert(tool.name.length <= 128, `${tool.name} exceeds 128 characters.`);
    assert(/^[A-Za-z0-9_-]+$/.test(tool.name), `${tool.name} contains invalid characters.`);
    assert(typeof tool.description === "string" && tool.description.length > 0, `${tool.name} description is required.`);
    assert(tool.description.length <= 1024, `${tool.name} description exceeds 1024 characters.`);
    assert(
      tool.description.includes("MeongCareNote MCP(멍케어노트 MCP)"),
      `${tool.name} description must include MeongCareNote MCP(멍케어노트 MCP).`,
    );
    assert(tool.inputSchema !== undefined, `${tool.name} inputSchema is required.`);
    assert(tool.annotations !== undefined, `${tool.name} annotations are required.`);

    for (const key of REQUIRED_ANNOTATIONS) {
      assert(Object.hasOwn(tool.annotations, key), `${tool.name} annotations.${key} is required.`);
    }

    assert(typeof tool.annotations.title === "string", `${tool.name} annotations.title must be string.`);
    assert(typeof tool.annotations.readOnlyHint === "boolean", `${tool.name} annotations.readOnlyHint must be boolean.`);
    assert(typeof tool.annotations.destructiveHint === "boolean", `${tool.name} annotations.destructiveHint must be boolean.`);
    assert(typeof tool.annotations.openWorldHint === "boolean", `${tool.name} annotations.openWorldHint must be boolean.`);
    assert(typeof tool.annotations.idempotentHint === "boolean", `${tool.name} annotations.idempotentHint must be boolean.`);
  }
}

function validateToolPayload(toolName, payload) {
  assert(typeof payload === "object" && payload !== null, `${toolName} payload must be object.`);
  assert(typeof payload.safetyMessage === "string" && payload.safetyMessage.length > 0, `${toolName} must include safetyMessage.`);

  const serialized = JSON.stringify(payload);
  assert(
    payload.safetyMessage.includes(EXPECTED_SAFETY_MESSAGE_PART),
    `${toolName} safetyMessage should contain the standard Korean medical safety notice.`,
  );

  for (const hint of MOJIBAKE_HINTS) {
    assert(!serialized.includes(hint), `${toolName} payload may contain broken Korean text: ${hint}`);
  }

  for (const phrase of BANNED_PHRASES) {
    assert(!serialized.includes(phrase), `${toolName} contains banned medical phrase: ${phrase}`);
  }
}

async function validateRecordFiles() {
  const [photoBody, foodBody] = await Promise.all([
    readFile(photoRecordsPath, "utf8"),
    readFile(foodRecordsPath, "utf8"),
  ]);
  const photoRecords = JSON.parse(photoBody);
  const foodRecords = JSON.parse(foodBody);

  assert(Array.isArray(photoRecords) && photoRecords.length === 1, "Photo record validation file should contain one record.");
  assert(Array.isArray(foodRecords) && foodRecords.length === 1, "Food ingestion validation file should contain one record.");
  assert(photoRecords[0].imageBase64Preview === "[base64 omitted]", "Photo record should omit full base64 content.");
  assert(foodRecords[0].imageBase64 === null, "Food ingestion record should not store missing base64 content.");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
