
use super::super::types::*;

use carbon_core::{borsh, CarbonDeserialize};


#[derive(CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash)]
#[carbon(discriminator = "0xe445a52e51cb9a1d317f846ee6b79626")]
pub struct LeveragePositionCreatedEvent{
    pub position: solana_pubkey::Pubkey,
    pub metadata: EventMetadata,
}
