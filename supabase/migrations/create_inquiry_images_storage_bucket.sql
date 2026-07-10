insert into storage.buckets (id, name, public)
values ('inquiry-images', 'inquiry-images', true)
on conflict (id) do update
set public = excluded.public;
