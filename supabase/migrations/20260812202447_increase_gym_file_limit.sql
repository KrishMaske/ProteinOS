-- Keep the private workout-import bucket aligned with the app's 10 MiB limit.
update storage.buckets
set file_size_limit = 10485760
where id = 'gym-files';
