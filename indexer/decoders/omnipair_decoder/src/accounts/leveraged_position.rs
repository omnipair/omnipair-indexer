
 
use carbon_core::{borsh, CarbonDeserialize};

#[derive(
    CarbonDeserialize, Debug, serde::Deserialize, serde::Serialize, PartialEq, Eq, Clone, Hash,
)] 
 

#[carbon(discriminator = "0xd4915845e3a7a2a5")] 
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