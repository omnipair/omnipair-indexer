import { PublicKey, Connection } from '@solana/web3.js';
import { Program, Idl } from '@coral-xyz/anchor';
import { MintLayout } from '@solana/spl-token';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplTokenMetadata, fetchDigitalAsset } from '@metaplex-foundation/mpl-token-metadata';
import { fromWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters';
import { 
  createConnection,
  createProvider,
  loadProgram,
  getOmnipairProgram
} from '../config/program';
import { simulatePairGetter } from '../utils/pairSimulation';
import { calculateInterestRate, RATE_PERCENT_SCALE } from '../utils/rateCalculator';
import type { Omnipair } from '../types/omnipair.mainnet';

export interface TokenMetadata {
  symbol: string;
  name: string;
  decimals: number;
  address: string;
  iconUrl?: string;
}

export interface PairState {
  token0: TokenMetadata;
  token1: TokenMetadata;
  reserves: {
    token0: string;
    token1: string;
  };
  oraclePrices: {
    token0: string;
    token1: string;
  };
  spotPrices: {
    token0: string;
    token1: string;
  };
  rates: {
    token0: number;
    token1: number;
  };
  totalDebts: {
    token0: string;
    token1: string;
  };
  utilization: {
    token0: number;
    token1: number;
  };
  totalSupply: string;
  lpTokenDecimals: number;
}

export class PairStateService {
  private connection: Connection;
  private program: Program<Omnipair> | null = null;

  constructor(rpcUrl?: string) {
    this.connection = createConnection(rpcUrl);
  }

  /**
   * Initialize the program with an IDL
   * @deprecated Use initializeTypedProgram() instead for better type safety
   */
  public initializeProgram(idl: Idl): void {
    const provider = createProvider(this.connection);
    this.program = loadProgram(provider, idl) as unknown as Program<Omnipair>;
  }

  /**
   * Initialize the typed Omnipair program
   */
  public initializeTypedProgram(): void {
    const provider = createProvider(this.connection);
    this.program = getOmnipairProgram(provider);
  }

  /**
   * Fetch token metadata from on-chain data
   */
  private async fetchTokenMetadata(mint: PublicKey): Promise<TokenMetadata> {
    try {
      const rpcEndpoint = this.connection.rpcEndpoint;
      const umi = createUmi(rpcEndpoint).use(mplTokenMetadata());

      const asset = await fetchDigitalAsset(umi, fromWeb3JsPublicKey(mint));

      // Get decimals from mint account
      const mintInfo = await this.connection.getAccountInfo(mint);
      if (!mintInfo) {
        throw new Error('Failed to fetch mint info');
      }
      const decimals = MintLayout.decode(mintInfo.data).decimals;

      // Extract icon URL from metadata URI
      let iconUrl: string | undefined;
      if (asset.metadata?.uri && asset.metadata.uri.trim() !== '') {
        try {
          const metadataResponse = await fetch(asset.metadata.uri);
          if (metadataResponse.ok) {
            const metadataJson = await metadataResponse.json() as any;
            if (metadataJson.image && typeof metadataJson.image === 'string' && metadataJson.image.trim() !== '') {
              iconUrl = metadataJson.image;
            }
          }
        } catch (error) {
          // Silently fail for metadata JSON fetch errors
          console.warn(`Failed to fetch metadata JSON for ${mint.toString()}`);
        }
      }

      return {
        symbol: asset.metadata?.symbol || 'Unknown',
        name: asset.metadata?.name || asset.metadata?.symbol || 'Unknown',
        decimals,
        address: mint.toString(),
        iconUrl,
      };
    } catch (err) {
      console.error('Error fetching token metadata:', err);
      return {
        symbol: 'Unknown',
        name: 'Unknown',
        decimals: 6, // Fallback to 6 if we can't fetch the decimals
        address: mint.toString(),
        iconUrl: undefined,
      };
    }
  }

  /**
   * Fetch LP token decimals
   */
  private async fetchLpTokenDecimals(lpMint: PublicKey): Promise<number> {
    try {
      const mintInfo = await this.connection.getAccountInfo(lpMint);
      if (!mintInfo) {
        throw new Error('Failed to fetch LP mint info');
      }
      return MintLayout.decode(mintInfo.data).decimals;
    } catch (err) {
      console.error('Error fetching LP token decimals:', err);
      return 6; // Fallback to 6 if we can't fetch the decimals
    }
  }


  /**
   * Fetch the complete pair state
   */
  public async fetchPairState(
    pairAddress: string
  ): Promise<PairState> {
    if (!this.program) {
      throw new Error('Program not initialized. Call initializeProgram() first.');
    }

    try {
      // Convert pair address to PublicKey and fetch pair account directly
      const pairPda = new PublicKey(pairAddress);
      const pairAccount = await this.program.account.pair.fetch(pairPda);

      // Extract token addresses and LP mint from the pair account
      const token0Mint = new PublicKey(pairAccount.token0);
      const token1Mint = new PublicKey(pairAccount.token1);
      const lpMint = new PublicKey(pairAccount.lpMint);

      // Fetch token metadata and LP token decimals in parallel
      const [token0Metadata, token1Metadata, lpTokenDecimals] = await Promise.all([
        this.fetchTokenMetadata(token0Mint),
        this.fetchTokenMetadata(token1Mint),
        this.fetchLpTokenDecimals(lpMint),
      ]);

      if (!token0Metadata || !token1Metadata) {
        throw new Error('Failed to fetch token metadata');
      }

      const {
        token0Decimals,
        token1Decimals,
        reserve0,
        reserve1,
        totalDebt0,
        totalDebt1,
        totalSupply,
      } = pairAccount;

      // Calculate utilization
      const utilization0 =
        Number(totalDebt0) > 0 ? (Number(totalDebt0) / Number(reserve0)) * 100 : 0;
      const utilization1 =
        Number(totalDebt1) > 0 ? (Number(totalDebt1) / Number(reserve1)) * 100 : 0;

      // Calculate spot prices from reserves
      // Price of token0 in terms of token1: reserve1 / reserve0
      // Price of token1 in terms of token0: reserve0 / reserve1
      const spotPrice0 = Number(reserve1) / Number(reserve0);
      const spotPrice1 = Number(reserve0) / Number(reserve1);

      // Get rate model PDA from pair account
      const rateModelPda = new PublicKey(pairAccount.rateModel);

      // Fetch EMA prices using simulation (after pair update)
      let emaPrice0 = spotPrice0;
      let emaPrice1 = spotPrice1;
      let rate0Raw = Number(pairAccount.lastRate0 ?? 0);
      let rate1Raw = Number(pairAccount.lastRate1 ?? 0);

      try {
        if (!this.program) {
          throw new Error('Program not initialized');
        }
        
        const [emaPrice0Result, emaPrice1Result] = await Promise.all([
          simulatePairGetter(this.program, this.connection, pairPda, rateModelPda, { emaPrice0Nad: {} }),
          simulatePairGetter(this.program, this.connection, pairPda, rateModelPda, { emaPrice1Nad: {} })
        ]);

        // Parse EMA prices (stored as NAD - 9 decimals)
        emaPrice0 = Number(emaPrice0Result.value0) / Math.pow(10, 9);
        emaPrice1 = Number(emaPrice1Result.value0) / Math.pow(10, 9);
      } catch (error) {
        console.warn('Error fetching EMA prices via simulation, falling back to spot prices:', error);
        // Fallback to spot prices if simulation fails
        emaPrice0 = spotPrice0;
        emaPrice1 = spotPrice1;
      }
      
      try {
        if (!this.program) {
          throw new Error('Program not initialized');
        }
        const rateModelAccount = await (this.program.account as any).rateModel.fetch(rateModelPda);
        const currentTimestamp = Math.floor(Date.now() / 1000);

        const rate0Result = calculateInterestRate(
          {
            utilizationPercent: utilization0,
            lastRate: pairAccount.lastRate0,
            lastUpdateTimestamp: pairAccount.lastUpdate,
            currentTimestamp,
          },
          {
            expRate: rateModelAccount.expRate,
            targetUtilStart: rateModelAccount.targetUtilStart,
            targetUtilEnd: rateModelAccount.targetUtilEnd,
          }
        );

        const rate1Result = calculateInterestRate(
          {
            utilizationPercent: utilization1,
            lastRate: pairAccount.lastRate1,
            lastUpdateTimestamp: pairAccount.lastUpdate,
            currentTimestamp,
          },
          {
            expRate: rateModelAccount.expRate,
            targetUtilStart: rateModelAccount.targetUtilStart,
            targetUtilEnd: rateModelAccount.targetUtilEnd,
          }
        );

        rate0Raw = rate0Result.rawRate;
        rate1Raw = rate1Result.rawRate;
      } catch (error) {
        console.warn('Error calculating rates locally, falling back to simulation:', error);
        try {
          if (!this.program) {
            throw new Error('Program not initialized');
          }
          const ratesResult = await simulatePairGetter(this.program, this.connection, pairPda, rateModelPda, { getRates: {} });
          rate0Raw = Number(ratesResult.value0);
          rate1Raw = Number(ratesResult.value1);
        } catch (simError) {
          console.warn('Error fetching rates via simulation:', simError);
        }
      }
      

      return {
        token0: {
          symbol: token0Metadata.symbol,
          name: token0Metadata.name,
          decimals: token0Decimals,
          address: token0Mint.toString(),
          iconUrl: token0Metadata.iconUrl,
        },
        token1: {
          symbol: token1Metadata.symbol,
          name: token1Metadata.name,
          decimals: token1Decimals,
          address: token1Mint.toString(),
          iconUrl: token1Metadata.iconUrl,
        },
        reserves: {
          token0: (Number(reserve0) / Math.pow(10, token0Decimals)).toString(),
          token1: (Number(reserve1) / Math.pow(10, token1Decimals)).toString(),
        },
        oraclePrices: {
          token0: emaPrice0.toString(),
          token1: emaPrice1.toString(),
        },
        spotPrices: {
          token0: spotPrice0.toString(),
          token1: spotPrice1.toString(),
        },
        rates: {
          token0: Math.floor((rate0Raw / RATE_PERCENT_SCALE) * 100) / 100,
          token1: Math.floor((rate1Raw / RATE_PERCENT_SCALE) * 100) / 100,
        },
        totalDebts: {
          token0: totalDebt0.toString(),
          token1: totalDebt1.toString(),
        },
        utilization: {
          token0: utilization0,
          token1: utilization1,
        },
        totalSupply: totalSupply.toString(),
        lpTokenDecimals,
      };
    } catch (err) {
      console.error('Error fetching pair state:', err);
      throw err;
    }
  }

  /**
   * Get the connection instance
   */
  public getConnection(): Connection {
    return this.connection;
  }

  /**
   * Get the program instance
   */
  public getProgram(): Program<Omnipair> | null {
    return this.program;
  }
}
