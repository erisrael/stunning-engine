// PostgreSQL schema, used unchanged by Supabase in production and PGlite locally.
// All instants are stored as ISO-8601 UTC strings. Boolean flags are integers (0 or 1).
// Statements are idempotent so the schema can be applied on every start.

export const SCHEMA_VERSION = 68;

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
-- v52: a name a person corrected stays when something is imported again.
ALTER TABLE units ADD COLUMN IF NOT EXISTS title_locked INTEGER NOT NULL DEFAULT 0;

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
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS title_locked INTEGER NOT NULL DEFAULT 0;

-- v52: every rename, move and merge of the curriculum.
CREATE TABLE IF NOT EXISTS curriculum_changes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  before_value TEXT,
  after_value TEXT,
  actor_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_curriculum_changes ON curriculum_changes(created_at);

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
-- v52: a rejection waits for a cross-check (status 'rejected') before the work goes back; 'missing' is a confirmed one.
ALTER TABLE handover_items ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE handover_items ADD COLUMN IF NOT EXISTS check_status TEXT;
ALTER TABLE handover_items ADD COLUMN IF NOT EXISTS checked_by TEXT;
ALTER TABLE handover_items ADD COLUMN IF NOT EXISTS checked_at TEXT;
ALTER TABLE handover_items ADD COLUMN IF NOT EXISTS check_note TEXT;

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

ALTER TABLE equipment ADD COLUMN IF NOT EXISTS ownership TEXT NOT NULL DEFAULT 'company';
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS owner_name TEXT;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS repair_status TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS cost_estimate DOUBLE PRECISION DEFAULT 0;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS last_inspected_at TEXT;

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
-- v53: the evidence for sick leave (a document on the person's HR record), which HR checks before approving.
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS evidence_doc_id TEXT;

-- v53: people do not see balances; they ask HR (a question, or a correction of a leave or balance), and HR answers.
CREATE TABLE IF NOT EXISTS leave_queries (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  request_id TEXT,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  answer TEXT,
  answered_by TEXT,
  answered_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leave_queries ON leave_queries(status, created_at);

-- v53: someone who left the office while checked in (automatic check-out or break), one row per person.
CREATE TABLE IF NOT EXISTS att_geofence (
  employee_id TEXT PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  site_id TEXT,
  outside_since TEXT,
  outside_count INTEGER NOT NULL DEFAULT 0,
  warned_at TEXT,
  acted TEXT,
  acted_at TEXT,
  last_at TEXT,
  last_distance INTEGER
);

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
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gmail TEXT;

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
ALTER TABLE att_kiosks ADD COLUMN IF NOT EXISTS site TEXT NOT NULL DEFAULT 'Main Entrance';
ALTER TABLE att_kiosks ADD COLUMN IF NOT EXISTS setup_pin TEXT;
-- Studio sessions booked for several parts at once, with a camera operator.
ALTER TABLE recording_sessions ADD COLUMN IF NOT EXISTS operator_id TEXT;
ALTER TABLE recording_sessions ADD COLUMN IF NOT EXISTS batch_id TEXT;
CREATE INDEX IF NOT EXISTS idx_recording_sessions_start ON recording_sessions(scheduled_start);

-- Face check-in: sealed face codes per employee, with the consent recorded. Deliberately not in the backup
-- table list, so face data is never exported; it goes with the employee row (cascade).
CREATE TABLE IF NOT EXISTS att_faces (
  employee_id TEXT PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  data_enc TEXT NOT NULL,
  samples INTEGER NOT NULL,
  consent_at TEXT NOT NULL,
  consent_by TEXT,
  consent_version TEXT NOT NULL,
  consent_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- A person's own Google account (Meet links, YouTube uploads); the refresh token is sealed.
CREATE TABLE IF NOT EXISTS google_tokens (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email TEXT,
  scopes TEXT NOT NULL DEFAULT '',
  refresh_enc TEXT,
  access_token TEXT,
  expires_at TEXT,
  updated_at TEXT NOT NULL
);

-- Group calls in the app (up to four people, a direct mesh between browsers).
CREATE TABLE IF NOT EXISTS group_calls (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
  media TEXT NOT NULL DEFAULT 'audio',
  started_by TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_group_calls_group ON group_calls(group_id, status);
CREATE TABLE IF NOT EXISTS group_call_members (
  call_id TEXT NOT NULL REFERENCES group_calls(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  seen_at TEXT NOT NULL,
  left_at TEXT,
  PRIMARY KEY (call_id, user_id)
);
CREATE TABLE IF NOT EXISTS group_call_signals (
  seq BIGSERIAL PRIMARY KEY,
  call_id TEXT NOT NULL REFERENCES group_calls(id) ON DELETE CASCADE,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_group_call_signals ON group_call_signals(call_id, to_id, seq);

-- Email that goes out later: notification copies and scheduled messages.
CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  user_id TEXT,
  to_address TEXT,
  subject TEXT,
  text TEXT,
  html TEXT,
  payload TEXT,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  log_id TEXT,
  send_after TEXT NOT NULL,
  sent_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_outbox_due ON email_outbox(status, send_after);

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
-- v23: sign-in set by Admin (Phase 15): wrong attempts, two-step sign-in, other sign-in providers, invitations,
-- sign-up requests, password history and the sign-in log.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TEXT;
CREATE TABLE IF NOT EXISTS signin_locks (
  key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  lockouts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS signin_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  email TEXT,
  event TEXT NOT NULL,
  method TEXT,
  ip TEXT,
  device_id TEXT,
  user_agent TEXT,
  detail TEXT,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_signin_log_user ON signin_log(user_id, at);
CREATE INDEX IF NOT EXISTS idx_signin_log_at ON signin_log(at);
CREATE TABLE IF NOT EXISTS user_two_step (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  totp_enc TEXT,
  totp_pending_enc TEXT,
  totp_confirmed_at TEXT,
  last_step BIGINT NOT NULL DEFAULT 0,
  recovery TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS two_step_trust (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  until TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, device_id)
);
CREATE TABLE IF NOT EXISTS signin_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  method TEXT NOT NULL,
  totp_pending_enc TEXT,
  email_code_hash TEXT,
  email_sent_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
-- (v42) the passkey challenge of this sign-in.
ALTER TABLE signin_challenges ADD COLUMN IF NOT EXISTS passkey_challenge TEXT;
CREATE TABLE IF NOT EXISTS user_identities (
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  PRIMARY KEY (provider, subject)
);
CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities(user_id);
CREATE TABLE IF NOT EXISTS signup_invites (
  token_hash TEXT PRIMARY KEY,
  email TEXT,
  role TEXT NOT NULL,
  created_by TEXT,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  used_by TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS signup_requests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT,
  provider TEXT,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  decided_by TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS password_history (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_password_history ON password_history(user_id, created_at);
-- v24: running the system (Phase 15): scheduled job results, errors kept in the app, and backup runs.
-- Not part of backups (they describe this server, not the workspace).
CREATE TABLE IF NOT EXISTS job_runs (
  name TEXT PRIMARY KEY,
  last_at TEXT,
  last_ok_at TEXT,
  ok INTEGER NOT NULL DEFAULT 1,
  ms INTEGER NOT NULL DEFAULT 0,
  detail TEXT,
  error TEXT,
  runs INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS error_events (
  id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  stack TEXT,
  path TEXT,
  route TEXT,
  digest TEXT,
  user_id TEXT,
  count INTEGER NOT NULL DEFAULT 1,
  first_at TEXT NOT NULL,
  last_at TEXT NOT NULL,
  resolved_at TEXT,
  alerted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_error_events_last ON error_events(last_at);
CREATE TABLE IF NOT EXISTS backup_runs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  ok INTEGER NOT NULL DEFAULT 0,
  file TEXT,
  size BIGINT,
  rows BIGINT,
  targets TEXT NOT NULL DEFAULT '{}',
  detail TEXT,
  by_user TEXT
);
CREATE INDEX IF NOT EXISTS idx_backup_runs ON backup_runs(kind, started_at);
-- v25: attendance by printed QR and the office network (Phase 10b): breaks and lunch as check-in kinds, where and
-- how each check-in was made, flags for HR, people's phones, and refused attempts (to spot a changed address).
ALTER TABLE att_events ADD COLUMN IF NOT EXISTS site_id TEXT;
ALTER TABLE att_events ADD COLUMN IF NOT EXISTS ip TEXT;
ALTER TABLE att_events ADD COLUMN IF NOT EXISTS device_id TEXT;
ALTER TABLE att_events ADD COLUMN IF NOT EXISTS flag TEXT;
ALTER TABLE att_events ADD COLUMN IF NOT EXISTS flag_state TEXT;
ALTER TABLE att_events ADD COLUMN IF NOT EXISTS flag_by TEXT;
ALTER TABLE att_events ADD COLUMN IF NOT EXISTS flag_at TEXT;
CREATE INDEX IF NOT EXISTS idx_att_events_flag ON att_events(flag_state);
CREATE INDEX IF NOT EXISTS idx_att_events_device ON att_events(device_id, at);
CREATE TABLE IF NOT EXISTS att_devices (
  device_id TEXT NOT NULL,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  first_at TEXT NOT NULL,
  last_at TEXT NOT NULL,
  decided_by TEXT,
  PRIMARY KEY (device_id, employee_id)
);
CREATE TABLE IF NOT EXISTS att_refusals (
  id TEXT PRIMARY KEY,
  site_id TEXT,
  employee_id TEXT,
  ip TEXT,
  reason TEXT,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_att_refusals ON att_refusals(site_id, at);

-- v26: department flows (Phase 12). Where a task is inside its stage (to do, in progress, done not sent, with the
-- lead, ready to hand over, arriving), since when, the status it came from, and the lead's last return note.
-- Releases group finished Dev work, with release notes.
ALTER TABLE dept_tasks ADD COLUMN IF NOT EXISTS flow_state TEXT;
ALTER TABLE dept_tasks ADD COLUMN IF NOT EXISTS flow_since TEXT;
ALTER TABLE dept_tasks ADD COLUMN IF NOT EXISTS flow_from TEXT;
ALTER TABLE dept_tasks ADD COLUMN IF NOT EXISTS flow_note TEXT;
ALTER TABLE dept_tasks ADD COLUMN IF NOT EXISTS release_id TEXT;
CREATE INDEX IF NOT EXISTS idx_dept_tasks_flow ON dept_tasks(dept, status, flow_state);
CREATE TABLE IF NOT EXISTS dept_releases (
  id TEXT PRIMARY KEY,
  dept TEXT NOT NULL,
  name TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  task_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dept_releases ON dept_releases(dept, created_at);

-- Email verification (Admin, Sign-in): when the address was confirmed, whether this account must confirm it
-- (joined by invitation or sign-up), and the one-time links.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_required INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS email_verifications (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_verifications_user ON email_verifications(user_id);

-- Phase 12b: the Dev studio. Story points and when a task joined its sprint (scope added after the start); a
-- sprint's planned and finished amounts kept at its close; daily stand-up notes; the retrospective board; specs
-- and documents per project with versions, reviewers and links from requirements to tasks.
ALTER TABLE dept_tasks ADD COLUMN IF NOT EXISTS points DOUBLE PRECISION;
ALTER TABLE dept_tasks ADD COLUMN IF NOT EXISTS sprint_added_at TEXT;
ALTER TABLE dept_sprints ADD COLUMN IF NOT EXISTS planned_units DOUBLE PRECISION;
ALTER TABLE dept_sprints ADD COLUMN IF NOT EXISTS done_units DOUBLE PRECISION;
ALTER TABLE dept_sprints ADD COLUMN IF NOT EXISTS closed_at TEXT;
ALTER TABLE dept_sprints ADD COLUMN IF NOT EXISTS review_note TEXT;
ALTER TABLE dept_capacity ADD COLUMN IF NOT EXISTS points_per_sprint DOUBLE PRECISION;
CREATE TABLE IF NOT EXISTS dept_standups (
  id TEXT PRIMARY KEY,
  sprint_id TEXT NOT NULL REFERENCES dept_sprints(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  yesterday TEXT,
  today TEXT,
  blockers TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (sprint_id, user_id, day)
);
CREATE TABLE IF NOT EXISTS dept_retro (
  id TEXT PRIMARY KEY,
  sprint_id TEXT NOT NULL REFERENCES dept_sprints(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  author_id TEXT,
  task_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dept_retro ON dept_retro(sprint_id);
CREATE TABLE IF NOT EXISTS dept_docs (
  id TEXT PRIMARY KEY,
  dept TEXT NOT NULL,
  project_id TEXT REFERENCES dept_projects(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  version INTEGER NOT NULL DEFAULT 1,
  reviewers TEXT NOT NULL DEFAULT '[]',
  approvals TEXT NOT NULL DEFAULT '[]',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  approved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_dept_docs ON dept_docs(dept, project_id);
-- (v49) the folder a document is in (none: the library's top).
ALTER TABLE dept_docs ADD COLUMN IF NOT EXISTS folder_id TEXT;
CREATE TABLE IF NOT EXISTS dept_doc_versions (
  doc_id TEXT NOT NULL REFERENCES dept_docs(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  saved_by TEXT,
  saved_at TEXT NOT NULL,
  PRIMARY KEY (doc_id, version)
);
CREATE TABLE IF NOT EXISTS dept_doc_links (
  doc_id TEXT NOT NULL REFERENCES dept_docs(id) ON DELETE CASCADE,
  req TEXT NOT NULL,
  task_id TEXT NOT NULL REFERENCES dept_tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (doc_id, req, task_id)
);

-- Phase 13: the assistant's monitoring (flows started, finished, given up, and text that matched nothing).
CREATE TABLE IF NOT EXISTS assistant_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  role TEXT,
  flow TEXT,
  event TEXT NOT NULL,
  step INTEGER,
  text TEXT,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assistant_events ON assistant_events(at);

-- Phase 14: Mail. A sender address with its own sign-in can also be the person's inbox in the app (mailbox = 1);
-- managed = 'cpanel' when the app created or took over the mailbox through the cPanel API. mail_state keeps the
-- unread count and the last check for the sidebar, without connecting to the mail server on every page.
ALTER TABLE email_senders ADD COLUMN IF NOT EXISTS mailbox INTEGER NOT NULL DEFAULT 0;
ALTER TABLE email_senders ADD COLUMN IF NOT EXISTS managed TEXT;
-- (v44) a mailbox's signature, added to new messages and replies.
ALTER TABLE email_senders ADD COLUMN IF NOT EXISTS signature TEXT;
-- v28: deleted accounts with history are kept anonymised, marked here and left out of Admin, People.
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TEXT;

CREATE TABLE IF NOT EXISTS mail_state (
  sender_id TEXT PRIMARY KEY,
  unread INTEGER NOT NULL DEFAULT 0,
  last_uid INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT,
  error TEXT
);

-- v51: calls to the app's own APIs per day and route, and each deploy (a new build starting).
CREATE TABLE IF NOT EXISTS api_usage (
  day TEXT NOT NULL,
  route TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  total_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
  max_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
  PRIMARY KEY (day, route)
);
CREATE TABLE IF NOT EXISTS sys_deploys (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  build TEXT NOT NULL,
  commit_sha TEXT,
  message TEXT,
  host TEXT,
  node TEXT,
  started_at TEXT NOT NULL
);

-- v50: platforms connected by their API (SMS, email, payments, webhooks...), and every call made to them.
CREATE TABLE IF NOT EXISTS int_connectors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  capability TEXT NOT NULL,
  draft TEXT NOT NULL,
  operations TEXT NOT NULL DEFAULT '[]',
  secrets TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  is_default INTEGER NOT NULL DEFAULT 0,
  use_for_system INTEGER NOT NULL DEFAULT 0,
  last_test TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS int_calls (
  id TEXT PRIMARY KEY,
  connector_id TEXT REFERENCES int_connectors(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  ok INTEGER NOT NULL,
  status INTEGER NOT NULL DEFAULT 0,
  ms INTEGER NOT NULL DEFAULT 0,
  summary TEXT NOT NULL,
  error TEXT,
  test INTEGER NOT NULL DEFAULT 0,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_int_calls ON int_calls(at);

-- v49: the department document library: folders, files in them, and documents pinned by each person.
CREATE TABLE IF NOT EXISTS dept_folders (
  id TEXT PRIMARY KEY,
  dept TEXT NOT NULL,
  parent_id TEXT REFERENCES dept_folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dept_folders ON dept_folders(dept, parent_id);
CREATE TABLE IF NOT EXISTS dept_folder_files (
  id TEXT PRIMARY KEY,
  dept TEXT NOT NULL,
  folder_id TEXT REFERENCES dept_folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  data TEXT NOT NULL,
  uploaded_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dept_folder_files ON dept_folder_files(dept, folder_id);
CREATE TABLE IF NOT EXISTS dept_doc_pins (
  doc_id TEXT NOT NULL REFERENCES dept_docs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (doc_id, user_id)
);

-- v48: strategic planning, monitoring and evaluation: plans, the results chain (goal, outcomes, outputs,
-- activities), indicators with their reference sheet and targets, results per period, risks and evaluations.
CREATE TABLE IF NOT EXISTS sp_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  vision TEXT,
  mission TEXT,
  values_json TEXT NOT NULL DEFAULT '[]',
  pillars TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  rag_green INTEGER NOT NULL DEFAULT 90,
  rag_amber INTEGER NOT NULL DEFAULT 70,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sp_nodes (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES sp_plans(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES sp_nodes(id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  pillar TEXT,
  perspective TEXT,
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  assumptions TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  start_date TEXT,
  end_date TEXT,
  budget DOUBLE PRECISION,
  sort DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sp_nodes ON sp_nodes(plan_id, parent_id);
CREATE TABLE IF NOT EXISTS sp_indicators (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES sp_nodes(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  definition TEXT,
  unit TEXT NOT NULL DEFAULT 'number',
  direction TEXT NOT NULL DEFAULT 'up',
  baseline DOUBLE PRECISION,
  baseline_date TEXT,
  frequency TEXT NOT NULL DEFAULT 'quarterly',
  data_source TEXT,
  method TEXT,
  verification TEXT,
  responsible_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  formula TEXT,
  disaggregation TEXT,
  measure TEXT,
  kpi_key TEXT,
  targets TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sp_indicators ON sp_indicators(node_id);
CREATE TABLE IF NOT EXISTS sp_actuals (
  id TEXT PRIMARY KEY,
  indicator_id TEXT NOT NULL REFERENCES sp_indicators(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  note TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  entered_by TEXT,
  entered_at TEXT NOT NULL,
  verified_by TEXT,
  verified_at TEXT,
  UNIQUE (indicator_id, period)
);
CREATE TABLE IF NOT EXISTS sp_risks (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES sp_plans(id) ON DELETE CASCADE,
  node_id TEXT REFERENCES sp_nodes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Operational',
  likelihood INTEGER NOT NULL DEFAULT 1,
  impact INTEGER NOT NULL DEFAULT 1,
  mitigation TEXT,
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open',
  review_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sp_evaluations (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES sp_plans(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'annual',
  period TEXT,
  scores TEXT NOT NULL DEFAULT '{}',
  summary TEXT,
  findings TEXT,
  lessons TEXT,
  recommendations TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- v47: presentation templates made in the app or imported from PowerPoint, Google Slides, Keynote or Canva.
CREATE TABLE IF NOT EXISTS pres_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'custom',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- v46: the assistant's saved conversations (side panel history), what the agent did on its own, and every status
-- move of a department task (for the team analyzer: time in each status, cycle time, bottlenecks).
CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'ask',
  messages TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_conversations ON ai_conversations(user_id, updated_at);
CREATE TABLE IF NOT EXISTS ai_agent_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id TEXT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  result TEXT,
  ok INTEGER NOT NULL DEFAULT 1,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_agent_log ON ai_agent_log(user_id, at);
CREATE TABLE IF NOT EXISTS dept_task_moves (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES dept_tasks(id) ON DELETE CASCADE,
  dept TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  by_id TEXT,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dept_task_moves ON dept_task_moves(dept, at);
CREATE INDEX IF NOT EXISTS idx_dept_task_moves_task ON dept_task_moves(task_id, at);

-- v45: a phone as the remote of a presentation (next, previous), for a few hours.
CREATE TABLE IF NOT EXISTS pres_remotes (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  steps INTEGER NOT NULL DEFAULT 0,
  title TEXT,
  position TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- v44: mail written now and sent from the person's mailbox later.
CREATE TABLE IF NOT EXISTS mail_scheduled (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  recipients TEXT NOT NULL,
  payload TEXT NOT NULL,
  send_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',
  error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_mail_scheduled ON mail_scheduled(status, send_at);

-- v43: how long pages take to open, per section and day (Admin, Usage: slowest pages).
CREATE TABLE IF NOT EXISTS page_timings (
  day TEXT NOT NULL,
  section TEXT NOT NULL,
  samples INTEGER NOT NULL DEFAULT 0,
  total_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
  slow INTEGER NOT NULL DEFAULT 0,
  max_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
  PRIMARY KEY (day, section)
);

-- v42: passkeys (fingerprint, face or a security key, WebAuthn) as a second step at sign-in.
CREATE TABLE IF NOT EXISTS user_passkeys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT NOT NULL DEFAULT '[]',
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_user_passkeys ON user_passkeys(user_id);
CREATE TABLE IF NOT EXISTS passkey_registrations (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  challenge TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- v41: customer support: the knowledge base, and email and Telegram threads on tickets.
CREATE TABLE IF NOT EXISTS sup_articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT,
  keywords TEXT NOT NULL DEFAULT '',
  published INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  helpful INTEGER NOT NULL DEFAULT 0,
  not_helpful INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- v40: performance management (Phase 17): the KPI library, KRA templates per role and position, targets per
-- person, values (computed, typed or corrected), monthly periods and frozen scorecards; OKR cycles, objectives,
-- key results and check-ins.
CREATE TABLE IF NOT EXISTS perf_kpis (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT NOT NULL DEFAULT 'count',
  direction TEXT NOT NULL DEFAULT 'up',
  source TEXT NOT NULL DEFAULT 'measure',
  measure TEXT,
  scoring TEXT NOT NULL DEFAULT 'percent',
  bands TEXT NOT NULL DEFAULT '{}',
  min_sample INTEGER NOT NULL DEFAULT 0,
  quality INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
-- (v48) the KPI's reference sheet: Balanced Scorecard perspective, formula, data source, frequency, owner, rationale.
ALTER TABLE perf_kpis ADD COLUMN IF NOT EXISTS meta TEXT NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS perf_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  applies_to TEXT NOT NULL DEFAULT '[]',
  kras TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS perf_targets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kpi_key TEXT NOT NULL,
  period TEXT NOT NULL,
  target DOUBLE PRECISION NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'approved',
  set_by TEXT,
  decided_by TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, kpi_key, period)
);
CREATE TABLE IF NOT EXISTS perf_values (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  kpi_key TEXT NOT NULL,
  period TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  sample INTEGER,
  source TEXT NOT NULL DEFAULT 'manual',
  note TEXT,
  status TEXT NOT NULL DEFAULT 'approved',
  entered_by TEXT,
  decided_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_perf_values ON perf_values(subject, period);
CREATE TABLE IF NOT EXISTS perf_periods (
  period TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'open',
  closed_at TEXT,
  closed_by TEXT
);
CREATE TABLE IF NOT EXISTS perf_scorecards (
  subject TEXT NOT NULL,
  period TEXT NOT NULL,
  score DOUBLE PRECISION,
  rating TEXT,
  detail TEXT NOT NULL DEFAULT '{}',
  computed_at TEXT NOT NULL,
  frozen INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (subject, period)
);
CREATE TABLE IF NOT EXISTS okr_cycles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  max_objectives INTEGER NOT NULL DEFAULT 5,
  max_krs INTEGER NOT NULL DEFAULT 5,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS okr_objectives (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL REFERENCES okr_cycles(id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  scope TEXT,
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  parent_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'everyone',
  score DOUBLE PRECISION,
  reflection TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_okr_objectives ON okr_objectives(cycle_id);
CREATE TABLE IF NOT EXISTS okr_key_results (
  id TEXT PRIMARY KEY,
  objective_id TEXT NOT NULL REFERENCES okr_objectives(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'number',
  start_value DOUBLE PRECISION NOT NULL DEFAULT 0,
  target DOUBLE PRECISION NOT NULL DEFAULT 1,
  current DOUBLE PRECISION NOT NULL DEFAULT 0,
  unit TEXT,
  kpi_key TEXT,
  confidence TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS okr_checkins (
  id TEXT PRIMARY KEY,
  kr_id TEXT NOT NULL REFERENCES okr_key_results(id) ON DELETE CASCADE,
  value DOUBLE PRECISION NOT NULL,
  confidence TEXT NOT NULL,
  note TEXT,
  by_id TEXT,
  at TEXT NOT NULL
);
ALTER TABLE dept_tasks ADD COLUMN IF NOT EXISTS key_result_id TEXT;

-- v39: presentation studio: decks saved for a team, and read-only share links with a copy of the slides.
CREATE TABLE IF NOT EXISTS pres_decks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scope TEXT NOT NULL,
  slides TEXT NOT NULL DEFAULT '[]',
  minutes TEXT NOT NULL DEFAULT '{}',
  theme TEXT NOT NULL DEFAULT '{}',
  shared INTEGER NOT NULL DEFAULT 0,
  email_to TEXT NOT NULL DEFAULT '[]',
  email_day INTEGER,
  last_emailed_on TEXT,
  last_meeting_at TEXT,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pres_decks_scope ON pres_decks(scope);
-- (v47) slides written by hand in the deck (sections, bullets, quotes, pictures, columns, timelines).
ALTER TABLE pres_decks ADD COLUMN IF NOT EXISTS custom TEXT NOT NULL DEFAULT '[]';
CREATE TABLE IF NOT EXISTS pres_shares (
  token TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slides TEXT NOT NULL,
  theme TEXT NOT NULL DEFAULT '{}',
  expires_at TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);

-- v38: customer support: queues, tickets and messages, customers of connected apps (SDK), calls with recordings,
-- agent status and activity, saved replies.
CREATE TABLE IF NOT EXISTS sup_apps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  public_key TEXT NOT NULL UNIQUE,
  secret TEXT NOT NULL,
  origins TEXT NOT NULL DEFAULT '[]',
  queue_id TEXT,
  verify_identity INTEGER NOT NULL DEFAULT 0,
  greeting TEXT,
  color TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sup_queues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  keywords TEXT NOT NULL DEFAULT '[]',
  members TEXT NOT NULL DEFAULT '[]',
  strategy TEXT NOT NULL DEFAULT 'least_busy',
  sla_first_min INTEGER NOT NULL DEFAULT 60,
  sla_resolve_min INTEGER NOT NULL DEFAULT 1440,
  last_assigned TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sup_customers (
  id TEXT PRIMARY KEY,
  app_id TEXT,
  external_id TEXT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  meta TEXT NOT NULL DEFAULT '{}',
  verified INTEGER NOT NULL DEFAULT 0,
  token_hash TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sup_customers_ext ON sup_customers(app_id, external_id);
CREATE INDEX IF NOT EXISTS idx_sup_customers_token ON sup_customers(token_hash);
CREATE TABLE IF NOT EXISTS sup_tickets (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  queue_id TEXT,
  customer_id TEXT REFERENCES sup_customers(id) ON DELETE SET NULL,
  app_id TEXT,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  priority TEXT NOT NULL DEFAULT 'normal',
  channel TEXT NOT NULL DEFAULT 'widget',
  assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  assigned_at TEXT,
  first_response_at TEXT,
  solved_at TEXT,
  sla_first_due TEXT,
  sla_resolve_due TEXT,
  breached INTEGER NOT NULL DEFAULT 0,
  rating INTEGER,
  rating_comment TEXT,
  last_customer_at TEXT,
  last_agent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sup_tickets_status ON sup_tickets(status, queue_id);
CREATE INDEX IF NOT EXISTS idx_sup_tickets_assignee ON sup_tickets(assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_sup_tickets_customer ON sup_tickets(customer_id);
CREATE TABLE IF NOT EXISTS sup_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES sup_tickets(id) ON DELETE CASCADE,
  author_kind TEXT NOT NULL,
  author_id TEXT,
  body TEXT NOT NULL,
  internal INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sup_messages_ticket ON sup_messages(ticket_id, created_at);
-- (v41) the email a message came in as or went out as, to thread replies.
ALTER TABLE sup_messages ADD COLUMN IF NOT EXISTS email_id TEXT;
CREATE INDEX IF NOT EXISTS idx_sup_messages_email ON sup_messages(email_id);
CREATE TABLE IF NOT EXISTS sup_calls (
  id TEXT PRIMARY KEY,
  ticket_id TEXT REFERENCES sup_tickets(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES sup_customers(id) ON DELETE SET NULL,
  agent_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  direction TEXT NOT NULL DEFAULT 'inbound',
  kind TEXT NOT NULL DEFAULT 'web',
  status TEXT NOT NULL DEFAULT 'ringing',
  offer TEXT,
  answer TEXT,
  customer_ice TEXT NOT NULL DEFAULT '[]',
  agent_ice TEXT NOT NULL DEFAULT '[]',
  consent INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  answered_at TEXT,
  ended_at TEXT,
  duration_s INTEGER,
  recording_id TEXT,
  recording_storage TEXT,
  recording_mime TEXT,
  recording_size INTEGER,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_sup_calls_status ON sup_calls(status, started_at);
CREATE TABLE IF NOT EXISTS sup_agents (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'offline',
  max_open INTEGER NOT NULL DEFAULT 10,
  skills TEXT NOT NULL DEFAULT '[]',
  status_since TEXT NOT NULL,
  last_seen_at TEXT
);
CREATE TABLE IF NOT EXISTS sup_activity (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  ticket_id TEXT,
  kind TEXT NOT NULL,
  detail TEXT,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sup_activity_user ON sup_activity(user_id, at);
CREATE INDEX IF NOT EXISTS idx_sup_activity_ticket ON sup_activity(ticket_id, at);
-- Recordings kept in the database when there is no file storage (Supabase keeps them in its bucket).
CREATE TABLE IF NOT EXISTS sup_blobs (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sup_canned (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL
);

-- v37: recognition: monthly scores, badges and titles, and kudos between colleagues.
CREATE TABLE IF NOT EXISTS recog_scores (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  score DOUBLE PRECISION NOT NULL,
  parts TEXT NOT NULL DEFAULT '{}',
  rank INTEGER,
  computed_at TEXT NOT NULL,
  PRIMARY KEY (user_id, period)
);
CREATE TABLE IF NOT EXISTS recog_awards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge TEXT NOT NULL,
  title TEXT NOT NULL,
  period TEXT NOT NULL,
  reason TEXT,
  auto INTEGER NOT NULL DEFAULT 1,
  awarded_by TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, badge, period)
);
CREATE INDEX IF NOT EXISTS idx_recog_awards_user ON recog_awards(user_id, created_at);
CREATE TABLE IF NOT EXISTS recog_kudos (
  id TEXT PRIMARY KEY,
  from_user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recog_kudos_to ON recog_kudos(to_user, created_at);

-- v36: project templates per department, and saved baselines of task dates (Phases 12b.2 and 12b.4).
CREATE TABLE IF NOT EXISTS dept_project_templates (
  id TEXT PRIMARY KEY,
  dept TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS dept_task_baselines (
  task_id TEXT PRIMARY KEY REFERENCES dept_tasks(id) ON DELETE CASCADE,
  dept TEXT NOT NULL,
  start_date TEXT,
  due_date TEXT,
  saved_at TEXT NOT NULL,
  saved_by TEXT
);

-- v35: development tools (Phase 12b.5): GitLab merge requests by task code, deployments per environment, release
-- versions, incidents, test cases and runs.
ALTER TABLE dept_releases ADD COLUMN IF NOT EXISTS version TEXT;
CREATE TABLE IF NOT EXISTS dev_merge_requests (
  dept TEXT NOT NULL,
  repo TEXT NOT NULL,
  number INTEGER NOT NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  branch TEXT NOT NULL,
  state TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (dept, repo, number, code)
);
CREATE TABLE IF NOT EXISTS dev_deployments (
  id TEXT PRIMARY KEY,
  dept TEXT NOT NULL,
  environment TEXT NOT NULL,
  version TEXT,
  release_id TEXT,
  status TEXT NOT NULL,
  commit_sha TEXT,
  url TEXT,
  source TEXT,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS dev_deployments_dept ON dev_deployments (dept, at);
CREATE TABLE IF NOT EXISTS dev_incidents (
  id TEXT PRIMARY KEY,
  dept TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  resolved_at TEXT,
  source TEXT,
  external_id TEXT,
  url TEXT,
  bug_task_id TEXT,
  postmortem_doc_id TEXT,
  timeline TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS dev_test_cases (
  id TEXT PRIMARY KEY,
  dept TEXT NOT NULL,
  title TEXT NOT NULL,
  steps TEXT NOT NULL DEFAULT '',
  expected TEXT NOT NULL DEFAULT '',
  requirement TEXT,
  doc_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS dev_test_runs (
  id TEXT PRIMARY KEY,
  dept TEXT NOT NULL,
  case_id TEXT NOT NULL REFERENCES dev_test_cases(id) ON DELETE CASCADE,
  release_id TEXT,
  result TEXT NOT NULL,
  note TEXT,
  bug_task_id TEXT,
  by_user TEXT,
  at TEXT NOT NULL
);

-- v34: the weekly file link check (Phase 16.2): the last result per file.
CREATE TABLE IF NOT EXISTS link_checks (
  asset_id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  status INTEGER NOT NULL,
  ok INTEGER NOT NULL,
  checked_at TEXT NOT NULL
);

-- v33: presenters (Phase 16.1): teachers and guests on camera, their signed releases, and monthly fee statements.
CREATE TABLE IF NOT EXISTS presenters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'teacher',
  phone TEXT,
  email TEXT,
  subjects TEXT,
  aliases TEXT NOT NULL DEFAULT '[]',
  rate_kind TEXT,
  rate DOUBLE PRECISION,
  department TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
ALTER TABLE presenters ADD COLUMN IF NOT EXISTS department TEXT;
CREATE TABLE IF NOT EXISTS presenter_releases (
  id TEXT PRIMARY KEY,
  presenter_id TEXT NOT NULL REFERENCES presenters(id) ON DELETE CASCADE,
  signed_on TEXT NOT NULL,
  expires_on TEXT,
  scope TEXT,
  file_name TEXT,
  file_mime TEXT,
  file_data TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS presenter_statements (
  presenter_id TEXT NOT NULL REFERENCES presenters(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL,
  sent_by TEXT,
  sent_at TEXT,
  bill_id TEXT,
  PRIMARY KEY (presenter_id, month)
);

-- v32: data protection (Phase 16.5): who accepted which version of the privacy notice, and who opened whose HR or
-- salary record.
CREATE TABLE IF NOT EXISTS privacy_acceptances (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  accepted_at TEXT NOT NULL,
  PRIMARY KEY (user_id, version)
);
CREATE TABLE IF NOT EXISTS record_access_log (
  id TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  what TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS record_access_emp ON record_access_log (employee_id, at);

-- v31: announcements and policies (with "I have read this"), and page visits per day for Admin's usage view.
CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'news',
  audience TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT
);
CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TEXT,
  acked_at TEXT,
  PRIMARY KEY (announcement_id, user_id)
);
CREATE TABLE IF NOT EXISTS page_visits (
  day TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  section TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, user_id, section)
);

-- v30: routines (recorded ways of doing something in the app) and their runs, with approval (Phase 13d).
CREATE TABLE IF NOT EXISTS assistant_routines (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  steps TEXT NOT NULL,
  shared TEXT NOT NULL DEFAULT 'none',
  uses INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- v52: runs made from a file's rows belong to one batch.
CREATE TABLE IF NOT EXISTS assistant_runs (
  id TEXT PRIMARY KEY,
  batch_id TEXT,
  routine_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  run_values TEXT,
  approver_ids TEXT,
  requested_at TEXT NOT NULL,
  decided_by TEXT,
  decided_at TEXT,
  note TEXT,
  started_at TEXT,
  finished_at TEXT,
  error TEXT
);
ALTER TABLE assistant_runs ADD COLUMN IF NOT EXISTS batch_id TEXT;
CREATE INDEX IF NOT EXISTS assistant_runs_user ON assistant_runs (user_id, requested_at);

-- v29: banners at the top of each section's main page (Admin, Branding), a picture (base64) or a colour.
CREATE TABLE IF NOT EXISTS brand_banners (
  key TEXT PRIMARY KEY,
  title TEXT,
  text TEXT,
  color TEXT,
  mime TEXT,
  data TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

-- v30: Legacy Noor Ethiopia CMS scraped data & multi-business Chapa accounts
-- Extend the existing HR asset register, preserving issued assets and their history.
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES users(id);
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS assigned_to TEXT REFERENCES users(id);
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity >= 0);
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS reorder_level INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS purchase_cost DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS repair_cost DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS repairs INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS maintenance_due TEXT;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS warranty_until TEXT;
ALTER TABLE equipment_events ADD COLUMN IF NOT EXISTS quantity_delta INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipment_events ADD COLUMN IF NOT EXISTS cost DOUBLE PRECISION NOT NULL DEFAULT 0;
UPDATE equipment SET department = 'general' WHERE department IS NULL;
UPDATE equipment SET assigned_to = employees.user_id FROM employees WHERE equipment.holder_id = employees.id AND equipment.assigned_to IS NULL;
ALTER TABLE dev_test_cases ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE dev_test_cases ADD COLUMN IF NOT EXISTS review_note TEXT;
ALTER TABLE dev_test_cases ADD COLUMN IF NOT EXISTS reviewed_by TEXT REFERENCES users(id);
CREATE TABLE IF NOT EXISTS dev_release_proposals (
 id TEXT PRIMARY KEY, dept TEXT NOT NULL, name TEXT NOT NULL, notes TEXT NOT NULL, task_ids TEXT NOT NULL,
 author_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL DEFAULT 'submitted',
 review_note TEXT, reviewed_by TEXT REFERENCES users(id), release_id TEXT REFERENCES dept_releases(id), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS resource_comments (
 id TEXT PRIMARY KEY, purchase_id TEXT NOT NULL REFERENCES fin_purchases(id), author_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dev_collaboration (
  id TEXT PRIMARY KEY,
  dept TEXT NOT NULL,
  kind TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id),
  project_id TEXT REFERENCES dept_projects(id) ON DELETE SET NULL,
  body_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dev_collab_scope ON dev_collaboration(dept, kind, project_id);

CREATE TABLE IF NOT EXISTS cms_tasks (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  options_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  progress TEXT NOT NULL DEFAULT 'Waiting to start',
  result_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cms_tasks_actor ON cms_tasks(actor_id, status);

CREATE TABLE IF NOT EXISTS legacy_cms_records (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  external_id TEXT,
  title TEXT,
  data_json TEXT NOT NULL,
  synced_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_legacy_cms_cat ON legacy_cms_records(category);
CREATE INDEX IF NOT EXISTS idx_legacy_cms_ext ON legacy_cms_records(external_id);

-- Update 1.0 Phase 2: Noor rows fetched by date, one row per table, closed day and filter set.
CREATE TABLE IF NOT EXISTS cms_range_cache (
  category TEXT NOT NULL,
  day TEXT NOT NULL,
  filter_key TEXT NOT NULL,
  headers_json TEXT NOT NULL,
  rows_json TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  method TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (category, day, filter_key)
);

-- Finance verification of Noor invoices, kept here and never written into the mirrored record.
CREATE TABLE IF NOT EXISTS cms_invoice_reviews (
  invoice_id TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'unverified',
  reason TEXT,
  note TEXT,
  student TEXT,
  contact_name TEXT,
  phone TEXT,
  grade TEXT,
  plan TEXT,
  amount REAL,
  method TEXT,
  invoice_date TEXT,
  invoice_json TEXT,
  assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  ticket_id TEXT,
  outcome TEXT,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cms_invoice_reviews_state ON cms_invoice_reviews(state, updated_at);
CREATE TABLE IF NOT EXISTS cms_invoice_review_log (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  reason TEXT,
  note TEXT,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cms_invoice_review_log ON cms_invoice_review_log(invoice_id, at);
CREATE INDEX IF NOT EXISTS idx_cms_invoice_review_actor ON cms_invoice_review_log(actor_id, at);
-- Each scheduled CMS report run keeps its rows so the emailed links open the same report.
CREATE TABLE IF NOT EXISTS cms_report_runs (
  id TEXT PRIMARY KEY,
  schedule_id TEXT,
  name TEXT NOT NULL,
  spec_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cms_report_runs ON cms_report_runs(schedule_id, created_at);
-- One row per Addis day: the day's Noor figures (invoices, revenue, new students and parents, subscriptions,
-- feedback), made every night and kept, for the trend dashboard.
CREATE TABLE IF NOT EXISTS cms_daily_metrics (
  day TEXT PRIMARY KEY,
  metrics_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS legacy_cms_snapshots (
  id TEXT PRIMARY KEY,
  version_name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  record_count INTEGER NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_legacy_cms_snap_cat ON legacy_cms_snapshots(category);

CREATE TABLE IF NOT EXISTS chapa_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  secret_key_enc TEXT NOT NULL,
  public_key TEXT,
  webhook_secret_enc TEXT,
  currency TEXT NOT NULL DEFAULT 'ETB',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- Update 1.0 Phase 3: each Chapa account is a business with its own mode, sync and health.
ALTER TABLE chapa_accounts ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'live';
ALTER TABLE chapa_accounts ADD COLUMN IF NOT EXISTS currencies TEXT NOT NULL DEFAULT '["ETB"]';
ALTER TABLE chapa_accounts ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE chapa_accounts ADD COLUMN IF NOT EXISTS sync_minutes INTEGER NOT NULL DEFAULT 15;
ALTER TABLE chapa_accounts ADD COLUMN IF NOT EXISTS health TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE chapa_accounts ADD COLUMN IF NOT EXISTS last_sync_at TEXT;
ALTER TABLE chapa_accounts ADD COLUMN IF NOT EXISTS last_sync_rows INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chapa_accounts ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE chapa_accounts ADD COLUMN IF NOT EXISTS backfilled_at TEXT;
ALTER TABLE chapa_accounts ADD COLUMN IF NOT EXISTS probe_json TEXT;
ALTER TABLE chapa_accounts ADD COLUMN IF NOT EXISTS webhook_at TEXT;

-- Every Chapa transaction we have seen, one row per business and tx_ref, with its status history.
CREATE TABLE IF NOT EXISTS chapa_transactions (
  account_id TEXT NOT NULL REFERENCES chapa_accounts(id) ON DELETE CASCADE,
  tx_ref TEXT NOT NULL,
  ref_id TEXT,
  amount REAL NOT NULL DEFAULT 0,
  charge REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'ETB',
  method TEXT,
  type TEXT,
  status TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  verified_at TEXT,
  status_history TEXT NOT NULL DEFAULT '[]',
  raw_json TEXT,
  followup_ticket_id TEXT,
  followup_at TEXT,
  PRIMARY KEY (account_id, tx_ref)
);
CREATE INDEX IF NOT EXISTS idx_chapa_tx_time ON chapa_transactions(account_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chapa_tx_status ON chapa_transactions(status, created_at);
CREATE INDEX IF NOT EXISTS idx_chapa_tx_phone ON chapa_transactions(phone);
-- Money moved from Myseed: withdrawals, refunds and swaps, each with maker, checker and Chapa's answer.
CREATE TABLE IF NOT EXISTS chapa_operations (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES chapa_accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_approval',
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ETB',
  reference TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  reason TEXT,
  requested_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  result_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chapa_ops ON chapa_operations(account_id, kind, created_at);
CREATE TABLE IF NOT EXISTS chapa_beneficiaries (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES chapa_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  bank_code TEXT NOT NULL,
  bank_name TEXT,
  account_number TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

-- Tickets that come from a payment: where from (chapa, cms_invoice), which record, and its category.
ALTER TABLE sup_tickets ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE sup_tickets ADD COLUMN IF NOT EXISTS source_ref TEXT;
ALTER TABLE sup_tickets ADD COLUMN IF NOT EXISTS category TEXT;
CREATE INDEX IF NOT EXISTS idx_sup_tickets_source ON sup_tickets(source, source_ref);

-- v31: Multi-AI Model API keys & providers
CREATE TABLE IF NOT EXISTS ai_models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  api_key_enc TEXT,
  custom_base_url TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_models_provider ON ai_models(provider);

-- v60: a video entry in the Legacy catalog carries its own title, presenter, studio, recording date, draft or submitted
-- state and supporting files; parts keep their kind (standard or review); feedback can carry screenshots and documents.
ALTER TABLE assets ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS presenter TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS studio TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS studio_reason TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS recorded_on TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS entry_status TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS no_resources INTEGER;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS part_kind TEXT;
CREATE TABLE IF NOT EXISTS asset_files (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_asset_files ON asset_files(asset_id);
CREATE TABLE IF NOT EXISTS feedback_files (
  id TEXT PRIMARY KEY,
  feedback_id TEXT NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_files ON feedback_files(feedback_id);

-- v61: customer help, one menu everywhere: the categories (English and Amharic), routing rules to queues, and files
-- customers send (Telegram photos and documents) kept on the ticket.
CREATE TABLE IF NOT EXISTS sup_categories (
  key TEXT PRIMARY KEY,
  label_en TEXT NOT NULL,
  label_am TEXT NOT NULL,
  hint_en TEXT,
  hint_am TEXT,
  icon TEXT,
  kb_category TEXT,
  queue_id TEXT,
  self_help INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sup_routes (
  id TEXT PRIMARY KEY,
  category TEXT,
  keywords TEXT NOT NULL DEFAULT '[]',
  channel TEXT NOT NULL DEFAULT 'any',
  queue_id TEXT NOT NULL,
  priority TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sup_files (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES sup_tickets(id) ON DELETE CASCADE,
  message_id TEXT,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sup_files ON sup_files(ticket_id);
CREATE INDEX IF NOT EXISTS idx_sup_tickets_category ON sup_tickets(category, created_at);

-- v63: the configuration hub. Every outgoing call and incoming webhook goes into int_calls with its source
-- (chapa, telegram, sms, email, ai, noor, connector), direction and, for AI, tokens and cost. SMS messages are kept
-- with their delivery status; connectors have an order for fallback; alerts when failures pass Admin's threshold;
-- email bounces; and each kiosk has its own capture modes and a test capture.
ALTER TABLE int_calls ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE int_calls ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'out';
ALTER TABLE int_calls ADD COLUMN IF NOT EXISTS ref TEXT;
ALTER TABLE int_calls ADD COLUMN IF NOT EXISTS tokens_in INTEGER;
ALTER TABLE int_calls ADD COLUMN IF NOT EXISTS tokens_out INTEGER;
ALTER TABLE int_calls ADD COLUMN IF NOT EXISTS cost REAL;
CREATE INDEX IF NOT EXISTS idx_int_calls_source ON int_calls(source, at);
ALTER TABLE int_connectors ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 100;
CREATE TABLE IF NOT EXISTS int_alerts (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  calls INTEGER NOT NULL,
  failures INTEGER NOT NULL,
  window_min INTEGER NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_int_alerts ON int_alerts(at);
CREATE TABLE IF NOT EXISTS sms_messages (
  id TEXT PRIMARY KEY,
  connector_id TEXT,
  provider_id TEXT,
  to_phone TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'alerts',
  sender TEXT,
  preview TEXT,
  length INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  delivered_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sms_messages ON sms_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_sms_provider ON sms_messages(provider_id);
CREATE TABLE IF NOT EXISTS email_bounces (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'hard',
  reason TEXT,
  message_id TEXT,
  provider TEXT,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_bounces ON email_bounces(address, at);
ALTER TABLE att_kiosks ADD COLUMN IF NOT EXISTS modes TEXT;
ALTER TABLE att_kiosks ADD COLUMN IF NOT EXISTS test_until TEXT;
ALTER TABLE att_kiosks ADD COLUMN IF NOT EXISTS test_result TEXT;

-- v62: My work take rules (requests a lead approves) and import undo. Each import row runs in a transaction that sets
-- myseed.job_id; a row trigger on every table then keeps what the row was before and after, so an approved undo
-- can put back exactly what that import changed and skip rows people edited since.
CREATE TABLE IF NOT EXISTS take_requests (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  decided_by TEXT,
  decided_at TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_take_requests ON take_requests(stage, status, created_at);
CREATE TABLE IF NOT EXISTS job_changes (
  id BIGSERIAL PRIMARY KEY,
  job_id TEXT NOT NULL,
  tbl TEXT NOT NULL,
  op TEXT NOT NULL,
  before_row TEXT,
  after_row TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_job_changes ON job_changes(job_id, id);
CREATE TABLE IF NOT EXISTS job_undo_requests (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  decided_by TEXT,
  decided_at TEXT,
  result TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_job_undo ON job_undo_requests(job_id, status);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS undone_at TEXT;
CREATE OR REPLACE FUNCTION myseed_capture_change() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  INSERT INTO job_changes (job_id, tbl, op, before_row, after_row, created_at)
  VALUES (
    current_setting('myseed.job_id', true),
    TG_TABLE_NAME,
    TG_OP,
    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD)::text END,
    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW)::text END,
    to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  RETURN NULL;
END
$fn$;
DO $do$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema() AND c.relkind = 'r'
      AND c.relname NOT IN ('job_changes', 'jobs', 'job_undo_requests', 'audit_events', 'notifications', 'settings', 'idempotency_keys', 'email_log', 'email_log_recipients', 'push_subscriptions')
      AND NOT EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = c.oid AND g.tgname = 'myseed_capture')
  LOOP
    BEGIN
      EXECUTE format('CREATE TRIGGER myseed_capture AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW WHEN (COALESCE(current_setting(''myseed.job_id'', true), '''') <> '''') EXECUTE FUNCTION myseed_capture_change()', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END
$do$;
-- v64: connected systems (Update 1.1). Each support app is a connected system with its own Telegram bot (sealed token,
-- webhook secret), channel switches (web chat, Telegram, calls, SMS), a signed outgoing webhook for ticket events and
-- a description. The single bot in settings stays the default one.
ALTER TABLE sup_apps ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE sup_apps ADD COLUMN IF NOT EXISTS channels TEXT;
ALTER TABLE sup_apps ADD COLUMN IF NOT EXISTS tg_token TEXT;
ALTER TABLE sup_apps ADD COLUMN IF NOT EXISTS tg_secret TEXT;
ALTER TABLE sup_apps ADD COLUMN IF NOT EXISTS tg_bot TEXT;
ALTER TABLE sup_apps ADD COLUMN IF NOT EXISTS webhook_url TEXT;
ALTER TABLE sup_apps ADD COLUMN IF NOT EXISTS webhook_secret TEXT;
ALTER TABLE sup_apps ADD COLUMN IF NOT EXISTS webhook_events TEXT;
ALTER TABLE sup_apps ADD COLUMN IF NOT EXISTS webhook_last TEXT;
CREATE INDEX IF NOT EXISTS idx_sup_apps_tg ON sup_apps(tg_secret);

-- v65: live chat (Update 1.1): typing and read times on both sides, and how a conversation ended.
ALTER TABLE sup_tickets ADD COLUMN IF NOT EXISTS customer_typing_at TEXT;
ALTER TABLE sup_tickets ADD COLUMN IF NOT EXISTS agent_typing_at TEXT;
ALTER TABLE sup_tickets ADD COLUMN IF NOT EXISTS agent_typing_name TEXT;
ALTER TABLE sup_tickets ADD COLUMN IF NOT EXISTS customer_read_at TEXT;
ALTER TABLE sup_tickets ADD COLUMN IF NOT EXISTS agent_read_at TEXT;
ALTER TABLE sup_tickets ADD COLUMN IF NOT EXISTS closed_at TEXT;
ALTER TABLE sup_tickets ADD COLUMN IF NOT EXISTS close_reason TEXT;

-- v66: the Telegram bot manager (Update 1.1): per bot (bot = 'default' or a connected system's id) a content library
-- (files kept here, or links such as YouTube) sent now or on a schedule, forms and surveys answered in the chat,
-- and the feedback inbox (new, reviewed, escalated to a ticket).
ALTER TABLE sup_apps ADD COLUMN IF NOT EXISTS tg_origin TEXT;
CREATE TABLE IF NOT EXISTS sup_bot_content (
  id TEXT PRIMARY KEY,
  bot TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  caption TEXT,
  url TEXT,
  file_name TEXT,
  mime TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  data TEXT,
  pub TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  sends INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sup_bot_content ON sup_bot_content(bot, created_at);
CREATE TABLE IF NOT EXISTS sup_bot_pushes (
  id TEXT PRIMARY KEY,
  bot TEXT NOT NULL,
  content_id TEXT,
  form_id TEXT,
  message TEXT,
  send_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  sent INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  origin TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sup_bot_pushes ON sup_bot_pushes(status, send_at);
CREATE TABLE IF NOT EXISTS sup_bot_forms (
  id TEXT PRIMARY KEY,
  bot TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'survey',
  title TEXT NOT NULL,
  intro TEXT,
  questions TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sup_bot_responses (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES sup_bot_forms(id) ON DELETE CASCADE,
  customer_id TEXT,
  answers TEXT NOT NULL DEFAULT '[]',
  step INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sup_bot_responses ON sup_bot_responses(form_id, done);
CREATE TABLE IF NOT EXISTS sup_bot_feedback (
  id TEXT PRIMARY KEY,
  bot TEXT NOT NULL,
  customer_id TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  ticket_id TEXT,
  reviewed_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sup_bot_feedback ON sup_bot_feedback(bot, status, created_at);

-- v67: the call center (Update 1.1): hold with its time, transfers (the new call points at the one it came from),
-- conference legs (a staff member joined through the agent's browser), how far a ringing call has widened (its own
-- agent, the queue, the overflow queue), phone calls with the number dialled, call-back requests, and each
-- system's call engine (calls in the browser, or a phone number).
ALTER TABLE sup_calls ADD COLUMN IF NOT EXISTS on_hold INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sup_calls ADD COLUMN IF NOT EXISTS hold_since TEXT;
ALTER TABLE sup_calls ADD COLUMN IF NOT EXISTS hold_s INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sup_calls ADD COLUMN IF NOT EXISTS transfer_to TEXT;
ALTER TABLE sup_calls ADD COLUMN IF NOT EXISTS transfer_from TEXT;
ALTER TABLE sup_calls ADD COLUMN IF NOT EXISTS parent_id TEXT;
ALTER TABLE sup_calls ADD COLUMN IF NOT EXISTS host_id TEXT;
ALTER TABLE sup_calls ADD COLUMN IF NOT EXISTS ring_stage INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sup_calls ADD COLUMN IF NOT EXISTS ring_queue TEXT;
ALTER TABLE sup_calls ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE sup_calls ADD COLUMN IF NOT EXISTS app_id TEXT;
CREATE INDEX IF NOT EXISTS idx_sup_calls_customer ON sup_calls(customer_id, started_at);
CREATE INDEX IF NOT EXISTS idx_sup_calls_agent ON sup_calls(agent_id, started_at);
ALTER TABLE sup_apps ADD COLUMN IF NOT EXISTS call_engine TEXT NOT NULL DEFAULT 'browser';
ALTER TABLE sup_apps ADD COLUMN IF NOT EXISTS call_phone TEXT;

-- v68: knowledge base guides (Update 1.1): an article is a plain answer or a how-to guide with ordered steps, each
-- with text and an optional YouTube video (checked, with its title kept); an article can have one video too.
ALTER TABLE sup_articles ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'article';
ALTER TABLE sup_articles ADD COLUMN IF NOT EXISTS steps TEXT NOT NULL DEFAULT '[]';
ALTER TABLE sup_articles ADD COLUMN IF NOT EXISTS video TEXT;
ALTER TABLE sup_articles ADD COLUMN IF NOT EXISTS intro TEXT;
CREATE INDEX IF NOT EXISTS idx_sup_articles_cat ON sup_articles(category, published);

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
  "dept_releases",
  "email_verifications",
  "dept_standups",
  "dept_retro",
  "dept_docs",
  "dept_doc_versions",
  "dept_doc_links",
  "assistant_events",
  "brand_banners",
  "assistant_routines",
  "assistant_runs",
  "curriculum_changes",
  "leave_queries",
  "att_geofence",
  "announcements",
  "announcement_reads",
  "page_visits",
  "privacy_acceptances",
  "record_access_log",
  "presenters",
  "presenter_releases",
  "presenter_statements",
  "link_checks",
  "perf_kpis",
  "perf_templates",
  "perf_targets",
  "perf_values",
  "perf_periods",
  "perf_scorecards",
  "okr_cycles",
  "okr_objectives",
  "okr_key_results",
  "okr_checkins",
  "user_passkeys",
  "page_timings",
  "mail_scheduled",
  "ai_conversations",
  "pres_templates",
  "sp_plans",
  "sp_nodes",
  "sp_indicators",
  "sp_actuals",
  "sp_risks",
  "sp_evaluations",
  "dept_folders",
  "dept_folder_files",
  "dept_doc_pins",
  "int_connectors",
  "ai_agent_log",
  "dept_task_moves",
  "pres_decks",
  "pres_shares",
  "sup_apps",
  "sup_queues",
  "sup_customers",
  "sup_tickets",
  "sup_messages",
  "sup_calls",
  "sup_agents",
  "sup_activity",
  "sup_canned",
  "sup_articles",
  "sup_blobs",
  "recog_scores",
  "recog_awards",
  "recog_kudos",
  "dev_merge_requests",
  "dev_deployments",
  "dev_incidents",
  "dev_test_cases",
  "dev_test_runs",
  "dept_project_templates",
  "dept_task_baselines",
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
  "email_outbox",
  "group_calls",
  "group_call_members",
  "group_call_signals",
  "google_tokens",
  "user_two_step",
  "user_identities",
  "signup_invites",
  "signup_requests",
  "password_history",
  "signin_log",
  "att_devices",
  "resource_comments",
  "dev_release_proposals",
  "dev_collaboration",
  "cms_tasks",
  "legacy_cms_records",
  "cms_range_cache",
  "cms_invoice_reviews",
  "cms_invoice_review_log",
  "cms_report_runs",
  "cms_daily_metrics",
  "legacy_cms_snapshots",
  "chapa_accounts",
  "chapa_transactions",
  "chapa_operations",
  "chapa_beneficiaries",
  "ai_models",
  "asset_files",
  "feedback_files",
  "sup_categories",
  "sup_routes",
  "sup_files",
  "take_requests",
  "job_undo_requests",
  "sup_bot_content",
  "sup_bot_pushes",
  "sup_bot_forms",
  "sup_bot_responses",
  "sup_bot_feedback",
] as const;
