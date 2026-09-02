

use carbon_core::{CarbonDeserialize, borsh};


#[derive(CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash)]
pub struct InitFutarchyAuthorityArgs {
    pub authority: carbon_core::deserialize::CarbonPubkey,
    pub swap_bps: u16,
    pub interest_bps: u16,
    pub futarchy_treasury: carbon_core::deserialize::CarbonPubkey,
    pub futarchy_treasury_bps: u16,
    pub buybacks_vault: carbon_core::deserialize::CarbonPubkey,
    pub buybacks_vault_bps: u16,
    pub team_treasury: carbon_core::deserialize::CarbonPubkey,
    pub team_treasury_bps: u16,
}
