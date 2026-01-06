use carbon_core::{borsh, CarbonDeserialize};

#[derive(
    CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash,
)]
pub struct EventMetadata {
    pub signer: solana_pubkey::Pubkey,
    pub pair: solana_pubkey::Pubkey,
    pub timestamp: i64,
}
