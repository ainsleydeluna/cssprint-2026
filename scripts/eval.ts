// The bake-off (docs/spec.md decision 27, section 4 C10, section 11): runs
// analyzeBouquet over the hand-counted bouquets and extractReceipt over the
// receipts, for each model and photo size, scores them with scripts/evalScore.ts,
// writes fixtures/eval/results.json and names the winner.
//
//   npm run eval                     every model, both sizes (live calls; costs money)
//   npm run eval -- --dry-run        fake answers, no key needed; writes to a temp folder
//   npm run eval -- --rescore        scores the saved answers again, no calls
//   npm run eval -- --limit 2 --model claude-haiku-5-5 --px 1600
//
// Every answer is saved under fixtures/eval/answers/<model>/<px>/<photo>.json,
// including bouquets with a count of 0, which are scored once counted. A run
// that left anything out (--limit, --model or --px, a missing or unreadable
// photo, an uncounted bouquet, a missing saved answer, or nothing scored in a
// category) writes results-partial.json and lists what it left out.
// Photos are shrunk like the app does (decision 26): longer side at most the
// size, JPEG at 80%. The Claude key is read from .env.local only, and never
// printed.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseEnv } from "node:util";
import sharp from "sharp";
import { analyzeBouquet } from "../lib/ai/analyzeBouquet";
import type { AiOutcome } from "../lib/ai/client";
import { TOKEN_PRICES, type ModelId } from "../lib/ai/config";
import { extractReceipt } from "../lib/ai/extractReceipt";
import { fakeApi, fakeMessage } from "../lib/ai/fakeApi";
import { findStem, type Photo } from "../lib/ai/shared";
import type { AnalyzeBouquetResult, EvalResult, ExtractReceiptResult } from "../lib/contract";
import {
  parseLabels,
  parseReceiptAnswers,
  passes,
  pickWinner,
  pricedStems,
  scoreBouquet,
  scoreReceipt,
  summarize,
  type BouquetTruth,
  type ReceiptTruth,
  type Run,
  type SeedStem,
} from "./evalScore";
import { missingParts, pool, type Coverage } from "./evalRun";

const MODELS: ModelId[] = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"];
const SIZES = [1280, 1600];
const CONCURRENCY = 4;
const EVAL_DIR = "fixtures/eval";
const RECEIPT_DIR = "fixtures/receipts";
const RECEIPT_ANSWERS = "fixtures/receipts/receipt_ground_truth_answers.csv";

type Options = { dryRun: boolean; rescore: boolean; limit: number; models: ModelId[]; sizes: number[] };
type Job = { model: ModelId; px: number } & (
  | { kind: "bouquet"; file: string; truth: BouquetTruth }
  | { kind: "receipt"; file: string; truth: ReceiptTruth }
);
type SavedAnswer = { file: string; kind: Job["kind"]; model: ModelId; photoPx: number; outcome: AiOutcome<unknown> };

function parseArgs(args: string[]): Options {
  const value = (flag: string) => {
    const i = args.indexOf(flag);
    return i === -1 ? undefined : args[i + 1];
  };
  const model = value("--model");
  if (model !== undefined && !MODELS.includes(model as ModelId)) throw new Error(`--model must be one of ${MODELS.join(", ")}`);
  const px = value("--px");
  if (px !== undefined && !SIZES.includes(Number(px))) throw new Error(`--px must be one of ${SIZES.join(", ")}`);
  const limit = value("--limit");
  if (limit !== undefined && !(Number(limit) > 0)) throw new Error("--limit must be a number above 0");
  return {
    dryRun: args.includes("--dry-run"),
    rescore: args.includes("--rescore"),
    limit: limit === undefined ? Infinity : Number(limit),
    models: model ? [model as ModelId] : MODELS,
    sizes: px ? [Number(px)] : SIZES,
  };
}

function loadKey() {
  const file = ".env.local";
  const key = existsSync(file) ? parseEnv(readFileSync(file, "utf8")).ANTHROPIC_API_KEY : undefined;
  if (!key) throw new Error("ANTHROPIC_API_KEY is missing from .env.local");
  process.env.ANTHROPIC_API_KEY = key;
}

function readIfExists(file: string): string | null {
  if (existsSync(file)) return readFileSync(file, "utf8");
  console.warn(`Missing ${file}`);
  return null;
}

/** The items whose photo file exists; the others' file names go in `missing`. */
function withPhotos<T>(items: T[], file: (item: T) => string, missing: string[]): T[] {
  return items.filter((item) => {
    if (existsSync(file(item))) return true;
    missing.push(path.basename(file(item)));
    return false;
  });
}

const shrunk = new Map<string, Promise<Photo>>();

/** The photo as the app sends it: longer side at most `px`, JPEG at 80%, location data dropped. */
function shrink(file: string, px: number): Promise<Photo> {
  const cacheKey = `${file}@${px}`;
  let photo = shrunk.get(cacheKey);
  if (!photo) {
    photo = sharp(readFileSync(file))
      .rotate()
      .resize({ width: px, height: px, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer()
      .then((data) => ({ data, mediaType: "image/jpeg" as const }));
    shrunk.set(cacheKey, photo);
  }
  return photo;
}

/** A dry run's answer: the hand count as a narrow range, or the answer key as written. */
function fakeAnswer(job: Job): AnalyzeBouquetResult | ExtractReceiptResult {
  if (job.kind === "bouquet") {
    const lines = job.truth.lines.map((line) => ({
      stem: line.stem,
      color: "",
      countLow: Math.max(1, line.count - 1),
      countHigh: line.count + 1,
      confidence: "high" as const,
      closestStem: line.closestStem,
      note: "",
    }));
    return { lines, note: "Dry run" };
  }
  const lines = job.truth.lines.map((line) => ({
    rawText: line.stem,
    stem: line.stem,
    quantity: line.quantity,
    unit: line.unit,
    bundleSize: line.bundleSize,
    unitPrice: line.unitPrice,
    totalPaid: line.totalPaid,
    confidence: "high" as const,
    note: "",
  }));
  return { purchaseDate: null, lines, note: "Dry run" };
}

function costUsd(model: ModelId, outcomes: AiOutcome<unknown>[]): number {
  const price = TOKEN_PRICES[model];
  return outcomes.reduce((sum, o) => sum + (o.inputTokens * price.input + o.outputTokens * price.output) / 1e6, 0);
}

const percent = (share: number) => `${Math.round(share * 100)}%`;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outDir = options.dryRun ? path.join(tmpdir(), "tangkay-eval-dry-run") : EVAL_DIR;
  const answersDir = path.join(outDir, "answers");
  const answerPath = (job: Pick<Job, "model" | "px" | "file">) => path.join(answersDir, job.model, String(job.px), `${job.file}.json`);

  const seed = JSON.parse(readFileSync("fixtures/seed/stems.json", "utf8")) as SeedStem[];
  const stems = pricedStems(seed);

  const missingPhotos: string[] = [];
  const labels = readIfExists(path.join(EVAL_DIR, "labels.csv"));
  // Uncounted photos are still run, so a --rescore after they are counted needs no new calls.
  const { photos, uncounted } = labels ? parseLabels(labels) : { photos: [], uncounted: [] };
  const bouquets = withPhotos(photos, (truth) => path.join(EVAL_DIR, truth.photo), missingPhotos);
  const answerKey = readIfExists(RECEIPT_ANSWERS);
  const receiptKeys = answerKey ? parseReceiptAnswers(answerKey) : [];
  const receipts = withPhotos(receiptKeys, (truth) => path.join(RECEIPT_DIR, truth.receipt), missingPhotos);

  // Rows the AI cannot pick: they always score wrong until the seed or the labels change.
  const unknown = new Set(
    [...bouquets.flatMap((t) => t.lines), ...receipts.flatMap((t) => t.lines)]
      .map((line) => ("closestStem" in line && line.stem.toLowerCase() === "other" ? line.closestStem : line.stem))
      .filter((stem): stem is string => stem !== null && stem.toLowerCase() !== "other" && !findStem(stems, stem)),
  );
  if (unknown.size) console.warn(`Not in fixtures/seed/stems.json (always scored wrong): ${[...unknown].join(", ")}`);

  const jobs: Job[] = options.models.flatMap((model) =>
    options.sizes.flatMap((px) => [
      ...bouquets.slice(0, options.limit).map((truth) => ({ model, px, kind: "bouquet" as const, file: truth.photo, truth })),
      ...receipts.slice(0, options.limit).map((truth) => ({ model, px, kind: "receipt" as const, file: truth.receipt, truth })),
    ]),
  );

  const outcomes = new Map<Job, AiOutcome<unknown>>();
  const missingAnswers: string[] = [];
  const unreadable = new Set<string>();
  if (options.rescore) {
    for (const job of jobs) {
      const file = answerPath(job);
      if (existsSync(file)) outcomes.set(job, (JSON.parse(readFileSync(file, "utf8")) as SavedAnswer).outcome);
      else missingAnswers.push(`${job.model}/${job.px}/${job.file}`);
    }
  } else {
    if (!options.dryRun) loadKey();
    console.log(`${jobs.length} photos to run, ${CONCURRENCY} at a time${options.dryRun ? " (dry run)" : ""}`);
    let done = 0;
    // A failed save rejects the pool at once; main's catch then exits, stopping the calls still running.
    await pool(jobs, CONCURRENCY, async (job) => {
      const file = path.join(job.kind === "bouquet" ? EVAL_DIR : RECEIPT_DIR, job.file);
      let photo: Photo;
      try {
        photo = await shrink(file, job.px);
      } catch {
        // Such as an iPhone HEIC photo with a .png name: sharp's prebuilt binary cannot decode it.
        unreadable.add(job.file);
        return;
      }
      const api = options.dryRun ? fakeApi(fakeMessage(fakeAnswer(job))).api : undefined;
      const input = { photo, stems, model: job.model };
      const outcome = job.kind === "bouquet" ? await analyzeBouquet(input, api) : await extractReceipt(input, api);
      outcomes.set(job, outcome);
      const saved: SavedAnswer = { file: job.file, kind: job.kind, model: job.model, photoPx: job.px, outcome };
      mkdirSync(path.dirname(answerPath(job)), { recursive: true });
      writeFileSync(answerPath(job), `${JSON.stringify(saved, null, 2)}\n`);
      done++;
      const status = outcome.ok ? "ok" : `failed: ${outcome.error}`;
      console.log(`[${done}/${jobs.length}] ${job.model} ${job.px}px ${job.file} ${outcome.seconds}s ${status}`);
    });
  }

  const runs: Run[] = [];
  const scored: Coverage["runs"] = [];
  for (const model of options.models) {
    for (const px of options.sizes) {
      const mine = jobs.filter((job) => job.model === model && job.px === px && outcomes.has(job));
      if (mine.length === 0) continue;
      const bouquetScores = mine.flatMap((job) =>
        job.kind === "bouquet" && !uncounted.includes(job.file)
          ? [scoreBouquet(job.truth, outcomes.get(job) as AiOutcome<AnalyzeBouquetResult>, stems)]
          : [],
      );
      const receiptScores = mine.flatMap((job) =>
        job.kind === "receipt" ? [scoreReceipt(job.truth, outcomes.get(job) as AiOutcome<ExtractReceiptResult>)] : [],
      );
      const failed = mine.filter((job) => !outcomes.get(job)!.ok).length;
      if (failed) console.warn(`${model} ${px}px: ${failed} failed calls, scored as wrong`);
      runs.push({
        result: summarize(model, px, bouquetScores, receiptScores),
        costUsd: costUsd(model, mine.map((job) => outcomes.get(job)!)),
      });
      scored.push({ model, photoPx: px, bouquets: bouquetScores, receipts: receiptScores });
    }
  }

  const results: EvalResult[] = runs.map((run) => run.result);
  mkdirSync(outDir, { recursive: true });
  // Only a run that left nothing out replaces results.json, the file the accuracy page reads.
  const missing = missingParts({
    limited: options.limit !== Infinity || options.models.length < MODELS.length || options.sizes.length < SIZES.length,
    missingPhotos,
    unreadable: [...unreadable],
    uncounted,
    missingAnswers,
    runs: scored,
  });
  const resultsPath = path.join(outDir, missing.length ? "results-partial.json" : "results.json");
  writeFileSync(resultsPath, `${JSON.stringify(results, null, 2)}\n`);
  if (missing.length) console.warn(`Left out, so results.json is unchanged:\n- ${missing.join("\n- ")}`);

  console.table(
    runs.map(({ result, costUsd }) => ({
      model: result.model,
      px: result.photoPx,
      rows: percent(result.stemRowAccuracy),
      "counts ±2": percent(result.countsWithin2),
      "totals ±10%": percent(result.totalsWithin10Percent),
      receipts: percent(result.receiptLineAccuracy),
      "median s": result.medianSeconds,
      "cost USD": costUsd.toFixed(3),
      passes: passes(result) ? "yes" : "no",
    })),
  );
  console.log(`Wrote ${resultsPath}`);

  const winner = pickWinner(runs);
  if (!winner) console.log("No runs to score.");
  else if (winner.passed)
    console.log(`Winner: ${winner.result.model} at ${winner.result.photoPx} px, the cheapest run that passes every mark.`);
  else
    console.log(`No run passes every mark. Most accurate: ${winner.result.model} at ${winner.result.photoPx} px.`);
}

// Exits at once, so a failed save also stops the calls other workers still have running.
main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`, () => process.exit(1));
});
