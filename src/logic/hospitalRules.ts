export type HospitalDataSource = "public_api" | "local_sample";

export interface AnimalHospital {
  name: string;
  address: string;
  businessStatus: string;
  phoneNumber?: string;
  licenseDate?: string;
  dataSource: HospitalDataSource;
}

export interface HospitalSearchInput {
  region: string;
  maxResults?: number;
  onlyOpen?: boolean;
}

export interface HospitalSearchResult {
  searchRegion: string;
  hospitals: AnimalHospital[];
  visitBeforeCallRecommendation: string;
  urgentSymptomMessage: string;
  dataNotice: string;
}

export function findHospitalsByRegion(
  input: HospitalSearchInput,
  hospitals: AnimalHospital[],
  dataNotice: string,
): HospitalSearchResult {
  const maxResults = normalizeMaxResults(input.maxResults);
  const region = input.region.trim();
  const matchedHospitals = hospitals
    .filter((hospital) => matchesRegion(hospital, region))
    .filter((hospital) => (input.onlyOpen === true ? isOpenStatus(hospital.businessStatus) : true))
    .slice(0, maxResults);

  return {
    searchRegion: region,
    hospitals: matchedHospitals,
    visitBeforeCallRecommendation:
      "방문 전에는 운영 여부, 진료 가능 시간, 응급 진료 가능 여부를 전화로 확인하는 것을 권장합니다.",
    urgentSymptomMessage:
      "혈변, 반복 구토, 매우 심한 무기력, 호흡 이상, 의식 저하처럼 응급 신호가 있으면 빠른 진료 권장을 우선하세요.",
    dataNotice,
  };
}

function matchesRegion(hospital: AnimalHospital, region: string): boolean {
  const compactRegion = compact(region);
  const compactTarget = compact(`${hospital.name} ${hospital.address}`);

  if (compactRegion.length === 0) {
    return true;
  }

  if (compactTarget.includes(compactRegion)) {
    return true;
  }

  const tokens = region
    .split(/\s+/)
    .map((token) => compact(token))
    .filter((token) => token.length > 0);

  return tokens.length > 0 && tokens.every((token) => compactTarget.includes(token));
}

function isOpenStatus(status: string): boolean {
  const normalizedStatus = compact(status);
  return (
    normalizedStatus.includes("영업") &&
    !normalizedStatus.includes("휴업") &&
    !normalizedStatus.includes("폐업") &&
    !normalizedStatus.includes("말소")
  );
}

function normalizeMaxResults(maxResults: number | undefined): number {
  if (maxResults === undefined) {
    return 5;
  }

  return Math.min(Math.max(Math.trunc(maxResults), 1), 10);
}

function compact(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}
