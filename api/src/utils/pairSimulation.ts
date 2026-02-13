import { PublicKey, Connection, Transaction } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';
import { GetterType, UserPositionGetterType, SimulationResult, EmitValueArgs } from '../types/pairTypes';
import type { Omnipair } from '@omnipair/program-interface';
import { GENERIC_READONLY_PUBKEY } from '../config/program';

/**
 * Cache for simulation results
 */
interface CacheEntry {
  result: SimulationResult;
  timestamp: number;
}

const SIMULATE_CACHE_DURATION = 5000; // 5 seconds cache
const simulateCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<SimulationResult>>();

// In-flight requests for user position getters
const userPositionInFlightRequests = new Map<string, Promise<SimulationResult>>();

/**
 * Extract numeric value from OptionalUint format (U64(123), U16(456), OptionalU64(Some(123)), etc.)
 */
export function extractValue(optionalUintStr: string): string {
  // Handle U64(123), U128(456), U16(789) formats
  const valueMatch = optionalUintStr.match(/U\d+\((\d+)\)/);
  if (valueMatch) {
    return valueMatch[1];
  }
  // Handle OptionalU64(Some(123)) format
  const optionalMatch = optionalUintStr.match(/OptionalU\d+\(Some\((\d+)\)\)/);
  if (optionalMatch) {
    return optionalMatch[1];
  }
  // Handle None case
  if (optionalUintStr.includes('None')) {
    return '0';
  }
  return '0';
}

/**
 * Parse simulation logs to extract 3-tuple values.
 * On-chain format: "Label: (OptionalUint, OptionalUint, OptionalUint)"
 * e.g. "EmaPrice0Nad: (U64(123), OptionalU64(None), OptionalU64(None))"
 * e.g. "GetBorrowLimitAndCfBpsForCollateral: (U64(1000), U16(6650), U16(7000))"
 */
function parseSimulationLogs(
  logs: string[],
  label: string
): { value0: string; value1: string; value2: string } {
  // Convert camelCase to PascalCase to match Rust Display format (e.g., "emaPrice0Nad" -> "EmaPrice0Nad")
  const pascalLabel = label.charAt(0).toUpperCase() + label.slice(1);

  // Match individual OptionalUint values: U64(123), U128(456), U16(789), OptionalU64(Some(123)), OptionalU64(None)
  const valuePattern = '(?:OptionalU\\d+\\([^)]*\\)|U\\d+\\(\\d+\\))';

  // Match 3-tuple: "Label: (val1, val2, val3)"
  const tupleRegex = new RegExp(
    `${pascalLabel}:\\s*\\(\\s*(${valuePattern})\\s*,\\s*(${valuePattern})\\s*,\\s*(${valuePattern})\\s*\\)`,
    'i'
  );

  const match = logs
    .map((log) => log.match(tupleRegex))
    .find(Boolean);

  if (!match || !match[1] || !match[2] || !match[3]) {
    throw new Error(`Tuple values for ${label} not found in logs`);
  }

  return {
    value0: extractValue(match[1]),
    value1: extractValue(match[2]),
    value2: extractValue(match[3]),
  };
}

/**
 * Simulate a pair getter function using view_pair_data instruction
 * This calls the view_pair_data instruction which returns data through logs after updating the pair
 */
export async function simulatePairGetter(
  program: Program<Omnipair>,
  connection: Connection,
  pairPda: PublicKey,
  rateModelPda: PublicKey,
  getter: GetterType,
  args?: EmitValueArgs
): Promise<SimulationResult> {
  // Create cache key based on parameters
  const getterKey = Object.keys(getter)[0];
  const argsKey = args ? JSON.stringify(args) : 'default';
  const cacheKey = `pair:${pairPda.toString()}:${getterKey}:${argsKey}`;

  // Check cache first
  const cached = simulateCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SIMULATE_CACHE_DURATION) {
    return cached.result;
  }

  // Check if there's already an in-flight request for this key
  const inFlight = inFlightRequests.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  // Create new request promise
  const requestPromise = (async () => {
    try {
      // Create the instruction
      const ix = await program.methods
        .viewPairData(
          getter,
          args || { amount: null, tokenMint: null }
        )
        .accounts({ pair: pairPda, rateModel: rateModelPda })
        .instruction();

      // Create transaction with fee payer
      const tx = new Transaction().add(ix);
      tx.feePayer = program.provider.publicKey ?? GENERIC_READONLY_PUBKEY;

      // Simulate transaction
      const simResult = await connection.simulateTransaction(tx);

      const logs = simResult.value.logs ?? [];
      const label = Object.keys(getter)[0]; // e.g. "emaPrice0Nad"

      // Parse logs to extract values
      const { value0, value1, value2 } = parseSimulationLogs(logs, label);

      const result: SimulationResult = { label, value0, value1, value2 };

      // Cache the result
      simulateCache.set(cacheKey, { result, timestamp: Date.now() });

      return result;
    } finally {
      // Remove from in-flight requests
      inFlightRequests.delete(cacheKey);
    }
  })();

  // Store in-flight request
  inFlightRequests.set(cacheKey, requestPromise);

  return requestPromise;
}

/**
 * Simulate a user position getter function using view_user_position_data instruction
 * This calls the view_user_position_data instruction which returns data through logs after updating the pair
 */
export async function simulateUserPositionGetter(
  program: Program<Omnipair>,
  connection: Connection,
  pairPda: PublicKey,
  userPositionPda: PublicKey,
  getter: UserPositionGetterType
): Promise<SimulationResult> {
  // Create key based on parameters for in-flight request deduplication only
  const getterKey = Object.keys(getter)[0];
  const requestKey = `userPosition:${pairPda.toString()}:${userPositionPda.toString()}:${getterKey}`;

  // Check if there's already an in-flight request for this key (deduplication only, no caching)
  const inFlight = userPositionInFlightRequests.get(requestKey);
  if (inFlight) {
    return inFlight;
  }

  // Create new request promise
  const requestPromise = (async () => {
    try {
      // Get the pair account to access the rate model
      const pairAccount = await program.account.pair.fetch(pairPda);
      const rateModelPda = pairAccount.rateModel;

      // Create the instruction
      const ix = await program.methods
        .viewUserPositionData(getter)
        .accounts({
          userPosition: userPositionPda,
          pair: pairPda,
          rateModel: rateModelPda
        })
        .instruction();

      // Create transaction with fee payer
      const tx = new Transaction().add(ix);
      tx.feePayer = program.provider.publicKey ?? GENERIC_READONLY_PUBKEY;

      // Simulate transaction using connection directly
      const simResult = await connection.simulateTransaction(tx);

      const logs = simResult.value.logs ?? [];
      const label = Object.keys(getter)[0]; // e.g. "userDynamicBorrowLimit"

      // Parse logs to extract values
      const { value0, value1, value2 } = parseSimulationLogs(logs, label);

      const result: SimulationResult = { label, value0, value1, value2 };

      return result;
    } finally {
      // Remove from in-flight requests
      userPositionInFlightRequests.delete(requestKey);
    }
  })();

  // Store in-flight request
  userPositionInFlightRequests.set(requestKey, requestPromise);

  return requestPromise;
}

/**
 * Clear the simulation cache (useful for testing or manual cache invalidation)
 */
export function clearSimulationCache(): void {
  simulateCache.clear();
  inFlightRequests.clear();
  userPositionInFlightRequests.clear();
}

/**
 * Get cache statistics (useful for monitoring)
 */
export function getSimulationCacheStats(): {
  cacheSize: number;
  inFlightRequests: number;
} {
  return {
    cacheSize: simulateCache.size,
    inFlightRequests: inFlightRequests.size,
  };
}

