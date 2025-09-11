

use carbon_core::{borsh, CarbonDeserialize};


#[derive(CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash)]
#[carbon(discriminator = "0xe445a52e51cb9a1df0845ce3d148b2a9")]
pub struct UserPositionCreatedEvent{
    pub user: solana_pubkey::Pubkey,
    pub pair: solana_pubkey::Pubkey,
    pub position: solana_pubkey::Pubkey,
    pub timestamp: i64,
}
