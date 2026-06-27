export interface DogProfile {
  dogName?: string;
  ageYears?: number;
  weightKg?: number;
  breed?: string;
  sex?: "male" | "female" | "unknown";
  neutered?: boolean;
  usualFood?: string;
  usualAppetite?: string;
  usualStool?: string;
  usualEnergy?: string;
  allergyOrSensitiveFoods?: string[];
  knownConditions?: string[];
  regularMedicationMemo?: string;
  vetClinicName?: string;
  vetPhone?: string;
  guardianMemo?: string;
}

export interface DogProfileUsage {
  applied: boolean;
  appliedFields: string[];
  missingProfileFields: string[];
  profileSummary: string;
}
