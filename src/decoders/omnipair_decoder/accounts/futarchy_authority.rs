
 
use carbon_core::{borsh, CarbonDeserialize};

#[derive(
    CarbonDeserialize, Debug, serde::Deserialize, serde::Serialize, PartialEq, Eq, Clone, Hash,
)] 
 

#[carbon(discriminator = "0xaff7a0b68c80d3e2")] 
pub struct FutarchyAuthority {
        pub authority: solana_pubkey::Pubkey,
        pub last_config_nonce: u64,
        pub bump: u8, 
}