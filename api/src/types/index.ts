export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface Swap {
  id: number;
  pair: string | null;
  user_address: string | null;
  is_token0_in: boolean | null;
  amount_in: string | null; 
  amount_out: string | null;
  reserve0: string | null;
  reserve1: string | null;
  timestamp: string | null;
  tx_sig: string | null;
  slot: string | null;
  fee_paid0: string | null;
  fee_paid1: string | null;
}

export interface UserHistory {
  id: number;
  pair: {
    address: string | null;
    token0: string | null;
    token1: string | null;
  };
  user_address: string | null;
  amount0: string | null;
  amount1: string | null;
  liquidity: string | null;
  tx_sig: string | null;
  timestamp: string | null;
  event_type: string | null;
}

export interface PoolRow {
  id: number;
  pair_address: string;
  token0: string;
  token1: string;
  lp_mint?: string;
  rate_model?: string;
  swap_fee_bps?: number;
  half_life?: number;
  fixed_cf_bps?: number;
  params_hash?: Buffer;
  version?: number;
}