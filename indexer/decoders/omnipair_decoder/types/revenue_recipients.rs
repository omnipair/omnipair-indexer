

use carbon_core::{CarbonDeserialize, borsh};


#[derive(CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash)]
pub struct RevenueRecipients {
    pub futarchy_treasury: carbon_core::deserialize::CarbonPubkey,
    pub buybacks_vault: carbon_core::deserialize::CarbonPubkey,
    pub team_treasury: carbon_core::deserialize::CarbonPubkey,
}
