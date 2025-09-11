

use carbon_core::{borsh, CarbonDeserialize};


#[derive(CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash)]
#[carbon(discriminator = "0xe445a52e51cb9a1d21592f75527ceefa")]
pub struct BurnEvent{
    pub user: solana_pubkey::Pubkey,
    pub amount0: u64,
    pub amount1: u64,
    pub liquidity: u64,
    pub timestamp: i64,
}
