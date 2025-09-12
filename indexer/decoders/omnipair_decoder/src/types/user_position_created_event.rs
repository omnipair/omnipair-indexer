

use carbon_core::{CarbonDeserialize, borsh};


#[derive(CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash)]
pub struct UserPositionCreatedEvent {
    pub user: solana_pubkey::Pubkey,
    pub pair: solana_pubkey::Pubkey,
    pub position: solana_pubkey::Pubkey,
    pub timestamp: i64,
}
