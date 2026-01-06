use carbon_core::{borsh, CarbonDeserialize};

#[derive(
    CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash,
)]
pub struct RateModel {
    pub exp_rate: u64,
    pub target_util_start: u64,
    pub target_util_end: u64,
}
