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
ADMIN_EMAIL=your-recovery-address@gmail.com
ADMIN_PASSWORD=
GMAIL_USER=your-account@gmail.com
GMAIL_APP_PASSWORD=your-16-character-app-password
```

The backend creates the database, tables, default master data, and an administrator account on first startup.

User document submissions are stored under `Tax-backend/uploads/documents` and tracked in `project_files` with a pending approval status. Uploads support PDF, JPG/PNG, TXT, DOC/DOCX, and XLS/XLSX up to 10 MB. The startup database initializer applies the required metadata and optional-project migration; existing MySQL installations can also run `migrations/002_project_file_uploads.sql` manually.

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

On non-production startup, the `admin` account is created or reset to `ADMIN_PASSWORD`; when unset, its development password is `admin123`. Set `ADMIN_PASSWORD` when bootstrapping an admin account in production. Existing production admin passwords are not reset automatically.

Set `ADMIN_EMAIL` to a real recovery mailbox for the `admin` account. On startup, the configured value replaces the admin account's existing email, including an old placeholder address. Other accounts need a real email address in the user management screen before password recovery can be used. Gmail sending also requires `GMAIL_USER` and a 16-character Google App Password in `GMAIL_APP_PASSWORD`; a normal Gmail password will not work.

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

When using these `SMTP_*` fields, leave `GMAIL_USER` and `GMAIL_APP_PASSWORD` empty. Set `ADMIN_EMAIL` to the admin recovery inbox; each other user needs their own valid email saved in User Access. The sender mailbox and recovery mailbox can be different.

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

### Password reset database setup

The startup initializer creates these tables. To apply the same change manually in MySQL, select `taxation_system` and run `migrations/001_password_resets.sql`:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) NULL;

CREATE TABLE IF NOT EXISTS password_resets (
	id INT AUTO_INCREMENT PRIMARY KEY,
	user_id INT NOT NULL,
	email VARCHAR(255) NOT NULL,
	otp_hash VARCHAR(255) NOT NULL,
	expires_at DATETIME NOT NULL,
	is_used TINYINT(1) NOT NULL DEFAULT 0,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	INDEX idx_password_resets_email (email),
	INDEX idx_password_resets_user (user_id),
	CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
```

The API generates a random six-digit OTP, stores only its bcrypt hash, expires it after 10 minutes, and marks it used after a successful password reset.

## 3. Frontend API URL

The frontend defaults to `http://localhost:4000/api`. To change it, create `Tax-frontend/.env`:

```env
VITE_API_URL=http://localhost:4000/api
```