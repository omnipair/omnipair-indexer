
use super::*;

use carbon_core::{CarbonDeserialize, borsh};


#[derive(CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash)]
pub struct LeveragePositionUpdatedEvent {
    pub position: solana_pubkey::Pubkey,
    pub long_token0: bool,
    pub target_leverage_bps: u32,
    pub debt_delta: i64,
    pub debt_amount: u64,
    pub collateral_deposited: u64,
    pub collateral_delta: i64,
    pub collateral_position_size: u64,
    pub collateral_leverage_multiplier_bps: u16,
    pub applied_cf_bps: u16,
    pub liquidation_price_nad: u64,
    pub entry_price_nad: u64,
    pub metadata: EventMetadata,
}
