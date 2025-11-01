import { PublicKey, Connection } from '@solana/web3.js';
import { AnchorProvider, Program, Idl } from '@coral-xyz/anchor';
import dotenv from 'dotenv';

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
 * Enum mapping for PairViewKind getters
 */
export enum PairViewKind {
  EmaPrice0Nad = 'emaPrice0Nad',
  EmaPrice1Nad = 'emaPrice1Nad',
  SpotPrice0Nad = 'spotPrice0Nad',
  SpotPrice1Nad = 'spotPrice1Nad',
  K = 'k',
  GetRates = 'getRates',
  GetMinCollateralForDebt = 'getMinCollateralForDebt',
  GetBorrowLimitAndCfBpsForCollateral = 'getBorrowLimitAndCfBpsForCollateral',
}

/**
 * Simulate a getter function on the pair using view_pair_data instruction
 * This calls the view_pair_data instruction which returns data through logs
 */
export async function simulatePairGetter(
  program: Program,
  pairPda: PublicKey,
  rateModel: PublicKey,
  getter: { [key: string]: any }
): Promise<any> {
  try {
    // Extract the getter type from the input object
    const getterKey = Object.keys(getter)[0];
    
    // Map the getter key to the proper enum variant
    const getterVariant = { [getterKey]: {} };
    
    // Call view_pair_data instruction with simulation
    const result = await program.methods
      .viewPairData(
        getterVariant,  // getter: PairViewKind enum variant
        {}              // args: EmitValueArgs (empty for these getters)
      )
      .accounts({
        pair: pairPda,
        rateModel: rateModel,
      })
      .simulate();
    
    // Parse the emitted logs to extract the returned value
    // The program emits the value in a log that we need to parse
    if (result.events && result.events.length > 0) {
      const event = result.events[0];
      return event.data;
    }
    
    // Fallback: if events aren't available, try to parse from logs
    // This is a simplified parser - adjust based on your actual log format
    if (result.raw) {
      return parseViewDataFromLogs([...result.raw], getterKey);
    }
    
    throw new Error('No data returned from view instruction');
  } catch (error) {
    console.error('Error simulating pair getter:', error);
    throw error;
  }
}

/**
 * TODO: This is a simplified version of the log parsing logic.
 * TODO: Need to implement the actual log parsing logic.
 * Helper function to parse view data from transaction logs
 */
function parseViewDataFromLogs(logs: string[], getterType: string): any {
  // Your program likely emits logs in a specific format
  // For example: "Program log: EmaPrice0Nad: 1234567890"
  // Or it might use Anchor events which are automatically parsed
  
  for (const log of logs) {
    if (log.includes('EmitValue')) {
      // Parse the emitted value from the log
      // This will depend on your program's log format
      try {
        const match = log.match(/value0:\s*(\d+)/);
        if (match) {
          return {
            value0: match[1],
            value1: '0', // Adjust based on your needs
          };
        }
      } catch (err) {
        console.warn('Failed to parse log:', log, err);
      }
    }
  }
  
  throw new Error(`Could not parse ${getterType} from logs`);
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
    publicKey: PublicKey.default,
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

