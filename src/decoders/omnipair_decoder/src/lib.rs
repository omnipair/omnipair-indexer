use solana_pubkey::Pubkey;

pub mod accounts;
pub mod instructions;
pub mod types;

pub struct OmnipairDecoder;
pub const PROGRAM_ID: Pubkey =
    Pubkey::from_str_const("3tJrAXnjofAw8oskbMaSo9oMAYuzdBgVbW3TvQLdMEBd");
