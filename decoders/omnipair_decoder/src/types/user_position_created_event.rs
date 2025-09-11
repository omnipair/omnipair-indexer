

use carbon_core::{CarbonDeserialize, borsh, account_utils::next_account};


#[derive(CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash)]
pub struct UserPositionCreatedEvent {
    pub user: solana_pubkey::Pubkey,
    pub pair: solana_pubkey::Pubkey,
    pub position: solana_pubkey::Pubkey,
    pub timestamp: i64,
}
