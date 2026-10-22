@AGENTS.md

# Tangkay team rules

## No AI bylines
- Don't add AI attribution or "Generated with Claude Code" lines to commits or pull requests. Never rewrite git history.

## Who owns which folders
- Ice: app/api, lib/ai, lib/server, supabase (all database changes), lib/types.ts, lib/contract.ts, lib/money.ts, features.ts, package.json.
- Pat: app/(app) screens, components/quote, components/receipt.
- Ian: components/ui, scripts/eval.ts, fixtures/eval.
- Zach: content, fixtures/seed, fixtures/receipts, docs, README.
- docs/agents/ belongs to our Claude Code skills setup (Ice).
- Changes outside your folders go through the owner.

## Team rules
- Contract first: ticket 1 sets our shared data shapes, AI answer formats and database tables in lib/types.ts and lib/contract.ts. Fake data must match them. Only Ice changes them, and he tells everyone when he does.
- One ticket = one branch = one small pull request (under about 300 lines). Pull main first.
- Ice merges only when npm run build and npx tsc --noEmit pass, tests pass, the Vercel preview is Ready, and Ian has tested it on a phone. Merge with gh pr merge <n> --merge.
- The margin alarm and demo mode can be switched on and off in features.ts.
- Tag a known-good commit at each checkpoint (git tag checkpoint-10pm). Never edit an old database migration. Ask before adding a library.

## How to work
- Before changing more than two or three files, list the files and the plan first. Small fixes go straight in.
- Prefer the simplest solution.
- Keep the demo flow working at all times. Never break main.
- Commit small and often, with clear messages.

## Verify before saying done
- Run npx tsc --noEmit (type check) and the lint script, and fix what they report.
- Run the app and check the flow you changed.
- For core logic only, write the test before the code.
- For a bug, first reproduce it the way a user would hit it, then fix it.
- When you say a task is done, say what you checked.

## UI
- No ALL CAPS in user-facing text; use sentence case.

## Safety
- Never hardcode API keys or secrets. Use .env.local, which is gitignored.

## Credits
- When you add a library, API, dataset or template, list it in the PR description so Zach can add it to the README credits.

## Explaining
- When you explain something to us, use plain, precise language: everyday words, short sentences, and define each technical term the first time. Don't drop details or caveats. Keep code, specs and technical names exact.
- Start every reply, including progress updates, with one plain sentence on what happened and what you need from us. Details come after.

## Writing
- In the README, docs and pitch text, say what the product does, not how it feels. Cut hype words, filler intros and vague claims. If a sentence could appear unchanged in another project's docs, it says nothing about ours; cut it.
