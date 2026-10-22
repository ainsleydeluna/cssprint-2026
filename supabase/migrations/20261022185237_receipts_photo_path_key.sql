-- One receipt per photo: a second save of the same photo (a double tap on Save)
-- fails with unique_violation, which the save route answers as invalid_request.
-- Without this, deleting one copy also deleted the photo the other still used.
-- Never edit this file once applied; add a new migration instead.

create unique index receipts_photo_path_key on public.receipts (photo_path);
