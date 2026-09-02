

use carbon_core::{CarbonDeserialize, borsh};


#[derive(CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash)]
pub struct EventMetadata {
    pub signer: carbon_core::deserialize::CarbonPubkey,
    pub pair: carbon_core::deserialize::CarbonPubkey,
    pub slot: u64,
}
