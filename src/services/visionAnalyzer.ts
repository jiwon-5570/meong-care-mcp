import { analyzePhotoObservation } from "../logic/photoRules.js";
import type {
  PhotoObservationAnalysis,
  PhotoObservationInput,
} from "../types/photoRecord.js";

export interface VisionAnalyzer {
  analyze(input: PhotoObservationInput): Promise<PhotoObservationAnalysis>;
}

export class RuleBasedVisionAnalyzer implements VisionAnalyzer {
  async analyze(input: PhotoObservationInput): Promise<PhotoObservationAnalysis> {
    return analyzePhotoObservation(input);
  }
}
