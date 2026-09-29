import { MemoryStore } from '../src/core/store.js';
import { storeContract } from './store-contract.js';

storeContract('MemoryStore', () => new MemoryStore());
