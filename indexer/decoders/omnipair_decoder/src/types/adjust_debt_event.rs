use {
    super::*,
    carbon_core::{borsh, CarbonDeserialize},
};

#[derive(
    CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash,
)]
pub struct AdjustDebtEvent {
    pub amount0: i64,
    pub amount1: i64,
    pub metadata: EventMetadata,
}
