use carbon_core::{borsh, CarbonDeserialize};

#[derive(
    CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash,
)]
pub struct EmitValueArgs {
    pub debt_amount: Option<u64>,
    pub collateral_amount: Option<u64>,
    pub collateral_token: Option<solana_pubkey::Pubkey>,
}
