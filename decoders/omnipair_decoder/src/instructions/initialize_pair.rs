
use super::super::types::*;

use carbon_core::{CarbonDeserialize, borsh, account_utils::next_account};


#[derive(CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash)]
#[carbon(discriminator = "0xb172e222ba9605f5")]
pub struct InitializePair{
    pub args: InitializePairArgs,
}

#[derive(Debug, PartialEq, Eq, Clone, Hash, serde::Serialize, serde::Deserialize)]
pub struct InitializePairInstructionAccounts {
    pub deployer: solana_pubkey::Pubkey,
    pub token0_mint: solana_pubkey::Pubkey,
    pub token1_mint: solana_pubkey::Pubkey,
    pub pair: solana_pubkey::Pubkey,
    pub pair_config: solana_pubkey::Pubkey,
    pub rate_model: solana_pubkey::Pubkey,
    pub lp_mint: solana_pubkey::Pubkey,
    pub deployer_lp_token_account: solana_pubkey::Pubkey,
    pub system_program: solana_pubkey::Pubkey,
    pub token_program: solana_pubkey::Pubkey,
    pub associated_token_program: solana_pubkey::Pubkey,
    pub rent: solana_pubkey::Pubkey,
    pub event_authority: solana_pubkey::Pubkey,
    pub program: solana_pubkey::Pubkey,
}

impl carbon_core::deserialize::ArrangeAccounts for InitializePair {
    type ArrangedAccounts = InitializePairInstructionAccounts;

    fn arrange_accounts(accounts: &[solana_instruction::AccountMeta]) -> Option<Self::ArrangedAccounts> {
        let mut iter = accounts.iter();
        let deployer = next_account(&mut iter)?;
        let token0_mint = next_account(&mut iter)?;
        let token1_mint = next_account(&mut iter)?;
        let pair = next_account(&mut iter)?;
        let pair_config = next_account(&mut iter)?;
        let rate_model = next_account(&mut iter)?;
        let lp_mint = next_account(&mut iter)?;
        let deployer_lp_token_account = next_account(&mut iter)?;
        let system_program = next_account(&mut iter)?;
        let token_program = next_account(&mut iter)?;
        let associated_token_program = next_account(&mut iter)?;
        let rent = next_account(&mut iter)?;
        let event_authority = next_account(&mut iter)?;
        let program = next_account(&mut iter)?;

        Some(InitializePairInstructionAccounts {
            deployer,
            token0_mint,
            token1_mint,
            pair,
            pair_config,
            rate_model,
            lp_mint,
            deployer_lp_token_account,
            system_program,
            token_program,
            associated_token_program,
            rent,
            event_authority,
            program,
        })
    }
}