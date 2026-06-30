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
  "진단했습니다",
  "처방합니다",
  "정상 괜찮습니다",
  "확실히 괜찮습니다",
  "완치",
];
const EXPECTED_SAFETY_MESSAGE_PART = "진단이나 처방이 아니며";
const MOJIBAKE_HINTS = ["\u5360", "\u7b4c", "\u7670", "\ufffd", "\uf9ce", "\u8e42", "\u8adb", "\u6e72"];
const KAKAO_ACTION_REQUIRED_TOOLS = new Set([
  "analyze_daily_status",
  "create_daily_care_note",
  "summarize_pet_chat_for_vet",
  "record_food_ingestion_event",
  "record_pet_photo_observation",
]);
const TOOL_CHAIN_REQUIRED_TOOLS = new Set([
  "check_food_safety",
  "analyze_daily_status",
  "create_daily_care_note",
  "create_vet_visit_summary",
  "summarize_pet_chat_for_vet",
  "record_pet_photo_observation",
  "record_food_ingestion_event",
]);

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
      assert(payload.riskPresentation?.severityOrder === 4, "check_food_safety should include high severity riskPresentation.");
      assert(
        String(payload.riskPresentation?.riskBadge).includes("🚨"),
        "check_food_safety danger should include urgent visual badge.",
      );
      assert(
        JSON.stringify(payload).includes("빠른 동물병원 상담 권장"),
        "check_food_safety should include fast vet consultation guidance for grape.",
      );
      assert(!hasRecommendedTool(payload, "find_nearby_animal_hospitals"), "check_food_safety must not auto-recommend hospital search.");
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
      assert(typeof payload.kakaoActionText?.chatFirstReply === "string", "analyze_daily_status should include kakaoActionText.");
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
      assert(payload.riskPresentation?.severityOrder === 4, "analyze_daily_status urgent should include high severity presentation.");
      assert(
        String(payload.riskPresentation?.immediateAction).includes("동물병원"),
        "analyze_daily_status urgent presentation should include vet consultation action.",
      );
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
    name: "analyze_daily_status",
    args: {
      ownerConcern: "몽이가 아침부터 밥을 거의 안 먹어요.",
    },
    assert: (payload) => {
      assert(payload.dogName === "반려견", "analyze_daily_status should default dogName to 반려견.");
      assert(Array.isArray(payload.knownInfo), "analyze_daily_status should include knownInfo.");
      assert(Array.isArray(payload.missingInfoQuestions), "analyze_daily_status should include missingInfoQuestions.");
      assert(typeof payload.currentAssessment === "string", "analyze_daily_status should include currentAssessment.");
      assert(
        ["watch", "vet_consult"].includes(payload.riskLevel),
        "analyze_daily_status should classify incomplete appetite concern as watch or vet_consult.",
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
      assert(typeof payload.kakaoActionText?.familyShareText === "string", "create_daily_care_note should include kakaoActionText.");
    },
  },
  {
    name: "create_daily_care_note",
    args: {
      dogProfile: {
        dogName: "몽이",
        ageYears: 6,
        weightKg: 11,
        usualFood: "닭고기 사료",
        usualStool: "보통",
      },
      ownerConcern: "오늘도 밥을 거의 안 먹고 변이 묽어요.",
      recentRecords: [
        {
          recordedAt: "어제",
          dogName: "몽이",
          riskLevel: "watch",
          mainSymptoms: ["식욕 감소", "묽은 변"],
          appetite: "less",
          stool: "soft",
          vomiting: "none",
          energy: "normal",
        },
      ],
    },
    assert: (payload) => {
      assert(payload.dogName === "몽이", "dogProfile should fill dogName.");
      assert(payload.dogProfileUsage?.applied === true, "dogProfileUsage should be applied.");
      assert(
        payload.trendSummary?.comparedWithRecentRecords === true,
        "trendSummary should compare recent records.",
      );
      assert(typeof payload.kakaoActionText?.chatFirstReply === "string", "kakaoActionText should remain.");
      assert(typeof payload.vetShareCard?.copyableText === "string", "vetShareCard should remain.");
    },
  },
  {
    name: "create_daily_care_note",
    args: {
      ownerConcern: "우리 강아지가 밥을 안 먹고 계속 누워 있어요.",
    },
    assert: (payload) => {
      assert(payload.dogName === "반려견", "create_daily_care_note should default dogName to 반려견.");
      assert(
        ["watch", "vet_consult"].includes(payload.riskLevel),
        "create_daily_care_note should classify incomplete concern as watch or vet_consult.",
      );
      assert(
        Array.isArray(payload.missingInfoQuestions) && payload.missingInfoQuestions.length >= 3,
        "create_daily_care_note should include follow-up questions for incomplete input.",
      );
      assert(typeof payload.userFriendlyGuide === "string", "create_daily_care_note should include userFriendlyGuide.");
      assert(typeof payload.riskPresentation?.riskBadge === "string", "create_daily_care_note should include riskPresentation.");
      assert(typeof payload.vetShareCard?.copyableText === "string", "create_daily_care_note should include vetShareCard.");
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
      assert(typeof payload.riskPresentation?.riskBadge === "string", "recommend_daily_care should include riskPresentation.");
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
      riskLevel: "vet_consult",
    },
    assert: (payload) => {
      assert(typeof payload.vetVisitSummary === "string", "create_vet_visit_summary should include vetVisitSummary.");
      assert(typeof payload.vetShareCard?.copyableText === "string", "create_vet_visit_summary should include vetShareCard.");
      assert(!hasRecommendedTool(payload, "find_nearby_animal_hospitals"), "create_vet_visit_summary must not auto-recommend hospital search.");
    },
  },
  {
    name: "summarize_pet_chat_for_vet",
    args: {
      dogProfile: {
        dogName: "몽이",
        ageYears: 6,
        weightKg: 11,
      },
      sourceType: "screenshot_ocr",
      chatText:
        "엄마: 몽이가 아침부터 밥을 거의 안 먹어. 동생: 변이 좀 묽은 것 같아. 나: 구토는 있었어? 엄마: 구토는 안 했는데 계속 누워 있어. 동생: 어제 닭가슴살 조금 먹었대.",
      ownerMemo: "가족방 캡처에서 읽은 내용",
    },
    assert: (payload) => {
      assert(Array.isArray(payload.extractedSymptoms), "summarize_pet_chat_for_vet should include extractedSymptoms.");
      assert(typeof payload.vetVisitSummary === "string", "summarize_pet_chat_for_vet should include vetVisitSummary.");
      assert(typeof payload.vetShareCard?.copyableText === "string", "summarize_pet_chat_for_vet should include vetShareCard.");
      assert(typeof payload.privacyNotice === "string", "summarize_pet_chat_for_vet should include privacyNotice.");
      assert(typeof payload.riskPresentation?.riskBadge === "string", "summarize_pet_chat_for_vet should include riskPresentation.");
      assert(typeof payload.kakaoActionText?.vetCallScript === "string", "summarize_pet_chat_for_vet should include kakaoActionText.");
      assert(payload.dogProfileUsage?.applied === true, "summarize_pet_chat_for_vet should apply dogProfile.");
      assert(!hasRecommendedTool(payload, "find_nearby_animal_hospitals"), "summarize_pet_chat_for_vet must not auto-recommend hospital search.");
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
      dogProfile: {
        dogName: "몽이",
        ageYears: 6,
        weightKg: 11,
      },
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
      assert(typeof payload.riskPresentation?.riskBadge === "string", "record_pet_photo_observation should include riskPresentation.");
      assert(typeof payload.vetShareCard?.copyableText === "string", "record_pet_photo_observation should include vetShareCard.");
      assert(typeof payload.kakaoActionText?.familyShareText === "string", "record_pet_photo_observation should include kakaoActionText.");
      assert(payload.dogProfileUsage?.applied === true, "record_pet_photo_observation should apply dogProfile.");
      assert(typeof payload.photoFollowUpGuide === "object", "record_pet_photo_observation should include photoFollowUpGuide.");
      assert(typeof payload.photoQuality === "object", "record_pet_photo_observation should include photoQuality.");
      assert(Array.isArray(payload.nextPhotoGuide), "record_pet_photo_observation should include nextPhotoGuide.");
      assert(Array.isArray(payload.followUpObservationGuide), "record_pet_photo_observation should include followUpObservationGuide.");
      assert(Array.isArray(payload.comparisonFocus), "record_pet_photo_observation should include comparisonFocus.");
      assert(typeof payload.photoRetakeRecommended === "boolean", "record_pet_photo_observation should include photoRetakeRecommended.");
      assert(typeof payload.photoRecordUserMessage === "string", "record_pet_photo_observation should include photoRecordUserMessage.");
      assert(!hasRecommendedTool(payload, "find_nearby_animal_hospitals"), "record_pet_photo_observation must not auto-recommend hospital search.");
    },
  },
  {
    name: "record_food_ingestion_event",
    args: {
      dogProfile: {
        dogName: "몽이",
        weightKg: 11,
      },
      foodName: "포도",
      foodDetail: "샤인머스캣",
      amount: "한 알",
      eatenAt: "30분 전",
      currentSymptoms: ["증상 없음"],
    },
    assert: (payload) => {
      assert(payload.riskLevel === "danger", "record_food_ingestion_event should classify grape as danger.");
      assert(
        String(payload.riskPresentation?.riskBadge).includes("🚨"),
        "record_food_ingestion_event danger should include urgent visual badge.",
      );
      assert(typeof payload.vetShareCard?.copyableText === "string", "record_food_ingestion_event should include vetShareCard.");
      assert(typeof payload.kakaoActionText?.vetCallScript === "string", "record_food_ingestion_event should include kakaoActionText.");
      assert(payload.dogProfileUsage?.applied === true, "record_food_ingestion_event should apply dogProfile.");
      assert(
        /동물병원|상담/.test(`${payload.kakaoActionText.chatFirstReply} ${payload.kakaoActionText.vetCallScript}`),
        "record_food_ingestion_event kakaoActionText should include vet consultation wording.",
      );
      assert(
        JSON.stringify(payload).includes("빠른 동물병원 상담 권장"),
        "record_food_ingestion_event should include fast vet consultation guidance for danger.",
      );
      assert(typeof payload.safetyNotice === "string", "record_food_ingestion_event should include safetyNotice.");
      assert(!hasRecommendedTool(payload, "find_nearby_animal_hospitals"), "record_food_ingestion_event must not auto-recommend hospital search.");
    },
  },
  {
    name: "create_daily_care_note",
    args: {
      dogProfile: {
        dogName: "몽이",
        weightKg: 11,
      },
      ownerConcern: "몽이가 축 처져 있어요. 부산 진구 근처 동물병원 찾아줘.",
      ownerRequestedHospitalSearch: true,
    },
    assert: (payload) => {
      assert(hasRecommendedTool(payload, "find_nearby_animal_hospitals"), "Explicit hospital search should recommend find_nearby_animal_hospitals.");
      assert(payload.toolChainGuide?.vetContactGuide?.mode === "hospital_search_on_request", "Explicit hospital search should use hospital_search_on_request mode.");
      assert(payload.toolChainGuide?.vetContactGuide?.shouldAutoSearchHospital === false, "Hospital search must still require opt-in confirmation.");
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

  if (KAKAO_ACTION_REQUIRED_TOOLS.has(toolName)) {
    assert(payload.kakaoActionText !== undefined, `${toolName} must include kakaoActionText.`);
  }

  if (TOOL_CHAIN_REQUIRED_TOOLS.has(toolName)) {
    assert(payload.toolChainGuide !== undefined, `${toolName} must include toolChainGuide.`);
  }

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

  if (payload.kakaoActionText !== undefined) {
    assert(
      typeof payload.kakaoActionText === "object" && payload.kakaoActionText !== null,
      `${toolName} kakaoActionText must be object.`,
    );
    assert(
      typeof payload.kakaoActionText.chatFirstReply === "string" &&
        payload.kakaoActionText.chatFirstReply.length > 0,
      `${toolName} kakaoActionText.chatFirstReply is required.`,
    );
    assert(
      typeof payload.kakaoActionText.familyShareText === "string" &&
        payload.kakaoActionText.familyShareText.length > 0,
      `${toolName} kakaoActionText.familyShareText is required.`,
    );
    assert(
      typeof payload.kakaoActionText.vetCallScript === "string" &&
        payload.kakaoActionText.vetCallScript.length > 0,
      `${toolName} kakaoActionText.vetCallScript is required.`,
    );
    assert(
      typeof payload.kakaoActionText.nextInputExample === "string" &&
        payload.kakaoActionText.nextInputExample.length > 0,
      `${toolName} kakaoActionText.nextInputExample is required.`,
    );
    assert(
      Array.isArray(payload.kakaoActionText.whyThisRisk),
      `${toolName} kakaoActionText.whyThisRisk must be array.`,
    );
    assert(
      payload.kakaoActionText.whyThisRisk.length >= 2,
      `${toolName} kakaoActionText.whyThisRisk should include at least two reasons.`,
    );
  }

  if (payload.dogProfileUsage !== undefined) {
    assert(
      typeof payload.dogProfileUsage === "object" && payload.dogProfileUsage !== null,
      `${toolName} dogProfileUsage must be object.`,
    );
    assert(
      typeof payload.dogProfileUsage.applied === "boolean",
      `${toolName} dogProfileUsage.applied must be boolean.`,
    );
    assert(
      Array.isArray(payload.dogProfileUsage.appliedFields),
      `${toolName} dogProfileUsage.appliedFields must be array.`,
    );
    assert(
      Array.isArray(payload.dogProfileUsage.missingProfileFields),
      `${toolName} dogProfileUsage.missingProfileFields must be array.`,
    );
    assert(
      typeof payload.dogProfileUsage.profileSummary === "string",
      `${toolName} dogProfileUsage.profileSummary must be string.`,
    );
  }

  if (payload.trendSummary !== undefined) {
    assert(
      typeof payload.trendSummary === "object" && payload.trendSummary !== null,
      `${toolName} trendSummary must be object.`,
    );
    assert(
      typeof payload.trendSummary.comparedWithRecentRecords === "boolean",
      `${toolName} trendSummary.comparedWithRecentRecords must be boolean.`,
    );
    assert(
      typeof payload.trendSummary.userMessage === "string",
      `${toolName} trendSummary.userMessage must be string.`,
    );
    assert(
      Array.isArray(payload.trendSummary.repeatedSignals),
      `${toolName} trendSummary.repeatedSignals must be array.`,
    );
    assert(
      Array.isArray(payload.trendSummary.worseningSignals),
      `${toolName} trendSummary.worseningSignals must be array.`,
    );
  }

  if (payload.photoFollowUpGuide !== undefined) {
    assert(
      typeof payload.photoFollowUpGuide === "object" && payload.photoFollowUpGuide !== null,
      `${toolName} photoFollowUpGuide must be object.`,
    );
    assert(
      typeof payload.photoFollowUpGuide.photoQuality === "object" &&
        payload.photoFollowUpGuide.photoQuality !== null,
      `${toolName} photoQuality is required.`,
    );
    assert(
      Array.isArray(payload.photoFollowUpGuide.nextPhotoGuide),
      `${toolName} nextPhotoGuide must be array.`,
    );
    assert(
      Array.isArray(payload.photoFollowUpGuide.followUpObservationGuide),
      `${toolName} followUpObservationGuide must be array.`,
    );
    assert(
      Array.isArray(payload.photoFollowUpGuide.comparisonFocus),
      `${toolName} comparisonFocus must be array.`,
    );
    assert(
      typeof payload.photoFollowUpGuide.photoRetakeRecommended === "boolean",
      `${toolName} photoRetakeRecommended must be boolean.`,
    );
    assert(
      typeof payload.photoFollowUpGuide.photoRecordUserMessage === "string",
      `${toolName} photoRecordUserMessage must be string.`,
    );
  }

  if (payload.photoRecordUserMessage !== undefined) {
    assert(
      typeof payload.photoRecordUserMessage === "string",
      `${toolName} photoRecordUserMessage must be string.`,
    );
  }

  if (payload.toolChainGuide !== undefined) {
    assert(
      typeof payload.toolChainGuide === "object" && payload.toolChainGuide !== null,
      `${toolName} toolChainGuide must be object.`,
    );
    assert(
      typeof payload.toolChainGuide.currentStep === "string",
      `${toolName} toolChainGuide.currentStep is required.`,
    );
    assert(
      Array.isArray(payload.toolChainGuide.recommendedNextTools),
      `${toolName} recommendedNextTools must be array.`,
    );
    assert(
      typeof payload.toolChainGuide.stopCondition === "string",
      `${toolName} stopCondition is required.`,
    );
    assert(
      typeof payload.toolChainGuide.userConfirmationNeeded === "boolean",
      `${toolName} userConfirmationNeeded must be boolean.`,
    );

    if (payload.toolChainGuide.vetContactGuide !== undefined) {
      assert(
        typeof payload.toolChainGuide.vetContactGuide === "object" &&
          payload.toolChainGuide.vetContactGuide !== null,
        `${toolName} vetContactGuide must be object.`,
      );
      assert(
        payload.toolChainGuide.vetContactGuide.shouldAutoSearchHospital === false,
        `${toolName} shouldAutoSearchHospital must always be false.`,
      );
      assert(
        typeof payload.toolChainGuide.vetContactGuide.primaryMessage === "string",
        `${toolName} vetContactGuide.primaryMessage is required.`,
      );
      assert(
        typeof payload.toolChainGuide.vetContactGuide.hospitalSearchOptInPrompt === "string",
        `${toolName} hospitalSearchOptInPrompt is required.`,
      );
    }

    for (const nextTool of payload.toolChainGuide.recommendedNextTools) {
      assert(typeof nextTool.toolName === "string", `${toolName} nextTool.toolName is required.`);
      assert(typeof nextTool.reason === "string", `${toolName} nextTool.reason is required.`);
      assert(typeof nextTool.when === "string", `${toolName} nextTool.when is required.`);
      assert(
        ["low", "medium", "high"].includes(nextTool.priority),
        `${toolName} nextTool.priority is invalid.`,
      );
      assert(
        typeof nextTool.userConfirmationNeeded === "boolean",
        `${toolName} nextTool.userConfirmationNeeded is required.`,
      );
    }
  }

  if (typeof payload.riskLevel === "string") {
    assert(
      typeof payload.riskPresentation === "object" && payload.riskPresentation !== null,
      `${toolName} should include riskPresentation when riskLevel is present.`,
    );
    assert(
      typeof payload.riskPresentation.riskBadge === "string",
      `${toolName} riskPresentation.riskBadge is required.`,
    );
    assert(
      typeof payload.riskPresentation.immediateAction === "string",
      `${toolName} riskPresentation.immediateAction is required.`,
    );
    assert(
      typeof payload.riskPresentation.severityOrder === "number",
      `${toolName} riskPresentation.severityOrder is required.`,
    );
  }

  if (payload.vetShareCard !== undefined) {
    assert(
      typeof payload.vetShareCard === "object" && payload.vetShareCard !== null,
      `${toolName} vetShareCard must be object.`,
    );
    assert(
      typeof payload.vetShareCard.copyableText === "string",
      `${toolName} vetShareCard.copyableText is required.`,
    );
    assert(
      payload.vetShareCard.copyableText.includes("병원 상담용 요약"),
      `${toolName} vetShareCard.copyableText should be a vet consultation summary.`,
    );
    assert(
      payload.vetShareCard.copyableText.includes("진단이나 처방이 아닙니다"),
      `${toolName} vetShareCard should include safety note.`,
    );
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

function hasRecommendedTool(payload, toolName) {
  return payload.toolChainGuide?.recommendedNextTools?.some((tool) => tool.toolName === toolName) === true;
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
