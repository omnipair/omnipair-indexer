import { PublicKey, Connection } from '@solana/web3.js';
import { AnchorProvider, Program, Idl } from '@coral-xyz/anchor';
import dotenv from 'dotenv';
import type { Omnipair } from '@omnipair/program-interface';
import { loadOmnipairIdl } from './idl-loader';

dotenv.config();

// Program ID - Lazy getter to avoid errors if not set
let _programId: PublicKey | null = null;
export function getOmnipairProgramId(): PublicKey {
  if (!_programId) {
    if (!process.env.OMNIPAIR_PROGRAM_ID) {
      throw new Error('OMNIPAIR_PROGRAM_ID environment variable is not set');
    }
    _programId = new PublicKey(process.env.OMNIPAIR_PROGRAM_ID);
  }
  return _programId;
}

export const GENERIC_READONLY_PUBKEY = new PublicKey(process.env.GENERIC_READONLY_PUBKEY || '8tF4uYMBXqGhCUGRZL3AmPqRzbX8JJ1TpYnY3uJKN4kt');  

// Legacy export for backwards compatibility
export const OMNIPAIR_PROGRAM_ID = process.env.OMNIPAIR_PROGRAM_ID 
  ? new PublicKey(process.env.OMNIPAIR_PROGRAM_ID)
  : null;

// Optional default token mints (only used if you want defaults)
export function getDefaultToken0Mint(): PublicKey | null {
  return process.env.TOKEN0_MINT ? new PublicKey(process.env.TOKEN0_MINT) : null;
}

export function getDefaultToken1Mint(): PublicKey | null {
  return process.env.TOKEN1_MINT ? new PublicKey(process.env.TOKEN1_MINT) : null;
}

// Legacy exports (only work if env vars are set)
export const TOKEN0_MINT_PUBLIC_KEY = process.env.TOKEN0_MINT 
  ? new PublicKey(process.env.TOKEN0_MINT) 
  : null;

export const TOKEN1_MINT_PUBLIC_KEY = process.env.TOKEN1_MINT 
  ? new PublicKey(process.env.TOKEN1_MINT) 
  : null;

export const GAMM_LP_MINT_SEED = 'gamm_lp_mint';
export const PAIR_SEED = 'gamm_pair';

/**
 * Find the PDA for a pair
 */
export function findPairPDA(
  program: Program,
  token0: PublicKey,
  token1: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(PAIR_SEED),
      token0.toBuffer(),
      token1.toBuffer(),
    ],
    program.programId
  );
}

/**
 * Create a connection to the Solana cluster
 */
export function createConnection(rpcUrl?: string): Connection {
  const endpoint = rpcUrl || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  return new Connection(endpoint, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000,
  });
}

/**
 * Create an Anchor provider
 */
export function createProvider(connection: Connection): AnchorProvider {
  // For read-only operations, we create a minimal wallet
  const wallet = {
    publicKey: GENERIC_READONLY_PUBKEY,
    signTransaction: async () => { throw new Error('Read-only wallet'); },
    signAllTransactions: async () => { throw new Error('Read-only wallet'); },
  };
  
  return new AnchorProvider(connection, wallet as any, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
}

/**
 * Load the program
 */
export function loadProgram(provider: AnchorProvider, idl: Idl): Program<Idl> {
  return new Program(idl, provider);
}

/**
 * Get typed Omnipair program instance
 */
export function getOmnipairProgram(provider: AnchorProvider): Program<Omnipair> {
  return new Program(loadOmnipairIdl() as Omnipair, provider) as Program<Omnipair>;
}

