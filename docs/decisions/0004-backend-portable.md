# 0004: Firebase now, Catalyst possible later

Date: 2026-09-29

## Decided

- **Firebase is the backend for now** (Blaze plan, linked by `create-heresay`, with a budget alert).
  Chosen over Zoho Catalyst for self-hosting because every setup step is scriptable and the free
  quotas are daily and generous. Catalyst needs a console-created first project, a "Start
  Exploring" click per service, and has small monthly Data Store quotas with a $5/project minimum.
- **The code stays backend-portable**, so `create-heresay` can later ask "Firebase or Catalyst?".
  - `functions/src/core/`: handler, `Store` interface, types. No provider imports.
  - `functions/src/providers/firebase/`: Cloud Functions adapter, `FirestoreStore`, firebase-admin.
  - `test/store-contract.ts`: behaviour every `Store` must pass (MemoryStore, Firestore today).
  - The SDK takes `data-api` for backends whose API is not beside `sdk.js`.

## Still Firebase-specific (to abstract when Catalyst is added)

- Dashboard sign-in uses the Firebase Auth web SDK (`public/dashboard.js`).
- `verifyIdToken` in the adapter verifies Firebase ID tokens.
- Hosting config (`firebase.json`) and deploy commands.
- `create-heresay` will get a provider module per backend: login, create project, enable
  services, deploy, update.
