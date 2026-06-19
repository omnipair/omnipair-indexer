// This V2 decoder code is generated from
// packages/program-interface/src/idl_v2.json.
use carbon_core::{CarbonDeserialize, borsh};

#[derive(
    CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash,
)]
pub struct SetMarketReduceOnlyArgs {
    pub reduce_only: bool,
}
