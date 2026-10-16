import { PublicKey } from '@solana/web3.js';
import type { PairStateService } from './PairStateService';
import { parseNumber } from '../utils/portfolioMath';

export interface CurrentLpPositionInput {
  signer: string;
  pair: string;
  lpAmount: string | number | null;
  amount0: string | number | null;
  amount1: string | number | null;
}

export interface CurrentLpTokenAmounts {
  signer: string;
  pair: string;
  token0Amount: number;
  token1Amount: number;
  exact: boolean;
}

export function currentLpValuationKey(signer: string, pair: string): string {
  return `${signer}:${pair}`;
}

/** Floor each underlying amount to raw token units without floating-point rounding. */
export function calculateRawLpTokenAmounts(
  lpAmount: string,
  totalSupply: string,
  reserve0: string,
  reserve1: string
): { token0Amount: string; token1Amount: string } {
  const balance = BigInt(lpAmount);
  const supply = BigInt(totalSupply);
  const reserves = [BigInt(reserve0), BigInt(reserve1)];
  if (balance < 0n || supply <= 0n || reserves.some((reserve) => reserve < 0n)) {
    throw new Error('Invalid LP balance or pool state');
  }
  return {
    token0Amount: (reserves[0] * balance / supply).toString(),
    token1Amount: (reserves[1] * balance / supply).toString(),
  };
}

export function calculateCurrentLpTokenAmounts(
  lpAmount: unknown,
  totalSupply: unknown,
  reserve0: unknown,
  reserve1: unknown
): { token0Amount: number; token1Amount: number } | null {
  const lpAmountNumber = parseNumber(lpAmount);
  const totalSupplyNumber = parseNumber(totalSupply);
  if (lpAmountNumber < 0 || totalSupplyNumber <= 0) {
    return null;
  }

  const lpShare = lpAmountNumber / totalSupplyNumber;
  return {
    token0Amount: parseNumber(reserve0) * lpShare,
    token1Amount: parseNumber(reserve1) * lpShare,
  };
}

async function fetchPairReserveAmounts(
  pairStateService: PairStateService,
  pair: string
): Promise<{ reserve0: string; reserve1: string; totalSupply: string } | null> {
  const program = pairStateService.getProgram();
  if (!program) {
    return null;
  }

  const pairAccount = await program.account.pair.fetch(new PublicKey(pair));
  return {
    reserve0: pairAccount.reserve0.toString(),
    reserve1: pairAccount.reserve1.toString(),
    totalSupply: pairAccount.totalSupply.toString(),
  };
}

async function initializeDefaultPairStateService(): Promise<PairStateService> {
  const { initializePairStateService } = await import('../controllers/helpers/controllerBase');
  return initializePairStateService();
}

function fallbackCurrentAmounts(
  positions: CurrentLpPositionInput[]
): Map<string, CurrentLpTokenAmounts> {
  const amountsByPosition = new Map<string, CurrentLpTokenAmounts>();
  for (const position of positions) {
    amountsByPosition.set(currentLpValuationKey(position.signer, position.pair), {
      signer: position.signer,
      pair: position.pair,
      token0Amount: parseNumber(position.amount0),
      token1Amount: parseNumber(position.amount1),
      exact: false,
    });
  }
  return amountsByPosition;
}

export async function loadCurrentLpTokenAmounts(
  positions: CurrentLpPositionInput[],
  pairStateService?: PairStateService
): Promise<Map<string, CurrentLpTokenAmounts>> {
  if (positions.length === 0) {
    return new Map();
  }

  let service: PairStateService;
  try {
    service = pairStateService ?? await initializeDefaultPairStateService();
  } catch (error) {
    console.warn('Falling back to indexed LP amounts; pair state service unavailable:', error);
    return fallbackCurrentAmounts(positions);
  }

  const amountsByPosition = new Map<string, CurrentLpTokenAmounts>();
  const reserveAmountsByPair = new Map<string, Awaited<ReturnType<typeof fetchPairReserveAmounts>>>();

  await Promise.all(
    [...new Set(positions.map((position) => position.pair))].map(async (pair) => {
      try {
        reserveAmountsByPair.set(pair, await fetchPairReserveAmounts(service, pair));
      } catch (error) {
        console.warn(`Falling back to indexed LP amounts for ${pair}:`, error);
        reserveAmountsByPair.set(pair, null);
      }
    })
  );

  for (const position of positions) {
    const reserves = reserveAmountsByPair.get(position.pair);
    const calculated = reserves
      ? calculateCurrentLpTokenAmounts(
          position.lpAmount,
          reserves.totalSupply,
          reserves.reserve0,
          reserves.reserve1
        )
      : null;

    amountsByPosition.set(currentLpValuationKey(position.signer, position.pair), {
      signer: position.signer,
      pair: position.pair,
      token0Amount: calculated?.token0Amount ?? parseNumber(position.amount0),
      token1Amount: calculated?.token1Amount ?? parseNumber(position.amount1),
      exact: Boolean(calculated),
    });
  }

  return amountsByPosition;
}
