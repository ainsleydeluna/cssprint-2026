# Tangkay build spec

Agreed at the kickoff on Thursday 22 October 2026. Words in **bold** are defined in [GLOSSARY.md](../GLOSSARY.md). Team rules are in [CLAUDE.md](../CLAUDE.md). Changes to this spec go through Ice.

Tangkay ("stem" in Tagalog; subtitle "Sagot agad sa 'hm po?'") is a phone-first web app for small florists. A customer sends a bouquet photo; Tangkay turns it into an itemized **quote** priced on the florist's **latest cost** from their own Dangwa receipts, and writes the Taglish reply.

## 1. People, deadlines, checkpoints

| Who | Builds |
| --- | --- |
| Ice | Server side (`app/api`, `lib/server`), AI calls (`lib/ai`), database (`supabase`), the contract (`lib/types.ts`, `lib/contract.ts`), money math (`lib/money.ts`), `package.json` |
| Pat | Screens in `app/(app)`, `components/quote`, `components/receipt`; builds first on fake data that matches the contract |
| Ian | Theme and `components/ui`, the 20 hand-counted test photos in `fixtures/eval`, `scripts/eval.ts`, phone testing, demo video |
| Zach | Taglish text in `content/`, seed data in `fixtures/seed`, 8 to 10 sample receipts in `fixtures/receipts`, docs and README, all through GitHub pull requests; runs the time-to-quote test with classmates |

Checkpoints: receipt to cost working on a phone by 10 PM Thursday (may move to 11 PM); photo to quote on a phone by 4 AM Friday; no new features after 8 AM Friday; no code changes after noon Friday. Tag main at each checkpoint (`git tag checkpoint-10pm`).

Pat's app shell and PhotoPicker (camera, crop, shrink) branches are the base for every screen ticket. Build on them; do not redo them.

## 2. Scope: the demo flow

Only these twelve pieces are in this build.

- **C1 Shop setup.** The florist enters the wrap fee, labor fee, **markup** % and **minimum margin** %, and edits the starter list of **stems**. Starter prices are labeled "sample" until a receipt replaces them.
- **C2 Receipt to cost.** Photo of a handwritten receipt or buy list → editable table → **stock batches** with a cost per stem. Each receipt is saved with its purchase date.
- **C3 Photo to quote.** The AI may only name rows from the shop's list, or `Other`. Per line: color, **count range**, confidence, and the closest stocked row for an unstocked flower. Code clamps counts and prices the quote.
- **C4 Quote editing.** − and +, swap a stem, add or remove lines, highlight unsure lines, live total.
- **C5 Fit to budget.** Up to 3 versions that keep the look and fit the budget by changing flowers, never the markup. Code rechecks every total.
- **C6 Taglish reply.** Ready-to-send message with price and **valid until** date, and a copy button.
- **C7 Quote list.** Quotes by **inquiry** label, each with its **time-to-quote**, and the shop's average.
- **C8 Photo prep.** Crop before upload, shrink, drop location data. No blur check.
- **C9 Demo mode.** Saved AI results labeled "Demo"; one live call stays live.
- **C10 AI accuracy page.** Our test results plus speed and cost per quote.
- **C11 Security.** Row-level security on every table, a Shop A / Shop B test, private photo storage, Claude key on the server only, `/security-review` before submission.
- **C12 Margin alarm.** A new receipt flags **underwater quotes** and drafts a polite price update. Built after the 4 AM checkpoint; the flag ships before the message if we are behind.

## 3. Decisions made at kickoff

Numbered as asked in the kickoff so the answers can be traced.

| # | Decision |
| --- | --- |
| 1 | Sign-in is our own one-field email form that sends a Supabase magic link, plus a "check your email" state. No Supabase UI package. |
| 2 | Money is stored in pesos with two decimals (`numeric(10,2)` in the database, `number` in TypeScript). Per-stem costs keep two decimals. Only the final quote **price** is rounded, up to the nearest ₱10. |
| 3 | Price = (**recipe cost**) × (1 + markup %) + wrap fee + labor fee, rounded up to ₱10. Recipe cost is stems and fillers only; fees are not costs and are not marked up. **Margin** = (price − recipe cost at latest costs) ÷ price. An **underwater quote** is an open quote whose margin at latest costs is below the shop's minimum margin (default 20%). |
| 4 | A **stem** is one row: flower plus color, bought in a unit, with a sample price. A **stock batch** is one receipt line. **Latest cost** is the newest batch by purchase date (ties: the one entered last), else the sample price. We say "latest", not "today's": we know the florist's last receipt, not the market. |
| 5 | Quote status: `draft` from photo upload → `sent` when the reply is first copied (stamps `sent_at`) → `expired` when valid-until passes. **Open quote** = sent and not expired. Valid-until defaults to 2 days after sending (shop setting), editable per quote. No won/lost tracking. |
| 6 | A **bunch** is a tied filler unit, priced whole, counted in whole bunches in a quote. A **bundle** is a supplier pack of N main-flower stems, N editable, converted to cost per stem. On a receipt, a filler sold "per bundle" is one bunch. |
| 7 | Confidence is `low`, `medium` or `high`; the quote screen highlights any line that is not `high`. The allowed list sent to the AI is the shop's exact stem rows ("Rose - red"), so the AI picks a row and code never guesses a color; the AI's own color words go in `note`. Every field in every AI answer is required; use `""` or `null` when it does not apply. `extractReceipt` returns `unitPrice` so code, not the AI, computes a missing total. |
| 8 | A quote line starts at the middle of the count range, rounded up. Code clamps each line to 1–100 stems and a bouquet to 200 stems. Revisit after the vision test. |
| 9 | `Other` with a `closestStem` becomes a line priced at the closest stem's latest cost, highlighted, with the real flower name in the note. `Other` with no closest stem becomes a "pick a flower" line at ₱0 that blocks copying the reply until the florist picks a row. |
| 10 | Tests run on Vitest. Money math and count clamping get tests before code. One test signs in as Shop A and asserts zero rows of Shop B. |
| 11 | On stage, demo mode keeps `draftReply` live. The demo video is recorded with demo mode off, showing a real live photo analysis. |
| 12 | Counting design is A: every line gets a prefilled count from its count range. The prefill rule lives in config as `countPrefill`, set to `"middle"` (middle of the range, rounded up). A blank count (a line the florist cleared) still blocks copying the reply until filled. Chosen after the vision test (section 11). |
| 13 | One extra table, `ai_calls`, logs every AI call: shop, call name, model, seconds, input and output tokens, the quote or receipt it belonged to, success or short error text. Cost per quote is computed from tokens and a price-per-token table in config. |
| 14 | On first sign-in the app creates the user's shop automatically, seeds the starter list from `fixtures/seed`, and sends them to shop setup. |
| 15 | New quotes get an automatic label "Inquiry N". The florist can rename it later; the rename box shows the hint "No customer names or numbers." Nothing is asked before the camera opens. |
| 16 | Cropped, shrunken photos stay in the shop's private storage, attached to the quote or receipt. Deleting a quote or receipt deletes its photo. Storage rules let each shop read only its own files. |
| 17 | Each filler is its own stem row with its own latest cost. There is no shop-level filler price setting. Starting costs come from Zach's seed file. |
| 18 | "Other" in the shop's list means "add your own row with a typed name". Stems are never deleted, only hidden, so old quotes and batches keep their lines. |
| 19 | Starter units: roses, gerbera, dendrobium orchid and anthurium per dozen; carnations per 10; chrysanthemum, Malaysian mums and alstroemeria (Dangwa calls it "astro") per bundle; sunflower, stargazer lily and tulip per piece; fillers per bunch. Sample prices and a source note per row come from Zach's seed file. |
| 20 | Each stock batch stores its own quantity, unit, bundle size and total paid; cost per stem is computed from the batch, not the row's unit. A receipt line the AI could not match must be matched or deleted before the receipt can be saved. |
| 21 | Screens call route handlers under `app/api` for every AI call and database write. No server actions. |
| 22 | All money math lives in `lib/money.ts`, a pure module (no database, no network) owned by Ice and imported by both server and screens. Drafts save to the database on every edit, debounced. |
| 23 | All Taglish labels live in `content/strings.json`, keyed by screen; screens read them through a typed helper so a missing key fails the type check. |
| 24 | The Shop A / Shop B test runs against the `cssprint-dev` project with two test accounts made once by a seed script, keys from `.env.local`; the test is skipped when the keys are absent. If the seed script needs the Supabase secret key, it lives only in Ice's `.env.local` as `SUPABASE_SECRET_KEY`: never `NEXT_PUBLIC_`, never committed, not in Vercel; the script and test say so in a comment. |
| 25 | The AI returns one line per filler it sees, from the shop's filler rows, with a count range in bunches clamped to 1–5; the line starts at the middle, rounded up. No filler seen, no line. |
| 26 | The crop screen always appears with the whole photo preselected (one tap accepts). The photo is shrunk so its longer side is at most the configured maximum, default 1600 px, saved as JPEG at 80%. Re-drawing it drops location data. The same file goes to the AI and to storage. The maximum lives in config so the bake-off can compare 1280 and 1600. |
| 27 | Bake-off candidates: Claude Haiku 5.5, Sonnet 5.5, Opus 5.5. Config starts with Opus 5.5, thinking off, for `analyzeBouquet` (vision test, section 11) and Sonnet 5.5 for `extractReceipt`, until the bake-off measures speed on the 20-photo set. Pass marks: `analyzeBouquet` right row on ≥ 90% of lines, counts within ±2 on ≥ 80% of lines, total within ±10% on ≥ 80% of photos; `extractReceipt` stem, quantity and price right on ≥ 95% of lines; both under 15 seconds. Cheapest passing model wins; if none passes, the most accurate, and the accuracy page says so. |
| 28 | A saved receipt is read-only. To fix one, delete it (its photo and batches go too, and latest cost falls back to the previous batch) and scan again. |

## 4. Defaults we chose

These were not asked in the kickoff. Review them here; tell Ice to change any.

### Fit to budget (C5)
- The florist types the customer's budget on the quote screen; it is saved on the quote.
- `fitToBudget` receives the current recipe, the budget, and the shop's stem rows with latest costs (so it can suggest cheaper swaps), and returns up to 3 options. Each option is a full recipe plus a short label ("Fewer roses", "Carnations instead of roses"). The AI returns no prices.
- "Keep the look" means, in order: keep the main flower and its colors; first reduce counts; then swap to cheaper rows of the same color; then cheaper fillers. Never below 1 stem of the main flower. Never touch fees or markup.
- Code prices every option with `lib/money.ts` and drops any over budget or below minimum margin. If nothing survives, it shows the cheapest option labeled "Over budget by ₱X".
- Choosing an option replaces the quote's recipe. The florist can run it again or edit by hand.

### Taglish reply (C6)
- `draftReply` receives the shop name (optional), the recipe lines (row names and counts, no per-line prices), the price, and the valid-until date written in Manila time (for example "Oct 25"). It returns one message: greeting, flowers with counts, price, valid until, polite close. No customer names.
- The message is editable before copying. "Regenerate" is allowed; each is a live call.
- The first copy stamps `sent_at`; later copies do not change it. The final text is saved on the quote.
- Copying is blocked while any line has a blank count or is a "pick a flower" line.

### Quote list (C7)
- Newest first, with a status chip, the inquiry label, the price, and the time-to-quote of sent quotes. The average is over all of the shop's sent quotes. Draft quotes show no time.

### Demo mode (C9)
- `features.ts` exports `DEMO_MODE` (from `NEXT_PUBLIC_DEMO_MODE`, default off) and `MARGIN_ALARM` (from `NEXT_PUBLIC_MARGIN_ALARM`, default on), so Vercel can flip them without a commit.
- In demo mode, "New quote" and "Scan receipt" show a "Use a demo photo" picker next to the camera. Demo photos come from `fixtures/eval` (bouquets) and `fixtures/receipts`; their saved answers live in `fixtures/demo/*.json`. Results show a "Demo" label.
- `draftReply` stays live. If it fails, a saved reply is shown with the "Demo" label.

### AI accuracy page (C10)
- `scripts/eval.ts` writes `fixtures/eval/results.json` (committed): per model and photo size, flower-row accuracy, counts within ±2, totals within ±10%, receipt line accuracy, and median seconds. The page reads that file.
- Live numbers come from `ai_calls`: median seconds and average cost per call name, and cost per quote (sum of its calls). Token prices live in `lib/ai/config.ts`.

### Margin alarm (C12)
- Trigger: after a receipt is saved or deleted, recompute the margin of every open quote in the shop that contains a stem whose latest cost changed. Quotes below minimum margin get `underwater_at` set; the others get it cleared.
- Shown as a banner after saving ("3 open quotes are now underwater") and a badge on the list.
- Opening a flagged quote shows the new price (same formula at latest costs) and a "Draft price update" button, a live AI call with the old price, new price and a new valid-until date.
- Copying the price update sets the quote's price to the new price, resets valid-until to the default, clears the flag, and leaves `sent_at` alone, so time-to-quote does not change.
- With `MARGIN_ALARM` off nothing is computed. If we are behind, ship the flag and banner first, the message later.

### Everything else
- Time: timestamps stored in UTC; dates shown, and valid-until computed, in Asia/Manila. A receipt's purchase date defaults to today in Manila when the AI cannot read one.
- IDs are UUIDs. Every table has `shop_id` and `created_at`. Row-level security: a row is visible when its shop's `owner_id` equals the signed-in user.
- Storage: two private buckets, `bouquets` and `receipts`; object path `<shop_id>/<uuid>.jpg`; the storage rule checks the first path segment against the caller's shop.
- Sign-in: the middleware protects everything under `app/(app)`; the magic link lands on the quote list.
- AI config (`lib/ai/config.ts`): model per call (thinking off), `countPrefill`, max photo size, token prices, a 30-second timeout and one retry. Every call, including failures, writes an `ai_calls` row.
- A shop has an optional `name`, used only in the reply.
- The spec lives here, in `docs/spec.md`; `docs/` is Zach's folder, but spec edits go through Ice.
- Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ANTHROPIC_API_KEY` (server only), `NEXT_PUBLIC_DEMO_MODE`, `NEXT_PUBLIC_MARGIN_ALARM`, `NEXT_PUBLIC_MAX_PHOTO_PX`; `SUPABASE_SECRET_KEY` only in Ice's local file.

## 5. Data shapes (`lib/types.ts`)

Shown as TypeScript sketches. Ice writes the real file; fake data must match it.

```ts
type Unit = "dozen" | "per10" | "bundle" | "bunch" | "piece";
type Confidence = "low" | "medium" | "high";
type QuoteStatus = "draft" | "sent" | "expired";
type Money = number; // pesos, two decimals

type Shop = {
  id: string; ownerId: string; name: string;
  wrapFee: Money; laborFee: Money; markupPercent: number;
  minimumMarginPercent: number;       // default 20
  validForDays: number;               // default 2
  createdAt: string;
};

type Stem = {
  id: string; shopId: string;
  flower: string; color: string;      // display name "Rose - red"
  isFiller: boolean;
  unit: Unit; bundleSize: number | null;   // bundleSize only when unit is "bundle"
  samplePrice: Money;                 // per unit, labeled "sample"
  sampleSource: string;               // where the sample price came from
  hidden: boolean;
};

type Receipt = {
  id: string; shopId: string; purchaseDate: string; photoPath: string; createdAt: string;
};

type StockBatch = {                   // table receipt_lines
  id: string; receiptId: string; shopId: string; stemId: string;
  quantity: number; unit: Unit; bundleSize: number | null;
  totalPaid: Money; costPerStem: Money;   // computed by lib/money.ts on save
  createdAt: string;
};

type Quote = {
  id: string; shopId: string; label: string; status: QuoteStatus;
  photoPath: string; budget: Money | null;
  price: Money | null; replyText: string;
  validUntil: string | null;          // date, Manila
  underwaterAt: string | null;
  createdAt: string; sentAt: string | null;
};

type QuoteLine = {
  id: string; quoteId: string; shopId: string;
  stemId: string | null;              // null = "pick a flower"
  count: number | null;               // null = blank, florist must fill
  countLow: number; countHigh: number;
  confidence: Confidence; note: string;
  costPerStem: Money;                 // latest cost at the time of pricing
};

type AiCall = {
  id: string; shopId: string; call: "extractReceipt" | "analyzeBouquet" | "fitToBudget" | "draftReply" | "priceUpdate";
  model: string; seconds: number; inputTokens: number; outputTokens: number;
  quoteId: string | null; receiptId: string | null;
  ok: boolean; error: string; createdAt: string;
};
```

## 6. AI answer formats (`lib/contract.ts`)

Structured outputs: every field required; `""` or `null` when it does not apply; no `reasoning` field, a short `note` instead. The AI never returns money. `allowedStems` is the list of the shop's visible row names.

```ts
type AnalyzeBouquetResult = {
  lines: Array<{
    stem: string;                 // a name from allowedStems, or "Other"
    color: string;                // the AI's own color words
    countLow: number; countHigh: number;   // stems, or bunches for fillers
    confidence: Confidence;
    closestStem: string | null;   // from allowedStems when stem is "Other"
    note: string;
  }>;
  note: string;
};

type ExtractReceiptResult = {
  purchaseDate: string | null;    // "YYYY-MM-DD" if readable
  lines: Array<{
    rawText: string;
    stem: string | null;          // a name from allowedStems if matched
    quantity: number | null;
    unit: Unit | null;
    bundleSize: number | null;
    unitPrice: number | null;     // as written, e.g. "@150"
    totalPaid: number | null;     // as written; code computes it when missing
    confidence: Confidence;
    note: string;
  }>;
  note: string;
};

type FitToBudgetResult = {
  options: Array<{                // 0 to 3
    label: string;
    lines: Array<{ stem: string; count: number; note: string }>;
  }>;
  note: string;
};

type DraftReplyResult = { message: string; note: string };
type PriceUpdateResult = { message: string; note: string };
```

Clamps applied in code after every answer: flower counts 1–100 per line, 200 per bouquet; filler bunches 1–5; names matched to rows ignoring capital letters; unknown names become `Other`.

Rules written into the `analyzeBouquet` prompt:

1. A flower's own leaves and stems are not Greenery. Only a separate filler counts as a filler line.
2. For `Other`, choose `closestStem` by price and size, not by name.
3. Count stems, not individual blooms. For flowers that grow in clusters, such as alstroemeria and spray roses, estimate the number of stems.

## 7. Money rules (`lib/money.ts`)

- `costPerStem(batch)`: `totalPaid ÷ stems in the batch`, where a dozen is 12, `per10` is 10, a bundle is `bundleSize`, a bunch or piece is 1 (a bunch is priced whole).
- `latestCost(stem, batches)`: newest batch by purchase date, ties broken by `createdAt`, else `samplePrice ÷ unit size`.
- `recipeCost(lines)`: sum of `count × costPerStem` over flower lines plus `bunches × costPerBunch` over filler lines. Lines with a blank count or no stem count as zero and mark the quote "incomplete".
- `price(recipeCost, shop)`: `roundUp10(recipeCost × (1 + markupPercent ÷ 100) + wrapFee + laborFee)`.
- `margin(price, recipeCostAtLatest)`: `(price − recipeCostAtLatest) ÷ price`.
- `isUnderwater(quote, shop)`: `margin < minimumMarginPercent ÷ 100`.
- Tests before code for every function above.

## 8. Database tables (`supabase/migrations`)

`shops`, `stems`, `receipts`, `receipt_lines` (stock batches), `quotes`, `quote_lines`, `ai_calls`, with the columns in section 5 in snake_case. Every table has row-level security on; the policy compares the row's `shop_id` with the shop owned by `auth.uid()`. Never edit an old migration; add a new one.

## 9. Ticket outline

The full ticket list comes from `/to-tickets`. The first three are fixed:

1. **Ticket 1, Ice: the contract.** Supabase client setup (Ice pastes Supabase's own setup prompt), migrations for all seven tables with row-level security and the two storage buckets, `lib/types.ts`, `lib/contract.ts`, `lib/money.ts` with tests, `lib/ai/config.ts`, `features.ts`, `content/strings.json` helper, the sign-in form, shop auto-creation with the seeded starter list, Vitest, the Shop A / Shop B test, and fake JSON files Pat can build against.
2. **Ticket 2, Ice and Pat: receipt to cost.** `extractReceipt` route handler and receipt save (Ice); the receipt table and cost screens on the PhotoPicker (Pat). Checkpoint 10 PM on a phone.
3. **Ticket 3, Ice and Pat: photo to quote.** `analyzeBouquet` route handler, quote creation and pricing (Ice); the quote screens with editing and the live total (Pat). Checkpoint 4 AM on a phone.

## 10. Prototype first (Pat)

Screen questions deliberately not decided here. Prototype on fake data, then show the team.

- The quote line row: −, +, swap, the "unsure" highlight, and a blank count.
- Three fit-to-budget options on one phone screen.
- The editable receipt table on a narrow screen, including "match this line".
- The crop step with the whole photo preselected.
- The quote list card with status and time-to-quote.
- The accuracy page.
- The banner and badge for underwater quotes.

## 11. Vision test and open items

Vision test, Thursday: 3 photos (tulips; red roses with eucalyptus; stargazer lilies with 37 roses and alstroemeria), Sonnet 5.5 versus Opus 5.5, thinking off.

- Flower types: both models 10 of 10.
- Counts within 2 of our hand counts: Opus 6 of 6; Sonnet 3 of 6 (it undercounted the big bouquet).
- Opus with thinking on, and Fable 5.1, were no better than Opus with thinking off.
- On the big bouquet, the middle of Opus's ranges matched our counts almost exactly, which set `countPrefill` to `"middle"`.

Open items:

- The bake-off on Ian's 20 photos: measures speed and confirms Opus 5.5 for `analyzeBouquet`. Run it before the 4 AM checkpoint if time allows; otherwise the config defaults stay.

## 12. Not in this build

A2 occasion check; A3 Ngayong Araw; A4 paste an inquiry; app-store wrapping with Capacitor; won/lost tracking on quotes; a blur check; storing any customer name or number; more than one user per shop; editing a saved receipt; deleting a stem; average-cost pricing; Supabase's ready-made sign-in screens; a local Supabase stack; server actions; markup on fees.
