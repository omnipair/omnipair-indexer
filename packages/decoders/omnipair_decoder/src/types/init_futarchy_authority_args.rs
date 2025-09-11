

use carbon_core::{CarbonDeserialize, borsh};


#[derive(CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash)]
pub struct InitFutarchyAuthorityArgs {
    pub authority: solana_pubkey::Pubkey,
}
