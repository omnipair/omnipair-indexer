

use carbon_core::{CarbonDeserialize, borsh};


#[derive(CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash)]
pub struct UpdateRevenueRecipientsArgs {
    pub futarchy_treasury: Option<carbon_core::deserialize::CarbonPubkey>,
    pub buybacks_vault: Option<carbon_core::deserialize::CarbonPubkey>,
    pub team_treasury: Option<carbon_core::deserialize::CarbonPubkey>,
}
