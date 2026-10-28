# Requirements workbook coverage

This review uses the public workbook export for Main Functions and its available tabs. The workbook contains Main Functions, Annex 1–11, Annex 16, Annex 16A, and Annex 17. Main Functions references Annex 12–15 tax-report layouts, but there are no Annex 12, 13, 14, or 15 tabs in the supplied workbook; those requirements cannot be inferred safely.

## Module coverage matrix

| Workbook area | Existing application coverage | Status against workbook |
| --- | --- | --- |
| Main Functions / Annex 1–2: registration, email, enterprise and user profiles | Login, registration approval, OTP password recovery, user management, settings | **Partial.** Registration and company profile fields do not fully cover representative/tax-agent details, enterprise TIN, director, accountant, activities, and the separate office/warehouse addresses. |
| Annex 2, 17: sub-users, roles and permissions | Admin/user roles, account approval, branch access | **Gap.** No configurable Manager/Accountant/Staff roles or permission matrix per report, journal, invoice, deletion, inventory, tax rate, depreciation rate, and export action. |
| Annex 3–4: customers and vendors | Customer/vendor CRUD, tax IDs and contact fields | **Partial.** Current records/forms do not fully model the annex contact person, two phone numbers, email, address, and related profile fields. |
| Annex 4A.1–4A.2: employee profiles and salary | Salary-tax records/calculations in tax-period workflows | **Gap.** No employee master for identity, household, nationality, hire date, and salary history linked to payroll. Workbook tax brackets must be verified against current law before being treated as authoritative. |
| Annex 5: item and merchandise master | Item catalog, barcode, inventory, units and stock | **Partial.** Item type (inventory/service/fixed asset), linked income/expense accounts, complete supplier/cost fields, and inactive/catalog semantics are not fully aligned. |
| Annex 6: chart of accounts and financial-statement mapping | Chart-of-accounts CRUD and account hierarchy | **Partial.** Account taxonomy, report mapping, normal-balance metadata, and tax-report associations from the annex are not fully represented or preloaded. |
| Annex 6A.1: general journal | Draft/post lifecycle, balanced lines, trial balance; posted entries are immutable | **Partial.** Related customer/vendor, bill/class/tax association, attachments, record navigation, and audit-preserving reversal are not implemented. Deleting posted transactions without an audit footprint is intentionally disallowed. |
| Annex 6A.2: cash/bank statements | Cash register and payment records | **Gap.** No general-ledger cash/bank statement and reconciliation workflow. |
| Annex 7: PO, receipt note and AP payment | Purchase orders, goods receipt, stock, AP summary/payment | **Partial.** Existing operational records are not automatically posted to the general ledger; the annex PO-versus-receipt accounting boundary is not integrated into the journal. |
| Annex 8: invoice and collections | POS/invoicing, returns, AR and collections, monthly sales tax data | **Partial.** Sales and receipt events do not automatically create ledger journals; invoice/report forms do not cover every annex field/layout. |
| Annex 8A: fixed-asset register, depreciation, disposal | Added in this change: class/rate configuration, register, monthly depreciation and disposal journals, depreciation history | **Implemented for core lifecycle.** Rates are configurable starting values and require accounting/tax review. The first full depreciation month is the deployment month; partial-month conventions are not specified in the workbook. |
| Annex 9, 11: rates and monthly tax declarations | Existing VAT, WHT, salary tax, prepayment and monthly tax-period workflows | **Partial.** Tax-rate configuration and a fully reconciled monthly package are not unified with the general ledger. Annex layouts 12–15 are absent. |
| Annex 10, 16: trial balance, journals and financial statements | Trial balance plus added income statement and balance sheet from posted ledger journals; CSV/print actions | **Partial.** Purchase/sales journals, mapped tax statements, PDF/Excel templates, comparative periods, closing and retained-earnings workflow remain. |
| Annex 16A: annual profit-tax computation | Annual tax return and schedules | **Partial.** Confirm workbook deductions, contribution/interest caps, loss carryforward, and reconciliation to the ledger against current tax rules before filing use. |
| Main Functions: backup/restore and system-administrator billing, termination, data extraction and analysis | Not found as complete product workflows | **Gap.** These require explicit retention, authorization, data-export, and recovery controls; they are not safe to simulate with generic CRUD. |

## Work delivered in this expansion

- Added fixed-asset class, asset register, and depreciation tables with foreign keys, checks, indexes, and audit timestamps. Existing installations receive the tables from normal schema initialization.
- Added admin-only fixed-asset APIs and a Pinia-backed Vue register. Monthly depreciation is sequential and idempotent by asset/period; its balanced posted journal and depreciation-history record are committed in one transaction. Disposal removes cost and accumulated depreciation and records proceeds plus a gain/loss in a posted journal.
- Added configurable straight-line and declining annual rates (saved per asset at registration), a depreciation schedule, and balance-sheet/income-statement APIs and views using posted journals only.
- Widened journal line precision to four decimal places in the schema and startup migration.

This is a documented coverage review, not a claim that every workbook process has been implemented. The remaining **Partial** and **Gap** rows need further feature slices and acceptance decisions; MySQL integration must be validated against an isolated configured database before production rollout.
