-- Native PNG crop encoding avoids the CPU-heavy JavaScript JPEG encoder used
-- by the import worker. Keep the existing bucket private and retain its 5 MiB
-- per-object limit while permitting either historical JPEGs or new PNG data.
do $$
begin
  update storage.buckets
  set allowed_mime_types = array['image/jpeg', 'image/png']::text[]
  where id = 'custom-exercise-media'
    and public is false
    and file_size_limit = 5242880;

  if not found then
    raise exception 'custom-exercise-media bucket is missing or its security bounds changed';
  end if;
end;
$$;
