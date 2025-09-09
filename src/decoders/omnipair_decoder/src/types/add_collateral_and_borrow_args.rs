

use carbon_core::{CarbonDeserialize, borsh};


#[derive(CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash)]
pub struct AddCollateralAndBorrowArgs {
    pub collateral_amount: u64,
    pub borrow_amount: u64,
}
