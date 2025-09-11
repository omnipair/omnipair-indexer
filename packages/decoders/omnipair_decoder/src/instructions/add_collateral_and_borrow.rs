
use super::super::types::*;

use carbon_core::{CarbonDeserialize, borsh, account_utils::next_account};


#[derive(CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash)]
#[carbon(discriminator = "0x1e9b3e04583e2adf")]
pub struct AddCollateralAndBorrow{
    pub args: AddCollateralAndBorrowArgs,
}

#[derive(Debug, PartialEq, Eq, Clone, Hash, serde::Serialize, serde::Deserialize)]
pub struct AddCollateralAndBorrowInstructionAccounts {
    pub pair: solana_pubkey::Pubkey,
    pub rate_model: solana_pubkey::Pubkey,
    pub user_position: solana_pubkey::Pubkey,
    pub collateral_vault: solana_pubkey::Pubkey,
    pub user_collateral_token_account: solana_pubkey::Pubkey,
    pub collateral_token_mint: solana_pubkey::Pubkey,
    pub borrow_vault: solana_pubkey::Pubkey,
    pub user_borrow_token_account: solana_pubkey::Pubkey,
    pub borrow_token_mint: solana_pubkey::Pubkey,
    pub user: solana_pubkey::Pubkey,
    pub token_program: solana_pubkey::Pubkey,
    pub token_2022_program: solana_pubkey::Pubkey,
    pub system_program: solana_pubkey::Pubkey,
    pub event_authority: solana_pubkey::Pubkey,
    pub program: solana_pubkey::Pubkey,
}

impl carbon_core::deserialize::ArrangeAccounts for AddCollateralAndBorrow {
    type ArrangedAccounts = AddCollateralAndBorrowInstructionAccounts;

    fn arrange_accounts(accounts: &[solana_instruction::AccountMeta]) -> Option<Self::ArrangedAccounts> {
        let mut iter = accounts.iter();
        let pair = next_account(&mut iter)?;
        let rate_model = next_account(&mut iter)?;
        let user_position = next_account(&mut iter)?;
        let collateral_vault = next_account(&mut iter)?;
        let user_collateral_token_account = next_account(&mut iter)?;
        let collateral_token_mint = next_account(&mut iter)?;
        let borrow_vault = next_account(&mut iter)?;
        let user_borrow_token_account = next_account(&mut iter)?;
        let borrow_token_mint = next_account(&mut iter)?;
        let user = next_account(&mut iter)?;
        let token_program = next_account(&mut iter)?;
        let token_2022_program = next_account(&mut iter)?;
        let system_program = next_account(&mut iter)?;
        let event_authority = next_account(&mut iter)?;
        let program = next_account(&mut iter)?;

        Some(AddCollateralAndBorrowInstructionAccounts {
            pair,
            rate_model,
            user_position,
            collateral_vault,
            user_collateral_token_account,
            collateral_token_mint,
            borrow_vault,
            user_borrow_token_account,
            borrow_token_mint,
            user,
            token_program,
            token_2022_program,
            system_program,
            event_authority,
            program,
        })
    }
}