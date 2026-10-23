// Runs one AI call on a sample input and prints the answer, model, seconds and
// tokens. Uses the fake shop's visible rows from lib/fake/data.ts.
//
//   npm run try-ai -- receipt [photo.jpg]
//   npm run try-ai -- bouquet [photo.jpg]
//   npm run try-ai -- budget | reply | price-update
//
// Without a photo it takes the first one in fixtures/receipts or fixtures/eval.
// The text calls use a fixed sample recipe: 24 red roses and 2 bunches of baby's breath.
// The Claude key is read from .env.local only, and never printed.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import type { AiOutcome } from "../lib/ai/client";
import { analyzeBouquet, bouquetToLines } from "../lib/ai/analyzeBouquet";
import { draftReply } from "../lib/ai/draftReply";
import { extractReceipt } from "../lib/ai/extractReceipt";
import { fitToBudget } from "../lib/ai/fitToBudget";
import { priceUpdate } from "../lib/ai/priceUpdate";
import { findStem, type Photo } from "../lib/ai/shared";
import { stems as allStems } from "../lib/fake/data";

const stems = allStems.filter((stem) => !stem.hidden);
const recipe = [
  { stem: "Rose - red", count: 24 },
  { stem: "Baby's breath - white", count: 2 },
];

function loadKey() {
  const file = ".env.local";
  const key = existsSync(file) ? parseEnv(readFileSync(file, "utf8")).ANTHROPIC_API_KEY : undefined;
  if (!key) throw new Error("ANTHROPIC_API_KEY is missing from .env.local");
  process.env.ANTHROPIC_API_KEY = key;
}

function loadPhoto(given: string | undefined, folder: string): Photo {
  const fallback = existsSync(folder)
    ? readdirSync(folder).find((name) => /\.(jpe?g|png|webp)$/i.test(name))
    : undefined;
  const file = given ?? (fallback && path.join(folder, fallback));
  if (!file) throw new Error(`Pass a photo path; ${folder} has no photos yet`);
  const ext = path.extname(file).toLowerCase();
  const mediaType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  console.log(`Photo: ${file}`);
  return { data: readFileSync(file), mediaType };
}

function print(outcome: AiOutcome<unknown>) {
  const { model, seconds, inputTokens, outputTokens } = outcome;
  console.log(JSON.stringify(outcome.ok ? outcome.result : { error: outcome.error }, null, 2));
  console.log(`Model ${model} · ${seconds} s · ${inputTokens} in / ${outputTokens} out tokens`);
}

async function main() {
  const [call, photoPath] = process.argv.slice(2);
  loadKey();
  switch (call) {
    case "receipt":
      return print(await extractReceipt({ photo: loadPhoto(photoPath, "fixtures/receipts"), stems }));
    case "bouquet": {
      const outcome = await analyzeBouquet({ photo: loadPhoto(photoPath, "fixtures/eval"), stems });
      print(outcome);
      if (outcome.ok) console.log("Quote lines:", bouquetToLines(outcome.result, stems));
      return;
    }
    case "budget":
      // At 50% markup and ₱150 fees: ₱1,430 is about ₱853.33 of flowers, and ₱1,000 allows ₱566.66.
      return print(await fitToBudget({ recipe, budget: 1000, currentPrice: 1430, currentRecipeCost: 853.33, maxRecipeCost: 566.66, stems }));
    case "reply": {
      const lines = recipe.map((line) => ({ ...line, isFiller: findStem(stems, line.stem)?.isFiller ?? false }));
      return print(await draftReply({ shopName: "Bulaklak ni Liza", lines, price: 1430, validUntil: "2026-10-25" }));
    }
    case "price-update":
      return print(await priceUpdate({ oldPrice: 1430, newPrice: 1610, validUntil: "2026-10-26" }));
    default:
      console.log("Usage: npm run try-ai -- receipt|bouquet [photo] | budget | reply | price-update");
      process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
