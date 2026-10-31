// PostgreSQL schema, used unchanged by Supabase in production and PGlite locally.
// All instants are stored as ISO-8601 UTC strings. Boolean flags are integers (0 or 1).
// Statements are idempotent so the schema can be applied on every start.

export const SCHEMA_VERSION = 20;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  handle TEXT NOT NULL UNIQUE,
  title TEXT,
  phone TEXT,
  bio TEXT,
  password_hash TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  invite_token TEXT,
  prefs TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS role_assignments (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  PRIMARY KEY (user_id, role)
);

CREATE TABLE IF NOT EXISTS access_scopes (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  grade_id TEXT,
  subject_id TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  active_role TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS user_capacity (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  hours_per_week DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (user_id, stage)
);

CREATE TABLE IF NOT EXISTS leave_entries (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS curricula (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  cycle TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS grades (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  level TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_am TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS grade_subjects (
  grade_id TEXT NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  PRIMARY KEY (grade_id, subject_id)
);

CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  curriculum_id TEXT REFERENCES curricula(id),
  grade_id TEXT NOT NULL REFERENCES grades(id),
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  title_am TEXT,
  term TEXT,
  source_ref TEXT,
  UNIQUE (grade_id, subject_id, number)
);

-- Planned lesson inventory ("parts"). Coverage compares this against production items.
CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  title_am TEXT,
  objectives TEXT,
  language TEXT,
  planned_deliverables INTEGER NOT NULL DEFAULT 1,
  source_ref TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (unit_id, number)
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  lesson_id TEXT REFERENCES lessons(id) ON DELETE SET NULL,
  deliverable_type TEXT NOT NULL DEFAULT 'main_video',
  title TEXT NOT NULL,
  title_am TEXT,
  objectives TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  content_type TEXT NOT NULL DEFAULT 'lesson_video',
  teacher TEXT,
  target_duration_min DOUBLE PRECISION,
  actual_duration_min DOUBLE PRECISION,
  complexity TEXT NOT NULL DEFAULT 'standard',
  complexity_note TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  tags TEXT NOT NULL DEFAULT '[]',
  lifecycle TEXT NOT NULL DEFAULT 'draft',
  stage TEXT,
  stage_status TEXT,
  substate TEXT,
  current_attempt_id TEXT,
  next_action TEXT,
  next_action_owner_id TEXT,
  planned_publish_at TEXT,
  original_due_at TEXT,
  current_due_at TEXT,
  scheduled_publish_at TEXT,
  published_at TEXT,
  publication_verified_at TEXT,
  live_url TEXT,
  provenance TEXT NOT NULL DEFAULT 'live',
  exclude_from_metrics INTEGER NOT NULL DEFAULT 0,
  import_batch_id TEXT,
  source_reference TEXT,
  revision_of_id TEXT REFERENCES items(id),
  cancel_reason TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  released_at TEXT,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_items_stage ON items(stage, stage_status);
CREATE INDEX IF NOT EXISTS idx_items_lesson ON items(lesson_id);

CREATE TABLE IF NOT EXISTS item_memberships (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  grade_id TEXT NOT NULL REFERENCES grades(id),
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  unit_id TEXT REFERENCES units(id) ON DELETE SET NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (item_id, grade_id, subject_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_gs ON item_memberships(grade_id, subject_id);

CREATE TABLE IF NOT EXISTS stage_assignments (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  stage_due_at TEXT,
  assigned_at TEXT NOT NULL,
  assigned_by TEXT,
  PRIMARY KEY (item_id, stage)
);

CREATE TABLE IF NOT EXISTS item_collaborators (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stage TEXT,
  PRIMARY KEY (item_id, user_id)
);

CREATE TABLE IF NOT EXISTS stage_attempts (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  attempt_no INTEGER NOT NULL,
  cause TEXT NOT NULL DEFAULT 'initial',
  cause_note TEXT,
  status TEXT NOT NULL,
  substate TEXT,
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  entered_at TEXT NOT NULL,
  first_started_at TEXT,
  handoff_submitted_at TEXT,
  completed_at TEXT,
  closed_at TEXT,
  held INTEGER NOT NULL DEFAULT 0,
  raw_duration_min DOUBLE PRECISION,
  notes TEXT,
  UNIQUE (item_id, stage, attempt_no)
);
CREATE INDEX IF NOT EXISTS idx_attempts_item ON stage_attempts(item_id);
CREATE INDEX IF NOT EXISTS idx_attempts_status ON stage_attempts(stage, status);

CREATE TABLE IF NOT EXISTS stage_intervals (
  id SERIAL PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES stage_attempts(id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_intervals_attempt ON stage_intervals(attempt_id);

CREATE TABLE IF NOT EXISTS work_sessions (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES stage_attempts(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  end_reason TEXT,
  corrected_from TEXT,
  corrected_by TEXT,
  correction_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON work_sessions(user_id, ended_at);
CREATE INDEX IF NOT EXISTS idx_sessions_attempt ON work_sessions(attempt_id);

CREATE TABLE IF NOT EXISTS session_corrections (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL,
  proposed_started_at TEXT NOT NULL,
  proposed_ended_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  decided_by TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL
);

-- Files and recordings. A raw recording may be identified only by its camera code(s).
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  attempt_id TEXT REFERENCES stage_attempts(id) ON DELETE SET NULL,
  stage TEXT NOT NULL,
  kind TEXT NOT NULL,
  version_no INTEGER NOT NULL,
  label TEXT,
  url TEXT,
  camera_code TEXT,
  duration_min DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'current',
  notes TEXT,
  source_ref TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assets_item ON assets(item_id, kind);

CREATE TABLE IF NOT EXISTS checklist_results (
  attempt_id TEXT NOT NULL REFERENCES stage_attempts(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  checked INTEGER NOT NULL DEFAULT 0,
  checked_by TEXT,
  checked_at TEXT,
  PRIMARY KEY (attempt_id, key)
);

CREATE TABLE IF NOT EXISTS handoff_reviews (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES stage_attempts(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason_category TEXT,
  note TEXT,
  reviewer_id TEXT,
  asset_id TEXT,
  self_approval INTEGER NOT NULL DEFAULT 0,
  valid INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS blockers (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES stage_attempts(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  cause TEXT NOT NULL,
  note TEXT,
  resolver_id TEXT,
  opened_by TEXT,
  opened_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT,
  resolution TEXT
);

CREATE TABLE IF NOT EXISTS deadline_revisions (
  id SERIAL PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  stage TEXT,
  old_due_at TEXT,
  new_due_at TEXT,
  reason TEXT NOT NULL,
  actor_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS publication_targets (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 1,
  upload_status TEXT NOT NULL DEFAULT 'pending',
  external_id TEXT,
  upload_url TEXT,
  uploaded_asset_id TEXT,
  playback_checked INTEGER NOT NULL DEFAULT 0,
  metadata_checked INTEGER NOT NULL DEFAULT 0,
  release_status TEXT NOT NULL DEFAULT 'pending',
  scheduled_at TEXT,
  live_url TEXT,
  published_at TEXT,
  verified_at TEXT,
  verified_by TEXT,
  failure_reason TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (item_id, platform)
);

CREATE TABLE IF NOT EXISTS audit_events (
  seq BIGSERIAL,
  id TEXT PRIMARY KEY,
  item_id TEXT,
  attempt_id TEXT,
  stage TEXT,
  actor_id TEXT,
  actor_kind TEXT NOT NULL DEFAULT 'user',
  action TEXT NOT NULL,
  summary TEXT,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  request_id TEXT,
  job_id TEXT,
  occurred_at TEXT NOT NULL,
  source_occurred_at TEXT,
  corrects_event_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_item ON audit_events(item_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_events(occurred_at);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  result TEXT,
  created_at TEXT NOT NULL
);

-- Field and item comments. Group chat lives in chat_messages.
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  item_id TEXT,
  stage TEXT,
  field TEXT,
  asset_id TEXT,
  timecode TEXT,
  parent_id TEXT,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  context TEXT,
  resolved INTEGER NOT NULL DEFAULT 0,
  resolved_by TEXT,
  edited_at TEXT,
  edit_history TEXT NOT NULL DEFAULT '[]',
  deleted_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_comments_item ON comments(item_id);

CREATE TABLE IF NOT EXISTS comment_reactions (
  comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  reaction TEXT NOT NULL,
  PRIMARY KEY (comment_id, user_id, reaction)
);

CREATE TABLE IF NOT EXISTS manager_questions (
  id TEXT PRIMARY KEY,
  item_id TEXT,
  stage TEXT,
  context_type TEXT NOT NULL DEFAULT 'item',
  context TEXT,
  asked_by TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  question TEXT NOT NULL,
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  answer TEXT,
  answered_at TEXT,
  resolved_at TEXT,
  escalation_level INTEGER NOT NULL DEFAULT 0,
  escalation_history TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

-- Chat groups (Telegram-style). Members are managed by managers and admins.
CREATE TABLE IF NOT EXISTS chat_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL DEFAULT 'group',
  color TEXT,
  grade_id TEXT,
  subject_id TEXT,
  created_by TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_members (
  group_id TEXT NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_role TEXT NOT NULL DEFAULT 'member',
  muted INTEGER NOT NULL DEFAULT 0,
  last_read_at TEXT,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  seq BIGSERIAL,
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  reply_to_id TEXT,
  item_id TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  edited_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_group ON chat_messages(group_id, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  item_id TEXT,
  group_key TEXT,
  dedupe_key TEXT,
  essential INTEGER NOT NULL DEFAULT 0,
  read_at TEXT,
  snoozed_until TEXT,
  delivery TEXT NOT NULL DEFAULT 'in_app',
  escalation_level INTEGER NOT NULL DEFAULT 0,
  count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe ON notifications(user_id, dedupe_key);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, created_at);

CREATE TABLE IF NOT EXISTS saved_views (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  page TEXT NOT NULL,
  query TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  shared INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recording_sessions (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  scheduled_start TEXT NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 60,
  presenter TEXT,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  outcome_note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  template TEXT,
  mode TEXT,
  file_name TEXT,
  status TEXT NOT NULL,
  dry_run INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT UNIQUE,
  total_rows INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  report TEXT,
  actor_id TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
);
-- v3: stage completion dates, team leads, own-work-only members, direct chats with end-to-end keys,
-- and workflow cards (redo requests and questions) posted into chat.
ALTER TABLE items ADD COLUMN IF NOT EXISTS recorded_at TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS edited_at TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS uploaded_at TEXT;

ALTER TABLE users ADD COLUMN IF NOT EXISTS own_work_only INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS e2e_public_key TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS e2e_private_enc TEXT;

CREATE TABLE IF NOT EXISTS team_leads (
  stage TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (stage, user_id)
);

ALTER TABLE chat_groups ADD COLUMN IF NOT EXISTS stage TEXT;
ALTER TABLE chat_groups ADD COLUMN IF NOT EXISTS dm_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_groups_dm ON chat_groups(dm_key);
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'text';
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS meta TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS encrypted INTEGER NOT NULL DEFAULT 0;

-- v4: trash. Deleted records are kept as a JSON snapshot of their rows (and dependent rows) so they can be
-- restored exactly; live tables keep no soft-delete flags, so existing queries are unaffected.
CREATE TABLE IF NOT EXISTS trash (
  id TEXT PRIMARY KEY,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  label TEXT NOT NULL,
  detail TEXT,
  snapshot TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  deleted_by TEXT,
  deleted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trash_time ON trash(deleted_at);

-- v5: editorial workflow. Checklist templates chosen per person when work is assigned, lead verification of
-- checklist items, and handover batches that the receiving team accepts or marks missing item by item.
CREATE TABLE IF NOT EXISTS checklist_templates (
  id TEXT PRIMARY KEY,
  stage TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  items TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS work_checklists (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  template_id TEXT,
  name TEXT NOT NULL,
  items TEXT NOT NULL DEFAULT '[]',
  assigned_to TEXT,
  assigned_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (item_id, stage)
);

ALTER TABLE checklist_results ADD COLUMN IF NOT EXISTS verified_by TEXT;
ALTER TABLE checklist_results ADD COLUMN IF NOT EXISTS verified_at TEXT;

CREATE TABLE IF NOT EXISTS handovers (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  from_stage TEXT NOT NULL,
  to_stage TEXT NOT NULL,
  from_user TEXT,
  to_user TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_handovers_stage ON handovers(to_stage, status);

CREATE TABLE IF NOT EXISTS handover_items (
  handover_id TEXT NOT NULL REFERENCES handovers(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  decided_by TEXT,
  decided_at TEXT,
  PRIMARY KEY (handover_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_handover_items_item ON handover_items(item_id);

-- v6: chat. Reactions, polls, files and voice messages (voice is deleted 10 minutes after it is first played),
-- channels (only their admins post), automatic end-to-end keys, and browser push subscriptions.
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE chat_groups ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private';
ALTER TABLE chat_groups ADD COLUMN IF NOT EXISTS invite_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS e2e_kdf TEXT;

CREATE TABLE IF NOT EXISTS chat_reactions (
  message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS chat_poll_votes (
  message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id, option_id)
);

CREATE TABLE IF NOT EXISTS chat_files (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
  message_id TEXT,
  uploader_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'file',
  name TEXT,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  storage TEXT NOT NULL,
  path TEXT NOT NULL,
  encrypted INTEGER NOT NULL DEFAULT 0,
  duration_sec DOUBLE PRECISION,
  first_played_at TEXT,
  expires_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_files_expiry ON chat_files(expires_at);

CREATE TABLE IF NOT EXISTS chat_blobs (
  file_id TEXT PRIMARY KEY REFERENCES chat_files(id) ON DELETE CASCADE,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

-- v7: email. Sender addresses (each employee's mailbox, created at the email provider), templates, and a log of
-- every email sent with the outcome per recipient. SMTP settings live in settings (cfg.smtp), password encrypted.
CREATE TABLE IF NOT EXISTS email_senders (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL UNIQUE,
  display_name TEXT,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  smtp_user TEXT,
  smtp_pass_enc TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  shared INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_log (
  id TEXT PRIMARY KEY,
  sender_id TEXT,
  from_address TEXT NOT NULL,
  sent_by TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  mode TEXT NOT NULL,
  attachments TEXT NOT NULL DEFAULT '[]',
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'sending',
  error TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_email_log_time ON email_log(created_at);

CREATE TABLE IF NOT EXISTS email_log_recipients (
  log_id TEXT NOT NULL REFERENCES email_log(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'to',
  name TEXT,
  user_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  message_id TEXT,
  sent_at TEXT,
  PRIMARY KEY (log_id, address, kind)
);

-- v8: departments. Positions (head, lead) per department; members are the people holding its roles.
-- Dev and Marketing share projects (campaigns in Marketing), milestones, tasks, comments and KPI entries.
-- Studio keeps notes, exams, a question bank and flash card decks, linked to the curriculum.
-- Department heads and leads write periodic reports that owners read.
CREATE TABLE IF NOT EXISTS department_positions (
  department TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position TEXT NOT NULL,
  PRIMARY KEY (department, user_id)
);

CREATE TABLE IF NOT EXISTS dept_projects (
  id TEXT PRIMARY KEY,
  dept TEXT NOT NULL,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  lead_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  start_date TEXT,
  due_date TEXT,
  color TEXT,
  budget DOUBLE PRECISION,
  meta TEXT NOT NULL DEFAULT '{}',
  next_number INTEGER NOT NULL DEFAULT 1,
  archived INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (dept, key)
);

CREATE TABLE IF NOT EXISTS dept_milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES dept_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dept_tasks (
  id TEXT PRIMARY KEY,
  dept TEXT NOT NULL,
  project_id TEXT REFERENCES dept_projects(id) ON DELETE SET NULL,
  milestone_id TEXT REFERENCES dept_milestones(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'task',
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'normal',
  assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reporter_id TEXT,
  estimate_hours DOUBLE PRECISION,
  spent_hours DOUBLE PRECISION,
  progress INTEGER NOT NULL DEFAULT 0,
  start_date TEXT,
  due_date TEXT,
  labels TEXT NOT NULL DEFAULT '[]',
  sort DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_dept_tasks ON dept_tasks(dept, status);
CREATE INDEX IF NOT EXISTS idx_dept_tasks_assignee ON dept_tasks(assignee_id);

CREATE TABLE IF NOT EXISTS dept_task_comments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES dept_tasks(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dept_metrics (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES dept_projects(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  recorded_on TEXT NOT NULL,
  note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dept_reports (
  id TEXT PRIMARY KEY,
  department TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  highlights TEXT,
  risks TEXT,
  next_steps TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  author_id TEXT,
  submitted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS studio_resources (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  grade_id TEXT REFERENCES grades(id) ON DELETE SET NULL,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  unit_id TEXT REFERENCES units(id) ON DELETE SET NULL,
  lesson_id TEXT REFERENCES lessons(id) ON DELETE SET NULL,
  language TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'draft',
  body TEXT NOT NULL DEFAULT '',
  meta TEXT NOT NULL DEFAULT '{}',
  author_id TEXT,
  reviewer_id TEXT,
  review_note TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_studio_resources ON studio_resources(type, status);

CREATE TABLE IF NOT EXISTS studio_questions (
  id TEXT PRIMARY KEY,
  grade_id TEXT REFERENCES grades(id) ON DELETE SET NULL,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  unit_id TEXT REFERENCES units(id) ON DELETE SET NULL,
  lesson_id TEXT REFERENCES lessons(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  stem TEXT NOT NULL,
  options TEXT NOT NULL DEFAULT '[]',
  answer TEXT,
  explanation TEXT,
  difficulty TEXT NOT NULL DEFAULT 'medium',
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  author_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS studio_exam_questions (
  resource_id TEXT NOT NULL REFERENCES studio_resources(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES studio_questions(id) ON DELETE CASCADE,
  sort INTEGER NOT NULL DEFAULT 0,
  points DOUBLE PRECISION NOT NULL DEFAULT 1,
  PRIMARY KEY (resource_id, question_id)
);

CREATE TABLE IF NOT EXISTS studio_cards (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES studio_resources(id) ON DELETE CASCADE,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);

-- v9: in-app calls. One row per call with its state (ringing, accepted, declined, busy, missed, cancelled, ended,
-- failed) and when each side was last seen, so a closed tab or lost connection ends the call. call_signals carries
-- the WebRTC connection messages (offer, answer, network candidates) between the two browsers while connecting.
CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
  caller_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  callee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media TEXT NOT NULL DEFAULT 'audio',
  status TEXT NOT NULL DEFAULT 'ringing',
  end_reason TEXT,
  ended_by TEXT,
  caller_seen_at TEXT,
  callee_seen_at TEXT,
  answered_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_calls_callee ON calls(callee_id, status);
CREATE INDEX IF NOT EXISTS idx_calls_caller ON calls(caller_id, status);
CREATE INDEX IF NOT EXISTS idx_calls_group ON calls(group_id, created_at);

CREATE TABLE IF NOT EXISTS call_signals (
  seq BIGSERIAL PRIMARY KEY,
  call_id TEXT NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  from_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_call_signals ON call_signals(call_id, seq);

-- v10: department configuration (statuses, types, fields, rights...) as data, with every saved version kept so an
-- earlier one can be restored. Tasks store their status category (kept in step with the configuration) so counts
-- survive renamed statuses, and their custom field values.
CREATE TABLE IF NOT EXISTS dept_config (
  dept TEXT PRIMARY KEY,
  config TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS dept_config_versions (
  dept TEXT NOT NULL,
  version INTEGER NOT NULL,
  config TEXT NOT NULL,
  summary TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT,
  PRIMARY KEY (dept, version)
);

ALTER TABLE dept_tasks ADD COLUMN IF NOT EXISTS status_category TEXT NOT NULL DEFAULT 'open';
ALTER TABLE dept_tasks ADD COLUMN IF NOT EXISTS fields TEXT NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_dept_tasks_category ON dept_tasks(dept, status_category);

-- v11: department dashboard layouts. scope is 'position:head' (lead, member) for the defaults a head sets, or
-- 'user:<id>' for a person's own arrangement.
CREATE TABLE IF NOT EXISTS dept_dashboards (
  dept TEXT NOT NULL,
  scope TEXT NOT NULL,
  layout TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  PRIMARY KEY (dept, scope)
);

-- v12: departments created from templates (Support, Sales, ...); and task depth: subtasks, reviewer, checklist,
-- recurrence, sprints, requests from other departments, dependencies, watchers, files, time entries, capacity.
-- Studio work gains an assignee, a due date and a review checklist.
CREATE TABLE IF NOT EXISTS departments (
  key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  template TEXT NOT NULL DEFAULT 'blank',
  archived INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL
);

ALTER TABLE dept_tasks ADD COLUMN IF NOT EXISTS parent_id TEXT;
ALTER TABLE dept_tasks ADD COLUMN IF NOT EXISTS reviewer_id TEXT;
ALTER TABLE dept_tasks ADD COLUMN IF NOT EXISTS checklist TEXT NOT NULL DEFAULT '[]';
ALTER TABLE dept_tasks ADD COLUMN IF NOT EXISTS recur TEXT;
ALTER TABLE dept_tasks ADD COLUMN IF NOT EXISTS sprint_id TEXT;
ALTER TABLE dept_tasks ADD COLUMN IF NOT EXISTS request_state TEXT;
ALTER TABLE dept_tasks ADD COLUMN IF NOT EXISTS requested_by TEXT;
CREATE INDEX IF NOT EXISTS idx_dept_tasks_parent ON dept_tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_dept_tasks_requested ON dept_tasks(requested_by);

CREATE TABLE IF NOT EXISTS dept_task_links (
  task_id TEXT NOT NULL REFERENCES dept_tasks(id) ON DELETE CASCADE,
  blocked_by TEXT NOT NULL REFERENCES dept_tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, blocked_by)
);

CREATE TABLE IF NOT EXISTS dept_task_watchers (
  task_id TEXT NOT NULL REFERENCES dept_tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);

CREATE TABLE IF NOT EXISTS dept_task_files (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES dept_tasks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  data TEXT NOT NULL,
  uploaded_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dept_task_files ON dept_task_files(task_id);

CREATE TABLE IF NOT EXISTS dept_time_entries (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES dept_tasks(id) ON DELETE CASCADE,
  dept TEXT NOT NULL,
  user_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  minutes INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dept_time_task ON dept_time_entries(task_id);
CREATE INDEX IF NOT EXISTS idx_dept_time_user ON dept_time_entries(user_id, started_at);

CREATE TABLE IF NOT EXISTS dept_sprints (
  id TEXT PRIMARY KEY,
  dept TEXT NOT NULL,
  name TEXT NOT NULL,
  goal TEXT,
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dept_capacity (
  dept TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hours_per_week DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (dept, user_id)
);

ALTER TABLE studio_resources ADD COLUMN IF NOT EXISTS assignee_id TEXT;
ALTER TABLE studio_resources ADD COLUMN IF NOT EXISTS due_date TEXT;
ALTER TABLE studio_resources ADD COLUMN IF NOT EXISTS checklist TEXT NOT NULL DEFAULT '[]';

-- v13: HR. Employee records (one per person, linked to their account when they have one), sensitive details kept
-- in their own table, documents with expiry dates, and the equipment register with its history.
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  user_id TEXT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  preferred_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  birth_date TEXT,
  gender TEXT,
  emergency_contacts TEXT NOT NULL DEFAULT '[]',
  job_title TEXT,
  department TEXT,
  manager_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  employment_type TEXT NOT NULL DEFAULT 'full_time',
  status TEXT NOT NULL DEFAULT 'active',
  location TEXT,
  start_date TEXT,
  probation_end TEXT,
  contract_end TEXT,
  end_date TEXT,
  end_reason TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_employees_manager ON employees(manager_id);
CREATE INDEX IF NOT EXISTS idx_employees_dept ON employees(department);

CREATE TABLE IF NOT EXISTS employee_private (
  employee_id TEXT PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  salary_grade TEXT,
  national_id TEXT,
  tin TEXT,
  pension_no TEXT,
  bank_name TEXT,
  bank_account TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employee_documents (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  data TEXT NOT NULL,
  expires_at TEXT,
  uploaded_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_employee_documents ON employee_documents(employee_id);

CREATE TABLE IF NOT EXISTS equipment (
  id TEXT PRIMARY KEY,
  tag TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  serial TEXT,
  condition TEXT NOT NULL DEFAULT 'good',
  status TEXT NOT NULL DEFAULT 'available',
  holder_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  issued_at TEXT,
  due_back TEXT,
  purchased_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_equipment_holder ON equipment(holder_id);

CREATE TABLE IF NOT EXISTS equipment_events (
  id TEXT PRIMARY KEY,
  equipment_id TEXT NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  employee_id TEXT,
  condition TEXT,
  note TEXT,
  actor_id TEXT,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_equipment_events ON equipment_events(equipment_id, at);

-- v14: leave. Types and policy, requests approved by the line manager then HR, balance adjustments. Approved leave
-- also writes a leave_entries row so capacity counts it.
CREATE TABLE IF NOT EXISTS leave_types (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  paid INTEGER NOT NULL DEFAULT 1,
  days_per_year DOUBLE PRECISION,
  service_bonus DOUBLE PRECISION NOT NULL DEFAULT 0,
  accrual TEXT NOT NULL DEFAULT 'yearly',
  needs_document INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type_key TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  half_day INTEGER NOT NULL DEFAULT 0,
  days DOUBLE PRECISION NOT NULL,
  reason TEXT,
  status TEXT NOT NULL,
  approver_id TEXT,
  lead_decided_by TEXT,
  lead_decided_at TEXT,
  lead_note TEXT,
  hr_decided_by TEXT,
  hr_decided_at TEXT,
  hr_note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee ON leave_requests(employee_id, start_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);

CREATE TABLE IF NOT EXISTS leave_adjustments (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type_key TEXT NOT NULL,
  year INTEGER NOT NULL,
  days DOUBLE PRECISION NOT NULL,
  note TEXT,
  actor_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leave_adjustments ON leave_adjustments(employee_id, year);

ALTER TABLE leave_entries ADD COLUMN IF NOT EXISTS request_id TEXT;

-- v15: HR. Recruitment (openings, applicants, interviews, scorecards), onboarding and offboarding checklists,
-- performance (goals, review cycles, one-to-ones), training and certifications, and confidential cases.
CREATE TABLE IF NOT EXISTS job_openings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  department TEXT,
  location TEXT,
  employment_type TEXT NOT NULL DEFAULT 'full_time',
  positions INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  hiring_manager_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open',
  closes_on TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS applicants (
  id TEXT PRIMARY KEY,
  opening_id TEXT NOT NULL REFERENCES job_openings(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  source TEXT,
  stage TEXT NOT NULL DEFAULT 'applied',
  notes TEXT,
  rejected_reason TEXT,
  offer_start_date TEXT,
  offer_note TEXT,
  employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_applicants_opening ON applicants(opening_id, stage);

CREATE TABLE IF NOT EXISTS applicant_files (
  id TEXT PRIMARY KEY,
  applicant_id TEXT NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  data TEXT NOT NULL,
  uploaded_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS interviews (
  id TEXT PRIMARY KEY,
  applicant_id TEXT NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  scheduled_at TEXT NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 45,
  location TEXT,
  interviewer_ids TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_interviews_applicant ON interviews(applicant_id);

CREATE TABLE IF NOT EXISTS scorecards (
  id TEXT PRIMARY KEY,
  interview_id TEXT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  reviewer_id TEXT NOT NULL,
  rating INTEGER NOT NULL,
  recommendation TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (interview_id, reviewer_id)
);

CREATE TABLE IF NOT EXISTS employee_checklists (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  items TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open',
  started_at TEXT NOT NULL,
  finished_at TEXT,
  started_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_employee_checklists ON employee_checklists(employee_id, kind);

CREATE TABLE IF NOT EXISTS hr_goals (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  detail TEXT,
  due_date TEXT,
  progress INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hr_goals ON hr_goals(employee_id);

CREATE TABLE IF NOT EXISTS review_cycles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  self_due TEXT,
  lead_due TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hr_reviews (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL REFERENCES review_cycles(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  reviewer_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'self',
  self_rating INTEGER,
  self_notes TEXT,
  self_at TEXT,
  lead_rating INTEGER,
  lead_notes TEXT,
  lead_at TEXT,
  evidence TEXT NOT NULL DEFAULT '{}',
  UNIQUE (cycle_id, employee_id)
);

CREATE TABLE IF NOT EXISTS one_on_ones (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  manager_user_id TEXT NOT NULL,
  held_on TEXT NOT NULL,
  notes TEXT,
  actions TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_one_on_ones ON one_on_ones(employee_id, held_on);

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  provider TEXT,
  description TEXT,
  renew_months INTEGER,
  mandatory INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trainings (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'assigned',
  due_date TEXT,
  completed_on TEXT,
  expires_on TEXT,
  note TEXT,
  assigned_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trainings ON trainings(employee_id);

CREATE TABLE IF NOT EXISTS hr_cases (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  opened_on TEXT NOT NULL,
  closed_on TEXT,
  outcome TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hr_case_notes (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES hr_cases(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  actor_id TEXT,
  at TEXT NOT NULL
);

-- v16: integrations (GitHub cache, API keys for Power BI and other tools), devices and sessions (IP, last seen,
-- blocked devices), profiles (photo, skills, education, files) and password resets (email link or Google).
CREATE TABLE IF NOT EXISTS integration_cache (
  key TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  datasets TEXT NOT NULL DEFAULT '[]',
  created_by TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ip TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS device_id TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen_at TEXT;
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS blocked_devices (
  device_id TEXT PRIMARY KEY,
  label TEXT,
  user_id TEXT,
  reason TEXT,
  blocked_by TEXT,
  blocked_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  headline TEXT,
  about TEXT,
  location TEXT,
  avatar TEXT,
  cover TEXT NOT NULL DEFAULT 'emerald',
  skills TEXT NOT NULL DEFAULT '[]',
  education TEXT NOT NULL DEFAULT '[]',
  experience TEXT NOT NULL DEFAULT '[]',
  languages TEXT NOT NULL DEFAULT '[]',
  links TEXT NOT NULL DEFAULT '[]',
  study_status TEXT,
  hidden_sections TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_files (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_profile_files ON profile_files(user_id);

CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  via TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

-- v17: chat presence and read receipts (who read up to which message, and when), contact details on profiles,
-- feedback to Admin, and safety reports.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TEXT;
ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS last_read_seq BIGINT NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS chat_receipts (
  group_id TEXT NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  upto_seq BIGINT NOT NULL,
  read_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_receipts ON chat_receipts(group_id, upto_seq);
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS forwarded_from TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contact TEXT NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  page TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  reply TEXT,
  replied_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  target_label TEXT,
  reason TEXT NOT NULL,
  details TEXT,
  evidence TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  resolution TEXT,
  handled_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- v18: Finance. Money accounts, vendors and customers, ledger codes, the transaction journal, bills (payables),
-- invoices (receivables), expense claims, purchase requests, budgets, salary structures, payroll runs and payslips,
-- and locked periods.
CREATE TABLE IF NOT EXISTS fin_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'bank',
  number TEXT,
  ledger_code TEXT,
  opening_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fin_parties (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  tin TEXT,
  phone TEXT,
  email TEXT,
  bank TEXT,
  bank_account TEXT,
  ledger_id TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fin_ledger (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS fin_transactions (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  direction TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  account_id TEXT REFERENCES fin_accounts(id),
  ledger_code TEXT,
  party_id TEXT,
  department TEXT,
  project TEXT,
  product TEXT,
  channel TEXT,
  description TEXT,
  reference TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT,
  transfer_id TEXT,
  status TEXT NOT NULL DEFAULT 'posted',
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fin_tx_date ON fin_transactions(date);
CREATE INDEX IF NOT EXISTS idx_fin_tx_source ON fin_transactions(source, source_id);
CREATE TABLE IF NOT EXISTS fin_bills (
  id TEXT PRIMARY KEY,
  vendor_id TEXT REFERENCES fin_parties(id),
  number TEXT,
  date TEXT NOT NULL,
  due_date TEXT,
  amount DOUBLE PRECISION NOT NULL,
  ledger_code TEXT,
  department TEXT,
  project TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'awaiting_approval',
  recurring TEXT,
  purchase_id TEXT,
  file_name TEXT,
  file_mime TEXT,
  file_data TEXT,
  created_by TEXT,
  approved_by TEXT,
  paid_tx_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fin_invoices (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  customer_id TEXT REFERENCES fin_parties(id),
  date TEXT NOT NULL,
  due_date TEXT,
  lines TEXT NOT NULL DEFAULT '[]',
  amount DOUBLE PRECISION NOT NULL,
  vat DOUBLE PRECISION NOT NULL DEFAULT 0,
  product TEXT,
  channel TEXT,
  department TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  paid_tx_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fin_claims (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  ledger_code TEXT,
  department TEXT,
  project TEXT,
  description TEXT NOT NULL,
  receipt_name TEXT,
  receipt_mime TEXT,
  receipt_data TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  approver_id TEXT,
  lead_by TEXT,
  lead_at TEXT,
  finance_by TEXT,
  finance_at TEXT,
  note TEXT,
  paid_tx_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fin_purchases (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  requester_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  department TEXT,
  project TEXT,
  title TEXT NOT NULL,
  lines TEXT NOT NULL DEFAULT '[]',
  estimate DOUBLE PRECISION NOT NULL,
  vendor_id TEXT REFERENCES fin_parties(id),
  status TEXT NOT NULL DEFAULT 'submitted',
  approved_by TEXT,
  ordered_at TEXT,
  received_at TEXT,
  received_note TEXT,
  bill_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fin_budgets (
  id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  scope_label TEXT NOT NULL,
  year INTEGER NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  alert_pct INTEGER NOT NULL DEFAULT 80,
  alerted_pct INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (scope_type, scope_key, year)
);
CREATE TABLE IF NOT EXISTS fin_pay_structures (
  employee_id TEXT PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  basic DOUBLE PRECISION NOT NULL,
  allowances TEXT NOT NULL DEFAULT '[]',
  deductions TEXT NOT NULL DEFAULT '[]',
  updated_by TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fin_payroll_runs (
  id TEXT PRIMARY KEY,
  period TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft',
  prepared_by TEXT,
  checked_by TEXT,
  approved_by TEXT,
  paid_by TEXT,
  account_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fin_payslips (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES fin_payroll_runs(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  basic DOUBLE PRECISION NOT NULL,
  allowances TEXT NOT NULL DEFAULT '[]',
  deductions TEXT NOT NULL DEFAULT '[]',
  overtime_hours DOUBLE PRECISION NOT NULL DEFAULT 0,
  overtime_rate DOUBLE PRECISION NOT NULL DEFAULT 1.5,
  unpaid_days DOUBLE PRECISION NOT NULL DEFAULT 0,
  gross DOUBLE PRECISION NOT NULL DEFAULT 0,
  taxable DOUBLE PRECISION NOT NULL DEFAULT 0,
  income_tax DOUBLE PRECISION NOT NULL DEFAULT 0,
  pension_employee DOUBLE PRECISION NOT NULL DEFAULT 0,
  pension_employer DOUBLE PRECISION NOT NULL DEFAULT 0,
  other_deductions DOUBLE PRECISION NOT NULL DEFAULT 0,
  net DOUBLE PRECISION NOT NULL DEFAULT 0,
  UNIQUE (run_id, employee_id)
);
CREATE TABLE IF NOT EXISTS fin_periods (
  period TEXT PRIMARY KEY,
  locked_by TEXT,
  locked_at TEXT NOT NULL
);

-- Attendance (Phase 9). Check-ins are events; a day's result is computed from them, the shift, leave and holidays.
-- A team lead's or HR's hand-made record of a day is a mark, which wins over the events.
CREATE TABLE IF NOT EXISTS att_events (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  at TEXT NOT NULL,
  day TEXT NOT NULL,
  source TEXT NOT NULL,
  kiosk_id TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  accuracy DOUBLE PRECISION,
  distance_m DOUBLE PRECISION,
  offline INTEGER NOT NULL DEFAULT 0,
  client_id TEXT,
  note TEXT,
  voided INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_att_events_day ON att_events(day, employee_id);
CREATE INDEX IF NOT EXISTS idx_att_events_emp ON att_events(employee_id, day);
CREATE UNIQUE INDEX IF NOT EXISTS idx_att_events_client ON att_events(kiosk_id, client_id);
CREATE TABLE IF NOT EXISTS att_marks (
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  status TEXT NOT NULL,
  in_time TEXT,
  out_time TEXT,
  note TEXT,
  source TEXT NOT NULL,
  set_by TEXT,
  set_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  PRIMARY KEY (employee_id, day)
);
CREATE TABLE IF NOT EXISTS att_shift_assign (
  employee_id TEXT PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  shift_key TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS att_corrections (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  in_time TEXT,
  out_time TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  approver_id TEXT,
  decided_by TEXT,
  decided_at TEXT,
  decision_note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_att_corrections_emp ON att_corrections(employee_id, day);
CREATE TABLE IF NOT EXISTS att_kiosks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT UNIQUE,
  setup_hash TEXT UNIQUE,
  setup_expires TEXT,
  sign_key TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  last_seen_at TEXT,
  alerted_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);
-- Studio sessions booked for several parts at once, with a camera operator.
ALTER TABLE recording_sessions ADD COLUMN IF NOT EXISTS operator_id TEXT;
ALTER TABLE recording_sessions ADD COLUMN IF NOT EXISTS batch_id TEXT;
CREATE INDEX IF NOT EXISTS idx_recording_sessions_start ON recording_sessions(scheduled_start);

-- Attendance rotas: shifts that change week by week.
ALTER TABLE att_shift_assign ADD COLUMN IF NOT EXISTS rota TEXT;
ALTER TABLE att_shift_assign ADD COLUMN IF NOT EXISTS rota_start TEXT;

-- Review notes pinned to a time in the master ("0:42: trim the silence"), per stage attempt.
CREATE TABLE IF NOT EXISTS item_review_notes (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  attempt_id TEXT,
  stage TEXT NOT NULL,
  at_sec INTEGER,
  note TEXT NOT NULL,
  author_id TEXT,
  created_at TEXT NOT NULL,
  resolved_by TEXT,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_review_notes_item ON item_review_notes(item_id, created_at);
CREATE TABLE IF NOT EXISTS att_badges (
  employee_id TEXT PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  pin_hash TEXT,
  badge TEXT UNIQUE,
  updated_at TEXT NOT NULL
);
`;

// Tables in dependency order; used to empty the workspace and to export or restore backups.
export const TABLES = [
  "settings",
  "users",
  "role_assignments",
  "access_scopes",
  "sessions",
  "user_capacity",
  "team_leads",
  "leave_entries",
  "curricula",
  "grades",
  "subjects",
  "grade_subjects",
  "units",
  "lessons",
  "items",
  "item_memberships",
  "stage_assignments",
  "item_collaborators",
  "stage_attempts",
  "stage_intervals",
  "work_sessions",
  "session_corrections",
  "assets",
  "checklist_results",
  "handoff_reviews",
  "blockers",
  "deadline_revisions",
  "publication_targets",
  "audit_events",
  "idempotency_keys",
  "comments",
  "comment_reactions",
  "manager_questions",
  "chat_groups",
  "chat_members",
  "chat_messages",
  "notifications",
  "saved_views",
  "recording_sessions",
  "jobs",
  "trash",
  "checklist_templates",
  "work_checklists",
  "handovers",
  "handover_items",
  "chat_reactions",
  "chat_poll_votes",
  "chat_files",
  "chat_blobs",
  "push_subscriptions",
  "email_senders",
  "email_templates",
  "email_log",
  "email_log_recipients",
  "department_positions",
  "dept_projects",
  "dept_milestones",
  "dept_tasks",
  "dept_task_comments",
  "dept_metrics",
  "dept_reports",
  "studio_resources",
  "studio_questions",
  "studio_exam_questions",
  "studio_cards",
  "calls",
  "call_signals",
  "dept_config",
  "dept_config_versions",
  "dept_dashboards",
  "departments",
  "dept_task_links",
  "dept_task_watchers",
  "dept_task_files",
  "dept_time_entries",
  "dept_sprints",
  "dept_capacity",
  "employees",
  "employee_private",
  "employee_documents",
  "equipment",
  "equipment_events",
  "leave_types",
  "leave_requests",
  "leave_adjustments",
  "job_openings",
  "applicants",
  "applicant_files",
  "interviews",
  "scorecards",
  "employee_checklists",
  "hr_goals",
  "review_cycles",
  "hr_reviews",
  "one_on_ones",
  "courses",
  "trainings",
  "hr_cases",
  "hr_case_notes",
  "integration_cache",
  "api_tokens",
  "blocked_devices",
  "profiles",
  "profile_files",
  "password_resets",
  "chat_receipts",
  "feedback",
  "reports",
  "fin_accounts",
  "fin_parties",
  "fin_ledger",
  "fin_transactions",
  "fin_bills",
  "fin_invoices",
  "fin_claims",
  "fin_purchases",
  "fin_budgets",
  "fin_pay_structures",
  "fin_payroll_runs",
  "fin_payslips",
  "fin_periods",
  "att_events",
  "att_marks",
  "att_shift_assign",
  "att_corrections",
  "att_kiosks",
  "att_badges",
  "item_review_notes",
] as const;
