

use carbon_core::{CarbonDeserialize, borsh, account_utils::next_account};


#[derive(CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash)]
pub struct SwapEvent {
    pub user: solana_pubkey::Pubkey,
    pub amount0_in: u64,
    pub amount1_in: u64,
    pub amount0_out: u64,
    pub amount1_out: u64,
    pub timestamp: i64,
}
