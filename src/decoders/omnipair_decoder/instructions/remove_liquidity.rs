
use super::super::types::*;

use carbon_core::{CarbonDeserialize, borsh, account_utils::next_account};


#[derive(CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash)]
#[carbon(discriminator = "0x5055d14818ceb16c")]
pub struct RemoveLiquidity{
    pub args: RemoveLiquidityArgs,
}

#[derive(Debug, PartialEq, Eq, Clone, Hash, serde::Serialize, serde::Deserialize)]
pub struct RemoveLiquidityInstructionAccounts {
    pub pair: solana_pubkey::Pubkey,
    pub rate_model: solana_pubkey::Pubkey,
    pub token0_vault: solana_pubkey::Pubkey,
    pub token1_vault: solana_pubkey::Pubkey,
    pub user_token0_account: solana_pubkey::Pubkey,
    pub user_token1_account: solana_pubkey::Pubkey,
    pub token0_vault_mint: solana_pubkey::Pubkey,
    pub token1_vault_mint: solana_pubkey::Pubkey,
    pub lp_mint: solana_pubkey::Pubkey,
    pub user_lp_token_account: solana_pubkey::Pubkey,
    pub user: solana_pubkey::Pubkey,
    pub token_program: solana_pubkey::Pubkey,
    pub token_2022_program: solana_pubkey::Pubkey,
    pub associated_token_program: solana_pubkey::Pubkey,
    pub system_program: solana_pubkey::Pubkey,
    pub event_authority: solana_pubkey::Pubkey,
    pub program: solana_pubkey::Pubkey,
}

impl carbon_core::deserialize::ArrangeAccounts for RemoveLiquidity {
    type ArrangedAccounts = RemoveLiquidityInstructionAccounts;

    fn arrange_accounts(accounts: &[solana_instruction::AccountMeta]) -> Option<Self::ArrangedAccounts> {
        let mut iter = accounts.iter();
        let pair = next_account(&mut iter)?;
        let rate_model = next_account(&mut iter)?;
        let token0_vault = next_account(&mut iter)?;
        let token1_vault = next_account(&mut iter)?;
        let user_token0_account = next_account(&mut iter)?;
        let user_token1_account = next_account(&mut iter)?;
        let token0_vault_mint = next_account(&mut iter)?;
        let token1_vault_mint = next_account(&mut iter)?;
        let lp_mint = next_account(&mut iter)?;
        let user_lp_token_account = next_account(&mut iter)?;
        let user = next_account(&mut iter)?;
        let token_program = next_account(&mut iter)?;
        let token_2022_program = next_account(&mut iter)?;
        let associated_token_program = next_account(&mut iter)?;
        let system_program = next_account(&mut iter)?;
        let event_authority = next_account(&mut iter)?;
        let program = next_account(&mut iter)?;

        Some(RemoveLiquidityInstructionAccounts {
            pair,
            rate_model,
            token0_vault,
            token1_vault,
            user_token0_account,
            user_token1_account,
            token0_vault_mint,
            token1_vault_mint,
            lp_mint,
            user_lp_token_account,
            user,
            token_program,
            token_2022_program,
            associated_token_program,
            system_program,
            event_authority,
            program,
        })
    }
}