// This V2 decoder code is generated from
// packages/program-interface/src/idl_v2.json.
use {
    super::*,
    carbon_core::{CarbonDeserialize, borsh},
};

#[derive(
    CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash,
)]
pub struct SwapArgs {
    pub asset_in: MarketAsset,
    pub exact_asset_in: u64,
    pub min_asset_out: u64,
}
