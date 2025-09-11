

use carbon_core::{CarbonDeserialize, borsh, account_utils::next_account};


#[derive(CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash)]
pub struct AdjustCollateralEvent {
    pub user: solana_pubkey::Pubkey,
    pub amount0: i64,
    pub amount1: i64,
    pub timestamp: i64,
}
