use {
    super::*,
    carbon_core::{borsh, CarbonDeserialize},
};

#[derive(
    CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash,
)]
pub struct MintEvent {
    pub amount0: u64,
    pub amount1: u64,
    pub liquidity: u64,
    pub metadata: EventMetadata,
}
