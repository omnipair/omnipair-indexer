

use carbon_core::{CarbonDeserialize, borsh, account_utils::next_account};


#[derive(CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash)]
#[carbon(discriminator = "0xdfb3e27d302e274a")]
pub struct Liquidate{
}

#[derive(Debug, PartialEq, Eq, Clone, Hash, serde::Serialize, serde::Deserialize)]
pub struct LiquidateInstructionAccounts {
    pub pair: solana_pubkey::Pubkey,
    pub user_position: solana_pubkey::Pubkey,
    pub rate_model: solana_pubkey::Pubkey,
    pub collateral_vault: solana_pubkey::Pubkey,
    pub position_owner: solana_pubkey::Pubkey,
    pub payer: solana_pubkey::Pubkey,
    pub system_program: solana_pubkey::Pubkey,
    pub event_authority: solana_pubkey::Pubkey,
    pub program: solana_pubkey::Pubkey,
}

impl carbon_core::deserialize::ArrangeAccounts for Liquidate {
    type ArrangedAccounts = LiquidateInstructionAccounts;

    fn arrange_accounts(accounts: &[solana_instruction::AccountMeta]) -> Option<Self::ArrangedAccounts> {
        let mut iter = accounts.iter();
        let pair = next_account(&mut iter)?;
        let user_position = next_account(&mut iter)?;
        let rate_model = next_account(&mut iter)?;
        let collateral_vault = next_account(&mut iter)?;
        let position_owner = next_account(&mut iter)?;
        let payer = next_account(&mut iter)?;
        let system_program = next_account(&mut iter)?;
        let event_authority = next_account(&mut iter)?;
        let program = next_account(&mut iter)?;

        Some(LiquidateInstructionAccounts {
            pair,
            user_position,
            rate_model,
            collateral_vault,
            position_owner,
            payer,
            system_program,
            event_authority,
            program,
        })
    }
}