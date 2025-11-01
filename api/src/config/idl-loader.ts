import { Idl } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Load the Omnipair IDL from the idl directory
 * 
 * @param idlFileName - Name of the IDL file (default: 'omnipair.mainnet.json')
 * @returns The parsed IDL object
 * @throws Error if IDL file is not found or invalid
 */
export function loadOmnipairIdl(idlFileName: string = 'omnipair.mainnet.json'): Idl {
  try {
    // Try to load from the idl directory
    const idlPath = path.join(__dirname, '..', 'idl', idlFileName);
    
    if (fs.existsSync(idlPath)) {
      const idlContent = fs.readFileSync(idlPath, 'utf-8');
      return JSON.parse(idlContent) as Idl;
    }
    
    // If not found, throw an error with helpful message
    throw new Error(
      `IDL file not found at ${idlPath}.\n\n` +
      `Please add your Anchor IDL file to: api/src/idl/${idlFileName}\n\n` +
      `You can get your IDL by:\n` +
      `1. From Anchor project: anchor build && cp target/idl/omnipair.json api/src/idl/omnipair.mainnet.json\n` +
      `2. From deployed program: anchor idl fetch <PROGRAM_ID> -o api/src/idl/omnipair.mainnet.json\n` +
      `3. Manually copy your IDL JSON file to api/src/idl/`
    );
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to load IDL: ${error}`);
  }
}

/**
 * Alternative: Load IDL directly from require (for bundled scenarios)
 * Use this if you want to bundle the IDL with your application
 */
export function requireOmnipairIdl(): Idl {
  try {
    // This will work if the IDL is in the idl directory
    const idl = require('../idl/omnipair.mainnet.json');
    return idl as Idl;
  } catch (error) {
    throw new Error(
      `Failed to require IDL. Make sure omnipair.mainnet.json exists in api/src/idl/\n` +
      `Error: ${error}`
    );
  }
}

/**
 * Check if IDL file exists
 */
export function hasIdlFile(idlFileName: string = 'omnipair.mainnet.json'): boolean {
  const idlPath = path.join(__dirname, '..', 'idl', idlFileName);
  return fs.existsSync(idlPath);
}

