
use super::*;

use carbon_core::{CarbonDeserialize, borsh};


#[derive(CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash)]
pub struct ClaimProtocolFeesEvent {
    pub token0: carbon_core::deserialize::CarbonPubkey,
    pub token1: carbon_core::deserialize::CarbonPubkey,
    pub futarchy_treasury_amount0: u64,
    pub futarchy_treasury_amount1: u64,
    pub buybacks_vault_amount0: u64,
    pub buybacks_vault_amount1: u64,
    pub team_treasury_amount0: u64,
    pub team_treasury_amount1: u64,
    pub metadata: EventMetadata,
}
