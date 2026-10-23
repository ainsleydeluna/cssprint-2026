-- Saving a receipt (spec C2, decision 20): the receipt and all its stock
-- batches in one transaction, so a failed line never leaves a receipt without
-- its batches. Runs as the caller, so row-level security and every table check
-- still apply. The save route has already checked each line and computed its
-- cost per stem with lib/money.ts costPerStem; `lines` is that JSON array, with
-- camelCase keys: stemId, quantity, unit, bundleSize, totalPaid, costPerStem.
-- Returns the new receipt's id.
-- Never edit this file once applied; add a new migration instead.

create function public.save_receipt(purchase_date date, photo_path text, lines jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_shop_id uuid := (select private.my_shop_id());
  new_receipt_id uuid;
begin
  if caller_shop_id is null then
    raise exception 'The caller has no shop';
  end if;
  if jsonb_typeof(lines) is distinct from 'array' or jsonb_array_length(lines) = 0 then
    raise exception 'A receipt needs at least one line';
  end if;

  insert into public.receipts (shop_id, purchase_date, photo_path)
  values (caller_shop_id, save_receipt.purchase_date, save_receipt.photo_path)
  returning id into new_receipt_id;

  -- In the order sent: created_at uses clock_timestamp(), and latest cost
  -- breaks ties between batches by entry order.
  insert into public.receipt_lines
    (receipt_id, shop_id, stem_id, quantity, unit, bundle_size, total_paid, cost_per_stem)
  select new_receipt_id, caller_shop_id, l."stemId", l.quantity, l.unit, l."bundleSize", l."totalPaid", l."costPerStem"
  from jsonb_to_recordset(lines) with ordinality as l (
    "stemId" uuid, quantity numeric, unit text, "bundleSize" integer,
    "totalPaid" numeric, "costPerStem" numeric, n bigint
  )
  order by l.n;

  return new_receipt_id;
end;
$$;

revoke execute on function public.save_receipt(date, text, jsonb) from public, anon;
grant execute on function public.save_receipt(date, text, jsonb) to authenticated;
