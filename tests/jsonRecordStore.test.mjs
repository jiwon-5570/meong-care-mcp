import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  appendJsonRecord,
  resolveRecordFilePath,
} from "../dist/services/jsonRecordStore.js";

function isRecord(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value.id === "string"
  );
}

async function withTempDir(run) {
  const dir = await mkdtemp(path.join(tmpdir(), "meong-json-store-test-"));

  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("appendJsonRecord creates a missing file and appends records", async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, "records.json");

    await appendJsonRecord(filePath, { id: "one", value: 1 }, isRecord);
    await appendJsonRecord(filePath, { id: "two", value: 2 }, isRecord);

    const records = JSON.parse(await readFile(filePath, "utf8"));
    assert.deepEqual(records.map((record) => record.id), ["one", "two"]);
  });
});

test("appendJsonRecord serializes concurrent writes to one file", async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, "records.json");
    const records = Array.from({ length: 12 }, (_, index) => ({
      id: `record-${index}`,
      value: index,
    }));

    await Promise.all(records.map((record) => appendJsonRecord(filePath, record, isRecord)));

    const storedRecords = JSON.parse(await readFile(filePath, "utf8"));
    assert.equal(storedRecords.length, records.length);
    assert.deepEqual(
      storedRecords.map((record) => record.id).sort(),
      records.map((record) => record.id).sort(),
    );
  });
});

test("appendJsonRecord preserves invalid JSON and starts a new valid array", async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, "records.json");
    await writeFile(filePath, "{ invalid json", "utf8");

    await appendJsonRecord(filePath, { id: "new-record" }, isRecord);

    const records = JSON.parse(await readFile(filePath, "utf8"));
    assert.deepEqual(records, [{ id: "new-record" }]);

    const files = await readdir(dir);
    assert.ok(files.some((fileName) => fileName.startsWith("records.json.invalid-")));
  });
});

test("appendJsonRecord filters malformed old records", async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, "records.json");
    await writeFile(
      filePath,
      JSON.stringify([{ id: "kept" }, { value: "dropped" }, null], null, 2),
      "utf8",
    );

    await appendJsonRecord(filePath, { id: "added" }, isRecord);

    const records = JSON.parse(await readFile(filePath, "utf8"));
    assert.deepEqual(records.map((record) => record.id), ["kept", "added"]);
  });
});

test("resolveRecordFilePath uses env override or workspace-relative fallback", async () => {
  const envName = "MEONG_TEST_RECORD_PATH";
  const originalValue = process.env[envName];

  try {
    process.env[envName] = path.join(tmpdir(), "absolute-records.json");
    assert.equal(
      resolveRecordFilePath(envName, "src/data/fallback.json"),
      process.env[envName],
    );

    delete process.env[envName];
    assert.equal(
      resolveRecordFilePath(envName, "src/data/fallback.json"),
      path.join(process.cwd(), "src/data/fallback.json"),
    );
  } finally {
    if (originalValue === undefined) {
      delete process.env[envName];
    } else {
      process.env[envName] = originalValue;
    }
  }
});
