# Campus Resolve — Firebase Edition
### College Complaint Management System
"Raise Concerns. Track Progress. Build a Better Campus."

This is the **Firebase edition** of Campus Resolve: MySQL has been fully replaced with
**Cloud Firestore**, and the custom bcrypt + JWT auth has been replaced with
**Firebase Authentication**. Everything else (Express REST API, role-based access,
deadline logic, escalation, PDF reports, cron scheduling, Chart.js analytics) works
the same way as before.

---

## 1. Architecture

```
Browser (Bootstrap + JS)
   ↓ signs in directly with Firebase Auth SDK
   ↓ sends ID token as "Authorization: Bearer <token>"
Express REST API  ──(Firebase Admin SDK)──▶  Cloud Firestore
   ↓
PDF Reports / node-cron scheduler / Notifications
```

- **The frontend never talks to Firestore directly.** It authenticates with the
  Firebase client SDK, then calls your Express API exactly as before — the API
  verifies the ID token and does all data access itself via the Admin SDK.
- Firestore Security Rules (`firestore.rules`) deny all direct client access as a
  safety net, since the Admin SDK bypasses rules anyway.

---

## 2. One-time Firebase Project Setup

### Step 1 — Create a Firebase project
Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project**.

### Step 2 — Enable Authentication
Build → Authentication → Get Started → **Sign-in method** tab → enable
**Email/Password**.

### Step 3 — Create a Firestore database
Build → Firestore Database → **Create database** → choose a region → start in
**production mode** (the included `firestore.rules` will lock it down further).

Deploy the rules (optional but recommended) with the Firebase CLI:
```bash
npm install -g firebase-tools
firebase login
firebase init firestore   # point it at this project, use the existing firestore.rules
firebase deploy --only firestore:rules
```

### Step 4 — Get your backend service account key
Project Settings (gear icon) → **Service accounts** → **Generate new private key**.
This downloads a JSON file. Rename it `serviceAccountKey.json` and place it at:
```
backend/serviceAccountKey.json
```
This file is git-ignored — never commit it.

### Step 5 — Get your frontend web app config
Project Settings → **General** tab → scroll to "Your apps" → click the **Web** icon
(`</>`) to register a new web app (no Firebase Hosting needed). Copy the config
object it gives you.

Open `frontend/js/firebase-config.js` and paste your values in:
```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "...",
  appId: "..."
};
```

---

## 3. Run the App

```bash
cd backend
cp .env.example .env
# (.env mainly holds demo passwords + PORT; Firebase credentials come from
#  serviceAccountKey.json, not from .env)

npm install
npm run seed     # creates demo Firebase Auth users + Firestore profiles
npm start
```

Visit **http://localhost:5000**.

### Demo accounts (created by `npm run seed`)

| Role        | Email                              | Password (default, change in `.env`) |
|-------------|-------------------------------------|----------------------------------------|
| Student     | student@campusresolve.local         | `Student@123`                          |
| Staff       | staff@campusresolve.local           | `Staff@123`                            |
| Coordinator | coordinator@campusresolve.local     | `Coordinator@123`                      |
| HOD         | hod@campusresolve.local             | `Hod@123`                              |
| Principal   | principal@campusresolve.local       | `Principal@123`                        |
| Admin       | admin@campusresolve.local           | `Admin@123`                            |

The seed script also creates the standard departments and complaint categories in
Firestore, matching the original spec.

---

## 4. What Changed vs. the MySQL Edition

| Concern | MySQL edition | Firebase edition |
|---|---|---|
| Database | MySQL (`mysql2`) | Cloud Firestore (`firebase-admin`) |
| Auth | bcrypt password hashing + custom JWT in an httpOnly cookie | Firebase Authentication; client SDK signs in, backend verifies ID tokens |
| Session | Server-side cookie session | Stateless — every request carries a fresh Firebase ID token |
| Login endpoint | `POST /api/auth/login` (server checks password) | **No server login route** — the frontend calls `firebase.auth().signInWithEmailAndPassword()` directly; the backend only verifies the resulting token |
| Register endpoint | Inserts a row + hashes password | Backend uses the Admin SDK to create the Firebase Auth user + a matching Firestore profile document |
| IDs | Auto-increment integers | Firestore auto-generated document IDs (strings) |
| Complaint code sequence | `COUNT(*)` query | Firestore transaction on a `counters/complaints_{year}` document (safe under concurrency) |
| Joins (student name, department name, etc. on a complaint) | SQL `JOIN` | Denormalized onto the complaint document at write time (Firestore has no joins) |
| Filtering | SQL `WHERE`/`GROUP BY` | Fetched per role-scope, then filtered/aggregated in memory (fine at college scale; avoids needing composite indexes for every filter combination) |
| File attachments | Local disk via Multer | Still local disk via Multer by default — see note below on switching to Firebase Storage |

### Switching attachments to Firebase Storage (optional)
By default, complaint attachments still save to `backend/uploads/` via Multer, same
as before. If you'd rather store them in Firebase Storage:
1. Set `FIREBASE_STORAGE_BUCKET` in `.env`.
2. In `complaintController.createComplaint`, after Multer saves the file locally,
   upload it via `bucket.upload(...)` (see `config/firebase.js`, which already
   exports `bucket`), then store the resulting public/signed URL as
   `attachment_path` instead of the local `/uploads/...` path.
This wasn't required by the "replace MySQL + auth" scope, so it's left as a
drop-in option rather than forced on you.

---

## 5. Firestore Data Model

```
users/{uid}            full_name, email, role, department_id, department_name,
                        register_number, phone, status, created_at, updated_at

departments/{id}        department_name, hod_user_id, hod_name, status, created_at

categories/{id}         category_name, description, status, created_at

complaints/{id}         complaint_code, user_id, student_name, student_email,
                        department_id, department_name, category_id, category_name,
                        title, description, location, priority, status,
                        attachment_path, assigned_coordinator_id, coordinator_name,
                        submitted_at, deadline, resolved_at, resolution_remarks,
                        escalation_level, escalated_at, created_at, updated_at

complaint_actions/{id}  complaint_id, performed_by, performed_by_role, action,
                        remarks, created_at

ratings/{complaintId}   complaint_id, student_id, rating, feedback, created_at
                        (doc ID = complaint ID, enforcing one rating per complaint)

notifications/{id}      user_id, complaint_id, title, message, type, is_read,
                        created_at

reports/{id}            report_type, period_start, period_end, generated_for,
                        department_id, file_path, generated_at, status

counters/complaints_{year}   value  (used to generate CMP-2026-0001 style codes)
```

---

## 6. Security Notes

- Firebase Authentication handles password hashing/storage entirely — the backend
  never sees or stores a password.
- Every API request is authenticated by verifying a short-lived Firebase ID token
  server-side (`admin.auth().verifyIdToken()`); tokens can't be forged without the
  project's private keys.
- Role-based `authorize(...)` middleware still gates every sensitive endpoint,
  exactly as before — Firebase confirms *who* the user is, not what they're allowed
  to do; that's still enforced by your Express code, reading the Firestore user
  profile's `role` field.
- Deactivating a user (`Admin → Manage Users → Deactivate`) both flips their
  Firestore `status` to `inactive` **and** disables their Firebase Auth account
  (`auth.updateUser(uid, { disabled: true })`), so they're locked out immediately.
- `firestore.rules` denies all direct client access, so even if someone got a
  client-side Firebase config, they can't read/write Firestore directly — only
  through your authenticated, role-checked API.
- `serviceAccountKey.json` is git-ignored — never commit it or share it publicly;
  anyone with that file has full admin access to your Firebase project.

---

## 7. REST API (unchanged endpoints, Firebase-backed under the hood)

```
POST   /api/auth/register        (backend creates Firebase Auth user + profile)
GET    /api/auth/me              (verifies ID token, returns Firestore profile)
POST   /api/auth/logout
POST   /api/auth/forgot-password (frontend actually uses firebase.auth().sendPasswordResetEmail)

GET    /api/complaints
POST   /api/complaints
GET    /api/complaints/:id
POST   /api/complaints/:id/assign
POST   /api/complaints/:id/status
POST   /api/complaints/:id/resolve
POST   /api/complaints/:id/escalate
POST   /api/complaints/:id/rating
GET    /api/complaints/stats/dashboard

GET    /api/admin/users | POST | PUT :id | PATCH :id/status
GET    /api/admin/departments | POST | PUT :id
GET    /api/admin/categories | POST | PUT :id
GET    /api/admin/coordinators

GET    /api/notifications | PATCH :id/read | PATCH read-all

GET    /api/analytics/overview | trend/weekly | trend/monthly | by-department |
       by-category | by-priority | by-status | satisfaction

GET    /api/reports | weekly | monthly
POST   /api/reports/generate
```

Every request except `/api/auth/register` and `/api/public/*` requires
`Authorization: Bearer <firebase-id-token>`, which `frontend/js/api.js` attaches
automatically from the signed-in Firebase user.
