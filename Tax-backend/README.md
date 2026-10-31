# Taxation System Backend

## 1. Configure MySQL

Copy `.env.example` to `.env` and set the credentials for a MySQL user that can create databases and tables:

```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_mysql_password
MYSQL_DATABASE=taxation_system
JWT_SECRET=use-a-long-random-secret
ABA_PAYWAY_MERCHANT_ID=your-payway-merchant-id
ABA_PAYWAY_API_KEY=your-payway-api-key
ABA_PAYWAY_BASE_URL=https://checkout-sandbox.payway.com.kh
ABA_PAYWAY_CALLBACK_URL=https://your-public-domain/api/khqr/payway/callback
ADMIN_EMAIL=your-recovery-address@gmail.com
ADMIN_PASSWORD=
GMAIL_USER=your-account@gmail.com
GMAIL_APP_PASSWORD=your-16-character-app-password
```

The backend creates the database, tables, default master data, and a Super Admin account on first startup. No tenant ID environment variable is required: startup migrates legacy records into a tenant workspace, promotes the earliest eligible legacy Admin to that workspace's owner, and keeps Super Admin accounts outside tenant workspaces. If no eligible Admin exists, startup warns that the workspace needs an owner before tenant access is granted. A tenant-context startup error is a database/bootstrap issue, not a missing `.env` tenant setting; inspect the reported database error and ensure the database user can create and alter tables and triggers.

### Annex 1 registration and account activation

Public registration is available at `/register`. The form collects a name, unique username, email address, and password. Each registration creates a new company workspace and `owner` account in one database transaction. Owners can create and manage `staff` accounts for their company, assigning a manager, cashier, inventory, or accountant preset and further configuring individual permissions. Staff permissions are scoped to their assigned company and branch access. Legacy non-owner Admins migrate to manager staff accounts; legacy Users migrate to cashier staff accounts. The new workspace starts with no chart-of-account rows, depreciation classes, tax-rate rows, product categories, inventory, customers, vendors, invoices, purchases, sales, tax returns, or journal entries. It receives only the owner's Main Branch access and the minimal company settings needed to configure the workspace; the owner can add company-specific accounts and depreciation classes before using those features. No operational or accounting records are copied from another company. Registration activates the email and account immediately without sending a verification email or requiring Gmail/SMTP configuration. Sign-in accepts either the registered username or work email. Existing accounts that were waiting for email verification are marked verified during database startup; any required approval still applies. If approval is enabled, the account remains inactive until approved; otherwise, the owner can sign in immediately after registration.

### Annex 2 company data profile

Company owners can view and update their own tenant's tax/company profile at `/company/profile` in the frontend or through `/api/company/profile`. Company records have a unique TIN and are linked to their owner and member accounts. Legacy user email/login addresses are not overwritten by the company's official email.

### Accounting ledger

The tenant Accounting screen provides a chart of accounts, draft general journals, posting, and an as-of trial balance in USD or KHR. Fixed assets and depreciation are available at `/accounting/fixed-assets`; financial statements are at `/accounting/financial-statements`. Access is permission-based and all reports include records from the authenticated company only. Accounting tables carry company IDs, and composite foreign keys prevent a journal line or account hierarchy from referencing another company's ledger. Journal lines support four decimal places, use one currency per entry, require exactly one non-zero debit or credit per line, and must balance before posting. Posted journals cannot be edited or deleted. Depreciation and asset-disposal journals post atomically with their source records; other POS, purchasing, payroll, and tax activity is not automatically posted to the ledger. See [REQUIREMENTS-GAP.md](./REQUIREMENTS-GAP.md) for workbook coverage and known gaps. Schema initialization and safe journal precision widening run on backend startup.

User document submissions are stored under `Tax-backend/uploads/documents` and tracked in `project_files` with a pending approval status. Uploads support PDF, JPG/PNG, TXT, DOC/DOCX, and XLS/XLSX up to 10 MB. The startup database initializer applies the schema and required metadata from `schema.sql`.

### ABA PayWay KHQR scan-to-pay setup

Set `ABA_PAYWAY_MERCHANT_ID`, `ABA_PAYWAY_API_KEY`, and `ABA_PAYWAY_CALLBACK_URL` in the backend `.env`. The callback URL must be publicly reachable over HTTPS at `/api/khqr/payway/callback`, and ABA must allow/whitelist the callback URL. Localhost URLs cannot receive callbacks from ABA. Keep the API key on the server and never put it in frontend settings or source control. `ABA_PAYWAY_BASE_URL` defaults to `https://checkout-sandbox.payway.com.kh`; the backend uses PayWay's `generate-qr` and `check-transaction-2` APIs with HMAC-SHA512 signatures. A configured full endpoint URL is also accepted; the backend uses its HTTPS origin to select the PayWay APIs.

POS requests an ABA KHQR for the current cart total. PayWay posts signed payment callbacks to the backend, which validates the signature, merchant, approved status, original currency, and amount before marking an intent paid. POS observes the verified status, completes the sale, and prints the receipt automatically. The backend also calls PayWay's check-transaction API to confirm the transaction independently. The existing database initializer adds the unique `payway_tran_id` column to older installations automatically.

Sandbox credentials and the sandbox host are for testing and do not settle real payments. To accept real payments, use production credentials issued by ABA and set `ABA_PAYWAY_BASE_URL=https://checkout.payway.com.kh`. Verify live payments with an authorized low-value test transaction before taking customer payments.

MySQL 8.0 is running on this machine, but a valid password is required. Do not leave `MYSQL_PASSWORD` empty unless the MySQL account was explicitly configured without a password.

## 2. Start the API

```powershell
npm install
npm start
# or
node server.js
```

The API is available at `http://localhost:4000/api`.

Default development login:

- Username: `admin`
- Password: `admin123`

On non-production startup, a fresh `admin` account uses `ADMIN_PASSWORD` or the development-only password `admin123`. An existing account is left unchanged unless `ADMIN_PASSWORD` is explicitly set, which rotates its password and promotes it to Super Admin. In production, `ADMIN_PASSWORD` must contain at least 12 characters to create or promote the bootstrap account. The `admin` account has the `superadmin` role and is platform-only; it cannot access tenant sales, inventory, accounting, or tax operations.

Owners exclusively manage staff accounts within their company through the owner-only user-management APIs. Super Admins can manage accounts across workspaces through `/api/superadmin/users/:id`; the last active Super Admin cannot be updated or deleted, and platform user changes are audited. Deleting an owner requires transferring ownership to an active, approved staff member in the same company first. Deletion runs in a database transaction: financial, operational, project, and audit history is retained while its user references are cleared; private branch access, notifications, password resets, and payment intents are removed with the account. Startup migrates required user-reference columns to nullable `ON DELETE SET NULL` constraints and restricts stored roles to `superadmin`, `owner`, or `staff`.

The Super Admin frontend opens a platform overview backed by `GET /api/superadmin/overview?page=1&limit=20&search=` and includes platform user account management backed by `GET /api/superadmin/users?page=1&limit=20&search=`. Both listing endpoints are Super Admin-only, paginated, and audited; user search matches account name, username, email, or company. Super Admins can edit supported account fields and delete eligible accounts through `/api/superadmin/users/:id`; company owners require an ownership transfer and the last active Super Admin remains protected. Owner-managed staff actions remain scoped to the authenticated company. The current company schema does not include a platform-level suspension state.

Authentication and password-recovery routes are rate-limited to 10 requests per IP and 5 per account identifier in a 15-minute window (OTP verification allows 10 per IP and 5 per account). The current limiter store is in-memory and local to each backend process; deployments with multiple backend instances should configure a shared rate-limit store.

Annual tax returns require the `tax.write` permission. A draft may remain a draft or transition to filed; filed returns cannot be edited. Production startup requires a configured `JWT_SECRET` (minimum 32 characters), `ADMIN_PASSWORD`, and `CORS_ORIGIN`.

When running behind a trusted reverse proxy, set `TRUST_PROXY_HOPS` to the exact number of proxy hops (for example, `1` for one proxy) so IP-based limits use the client address. Do not enable proxy trust if clients can reach the backend directly while spoofing forwarded headers.

Set `ADMIN_EMAIL` to a real recovery mailbox for the `admin` account. It is assigned when creating the bootstrap account or when `ADMIN_PASSWORD` is explicitly set to rotate/promote an existing account. Every account needs a real recovery email address before password recovery can be used. Recovery accepts either the account username or its registered email. Gmail sending also requires `GMAIL_USER` and a 16-character Google App Password in `GMAIL_APP_PASSWORD`; a normal Gmail password will not work.

### Password reset email: quick Gmail setup

Password recovery uses Gmail SMTP through Nodemailer. Use a dedicated Gmail account when possible.

For Gmail through the custom SMTP settings in `.env`, use:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-sending-account@gmail.com
SMTP_PASSWORD=your-16-character-google-app-password
SMTP_FROM=your-sending-account@gmail.com
```

When using these `SMTP_*` fields, leave `GMAIL_USER` and `GMAIL_APP_PASSWORD` empty. Set `ADMIN_EMAIL` to the admin recovery inbox; each account needs a valid recovery email, provided during registration or maintained in User Access. The sender mailbox and recovery mailbox can be different.

The backend also accepts any authenticated SMTP provider. For non-Gmail providers, replace the Gmail settings in `.env` with:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=your-sender@example.com
```

`ADMIN_EMAIL` is the recovery destination stored on the seeded admin user. `GMAIL_USER` is the account that sends mail; the two may be different. Set `ADMIN_EMAIL` to the real mailbox that should receive the code, and set `GMAIL_USER` plus its 16-character Google App Password to enable Gmail sending.

SMTP/Gmail is not required to register or activate new accounts. Configure it only for email-based password recovery and verification links for legacy accounts that are still pending verification.

Restart the backend after changing `.env`. Startup awaits the SMTP handshake and logs `Password reset SMTP connection verified` when it succeeds. Missing or invalid mail configuration returns 503, and the password reset code is not stored unless SMTP accepts the recipient.

1. Open [Google Account](https://myaccount.google.com/) and sign in to the account that will send the emails.
2. Select **Security** in the left menu.
3. Under **How you sign in to Google**, select **2-Step Verification**.
4. Select **Get started**, complete Google's identity checks, and finish enabling 2-Step Verification.
5. Return to **Security**, select **App passwords**, and sign in again if prompted.
6. Enter `Tax System` as the app name, select **Create**, and copy the 16-character password Google displays. Google may show it in four groups; remove all spaces to get the 16-character Nodemailer password.
7. Put the password in `.env`. The backend also removes spaces automatically, so this grouped form is valid:

```env
GMAIL_USER=your_email@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
```

Use the App Password, never the normal Gmail password. App passwords may be unavailable for work or school accounts, accounts with Advanced Protection, or accounts with 2-Step Verification enforced only by security keys. The backend logs a generic SMTP verification error if Gmail rejects the connection; never paste credentials into source code or logs.

## Inventory stock tracking

Stock quantities are whole numbers. `item_branch_stock` holds the on-hand quantity for each item and branch; `items.qty_on_hand` is maintained as the sum of those branch balances. On existing installations, startup checks every quantity column before changing its scale. If it finds fractional values, startup stops and reports up to five example rows per column; review and correct those records explicitly before restarting. It never rounds existing fractional quantities automatically. Existing installations migrate their current item balances and legacy batches to the configured branch on startup, and batch quantities are reconciled to the migrated branch balances. Staff access is persisted in `user_branch_access`; existing staff are assigned the configured branch on migration, while company owners and administrators have access to every branch in their own company workspace. Company owners and administrators can manage staff branch assignments in Settings → Access & Users.

Sales, purchase receipts, adjustments, batches, and transfers update branch balances, batches, and stock movements within database transactions. Every stock-writing request checks the authenticated user's assigned branch; transfer dispatch requires access to the source branch and receipt requires access to the destination branch. Sales and write-offs consume available batches by FIFO. The company inventory policy controls whether stock may become negative, whether adjustments require an administrator, and whether adjustment notes are mandatory. Policy settings are cached briefly and refreshed immediately after settings are saved. A transfer deducts from its source when dispatched with `POST /api/inventory/transfers`, remains in transit, then credits the destination when an authorized user calls `POST /api/inventory/transfers/:id/receive`.

Vendor, customer, and invoice reads require a bearer token. Invoice lists and details, sales-by-staff, AR/AP summaries, and purchase-order reads are limited to the authenticated user's currently assigned branches; company owners and administrators can view all branches in their own company workspace. Authentication rechecks the current account status, role, and ownership in the database on every request, so account deactivation and role changes take effect immediately. Purchase orders store their owning branch when created, and existing orders are assigned to their received branch or the configured branch during migration. Access policies in `settings.company.policy.access` control password minimum length, registration approval, and inactive-account login. New registrations can sign in immediately when approval is disabled; if approval is enabled, they can sign in after administrator approval.

The sales-by-staff report accepts valid `YYYY-MM-DD` `from` and `to` parameters. If omitted, it reports from the first day of the current month through today.

Stock movement history is available from `GET /api/transactions` with `page`, `limit` (default `50`, maximum `500`), `item_id`, `branch`, `startDate`, and `endDate` filters. The response contains `data`, `total`, `page`, and `totalPages`.

### Tenant isolation migration and verification

Back up the database before a production migration. The backend applies the tenant migration during startup after loading `schema.sql`; the manual migration script is `migrations/001_tenant_isolation.sql` and should be run after the schema when preparing a database manually. Legacy shared records are assigned to the existing Super Admin's company. The migration refuses to add accounting cross-company reference constraints if existing journal lines or account parents link across companies; resolve those records before retrying. New registrations receive a distinct `company_id`; their starter setup is company-scoped, and operational tables remain empty. Tenant-aware API middleware and database write guards reject cross-company access.

To verify the full registration flow in a test environment:

1. Register Account A with a unique email and username. Complete any configured administrator approval, then sign in.
2. Create an item and a customer as Account A; optionally complete a sale after opening a register. Record Account A's company ID and item ID for comparison.
3. Register Account B using a different email and username. Complete any required approval, then sign in using a separate browser session so no cached Account A state is reused.
4. Confirm Account B has a different company ID. Its Dashboard should show the setup prompt and empty operational data; its Items, Customers, Invoices, Purchases, and Inventory views should not show Account A's records.
5. Check the API as Account B: `GET /api/items`, `GET /api/customers`, and `GET /api/invoices` must not return Account A's records. Attempt a write using Account A's item ID and confirm it is rejected without changing Account A's records.
6. In the test database, verify seeded rows are tied to each company's own ID and that Account B has no operational rows until it creates them.

### Inventory costing and valuation

Branch inventory uses perpetual moving weighted-average cost. Purchase-order receipt allocates order-level freight/handling and documentation costs, plus line delivery charges, by each line's share of total merchandise value. Purchase overhead fields use cents and allocated purchase-line landed costs use four decimal places; branch AVCO and sale snapshots retain six-decimal precision. Landed cost updates branch AVCO and is stored on the received batch. Sales snapshot the branch's base-unit moving cost on each invoice line (`cogs_unit_cost`/`unit_cost_at_sale` and `qty_base`) so COGS remains historical after later receipts. Stock adjustments and branch transfers are recorded at the applicable moving-average cost; transferred stock keeps its batch/expiry trace while destination AVCO uses the source branch's book cost. Items can optionally recalculate retail prices from received landed cost and configured markup; manual prices are preserved when that toggle is off.

Startup backfills legacy zero-cost adjustment movements from branch average cost, then item average cost, then purchase cost. The inventory valuation audit uses the same fallback when reporting adjustment movements.

`GET /api/reports/inventory-valuation` returns a `summary` and per-item `items` array. The summary includes purchases, landed cost, sold quantity, gross revenue, ending stock and value, COGS (`total_landed_cost - ending_stock_value`), and gross profit. The endpoint checks a requested branch and otherwise limits the result to the authenticated user's authorized branches.

### MySQL stock transaction integration tests

The normal `npm test` run includes fast policy and branch-authorization tests. MySQL integration tests use a disposable database named by `MYSQL_TEST_DATABASE` and containing `test` (for example `taxation_stock_test`; omit trailing punctuation). Set `MYSQL_TEST_HOST`, `MYSQL_TEST_USER`, `MYSQL_TEST_PASSWORD`, and optionally `MYSQL_TEST_PORT` for the test MySQL instance. The test user must be allowed to create databases and triggers. The tests initialize and write to that database but do not drop it.

In PowerShell, configure the regular MySQL connection variables and run:

```powershell
$env:MYSQL_TEST_HOST = 'localhost'
$env:MYSQL_TEST_USER = 'root'
$env:MYSQL_TEST_PASSWORD = '<test database password>'
$env:MYSQL_TEST_PORT = '3306'
$env:MYSQL_TEST_DATABASE = 'taxation_stock_test'
npm run test:integration
```

The integration suite exercises duplicate-line stock aggregation, whole-number quantity validation and deductions, transfer dispatch/receipt ledgers, transaction rollback after a forced database failure, negative-stock receipt reconciliation, branch read authorization, concurrent stock adjustments, landed-cost allocation, moving-average sales COGS, automatic markup pricing, and valuation reporting.

### Password reset database setup

The startup initializer creates these tables. To apply the database structure manually in MySQL, run `schema.sql`.

The API generates a random six-digit OTP, stores only its bcrypt hash, expires it after 10 minutes, and marks it used after a successful password reset.

## 3. Frontend API URL

The frontend defaults to `http://159.223.34.157:4000/api`. To change it, create `Tax-frontend/.env`:

```env
VITE_API_URL=http://159.223.34.157:4000/api
```