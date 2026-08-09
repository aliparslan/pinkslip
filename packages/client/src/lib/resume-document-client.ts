import type { TailoredResume } from "../../../../shared/tailoring";
import {
  buildResumeTypstSource,
  removeLowestPriorityContent,
} from "./resume-document";

interface WorkerResponse {
  id: number;
  pdf?: ArrayBuffer;
  svg?: string;
  pageCount?: number;
  error?: string;
}

export interface CompiledResumeDocument {
  resume: TailoredResume;
  source: string;
  pdf: Uint8Array;
  svg: string;
  pageCount: number;
}

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, {
  resolve: (value: WorkerResponse) => void;
  reject: (reason: Error) => void;
}>();

function compilerWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./resume-document.worker.ts", import.meta.url), { type: "module" });
  worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
    const request = pending.get(event.data.id);
    if (!request) return;
    pending.delete(event.data.id);
    if (event.data.error) request.reject(new Error(event.data.error));
    else request.resolve(event.data);
  });
  worker.addEventListener("error", () => {
    for (const request of pending.values()) request.reject(new Error("The resume compiler stopped unexpectedly."));
    pending.clear();
    worker?.terminate();
    worker = null;
  });
  return worker;
}

function compileSource(source: string): Promise<WorkerResponse> {
  const id = nextRequestId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    compilerWorker().postMessage({ id, source });
  });
}

export async function compileResumeDocument(
  initialResume: TailoredResume,
  priorityEvidenceIds: string[],
): Promise<CompiledResumeDocument> {
  let resume = structuredClone(initialResume);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const source = buildResumeTypstSource(resume);
    const result = await compileSource(source);
    if (!result.pdf || !result.svg || !result.pageCount) {
      throw new Error("The resume compiler returned an incomplete document.");
    }
    if (result.pageCount <= 1) {
      return { resume, source, pdf: new Uint8Array(result.pdf), svg: result.svg, pageCount: result.pageCount };
    }
    const removal = removeLowestPriorityContent(resume, priorityEvidenceIds);
    if (!removal.removed) {
      if (result.pageCount <= 2) {
        return { resume, source, pdf: new Uint8Array(result.pdf), svg: result.svg, pageCount: result.pageCount };
      }
      throw new Error("This resume needs more than two pages even at the minimum type size.");
    }
    resume = removal.resume;
  }
  throw new Error("The resume could not be fitted safely within two pages.");
}
