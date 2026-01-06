use carbon_core::{borsh, CarbonDeserialize};

#[derive(
    CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash,
)]
pub enum UserPositionViewKind {
    UserBorrowingPower,
    UserAppliedCollateralFactorBps,
    UserLiquidationCollateralFactorBps,
    UserDebtUtilizationBps,
    UserLiquidationPrice,
    UserDebtWithInterest,
}
