-- Fixes from the PR #22 review. Never edit this file once applied; add a new migration instead.

-- Stem names have no spaces around them, so "Rose" and "Rose " cannot both
-- exist past stems_name_key. The routes trim; this guards everything else.
alter table public.stems
  add constraint stems_flower_trimmed check (flower = btrim(flower, E' \t\r\n')),
  add constraint stems_color_trimmed check (color = btrim(color, E' \t\r\n'));

-- A quote leaves draft only when its reply is first copied, which stamps the
-- price, the valid-until date and the sent time (spec decision 5).
alter table public.quotes
  add constraint quotes_sent_complete check (
    status = 'draft' or (price is not null and valid_until is not null and sent_at is not null)
  );

-- Column-level updates, as on shops and stems: ids, owning shop, parent quote
-- and created_at never change.
revoke update on public.quotes, public.quote_lines from authenticated;
grant update (label, status, photo_path, budget, price, reply_text, valid_until, underwater_at, sent_at)
  on public.quotes to authenticated;
grant update (stem_id, count, count_low, count_high, confidence, note, cost_per_stem)
  on public.quote_lines to authenticated;
