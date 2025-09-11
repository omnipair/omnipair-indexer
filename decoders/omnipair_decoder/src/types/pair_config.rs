

use carbon_core::{CarbonDeserialize, borsh, account_utils::next_account};


#[derive(CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash)]
pub struct PairConfig {
    pub futarchy_fee_bps: u16,
    pub founder_fee_bps: u16,
    pub nonce: u64,
    pub bump: u8,
}
