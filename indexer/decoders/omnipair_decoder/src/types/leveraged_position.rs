

use carbon_core::{CarbonDeserialize, borsh};


#[derive(CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash)]
pub struct LeveragedPosition {
    pub owner: solana_pubkey::Pubkey,
    pub pair: solana_pubkey::Pubkey,
    pub token0_multiplier: u16,
    pub token1_multiplier: u16,
    pub token0_applied_min_cf_bps: u16,
    pub token1_applied_min_cf_bps: u16,
    pub collateral0: u64,
    pub collateral1: u64,
    pub debt0_shares: u64,
    pub debt1_shares: u64,
    pub bump: u8,
}
