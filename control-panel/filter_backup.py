"""Filter backup JSON to selectively sync accounts and configurations without workspace config.

Used by the control panel for selective database sync between Supabase and Hostinger VPS.
"""

from __future__ import annotations

import gzip
import json
import os
import sys
from pathlib import Path

# People, HR, auth, finance, attendance, departments, and communication records
ACCOUNT_TABLES = {
    "users",
    "role_assignments",
    "access_scopes",
    "sessions",
    "user_capacity",
    "team_leads",
    "leave_entries",
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
    "api_tokens",
    "blocked_devices",
    "profiles",
    "profile_files",
    "password_resets",
    "password_history",
    "signin_log",
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
    "att_devices",
    "att_geofence",
    "google_tokens",
    "user_two_step",
    "user_identities",
    "signup_invites",
    "signup_requests",
}

# System and administrative configuration
CONFIG_TABLES = {
    "settings",
    "email_senders",
    "email_templates",
    "departments",
    "department_positions",
    "dept_config",
    "dept_config_versions",
    "checklist_templates",
}

ALLOWED_TABLES = ACCOUNT_TABLES | CONFIG_TABLES


def read_backup(src_path: str | Path) -> dict:
    p = Path(src_path)
    if not p.is_file():
        raise FileNotFoundError(f"Backup file not found: {p}")
    if p.name.endswith(".gz"):
        with gzip.open(p, "rt", encoding="utf-8") as f:
            return json.load(f)
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)


def write_backup(dst_path: str | Path, data: dict) -> None:
    p = Path(dst_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    if str(dst_path).endswith(".gz"):
        with gzip.open(p, "wt", encoding="utf-8") as f:
            json.dump(data, f)
    else:
        with open(p, "w", encoding="utf-8") as f:
            json.dump(data, f)


def filter_backup(src: str | Path, dst: str | Path, mode: str = "accounts_and_config") -> dict:
    raw = read_backup(src)
    tables = raw.get("tables", {})
    filtered_tables: dict[str, list] = {}

    if mode == "accounts_and_config":
        for t, rows in tables.items():
            if t in ALLOWED_TABLES:
                if t == "settings":
                    # Exclude cfg.workspace (which contains workspace name, code prefix, timezone, etc.)
                    filtered_tables[t] = [r for r in rows if isinstance(r, dict) and r.get("key") != "cfg.workspace"]
                else:
                    filtered_tables[t] = rows
            else:
                filtered_tables[t] = []
    else:
        filtered_tables = tables

    out_data = {
        "format": raw.get("format", "myseed-backup"),
        "version": raw.get("version", 1),
        "createdAt": raw.get("createdAt"),
        "tables": filtered_tables,
    }

    write_backup(dst, out_data)
    total_rows = sum(len(r) for r in filtered_tables.values())
    active_tables = sum(1 for r in filtered_tables.values() if len(r) > 0)
    print(f"Filtered backup saved: {dst} ({total_rows} rows across {active_tables} tables, mode: {mode})")
    return out_data


def main():
    if len(sys.argv) < 3:
        print("Usage: python filter_backup.py <input.json[.gz]> <output.json[.gz]> [mode]")
        sys.exit(1)
    src = sys.argv[1]
    dst = sys.argv[2]
    mode = sys.argv[3] if len(sys.argv) > 3 else "accounts_and_config"
    filter_backup(src, dst, mode)


if __name__ == "__main__":
    main()

