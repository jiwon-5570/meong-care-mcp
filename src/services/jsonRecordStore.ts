import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const writeQueues = new Map<string, Promise<void>>();

export function resolveRecordFilePath(
  envName: string,
  fallbackRelativePath: string,
): string {
  const configuredPath = process.env[envName]?.trim();
  const targetPath = configuredPath !== undefined && configuredPath.length > 0
    ? configuredPath
    : fallbackRelativePath;

  return path.isAbsolute(targetPath)
    ? targetPath
    : path.join(process.cwd(), targetPath);
}

export async function appendJsonRecord<T>(
  filePath: string,
  record: T,
  isRecord: (value: unknown) => value is T,
): Promise<void> {
  const currentQueue = writeQueues.get(filePath) ?? Promise.resolve();
  const nextQueue = currentQueue.then(() => appendJsonRecordUnsafe(filePath, record, isRecord));

  writeQueues.set(
    filePath,
    nextQueue.catch(() => undefined),
  );

  try {
    await nextQueue;
  } finally {
    if (writeQueues.get(filePath) === nextQueue) {
      writeQueues.delete(filePath);
    }
  }
}

async function appendJsonRecordUnsafe<T>(
  filePath: string,
  record: T,
  isRecord: (value: unknown) => value is T,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const records = await readExistingRecords(filePath, isRecord);
  records.push(record);
  await writeJsonArrayAtomically(filePath, records);
}

async function readExistingRecords<T>(
  filePath: string,
  isRecord: (value: unknown) => value is T,
): Promise<T[]> {
  let body: string;

  try {
    body = await readFile(filePath, "utf8");
  } catch {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(body);
  } catch {
    await preserveInvalidJson(filePath, body);
    return [];
  }

  if (!Array.isArray(parsed)) {
    await preserveInvalidJson(filePath, body);
    return [];
  }

  return parsed.filter(isRecord);
}

async function preserveInvalidJson(filePath: string, body: string): Promise<void> {
  const backupPath = `${filePath}.invalid-${createTimestamp()}.bak`;

  try {
    await writeFile(backupPath, body, "utf8");
  } catch {
    // Best effort only. A new valid record file will still be written.
  }
}

async function writeJsonArrayAtomically<T>(filePath: string, records: T[]): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${createTimestamp()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);
}

function createTimestamp(): string {
  return new Date().toISOString().replace(/[-:.TZ]/g, "");
}
