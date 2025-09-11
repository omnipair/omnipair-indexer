

use carbon_core::{CarbonDeserialize, borsh, account_utils::next_account};


#[derive(CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash)]
pub struct BurnEvent {
    pub user: solana_pubkey::Pubkey,
    pub amount0: u64,
    pub amount1: u64,
    pub liquidity: u64,
    pub timestamp: i64,
}
