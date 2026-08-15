export type ResumeImportConfidenceLevel = "high" | "medium" | "low";

export type ResumeImportFieldKind =
  | "identity"
  | "organization"
  | "title"
  | "location"
  | "date"
  | "credential"
  | "field_of_study";

export interface ResumeImportFieldConfidence {
  /** Stable path into ResumeProfile, suitable for linking a warning to its editor. */
  path: string;
  label: string;
  value: string;
  kind: ResumeImportFieldKind;
  confidence: ResumeImportConfidenceLevel;
  reason: "missing" | "ambiguous" | "fused" | "inferred" | "well_formed";
}

export interface ResumeImportAssessment {
  overall: ResumeImportConfidenceLevel;
  fields: ResumeImportFieldConfidence[];
  reviewPaths: string[];
}

export interface ResumeImportCounts {
  experience: number;
  education: number;
  projects: number;
  skills: number;
  additional: number;
}
