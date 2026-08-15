-- Coach should accept documents as well as photos. PDFs go to the OpenAI Files API the
-- same way routine imports do; plain text and CSV are read inline. The 10 MB cap stays,
-- since anything larger is impractical to send in a single request.
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/markdown'
]
where id = 'coach-attachments';
