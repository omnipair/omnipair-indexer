
use super::*;

use carbon_core::{CarbonDeserialize, borsh};


#[derive(CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash)]
pub struct UserPositionUpdatedEvent {
    pub position: solana_pubkey::Pubkey,
    pub collateral0: u64,
    pub collateral1: u64,
    pub debt0_shares: u64,
    pub debt1_shares: u64,
    pub metadata: EventMetadata,
}
