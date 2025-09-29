
use super::super::types::*;

use carbon_core::{CarbonDeserialize, borsh, account_utils::next_account};


#[derive(CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash)]
#[carbon(discriminator = "0x5aadc9881cd37e3b")]
pub struct Leverage{
    pub args: LeverageArgs,
}

#[derive(Debug, PartialEq, Eq, Clone, Hash, serde::Serialize, serde::Deserialize)]
pub struct LeverageInstructionAccounts {
    pub pair: solana_pubkey::Pubkey,
    pub rate_model: solana_pubkey::Pubkey,
    pub leveraged_position: solana_pubkey::Pubkey,
    pub debt_vault: solana_pubkey::Pubkey,
    pub collateral_vault: solana_pubkey::Pubkey,
    pub debt_mint: solana_pubkey::Pubkey,
    pub collateral_mint: solana_pubkey::Pubkey,
    pub user: solana_pubkey::Pubkey,
    pub token_program: solana_pubkey::Pubkey,
    pub token_2022_program: solana_pubkey::Pubkey,
    pub system_program: solana_pubkey::Pubkey,
    pub event_authority: solana_pubkey::Pubkey,
    pub program: solana_pubkey::Pubkey,
}

impl carbon_core::deserialize::ArrangeAccounts for Leverage {
    type ArrangedAccounts = LeverageInstructionAccounts;

    fn arrange_accounts(accounts: &[solana_instruction::AccountMeta]) -> Option<Self::ArrangedAccounts> {
        let mut iter = accounts.iter();
        let pair = next_account(&mut iter)?;
        let rate_model = next_account(&mut iter)?;
        let leveraged_position = next_account(&mut iter)?;
        let debt_vault = next_account(&mut iter)?;
        let collateral_vault = next_account(&mut iter)?;
        let debt_mint = next_account(&mut iter)?;
        let collateral_mint = next_account(&mut iter)?;
        let user = next_account(&mut iter)?;
        let token_program = next_account(&mut iter)?;
        let token_2022_program = next_account(&mut iter)?;
        let system_program = next_account(&mut iter)?;
        let event_authority = next_account(&mut iter)?;
        let program = next_account(&mut iter)?;

        Some(LeverageInstructionAccounts {
            pair,
            rate_model,
            leveraged_position,
            debt_vault,
            collateral_vault,
            debt_mint,
            collateral_mint,
            user,
            token_program,
            token_2022_program,
            system_program,
            event_authority,
            program,
        })
    }
}