use {
    super::*,
    carbon_core::{borsh, CarbonDeserialize},
};

#[derive(
    CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash,
)]
pub struct UserPositionCreatedEvent {
    pub position: solana_pubkey::Pubkey,
    pub metadata: EventMetadata,
}
