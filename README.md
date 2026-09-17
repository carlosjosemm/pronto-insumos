# PRONTO — Insumos Odontológicos

E-commerce storefront and administrative backoffice designed specifically for dental clinics, practitioners, and dental laboratories in **Melipilla and the Región Metropolitana of Chile**.

---

## ⚡ Quick Start

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env.local` and populate the necessary Firebase and Mercado Pago credentials:
```bash
cp .env.example .env.local
```

### 3. Start Local Development Server
```bash
pnpm dev
```
- Storefront is available at: `http://localhost:5173/`
- Administrative Backoffice is available at: `http://localhost:5173/admin`

---

## 🛡️ Admin Portal User Provisioning (`/admin`)

The administrative portal at `/admin` is protected by Firebase Authentication with administrative custom claims (`{ admin: true }`). To create an admin account or grant admin privileges to an existing user:

```bash
# Provision an administrator account using local .env.local credentials:
pnpm run setup:admin tu-email@prontoinsumos.cl TuPasswordSegura123!
```

> **Note:** The script automatically loads `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` from your local `.env.local` (or `.env`), contacts Firebase Authentication, creates or updates the user, and assigns the `{ admin: true }` claim. You can immediately log in at `/admin`.

---

## 🧪 Testing & Validation

```bash
# Run complete automated test suite (Vitest)
pnpm test

# Run tests in live watch mode
pnpm test:watch

# Run test coverage report
pnpm test:coverage
```

---

## 🏗️ Production Build & Verification

```bash
# Compile multi-page production bundle (storefront and admin portal)
pnpm build

# Preview production build locally
pnpm preview

# Deploy Firestore Security Rules
pnpm run deploy:rules
```

---

## 🚀 Deployment (Vercel CLI)

```bash
# Deploy preview release
pnpm dlx vercel

# Deploy directly to production
pnpm dlx vercel --prod
```

For full architectural guidelines, Chilean localization details, and anti-overshooting constraints, see [AGENTS.md](file:///c:/Users/ecmv2/Documents/PRONTO/AGENTS.md).
