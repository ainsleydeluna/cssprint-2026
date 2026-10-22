-- Private photo buckets (spec decision 16 and section 4, "Everything else").
-- Object path "<shop_id>/<uuid>.jpg"; the first path segment must be the
-- caller's shop. Photos are never replaced in place, so there is no update rule.
-- Never edit this file once applied; add a new migration instead.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('bouquets', 'bouquets', false, 5242880, array['image/jpeg']),
  ('receipts', 'receipts', false, 5242880, array['image/jpeg']);

create policy "Shops read their own photos" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('bouquets', 'receipts')
    and (storage.foldername(name))[1] = (select private.my_shop_id())::text
  );

create policy "Shops upload photos to their own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('bouquets', 'receipts')
    and (storage.foldername(name))[1] = (select private.my_shop_id())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
  );

create policy "Shops delete their own photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('bouquets', 'receipts')
    and (storage.foldername(name))[1] = (select private.my_shop_id())::text
  );
