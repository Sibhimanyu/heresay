/**
 * Deploy entry point. Heresay's logic lives in core/ and knows nothing about where it runs;
 * providers/ holds one adapter per backend. Today that is Firebase; Catalyst would be a second
 * adapter, chosen by `create-heresay`. core/ must never import from providers/.
 */
export { api } from './providers/firebase/api.js';
