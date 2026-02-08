import { PublicKey } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';
import type { Omnipair } from '@omnipair/program-interface';
import dbPool from '../config/database';

const OLP_DECIMALS = 9;

export interface OlpTokenValue {
  olpMint: string;
  pairAddress: string;
  token0: string;
  token1: string;
  token0Decimals: number;
  token1Decimals: number;
  totalSupply: string;
  reserve0: string;
  reserve1: string;
  token0PerOlp: string;
  token1PerOlp: string;
}

export class OlpValueService {
  private olpValues: Map<string, OlpTokenValue> = new Map();
  private initialized = false;

  async initialize(program: Program<Omnipair>): Promise<void> {
    if (this.initialized) return;

    // 1. Get all pools from DB
    const poolsResult = await dbPool.query(
      'SELECT pair_address, token0, token1, lp_mint FROM pools'
    );

    if (poolsResult.rows.length === 0) {
      this.initialized = true;
      return;
    }

    // 2. Batch fetch all pair accounts on-chain (single RPC call)
    const pairPubkeys = poolsResult.rows.map((r: any) => new PublicKey(r.pair_address));
    const pairAccounts = await program.account.pair.fetchMultiple(pairPubkeys);

    // 3. Compute and store exchange rates
    for (let i = 0; i < poolsResult.rows.length; i++) {
      const poolRow = poolsResult.rows[i];
      const pairAccount = pairAccounts[i];

      if (!pairAccount) {
        console.warn(`Pair account not found on-chain for ${poolRow.pair_address}, skipping`);
        continue;
      }

      const reserve0 = Number(pairAccount.reserve0);
      const reserve1 = Number(pairAccount.reserve1);
      const totalSupply = Number(pairAccount.totalSupply);
      const token0Decimals: number = pairAccount.token0Decimals;
      const token1Decimals: number = pairAccount.token1Decimals;

      let token0PerOlp = 0;
      let token1PerOlp = 0;

      if (totalSupply > 0) {
        // token0PerOlp = (reserve0 / 10^token0Decimals) / (totalSupply / 10^olpDecimals)
        //              = (reserve0 / totalSupply) * 10^(olpDecimals - token0Decimals)
        token0PerOlp = (reserve0 / totalSupply) * Math.pow(10, OLP_DECIMALS - token0Decimals);
        token1PerOlp = (reserve1 / totalSupply) * Math.pow(10, OLP_DECIMALS - token1Decimals);
      }

      this.olpValues.set(poolRow.lp_mint, {
        olpMint: poolRow.lp_mint,
        pairAddress: poolRow.pair_address,
        token0: poolRow.token0,
        token1: poolRow.token1,
        token0Decimals,
        token1Decimals,
        totalSupply: totalSupply.toString(),
        reserve0: (reserve0 / Math.pow(10, token0Decimals)).toString(),
        reserve1: (reserve1 / Math.pow(10, token1Decimals)).toString(),
        token0PerOlp: token0PerOlp.toString(),
        token1PerOlp: token1PerOlp.toString(),
      });
    }

    this.initialized = true;
    console.log(`OlpValueService initialized with ${this.olpValues.size} oLP token exchange rates:`);
    for (const [, value] of this.olpValues) {
      console.log(`  oLP ${value.olpMint} | pair ${value.pairAddress} | token0PerOlp: ${value.token0PerOlp} | token1PerOlp: ${value.token1PerOlp} | reserve0: ${value.reserve0} | reserve1: ${value.reserve1} | totalSupply: ${value.totalSupply}`);
    }
  }

  getValues(olpMints: string[]): (OlpTokenValue | { olpMint: string; error: string })[] {
    return olpMints.map(mint => {
      const value = this.olpValues.get(mint);
      if (!value) {
        return { olpMint: mint, error: 'No pool found for this oLP mint' };
      }
      return value;
    });
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}
