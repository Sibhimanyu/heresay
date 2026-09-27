/**
 * The ONE firebase-admin instance. Import it from here and nowhere else: two copies of
 * firebase-admin in one process break FieldValue instanceof checks, and that surfaces as
 * unrelated-looking 502s.
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) initializeApp();

export const db = getFirestore();
export const auth = getAuth();
