import { createRequire } from 'node:module';
import type * as Koishi from 'koishi';

// Koishi 4.18's native ESM loader cannot initialize its CommonJS base class.
export const { Argv, h, Logger, Schema } = createRequire(import.meta.url)('koishi') as typeof Koishi;
