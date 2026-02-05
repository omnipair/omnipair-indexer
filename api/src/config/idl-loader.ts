import { Idl } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';

// Cached IDL instance
let _cachedIdl: Idl | null = null;

/**
 * Load the Omnipair IDL from the @omnipair/program-interface package.

 */
export function loadOmnipairIdl(): Idl {
  if (_cachedIdl) return _cachedIdl;

  let dir = __dirname;
  while (dir !== path.dirname(dir)) {
    const idlPath = path.join(
      dir,
      'node_modules',
      '@omnipair',
      'program-interface',
      'src',
      'idl.json',
    );
    if (fs.existsSync(idlPath)) {
      _cachedIdl = JSON.parse(fs.readFileSync(idlPath, 'utf-8')) as Idl;
      return _cachedIdl;
    }
    dir = path.dirname(dir);
  }

  throw new Error(
    'Omnipair IDL not found. Make sure @omnipair/program-interface is installed:\n' +
    '  npm install @omnipair/program-interface',
  );
}
