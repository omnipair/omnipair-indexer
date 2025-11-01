

use carbon_core::{CarbonDeserialize, borsh, account_utils::next_account};


#[derive(CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash)]
#[carbon(discriminator = "0x2fe5dd5800389c26")]
pub struct FaucetMint{
}

#[derive(Debug, PartialEq, Eq, Clone, Hash, serde::Serialize, serde::Deserialize)]
pub struct FaucetMintInstructionAccounts {
    pub user: solana_pubkey::Pubkey,
    pub faucet_authority: solana_pubkey::Pubkey,
    pub pair: solana_pubkey::Pubkey,
    pub user_token0_account: solana_pubkey::Pubkey,
    pub user_token1_account: solana_pubkey::Pubkey,
    pub token0_mint: solana_pubkey::Pubkey,
    pub token1_mint: solana_pubkey::Pubkey,
    pub system_program: solana_pubkey::Pubkey,
    pub token_program: solana_pubkey::Pubkey,
    pub associated_token_program: solana_pubkey::Pubkey,
}

impl carbon_core::deserialize::ArrangeAccounts for FaucetMint {
    type ArrangedAccounts = FaucetMintInstructionAccounts;

    fn arrange_accounts(accounts: &[solana_instruction::AccountMeta]) -> Option<Self::ArrangedAccounts> {
        let mut iter = accounts.iter();
        let user = next_account(&mut iter)?;
        let faucet_authority = next_account(&mut iter)?;
        let pair = next_account(&mut iter)?;
        let user_token0_account = next_account(&mut iter)?;
        let user_token1_account = next_account(&mut iter)?;
        let token0_mint = next_account(&mut iter)?;
        let token1_mint = next_account(&mut iter)?;
        let system_program = next_account(&mut iter)?;
        let token_program = next_account(&mut iter)?;
        let associated_token_program = next_account(&mut iter)?;

        Some(FaucetMintInstructionAccounts {
            user,
            faucet_authority,
            pair,
            user_token0_account,
            user_token1_account,
            token0_mint,
            token1_mint,
            system_program,
            token_program,
            associated_token_program,
        })
    }
}