import type {
  AppetiteStatus,
  DailyRiskLevel,
  EnergyStatus,
  StoolStatus,
  VomitingStatus,
} from "./riskRules.js";

export interface RecentDailyStatusRecord {
  recordedAt?: string;
  dogName?: string;
  riskLevel?: DailyRiskLevel;
  mainSymptoms?: string[];
  appetite?: AppetiteStatus | string;
  stool?: StoolStatus | string;
  vomiting?: VomitingStatus | string;
  energy?: EnergyStatus | string;
  ownerConcern?: string;
}

export interface TrendSummary {
  comparedWithRecentRecords: boolean;
  recentRecordCount: number;
  repeatedSignals: string[];
  worseningSignals: string[];
  improvingSignals: string[];
  trendRiskReason: string;
  trendLabel: "no_recent_data" | "stable" | "repeated" | "worsening" | "improving" | "mixed";
  userMessage: string;
}

export function buildTrendSummary(input: {
  dogName: string;
  riskLevel: DailyRiskLevel;
  mainSymptoms: string[];
  appetite?: AppetiteStatus | string;
  stool?: StoolStatus | string;
  vomiting?: VomitingStatus | string;
  energy?: EnergyStatus | string;
  recentRecords?: RecentDailyStatusRecord[];
}): TrendSummary {
  const recentRecords = input.recentRecords ?? [];

  if (recentRecords.length === 0) {
    const message = "비교할 최근 기록이 아직 없어 오늘 기록을 기준점으로 사용할 수 있습니다.";
    return {
      comparedWithRecentRecords: false,
      recentRecordCount: 0,
      repeatedSignals: [],
      worseningSignals: [],
      improvingSignals: [],
      trendRiskReason: "최근 기록이 없어 오늘 기록을 기준점으로 저장해두면 다음 비교에 도움이 됩니다.",
      trendLabel: "no_recent_data",
      userMessage: message,
    };
  }

  const currentSignals = collectSignals({
    mainSymptoms: input.mainSymptoms,
    appetite: input.appetite,
    stool: input.stool,
    vomiting: input.vomiting,
    energy: input.energy,
  });
  const recentSignals = new Set(
    recentRecords.flatMap((record) => collectSignals(record)),
  );
  const repeatedSignals = currentSignals.filter((signal) => recentSignals.has(signal));
  const latest = recentRecords.at(-1) ?? {};
  const worseningSignals: string[] = [];
  const improvingSignals: string[] = [];

  compareSeverity(
    riskSeverity(latest.riskLevel),
    riskSeverity(input.riskLevel),
    "위험도 상승",
    "위험도 하락",
    worseningSignals,
    improvingSignals,
  );
  compareSeverity(
    appetiteSeverity(latest.appetite),
    appetiteSeverity(input.appetite),
    "식욕 상태가 나빠진 것으로 보임",
    "식욕 상태가 나아진 것으로 보임",
    worseningSignals,
    improvingSignals,
  );
  compareSeverity(
    stoolSeverity(latest.stool),
    stoolSeverity(input.stool),
    "변 상태가 나빠진 것으로 보임",
    "변 상태가 나아진 것으로 보임",
    worseningSignals,
    improvingSignals,
  );
  compareSeverity(
    vomitingSeverity(latest.vomiting),
    vomitingSeverity(input.vomiting),
    "구토 상태가 늘어난 것으로 보임",
    "구토 상태가 줄어든 것으로 보임",
    worseningSignals,
    improvingSignals,
  );
  compareSeverity(
    energySeverity(latest.energy),
    energySeverity(input.energy),
    "활동량이 낮아진 것으로 보임",
    "활동량이 나아진 것으로 보임",
    worseningSignals,
    improvingSignals,
  );

  const uniqueRepeated = uniqueStrings(repeatedSignals);
  const uniqueWorsening = uniqueStrings(worseningSignals);
  const uniqueImproving = uniqueStrings(improvingSignals);
  const trendLabel = classifyTrend(uniqueRepeated, uniqueWorsening, uniqueImproving);
  const trendRiskReason = buildTrendRiskReason(
    trendLabel,
    uniqueRepeated,
    uniqueWorsening,
    uniqueImproving,
  );

  return {
    comparedWithRecentRecords: true,
    recentRecordCount: recentRecords.length,
    repeatedSignals: uniqueRepeated,
    worseningSignals: uniqueWorsening,
    improvingSignals: uniqueImproving,
    trendRiskReason,
    trendLabel,
    userMessage: `${input.dogName}의 최근 기록 ${recentRecords.length}건과 비교했습니다. ${trendRiskReason}`,
  };
}

function collectSignals(input: {
  mainSymptoms?: string[];
  appetite?: AppetiteStatus | string;
  stool?: StoolStatus | string;
  vomiting?: VomitingStatus | string;
  energy?: EnergyStatus | string;
  ownerConcern?: string;
}): string[] {
  const values = [
    ...(input.mainSymptoms ?? []),
    ...(input.ownerConcern !== undefined ? [input.ownerConcern] : []),
  ];
  const signals = values.flatMap(canonicalizeTextSignals);
  const appetite = normalizeStatus(input.appetite);
  const stool = normalizeStatus(input.stool);
  const vomiting = normalizeStatus(input.vomiting);
  const energy = normalizeStatus(input.energy);

  if (["less", "none", "감소", "없음", "안먹음"].includes(appetite)) signals.push("식욕 감소");
  if (["soft", "묽음", "무름"].includes(stool)) signals.push("묽은 변");
  if (["diarrhea", "설사"].includes(stool)) signals.push("설사");
  if (["bloody", "혈변"].includes(stool)) signals.push("혈변");
  if (["once", "multiple", "1회", "반복"].includes(vomiting)) signals.push("구토");
  if (["low", "very_low", "낮음", "매우낮음"].includes(energy)) signals.push("활동량 감소");

  return uniqueStrings(signals);
}

function canonicalizeTextSignals(value: string): string[] {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "");
  const signals: string[] = [];

  if (/식욕|밥|사료/.test(normalized) && /감소|덜먹|반만|안먹|못먹|거의안/.test(normalized)) {
    signals.push("식욕 감소");
  }
  if (/묽은변|변이묽|무른변|묽어/.test(normalized)) signals.push("묽은 변");
  if (/설사|물변/.test(normalized)) signals.push("설사");
  if (/혈변|피가섞|붉은변/.test(normalized)) signals.push("혈변");
  if (
    /구토|토했|계속토|토하고/.test(normalized) &&
    !/구토없|구토는없|토는안|토하지않/.test(normalized)
  ) {
    signals.push("구토");
  }
  if (/활동량감소|무기력|축처|계속누워|기운없/.test(normalized)) signals.push("활동량 감소");

  if (signals.length === 0 && value.trim().length > 0) {
    signals.push(value.trim());
  }

  return signals;
}

function compareSeverity(
  recent: number | undefined,
  current: number | undefined,
  worseningLabel: string,
  improvingLabel: string,
  worseningSignals: string[],
  improvingSignals: string[],
): void {
  if (recent === undefined || current === undefined || recent === current) {
    return;
  }

  if (current > recent) {
    worseningSignals.push(worseningLabel);
  } else {
    improvingSignals.push(improvingLabel);
  }
}

function classifyTrend(
  repeatedSignals: string[],
  worseningSignals: string[],
  improvingSignals: string[],
): TrendSummary["trendLabel"] {
  if (worseningSignals.length > 0 && improvingSignals.length > 0) return "mixed";
  if (worseningSignals.length > 0) return "worsening";
  if (improvingSignals.length > 0 && repeatedSignals.length > 0) return "mixed";
  if (improvingSignals.length > 0) return "improving";
  if (repeatedSignals.length > 0) return "repeated";
  return "stable";
}

function buildTrendRiskReason(
  trendLabel: TrendSummary["trendLabel"],
  repeatedSignals: string[],
  worseningSignals: string[],
  improvingSignals: string[],
): string {
  if (trendLabel === "worsening") {
    const worsening = worseningSignals.slice(0, 2).join(", ");
    const repeated = repeatedSignals.length > 0
      ? ` ${repeatedSignals.slice(0, 2).join(", ")}도 최근 기록에서 반복된 것으로 보입니다.`
      : "";
    return `최근 기록보다 ${worsening} 변화가 있어 나빠진 것으로 보입니다.${repeated}`;
  }

  if (trendLabel === "improving") {
    return `최근 기록보다 ${improvingSignals.slice(0, 2).join(", ")} 변화가 있어 나아진 것으로 보입니다.`;
  }

  if (trendLabel === "mixed") {
    return `최근 기록과 비교해 반복 또는 나빠진 신호와 나아진 신호가 함께 보여 계속 기록하며 관찰할 필요가 있습니다.`;
  }

  if (trendLabel === "repeated") {
    return `${repeatedSignals.slice(0, 3).join(", ")}가 최근 기록에서도 반복된 것으로 보여 상담 판단에 참고했습니다.`;
  }

  return "최근 기록과 비교해 뚜렷한 상태 변화 신호가 많지 않지만 계속 기록하면 다음 비교에 도움이 됩니다.";
}

function riskSeverity(value: DailyRiskLevel | undefined): number | undefined {
  const levels: Record<DailyRiskLevel, number> = {
    normal: 1,
    watch: 2,
    vet_consult: 3,
    urgent: 4,
  };
  return value !== undefined ? levels[value] : undefined;
}

function appetiteSeverity(value: AppetiteStatus | string | undefined): number | undefined {
  return severityFromAliases(value, {
    normal: 0,
    increased: 0,
    less: 1,
    none: 2,
    unknown: undefined,
    정상: 0,
    증가: 0,
    감소: 1,
    없음: 2,
  });
}

function stoolSeverity(value: StoolStatus | string | undefined): number | undefined {
  return severityFromAliases(value, {
    normal: 0,
    soft: 1,
    diarrhea: 2,
    bloody: 3,
    unknown: undefined,
    정상: 0,
    묽음: 1,
    무름: 1,
    설사: 2,
    혈변: 3,
  });
}

function vomitingSeverity(value: VomitingStatus | string | undefined): number | undefined {
  return severityFromAliases(value, {
    none: 0,
    once: 1,
    multiple: 2,
    unknown: undefined,
    없음: 0,
    "1회": 1,
    반복: 2,
  });
}

function energySeverity(value: EnergyStatus | string | undefined): number | undefined {
  return severityFromAliases(value, {
    normal: 0,
    low: 1,
    very_low: 2,
    unknown: undefined,
    정상: 0,
    낮음: 1,
    매우낮음: 2,
  });
}

function severityFromAliases(
  value: string | undefined,
  aliases: Record<string, number | undefined>,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return aliases[normalizeStatus(value)];
}

function normalizeStatus(value: string | undefined): string {
  return value?.trim().toLowerCase().replace(/\s+/g, "") ?? "";
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
