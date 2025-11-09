import { PublicKey, Connection } from '@solana/web3.js';
import { Program, Idl } from '@coral-xyz/anchor';
import { MintLayout } from '@solana/spl-token';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplTokenMetadata, fetchDigitalAsset } from '@metaplex-foundation/mpl-token-metadata';
import { fromWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters';
import { 
  createConnection,
  createProvider,
  loadProgram
} from '../config/program';
import { fetchRatesFromRateModel, estimateRateFromUtilization } from '../utils/rateCalculator';

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
  private program: Program | null = null;

  constructor(rpcUrl?: string) {
    this.connection = createConnection(rpcUrl);
  }

  /**
   * Initialize the program with an IDL
   */
  public initializeProgram(idl: Idl): void {
    const provider = createProvider(this.connection);
    this.program = loadProgram(provider, idl);
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
      const pairAccount = await (this.program.account as any).pair.fetch(pairPda);

      // Extract token addresses and LP mint from the pair account
      const token0Mint = new PublicKey(pairAccount.token0);
      const token1Mint = new PublicKey(pairAccount.token1);
      const lpMint = new PublicKey(pairAccount.lpMint || pairAccount.lp_mint);

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

      // Try to get EMA prices and rates from the pair account if available
      // Many AMMs store these directly in the account
      let emaPrice0 = spotPrice0;
      let emaPrice1 = spotPrice1;
      let rate0 = 0;
      let rate1 = 0;

      // Check if EMA prices are stored in the pair account
      // Try both camelCase and snake_case field names
      const lastPrice0Ema = pairAccount.lastPrice0Ema || pairAccount.last_price0_ema;
      const lastPrice1Ema = pairAccount.lastPrice1Ema || pairAccount.last_price1_ema;
      
      if (lastPrice0Ema !== undefined) {
        emaPrice0 = Number(lastPrice0Ema) / Math.pow(10, 9);
      }
      if (lastPrice1Ema !== undefined) {
        emaPrice1 = Number(lastPrice1Ema) / Math.pow(10, 9);
      }

      // Try to get rates if stored in pair account
      // Try both camelCase and snake_case field names
      const lastRate0 = pairAccount.lastRate0 || pairAccount.last_rate0;
      const lastRate1 = pairAccount.lastRate1 || pairAccount.last_rate1;
      
      if (lastRate0 !== undefined) {
        rate0 = Number(lastRate0);
      }
      if (lastRate1 !== undefined) {
        rate1 = Number(lastRate1);
      }

      // If rates aren't stored, calculate from rate model
      // This avoids the "Transaction too large" error from simulation
      if (rate0 === 0 && rate1 === 0 && pairAccount.rateModel) {
        try {
          const rates = await fetchRatesFromRateModel(
            this.program,
            pairAccount.rateModel,
            utilization0,
            utilization1
          );
          rate0 = rates.rate0;
          rate1 = rates.rate1;
        } catch (rateError) {
          console.warn('Could not fetch rates from rate model, using estimation:', rateError);
          // Fallback to simple estimation
          rate0 = estimateRateFromUtilization(utilization0);
          rate1 = estimateRateFromUtilization(utilization1);
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
          token0: rate0, // 1e5 = bps, 1e6 = permille, 1e7 = percent
          token1: rate1, // 1e5 = bps, 1e6 = permille, 1e7 = percent
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
  public getProgram(): Program | null {
    return this.program;
  }
}

