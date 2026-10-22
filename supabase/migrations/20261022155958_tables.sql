-- The seven tables from docs/spec.md section 8, with the columns of lib/types.ts
-- in snake_case. Money is pesos with two decimals. Row-level security: a row is
-- visible when its shop's owner_id is the signed-in user.
-- Never edit this file once applied; add a new migration instead.

-- Helpers live in a schema the Data API does not expose.
create schema if not exists private;

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null default '',
  wrap_fee numeric(10, 2) not null default 0 check (wrap_fee >= 0),
  labor_fee numeric(10, 2) not null default 0 check (labor_fee >= 0),
  markup_percent numeric(6, 2) not null default 0 check (markup_percent >= 0),
  minimum_margin_percent numeric(5, 2) not null default 20 check (minimum_margin_percent between 0 and 100),
  valid_for_days integer not null default 2 check (valid_for_days between 1 and 60),
  created_at timestamptz not null default now()
);

-- The signed-in user's shop id, or null. Security definer so policies on other
-- tables can read shops without recursing into its own policy.
create function private.my_shop_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.shops where owner_id = (select auth.uid())
$$;

-- clock_timestamp() rather than now() on line tables, so rows inserted in one
-- statement still sort in the order they were entered (latest cost breaks ties
-- between batches by entry order).

create table public.stems (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  flower text not null check (length(trim(flower)) > 0),
  color text not null default '',
  is_filler boolean not null default false,
  unit text not null check (unit in ('dozen', 'per10', 'bundle', 'bunch', 'piece')),
  bundle_size integer,
  sample_price numeric(10, 2) not null check (sample_price >= 0),
  sample_source text not null default '',
  hidden boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  -- coalesce: a plain "bundle_size > 0" lets null through, since a check that is null passes.
  constraint stems_bundle_size_check check (unit <> 'bundle' or coalesce(bundle_size, 0) > 0),
  -- Lets child tables require that the stem belongs to the same shop.
  unique (id, shop_id)
);

-- The AI matches row names ("Rose - red") ignoring capital letters, so two rows
-- may not share a name. Hidden rows count: they can be unhidden.
create unique index stems_name_key on public.stems (shop_id, lower(flower), lower(color));

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  purchase_date date not null,
  photo_path text not null,
  created_at timestamptz not null default now(),
  unique (id, shop_id)
);

create index receipts_shop_id_idx on public.receipts (shop_id, purchase_date desc);

-- Stock batches. Composite foreign keys keep a batch, its receipt and its stem in one shop.
create table public.receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null,
  shop_id uuid not null references public.shops (id) on delete cascade,
  stem_id uuid not null,
  quantity numeric(10, 2) not null check (quantity > 0),
  unit text not null check (unit in ('dozen', 'per10', 'bundle', 'bunch', 'piece')),
  bundle_size integer,
  total_paid numeric(10, 2) not null check (total_paid >= 0),
  cost_per_stem numeric(10, 2) not null check (cost_per_stem >= 0),
  created_at timestamptz not null default clock_timestamp(),
  constraint receipt_lines_bundle_size_check check (unit <> 'bundle' or coalesce(bundle_size, 0) > 0),
  foreign key (receipt_id, shop_id) references public.receipts (id, shop_id) on delete cascade,
  -- Stems are never deleted, so a batch never loses its stem.
  foreign key (stem_id, shop_id) references public.stems (id, shop_id)
);

create index receipt_lines_shop_id_idx on public.receipt_lines (shop_id);
create index receipt_lines_receipt_id_idx on public.receipt_lines (receipt_id);
create index receipt_lines_stem_id_idx on public.receipt_lines (stem_id);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  label text not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'expired')),
  photo_path text not null,
  budget numeric(10, 2) check (budget >= 0),
  price numeric(10, 2) check (price >= 0),
  reply_text text not null default '',
  valid_until date,
  underwater_at timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (id, shop_id)
);

create index quotes_shop_id_idx on public.quotes (shop_id, created_at desc);

create table public.quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null,
  shop_id uuid not null references public.shops (id) on delete cascade,
  -- null = a "pick a flower" line. A null stem_id skips the foreign key check.
  stem_id uuid,
  -- null = blank, which blocks copying the reply.
  count integer check (count > 0),
  count_low integer not null check (count_low >= 0),
  count_high integer not null check (count_high >= count_low),
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  note text not null default '',
  cost_per_stem numeric(10, 2) not null default 0 check (cost_per_stem >= 0),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (quote_id, shop_id) references public.quotes (id, shop_id) on delete cascade,
  foreign key (stem_id, shop_id) references public.stems (id, shop_id)
);

create index quote_lines_shop_id_idx on public.quote_lines (shop_id);
create index quote_lines_quote_id_idx on public.quote_lines (quote_id);
create index quote_lines_stem_id_idx on public.quote_lines (stem_id);

-- One row per AI call, failures included. Kept when its quote or receipt is
-- deleted (only the link is cleared) so cost per quote stays honest.
create table public.ai_calls (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  call text not null check (call in ('extractReceipt', 'analyzeBouquet', 'fitToBudget', 'draftReply', 'priceUpdate')),
  model text not null,
  seconds numeric(8, 2) not null check (seconds >= 0),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  quote_id uuid,
  receipt_id uuid,
  ok boolean not null,
  error text not null default '',
  created_at timestamptz not null default now(),
  foreign key (quote_id, shop_id) references public.quotes (id, shop_id) on delete set null (quote_id),
  foreign key (receipt_id, shop_id) references public.receipts (id, shop_id) on delete set null (receipt_id)
);

create index ai_calls_shop_id_idx on public.ai_calls (shop_id, call);
create index ai_calls_quote_id_idx on public.ai_calls (quote_id);
create index ai_calls_receipt_id_idx on public.ai_calls (receipt_id);

-- Grants: signed-in users only, still limited by the policies below. Nothing
-- for anon. Missing verbs are on purpose: shops and stems are never deleted,
-- saved receipts are read-only, ai_calls rows are append-only.
revoke all on public.shops, public.stems, public.receipts, public.receipt_lines,
  public.quotes, public.quote_lines, public.ai_calls from anon, authenticated;
-- Column-level updates: ids, owners and shops never change.
grant select, insert on public.shops, public.stems to authenticated;
grant update (name, wrap_fee, labor_fee, markup_percent, minimum_margin_percent, valid_for_days)
  on public.shops to authenticated;
grant update (flower, color, is_filler, unit, bundle_size, sample_price, sample_source, hidden)
  on public.stems to authenticated;
grant select, insert, delete on public.receipts, public.receipt_lines to authenticated;
grant select, insert, update, delete on public.quotes, public.quote_lines to authenticated;
grant select, insert on public.ai_calls to authenticated;
grant select, insert, update, delete on public.shops, public.stems, public.receipts, public.receipt_lines,
  public.quotes, public.quote_lines, public.ai_calls to service_role;

revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke execute on function private.my_shop_id() from public, anon;
grant execute on function private.my_shop_id() to authenticated;

alter table public.shops enable row level security;
alter table public.stems enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_lines enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_lines enable row level security;
alter table public.ai_calls enable row level security;

create policy "Owners read their shop" on public.shops
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "Users create their own shop" on public.shops
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "Owners update their shop" on public.shops
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "Shop rows" on public.stems
  for all to authenticated
  using (shop_id = (select private.my_shop_id())) with check (shop_id = (select private.my_shop_id()));
create policy "Shop rows" on public.receipts
  for all to authenticated
  using (shop_id = (select private.my_shop_id())) with check (shop_id = (select private.my_shop_id()));
create policy "Shop rows" on public.receipt_lines
  for all to authenticated
  using (shop_id = (select private.my_shop_id())) with check (shop_id = (select private.my_shop_id()));
create policy "Shop rows" on public.quotes
  for all to authenticated
  using (shop_id = (select private.my_shop_id())) with check (shop_id = (select private.my_shop_id()));
create policy "Shop rows" on public.quote_lines
  for all to authenticated
  using (shop_id = (select private.my_shop_id())) with check (shop_id = (select private.my_shop_id()));
create policy "Shop rows" on public.ai_calls
  for all to authenticated
  using (shop_id = (select private.my_shop_id())) with check (shop_id = (select private.my_shop_id()));

-- First sign-in (spec decision 14): creates the caller's shop and its starter
-- list in one transaction. `starter` is the fixtures/seed/stems.json array, with
-- its camelCase keys. Runs as the caller, so the policies above still apply.
-- Returns true when it created the shop, false when the caller already had one.
create function public.create_shop(starter jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_shop_id uuid;
begin
  insert into public.shops (owner_id)
  values ((select auth.uid()))
  on conflict (owner_id) do nothing
  returning id into new_shop_id;

  if new_shop_id is null then
    return false;
  end if;

  insert into public.stems (shop_id, flower, color, is_filler, unit, bundle_size, sample_price, sample_source)
  select new_shop_id, s.flower, s.color, s."isFiller", s.unit, s."bundleSize", s."samplePrice", s."sampleSource"
  from jsonb_to_recordset(starter) as s (
    flower text, color text, "isFiller" boolean, unit text,
    "bundleSize" integer, "samplePrice" numeric, "sampleSource" text
  );

  return true;
end;
$$;

revoke execute on function public.create_shop(jsonb) from public, anon;
grant execute on function public.create_shop(jsonb) to authenticated;
