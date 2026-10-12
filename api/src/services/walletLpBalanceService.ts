import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, unpackAccount } from '@solana/spl-token';
import type { Pool } from 'pg';
import pool from '../config/database';
import { createConnection } from '../config/program';
import { cache } from '../utils/cache';

export class LiveLpDataUnavailableError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'LiveLpDataUnavailableError';
  }
}

export interface WalletLpBalance {
  pair: string;
  lpMint: string;
  token0Mint: string;
  token1Mint: string;
  lpAmount: string;
}

export interface WalletLpBalanceSnapshot {
  holdings: WalletLpBalance[];
  observation: {
    commitment: 'confirmed';
    observedAt: string;
    slotsByTokenProgram: Record<string, number>;
  };
}

interface LpPoolRow {
  pair_address: string;
  lp_mint: string;
  token0: string;
  token1: string;
}

type BalanceConnection = Pick<Connection, 'getTokenAccountsByOwner'>;

/** Discover holdings from token accounts, including wallets with no indexed deposits. */
export async function fetchWalletLpBalances(
  userAddress: string,
  db: Pick<Pool, 'query'> = pool,
  connection: BalanceConnection = createConnection()
): Promise<WalletLpBalanceSnapshot> {
  const owner = new PublicKey(userAddress);
  // Share concurrent lookups across pages/aliases, but retain no completed balance.
  return cache.getOrSet(`wallet_lp_balances:${owner.toBase58()}`, 0, () =>
    readWalletLpBalances(owner, db, connection)
  );
}

async function readWalletLpBalances(
  owner: PublicKey,
  db: Pick<Pool, 'query'>,
  connection: BalanceConnection
): Promise<WalletLpBalanceSnapshot> {
  const programs = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];
  const slotsByTokenProgram: Record<string, number> = {};
  const balances = new Map<string, bigint>();
  try {
    const responses = await Promise.all(programs.map((programId) =>
      connection.getTokenAccountsByOwner(owner, { programId }, 'confirmed')
    ));
    responses.forEach((response, index) => {
      slotsByTokenProgram[programs[index].toBase58()] = response.context.slot;
      for (const entry of response.value) {
        const account = unpackAccount(entry.pubkey, entry.account, programs[index]);
        if (!account.owner.equals(owner)) {
          throw new Error('Token account owner does not match requested wallet');
        }
        if (account.amount > 0n) {
          const mint = account.mint.toBase58();
          balances.set(mint, (balances.get(mint) ?? 0n) + account.amount);
        }
      }
    });
  } catch (error) {
    throw new LiveLpDataUnavailableError('Unable to read wallet LP balances', error);
  }
  const observation: WalletLpBalanceSnapshot['observation'] = {
    commitment: 'confirmed', observedAt: new Date().toISOString(), slotsByTokenProgram,
  };

  if (balances.size === 0) return { holdings: [], observation };

  const result = await db.query<LpPoolRow>(
    `SELECT pair_address, lp_mint, token0, token1
     FROM pools WHERE lp_mint = ANY($1::text[])`,
    [[...balances.keys()]]
  );

  const holdings = result.rows.map((row) => ({
    pair: row.pair_address,
    lpMint: row.lp_mint,
    token0Mint: row.token0,
    token1Mint: row.token1,
    lpAmount: balances.get(row.lp_mint)!.toString(),
  }));
  return { holdings, observation };
}
