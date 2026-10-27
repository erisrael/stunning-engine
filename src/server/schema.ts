// PostgreSQL schema, used unchanged by Supabase in production and PGlite locally.
// All instants are stored as ISO-8601 UTC strings. Boolean flags are integers (0 or 1).
// Statements are idempotent so the schema can be applied on every start.

export const SCHEMA_VERSION = 3;

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
] as const;
