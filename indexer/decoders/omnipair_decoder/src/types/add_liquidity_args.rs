use carbon_core::{borsh, CarbonDeserialize};

#[derive(
    CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash,
)]
pub struct AddLiquidityArgs {
    pub amount0_in: u64,
    pub amount1_in: u64,
    pub min_liquidity_out: u64,
}
