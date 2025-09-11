

use carbon_core::{CarbonDeserialize, borsh, account_utils::next_account};


#[derive(CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash)]
pub struct InitializePairArgs {
    pub swap_fee_bps: u16,
    pub half_life: u64,
    pub pool_deployer_fee_bps: u16,
}
