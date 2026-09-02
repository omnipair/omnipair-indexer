
use super::*;

use carbon_core::{CarbonDeserialize, borsh};


#[derive(CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash)]
pub struct UserPositionCreatedEvent {
    pub position: carbon_core::deserialize::CarbonPubkey,
    pub metadata: EventMetadata,
}
