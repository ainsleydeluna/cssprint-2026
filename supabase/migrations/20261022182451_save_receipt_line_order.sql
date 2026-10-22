-- Fixes save_receipt from 20261022182420_save_receipt.sql, which failed on every
-- call: WITH ORDINALITY cannot follow a column definition list, so the list
-- moves inside ROWS FROM(). Same behavior otherwise: the receipt and its stock
-- batches in one transaction, lines inserted in the order sent.
-- Never edit this file once applied; add a new migration instead.

create or replace function public.save_receipt(purchase_date date, photo_path text, lines jsonb)
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
  from rows from (
    jsonb_to_recordset(lines) as (
      "stemId" uuid, quantity numeric, unit text, "bundleSize" integer, "totalPaid" numeric, "costPerStem" numeric
    )
  ) with ordinality as l ("stemId", quantity, unit, "bundleSize", "totalPaid", "costPerStem", n)
  order by l.n;

  return new_receipt_id;
end;
$$;
