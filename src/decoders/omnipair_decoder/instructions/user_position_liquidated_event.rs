

use carbon_core::{borsh, CarbonDeserialize};


#[derive(CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash)]
#[carbon(discriminator = "0xe445a52e51cb9a1ddc89d903f2beeed8")]
pub struct UserPositionLiquidatedEvent{
    pub user: solana_pubkey::Pubkey,
    pub pair: solana_pubkey::Pubkey,
    pub position: solana_pubkey::Pubkey,
    pub liquidator: solana_pubkey::Pubkey,
    pub collateral0_liquidated: u64,
    pub collateral1_liquidated: u64,
    pub debt0_liquidated: u64,
    pub debt1_liquidated: u64,
    pub collateral_price: u64,
    pub liquidation_bonus_applied: u64,
    pub k0: u128,
    pub k1: u128,
    pub timestamp: i64,
}
