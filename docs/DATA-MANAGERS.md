# Department Data Managers

Open **Data Manager** from a department's navigation:

- Dev, Marketing and custom work departments: `/dev/data`, `/marketing/data`, `/d/<key>/data`.
- Studio: `/studio/data` — notes, exams, flash cards and questions.
- HR: `/hr/data` — employee records and equipment.
- Finance: `/finance/data` — accounts, vendors/customers, transactions, bills, invoices and yearly budgets.

Table and Sheet show the same records. Search filters the loaded records; click column headings to sort. The Columns menu hides or restores columns. Right-click rows for actions or headings for sorting, copying and hiding. Check rows for bulk actions. Specialized departments support up to 100 records per bulk request, reporting each failure separately and keeping failed records selected.

Sheet cells save on Enter or blur. Editing always goes through the department's existing server validation. Fields not displayed in the table are preserved. Read-only records can be opened in their source workspace.

Studio content retains its review and publishing rules. New questions in Data Manager use short-answer format; the question-bank editor supports other formats and answer options. Exams and flash-card content can be completed in the source workspace.

HR employee deletion keeps the linked application account. Equipment retirement requires equipment to have been returned first. Finance deactivates accounts and parties instead of deleting accounting history. Only manual/transfer transactions can be voided here, and locked periods still block changes. Bills, invoices and budgets open their existing workspaces for preparation, approval and posting.

## Permissions

Work departments use **Configure → Rights**, with checkbox permissions for Data Manager access, creation, updating, deletion and bulk actions, alongside ownership and assignment rights.

Studio, HR and Finance use **Data Manager → Configure permissions**. Studio rules apply to department membership (head, lead, member or observer). HR and Finance rules apply to application roles. The checkboxes restrict existing permissions; they do not grant additional HR, finance, approval or record ownership rights. For people with multiple roles, any checked role enables the action, subject to native permission checks. Admin retains access. Configuration changes are audited and checked for concurrent updates.

## Dev import templates

Download templates beside task CSV import, the Sheet **Paste rows** dialog, Jira/Asana/Trello import, document import and configuration import. Task CSV includes active custom fields. Sheet TSV preserves the current column order, including ignored columns. Replace example content before importing. Configuration templates start from the saved department configuration and must be reviewed before saving.
