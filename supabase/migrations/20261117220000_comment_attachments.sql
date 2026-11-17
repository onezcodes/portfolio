-- Allow task file attachments to be linked to a comment (optional).
-- Comment-section uploads store the same file on the task and point at the comment.

alter table public.task_attachments
  add column if not exists comment_id uuid references public.task_comments (id) on delete set null;

create index if not exists task_attachments_comment_idx
  on public.task_attachments (comment_id)
  where comment_id is not null;
