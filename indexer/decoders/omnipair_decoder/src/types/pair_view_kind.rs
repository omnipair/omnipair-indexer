use carbon_core::{borsh, CarbonDeserialize};

#[derive(
    CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash,
)]
pub enum PairViewKind {
    EmaPrice0Nad,
    EmaPrice1Nad,
    SpotPrice0Nad,
    SpotPrice1Nad,
    K,
    GetRates,
    GetBorrowLimitAndCfBpsForCollateral,
}
