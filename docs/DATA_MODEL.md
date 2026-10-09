# Data model

Written 2026-10-08 by `scripts/migrate/data-model.mjs` from the Neon **dev** branch. Structure and row counts only.

## How to read it

- Every table made by the migration has the same bookkeeping columns: `legacy_key` (unique; how a row is found again when the import re-runs), `source_sheet` + `source_row` (where it came from; empty on rows created in Postgres), `imported_at`, `created_at`, `updated_at`. They are left out of the column lists below.
- A column ending in `_raw` holds the text exactly as the sheet showed it. A typed column next to it (a date, a number) is filled only when the text really is one. The app reads the text, so the screens show what they showed before.
- `sheet_row` is the row number the app uses to find a row when it saves. Imported rows keep their sheet row; new rows get the next number.
- A link (`account_ref`, `subcontractor_id` …) is set only on an exact match. The name the sheet had stays in the row either way. Deleting an account or a sub un-links its rows; it never deletes them.
- **Switch** is the `DATA_SOURCE_<AREA>` setting that makes the app use the table. None is on in production.

## Tables from Google Sheets

| Table | Switch | From | Rows |
|---|---|---|---|
| `changelog_entries` | CATALOGS | PORTAL / ChangeLog | 3 |
| `geocode_cache` | CATALOGS | MAIN / GeocodeCache | 0 |
| `extra_services` | CATALOGS | PORTAL / ExtraServices | 4 |
| `documents` | CATALOGS | MAIN / Documents | 5 |
| `document_sends` | CATALOGS | MAIN / DocumentSends | 7 |
| `staff` | PEOPLE | MAIN / Staff | 15 |
| `managers` | PEOPLE | MAIN / Managers | 6 |
| `subcontractors` | SUBS | MAIN / Subcontractors | 39 |
| `sub_name_aliases` | SUBS | (worked out at import) | 71 |
| `sub_activity_log` | SUBS / SUB_PORTAL | MAIN / Subcontractor Activity Log | 385 |
| `accounts` | ACCOUNTS | MAIN / Accounts | 399 |
| `onboarding_checklists` | ACCOUNTS | MAIN / OnboardingChecklist | 3 |
| `account_updates` | (Apps Script) | MAIN / Account Updates | 193 |
| `sub_transfer_proposals` | (Apps Script) | MAIN / Sub Transfer Proposals | 72 |
| `equipment_categories` | EQUIPMENT | MAIN / EquipmentCategories | 2 |
| `equipment` | EQUIPMENT | MAIN / Equipment | 1 |
| `equipment_checkouts` | EQUIPMENT | MAIN / EquipmentCheckouts | 1 |
| `equipment_parts` | EQUIPMENT | MAIN / EquipmentParts | 0 |
| `equipment_repairs` | EQUIPMENT | MAIN / EquipmentRepairs | 0 |
| `sub_schedules` | SCHEDULING | MAIN / SubSchedules | 298 |
| `schedule_exceptions` | SCHEDULING | MAIN / ScheduleExceptions | 0 |
| `subcontractor_visits` | SCHEDULING | PORTAL / subcontractor-visits | 1 |
| `visits` | VISITS | MAIN / Visits | 611 |
| `visit_edit_log` | VISITS | MAIN / VisitEditLog | 6 |
| `complaints` | COMPLAINTS | MAIN / Complaints | 22 |
| `todos` | TODOS | MAIN / To Do | 127 |
| `todo_sms_log` | TODOS | MAIN / SmsLog | 44 |
| `sales` | SALES | MAIN / Sales & Commissions | 2 |
| `portal_access` | CUSTOMER_PORTAL | PORTAL / customer-portal | 393 |
| `portal_requests` | CUSTOMER_PORTAL | PORTAL / portal-complaints, portal-service-requests, portal-date-changes (+ billing) | 0 |
| `sub_supplies` | SUPPLIES | MAIN / Supplies | 51 |
| `sub_supply_orders` | SUPPLIES | MAIN / Supply Orders | 13 |
| `sub_portal_issues` | SUB_PORTAL | MAIN / Sub Portal Issues | 1 |
| `photos` | (Apps Script) | MAIN / Photos | 3 |

34 tables, 2778 rows.

### changelog_entries

The "What's new" entries shown in the app.

Switch: CATALOGS. From: PORTAL / ChangeLog. Rows: 3.

Columns: `id` bigint, `entry_date` date, `entry_date_raw` text, `version` text, `description` text.

### geocode_cache

Addresses already turned into map coordinates.

Switch: CATALOGS. From: MAIN / GeocodeCache. Rows: 0.

Columns: `address` text, `latitude` float, `longitude` float, `geocoded_at` timestamptz, `geocoded_at_raw` text.

### extra_services

Specialty services customers can ask for.

Switch: CATALOGS. From: PORTAL / ExtraServices. Rows: 4.

Columns: `id` text, `name` text, `description` text, `image_url` text, `active` bool, `sort_order` int.

### documents

Documents staff can send to subcontractors.

Switch: CATALOGS. From: MAIN / Documents. Rows: 5.

Columns: `id` text, `name` text, `category` text, `file_name` text, `file_url` text, `file_size` bigint, `uploaded_at` timestamptz, `uploaded_at_raw` text, `uploaded_by` text.

### document_sends

Which document was sent to which subcontractor, and when.

Switch: CATALOGS. From: MAIN / DocumentSends. Rows: 7.

Columns: `id` text, `document_id` text, `document_name` text, `subcontractor_id` text, `subcontractor_id_raw` text, `subcontractor_name` text, `sent_by` text, `sent_at` timestamptz, `sent_at_raw` text, `note` text.

Links: `subcontractor_id` → `subcontractors.id`.

### staff

People who sign equipment in and out and log in.

Switch: PEOPLE. From: MAIN / Staff. Rows: 15.

Columns: `id` text, `name` text, `role` text, `role_raw` text, `active` bool.

### managers

Account managers (name, phone, calendar color).

Switch: PEOPLE. From: MAIN / Managers. Rows: 6.

Columns: `id` bigint, `manager_id` text, `name` text, `email` text, `phone` text, `status` text, `notes` text, `calendar_color_id` text, `staff_id` text, `row_no` int.

Links: `staff_id` → `staff.id`.

### subcontractors

Subcontractors. `id` is permanent (SUB-001 …); `legacy_row_id` is what the app still uses.

Switch: SUBS. From: MAIN / Subcontractors. Rows: 39.

Columns: `id` text, `legacy_row_id` text, `display_id_raw` text, `fingerprint` text, `contact_name` text, `company_name` text, `address` text, `phone` text, `email` text, `areas_serviced` text, `services_provided` text, `employee_capacity` text, `insurance_document_name` text, `insurance_expiration` date, `insurance_expiration_raw` text, `status` text, `notes` text, `created_at_raw` text, `updated_at_raw` text, `extra_id_raw` text, `extra_phone_raw` text, `extra_insurance_raw` text.

### sub_name_aliases

Names that mean one subcontractor without doubt.

Switch: SUBS. From: (worked out at import). Rows: 71.

Columns: `alias` text, `subcontractor_id` text, `source` text.

Links: `subcontractor_id` → `subcontractors.id`.

### sub_activity_log

What subs did in their portal (Login, Viewed Schedule …). Never mixed with the staff activity log.

Switch: SUBS / SUB_PORTAL. From: MAIN / Subcontractor Activity Log. Rows: 385.

Columns: `id` bigint, `logged_at` timestamp, `logged_at_raw` text, `subcontractor_id` text, `subcontractor_email` text, `subcontractor_name` text, `action_type` text, `details` text.

Links: `subcontractor_id` → `subcontractors.id`.

### accounts

Customer accounts. `id` is the app's account id; `pk` is the row's own key.

Switch: ACCOUNTS. From: MAIN / Accounts. Rows: 399.

Columns: `pk` bigint, `id` text, `account_name` text, `start_date` date, `start_date_raw` text, `service_type` text, `frequency` text, `cleaning_days` text, `key_alarm_access_info` text, `monthly_revenue` numeric, `monthly_revenue_raw` text, `subcontractor_id` text, `subcontractor_raw` text, `manager_id` bigint, `manager_raw` text, `monthly_sub_pay` numeric, `monthly_sub_pay_raw` text, `address` text, `contact_name` text, `phone` text, `scope_of_work` text, `notes` text, `status` text, `status_key` text, `cancelled_date` date, `cancelled_date_raw` text, `last_updated_raw` text, `account_health` text, `email` text, `gross_margin` numeric, `gross_margin_raw` text, `gross_margin_pct_raw` text, `last_visit_date_raw` text, `last_complaint_date_raw` text, `last_follow_up_date_raw` text, `open_complaints_raw` text, `open_inactive_notes` text, `latitude` float, `latitude_raw` text, `longitude` float, `longitude_raw` text, `has_key` text, `alarm_code` text, `city` text, `zip` text, `checklist_needed` text, `unformatted` jsonb.

Links: `subcontractor_id` → `subcontractors.id`, `manager_id` → `managers.id`.

### onboarding_checklists

New-account checklist progress.

Switch: ACCOUNTS. From: MAIN / OnboardingChecklist. Rows: 3.

Columns: `account_id` text, `account_name` text, `items` jsonb, `items_raw` text, `started_at` timestamptz, `started_at_raw` text, `last_updated_at` timestamptz, `last_updated_at_raw` text, `completed_at` timestamptz, `completed_at_raw` text, `auto_stable_applied_at` timestamptz, `auto_stable_applied_at_raw` text.

### account_updates

Account history notes. Copied; the app still reads and saves them through Apps Script.

Switch: (Apps Script). From: MAIN / Account Updates. Rows: 193.

Columns: `id` bigint, `update_id_raw` text, `account_id_raw` text, `account_pk` bigint, `account_name` text, `update_date` date, `update_date_raw` text, `update_type` text, `notes` text, `created_by` text, `notify_email` text, `created_at_raw` text, `updated_at_raw` text, `update_title` text, `details` text, `entered_by` text, `notify_office` text, `notify_subcontractor` text, `follow_up_needed` text, `follow_up_date_raw` text.

Links: `account_pk` → `accounts.pk`.

### sub_transfer_proposals

Proposals to move accounts to another sub. Copied; still on Apps Script.

Switch: (Apps Script). From: MAIN / Sub Transfer Proposals. Rows: 72.

Columns: `id` bigint, `proposal_id` text, `created_at_raw` text, `status` text, `new_subcontractor` text, `new_subcontractor_email` text, `new_subcontractor_id` text, `account_name` text, `account_pk` bigint, `address` text, `cleaning_days` text, `scope` text, `keys_alarm` text, `proposed_monthly_pay` numeric, `proposed_monthly_pay_raw` text, `accepted_at_raw` text, `declined_at_raw` text, `notes` text, `sent_at_raw` text.

Links: `new_subcontractor_id` → `subcontractors.id`, `account_pk` → `accounts.pk`.

### equipment_categories

Kinds of equipment.

Switch: EQUIPMENT. From: MAIN / EquipmentCategories. Rows: 2.

Columns: `id` text, `name` text, `active_raw` text, `active` bool, `sheet_row` int.

### equipment

Machines and tools.

Switch: EQUIPMENT. From: MAIN / Equipment. Rows: 1.

Columns: `id` text, `name` text, `category_id` text, `serial_number` text, `purchase_date_raw` text, `purchase_date` date, `purchase_cost_raw` text, `purchase_cost` numeric, `status_raw` text, `current_holder_type` text, `current_holder_id` text, `current_holder_name` text, `condition_notes` text, `photo_url` text, `item_created_at_raw` text, `item_created_at` timestamptz, `checked_out_at_raw` text, `checked_out_at` timestamptz, `expected_return_at_raw` text, `expected_return_at` timestamptz, `needs_maintenance_review_raw` text, `sheet_row` int.

### equipment_checkouts

Who took which item, when it came back.

Switch: EQUIPMENT. From: MAIN / EquipmentCheckouts. Rows: 1.

Columns: `id` text, `equipment_id` text, `holder_type` text, `holder_id` text, `holder_name` text, `account_id` text, `checked_out_at_raw` text, `checked_out_at` timestamptz, `expected_return_at_raw` text, `expected_return_at` timestamptz, `returned_at_raw` text, `returned_at` timestamptz, `condition_at_checkout` text, `condition_at_return` text, `signed_out_by_staff_id` text, `signed_out_by_staff_name` text, `signed_in_by_staff_id` text, `signed_in_by_staff_name` text, `notes` text, `work_order_number` text, `sheet_row` int.

### equipment_parts

Spare parts.

Switch: EQUIPMENT. From: MAIN / EquipmentParts. Rows: 0.

Columns: `id` text, `part_name` text, `compatible_equipment_id` text, `supplier` text, `unit_cost_raw` text, `unit_cost` numeric, `stock_qty_raw` text, `stock_qty` numeric, `low_stock_threshold_raw` text, `low_stock_threshold` numeric, `sheet_row` int.

### equipment_repairs

Repairs.

Switch: EQUIPMENT. From: MAIN / EquipmentRepairs. Rows: 0.

Columns: `id` text, `equipment_id` text, `started_at_raw` text, `started_at` timestamptz, `completed_at_raw` text, `completed_at` timestamptz, `description` text, `cost_raw` text, `cost` numeric, `performed_by` text, `parts_used` text, `status_raw` text, `sheet_row` int.

### sub_schedules

The weekly cleaning pattern of an account (day, time window, sub).

Switch: SCHEDULING. From: MAIN / SubSchedules. Rows: 298.

Columns: `id` bigint, `schedule_id` text, `account_id` text, `account_ref` text, `sub_id_raw` text, `subcontractor_id` text, `day_of_week` text, `time_window` text, `recurring` text, `effective_start_raw` text, `effective_start` date, `effective_end_raw` text, `effective_end` date, `status` text, `submitted_by` text, `submitted_date_raw` text, `submitted_date` date, `last_edited_by` text, `last_edited_date_raw` text, `last_edited_at` timestamptz, `frequency` text, `monthly_occurrence` text, `submitted_via` text, `sheet_row` int.

Links: `account_ref` → `accounts.id`, `subcontractor_id` → `subcontractors.id`.

### schedule_exceptions

A skipped or moved cleaning day.

Switch: SCHEDULING. From: MAIN / ScheduleExceptions. Rows: 0.

Columns: `id` bigint, `exception_id` text, `account_id` text, `account_ref` text, `original_date_raw` text, `original_date` date, `type` text, `new_date_raw` text, `new_date` date, `new_time_window` text, `reason` text, `created_by` text, `created_date_raw` text, `created_date` date, `sheet_row` int.

Links: `account_ref` → `accounts.id`.

### subcontractor_visits

Visits a sub logged.

Switch: SCHEDULING. From: PORTAL / subcontractor-visits. Rows: 1.

Columns: `id` bigint, `visit_id` text, `account_name` text, `account_ref` text, `sub_email` text, `subcontractor_id` text, `sub_name` text, `visit_date_raw` text, `visit_date` date, `arrival_time` text, `notes` text, `sheet_row` int.

Links: `account_ref` → `accounts.id`, `subcontractor_id` → `subcontractors.id`.

### visits

Site visits by staff, with the condition score.

Switch: VISITS. From: MAIN / Visits. Rows: 611.

Columns: `id` bigint, `visit_id` text, `account_id_raw` text, `account_name` text, `account_ref` text, `visit_date_raw` text, `visit_date` date, `visit_type` text, `completed_by` text, `condition_raw` text, `condition_score` numeric, `follow_up_needed` text, `follow_up_date_old_raw` text, `notes` text, `created_at_raw` text, `visit_created_at` timestamptz, `updated_at_raw` text, `visit_updated_at` timestamptz, `follow_up_date_raw` text, `follow_up_date` date, `sheet_row` int.

Links: `account_ref` → `accounts.id`.

### visit_edit_log

Who changed a visit and what.

Switch: VISITS. From: MAIN / VisitEditLog. Rows: 6.

Columns: `id` text, `visit_id` text, `edited_by` text, `edited_at_raw` text, `edited_at` timestamptz, `change_summary` text, `sheet_row` int.

### complaints

Customer complaints. `resolution_note` exists only here (the sheet has no column for it).

Switch: COMPLAINTS. From: MAIN / Complaints. Rows: 22.

Columns: `id` bigint, `complaint_id` text, `account_id_raw` text, `account_name` text, `account_ref` text, `complaint_date_raw` text, `complaint_date` date, `issue` text, `priority` text, `complaint_validity` text, `status` text, `reported_by` text, `assigned_to` text, `last_follow_up_date_raw` text, `last_follow_up_date` date, `resolution_date_raw` text, `notes` text, `created_at_raw` text, `updated_at_raw` text, `complaint_updated_at` timestamptz, `last_follow_up_raw` text, `resolution_note` text, `sheet_row` int.

Links: `account_ref` → `accounts.id`.

### todos

To-do items for managers.

Switch: TODOS. From: MAIN / To Do. Rows: 127.

Columns: `id` bigint, `todo_id` text, `created_date_raw` text, `created_date` date, `due_date_raw` text, `due_date` date, `assigned_to` text, `account_name` text, `account_ref` text, `task_type` text, `why` text, `status` text, `notes` text, `group_id` text, `outcome` text, `calendar_event_id` text, `calendar_sync_failed_raw` text, `sync_to_calendar_raw` text, `priority_raw` text, `account_id_raw` text, `sheet_row` int.

Links: `account_ref` → `accounts.id`.

### todo_sms_log

Text messages sent for to-dos.

Switch: TODOS. From: MAIN / SmsLog. Rows: 44.

Columns: `id` bigint, `todo_id` text, `text_id` text, `manager_phone` text, `status` text, `sent_at_raw` text, `sent_at` timestamptz, `last_checked_at_raw` text, `last_checked_at` timestamptz, `quota_remaining_raw` text, `sheet_row` int.

### sales

Sales and their commission.

Switch: SALES. From: MAIN / Sales & Commissions. Rows: 2.

Columns: `id` bigint, `sale_id` text, `account_id_raw` text, `account_name` text, `account_ref` text, `sale_date_raw` text, `sale_date` date, `service_sold` text, `work_order_estimate_number` text, `sold_by` text, `amount_sold_raw` text, `amount_sold` numeric, `commission_percent_raw` text, `commission_percent` numeric, `commission_amount_raw` text, `commission_amount` numeric, `status` text, `notes` text, `created_at_raw` text, `sale_created_at` timestamptz, `updated_at_raw` text, `sale_updated_at` timestamptz, `service_type` text, `manager` text, `amount_raw` text, `commission_amount_old_raw` text, `recurring_start_date_raw` text, `recurring_start_date` date, `recurring_end_date_raw` text, `recurring_end_date` date, `sheet_row` int.

Links: `account_ref` → `accounts.id`.

### portal_access

Which customers can log in to the portal, with phone and code.

Switch: CUSTOMER_PORTAL. From: PORTAL / customer-portal. Rows: 393.

Columns: `id` bigint, `account_id_raw` text, `account_name` text, `account_ref` text, `service_date_raw` text, `service_type` text, `frequency` text, `cleaning_days` text, `address` text, `contact_name` text, `phone` text, `email` text, `scope_of_work` text, `status` text, `last_visit_date_raw` text, `next_scheduled_service` text, `last_invoice_date_raw` text, `monthly_revenue_raw` text, `estimated_monthly_total_raw` text, `portal_code` text, `portal_access` text, `sheet_row` int.

Links: `account_ref` → `accounts.id`.

### portal_requests

What customers send from /portal. `tab` says which kind.

Switch: CUSTOMER_PORTAL. From: PORTAL / portal-complaints, portal-service-requests, portal-date-changes (+ billing). Rows: 0.

Columns: `id` bigint, `tab` text, `account_id_raw` text, `account_name` text, `account_ref` text, `submitted_date_raw` text, `submitted_date` date, `field_1` text, `field_2` text, `field_3` text, `status` text, `staff_notes` text, `photos` text, `sheet_row` int.

Links: `account_ref` → `accounts.id`.

### sub_supplies

The supply list subs order from. Not Team Hub's supply_items.

Switch: SUPPLIES. From: MAIN / Supplies. Rows: 51.

Columns: `id` bigint, `supply_item` text, `category` text, `description` text, `unit` text, `status` text, `notes` text, `active_raw` text, `current_stock_raw` text, `minimum_stock_raw` text, `last_updated_raw` text, `updated_by` text, `low_stock_email_to` text, `low_stock_email_status` text, `sheet_row` int.

### sub_supply_orders

One row per ordered item.

Switch: SUPPLIES. From: MAIN / Supply Orders. Rows: 13.

Columns: `id` bigint, `timestamp_raw` text, `ordered_on` date, `order_id` text, `order_group_id` text, `subcontractor` text, `subcontractor_email` text, `subcontractor_id` text, `account_name` text, `account_id_raw` text, `account_ref` text, `supply_item` text, `category` text, `description` text, `quantity_raw` text, `unit` text, `delivery_mode` text, `notes` text, `status` text, `email_sent_to` text, `email_status` text, `sheet_row` int.

Links: `account_ref` → `accounts.id`, `subcontractor_id` → `subcontractors.id`.

### sub_portal_issues

Issues subs report; staff see them under Notifications.

Switch: SUB_PORTAL. From: MAIN / Sub Portal Issues. Rows: 1.

Columns: `id` bigint, `timestamp_raw` text, `reported_on` date, `issue_id` text, `subcontractor_email` text, `subcontractor_name` text, `subcontractor_id` text, `account_id_raw` text, `account_name` text, `account_ref` text, `issue_type` text, `urgency` text, `description` text, `photo_count_raw` text, `status` text, `notes` text, `sheet_row` int.

Links: `account_ref` → `accounts.id`, `subcontractor_id` → `subcontractors.id`.

### photos

Photo records. Copied; uploading and listing still go through Apps Script.

Switch: (Apps Script). From: MAIN / Photos. Rows: 3.

Columns: `id` bigint, `timestamp_raw` text, `taken_on` date, `photo_id` text, `account_id_raw` text, `account_name` text, `account_ref` text, `source_type` text, `source_id` text, `uploaded_by` text, `user_role` text, `file_name` text, `drive_file_id` text, `drive_url` text, `folder_url` text, `notes` text, `status` text, `sheet_row` int.

Links: `account_ref` → `accounts.id`.

## Migration bookkeeping

- `schema_migrations` (16 rows): Which `db/migrations/*.sql` files were applied.
- `migration_runs` (32 rows): One row per import run.
- `migration_issues` (143 rows): Open questions the imports found (a name that matches nothing, a repeated id …).
- `migration_overrides` (6 rows): Andres' answers to those questions; the import obeys them.

Open questions right now: 137.

## Tables that were already in Postgres (not changed by the migration)

Team Hub, Crew Link checklists, vehicles, the staff activity log and logins. The migration reads some of them and changes none.

`activity_log`, `checklist_submissions`, `checklist_tabs`, `checklist_templates`, `content_translations`, `equipment_check_link`, `equipment_reports`, `equipment_staff_pins`, `hub_checklist_alerts_sent`, `hub_checklist_library`, `hub_checklist_run_items`, `hub_checklist_runs`, `hub_crew_items`, `hub_crew_modules`, `hub_crews`, `hub_handoffs`, `hub_issues`, `hub_photos`, `hub_requests`, `hub_round_checks`, `hub_round_library`, `hub_sites`, `hub_workers`, `manager_accounts`, `supply_items`, `supply_order_lines`, `supply_orders`, `vehicle_digest_sent`, `vehicle_mileage_readings`, `vehicle_service_items`, `vehicle_service_logs`, `vehicles`.
