

use carbon_core::{CarbonDeserialize, borsh};


#[derive(CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash)]
pub struct FutarchyAuthority {
    pub authority: solana_pubkey::Pubkey,
    pub last_config_nonce: u64,
    pub bump: u8,
}
