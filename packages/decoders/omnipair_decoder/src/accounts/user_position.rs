
 
use carbon_core::{borsh, CarbonDeserialize};

#[derive(
    CarbonDeserialize, Debug, serde::Deserialize, serde::Serialize, PartialEq, Eq, Clone, Hash,
)] 
 

#[carbon(discriminator = "0xfbf8d1f553ea111b")] 
pub struct UserPosition {
        pub owner: solana_pubkey::Pubkey,
        pub pair: solana_pubkey::Pubkey,
        pub collateral0_applied_min_cf_bps: u16,
        pub collateral1_applied_min_cf_bps: u16,
        pub collateral0: u64,
        pub collateral1: u64,
        pub debt0_shares: u64,
        pub debt1_shares: u64,
        pub bump: u8, 
}