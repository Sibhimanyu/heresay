/** The store contract against the Firestore emulator. Run with `npm run test:firestore` from the repo root. */
import { test } from 'node:test';
import { storeContract } from './store-contract.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  test('FirestoreStore contract (skipped: no FIRESTORE_EMULATOR_HOST)', { skip: true }, () => {});
} else {
  const { db } = await import('../src/providers/firebase/admin.js');
  const { FirestoreStore } = await import('../src/providers/firebase/firestore-store.js');
  storeContract('FirestoreStore', () => new FirestoreStore(db));
}
