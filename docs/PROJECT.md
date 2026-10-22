\# Pitas: Sagot agad sa "hm po?"



\*\*Team:\*\* \[The Hidden King]: Ice, Pat, Ian, Zach 



\## Problem

Small florists, at Dangwa stalls and on Facebook pages, get a customer's reference photo plus "hm po?" (how much?) many times a day. Quoting means counting stems by eye and pricing from memory, so replies are slow and customers ghost. Stem prices also swing: most Dangwa flower prices nearly doubled four days before Valentine's Day 2025 (ABS-CBN), so florists underprice when they quote from old costs.



\## Target user

Small florists in Metro Manila who buy stock at Dangwa and sell custom bouquets through Facebook and Messenger.



\## Solution

A mobile-first web app. The florist:

1\. Snaps the supplier receipt → Pitas reads it into cost per stem.

2\. Uploads the customer's bouquet photo → Pitas reverse-engineers it into a stem-by-stem recipe, priced on today's costs.

3\. Adjusts counts or swaps flowers, fits it to the customer's budget, and copies a ready-to-send Taglish reply.



\## Why AI is needed

Reading handwritten receipts, recognizing flowers and estimating stem counts from photos, and re-planning a bouquet within a budget while keeping its look are things simple rules can't do. All money math runs in code, and the florist confirms every line before sending.



\## Demo scope (core features)

Shop settings and flower catalog; receipt to cost; photo to itemized quote with confidence per line; quote editing; fit to budget; Taglish reply; saved quotes. Extra features are planned if time allows (subject to change).



\## Tech stack

Next.js, TypeScript, Tailwind, shadcn/ui; Supabase (database, sign-in, storage, row-level security); Vercel; Claude API (Anthropic) for image and text understanding.



\## How we'll measure it

Time to quote (manual versus Pitas); accuracy on 20 hand-counted bouquet photos (flower types, counts within ±2 stems, quote total within ±10%); receipt reading accuracy.



\## Privacy and security

No customer names or numbers stored; private photo storage; row-level security on every table; API keys only on the server.



\## Plan

Thursday: planning, receipt to cost, photo to quote. Friday: budget fit and reply, testing and evaluation, docs, demo video and deck.



\## AI tools used to build

Claude Code (building), Codex (code reviews), Gemini (research and docs). Full credits will be in the README.

