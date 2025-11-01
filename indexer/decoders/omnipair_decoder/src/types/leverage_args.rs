

use carbon_core::{CarbonDeserialize, borsh};


#[derive(CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash)]
pub struct LeverageArgs {
    pub long_token0: bool,
    pub borrow_amount: u64,
    pub min_collateral_delta: u64,
    pub target_leverage_bps: u32,
}
