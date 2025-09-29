use solana_pubkey::Pubkey;
use std::env;
use std::sync::LazyLock;

pub mod accounts;
pub mod instructions;
pub mod types;

pub struct OmnipairDecoder;

pub static PROGRAM_ID: LazyLock<Pubkey> = LazyLock::new(|| {
    let program_id_str = env::var("OMNIPAIR_PROGRAM_ID")
        .unwrap_or_else(|_| "3tJrAXnjofAw8oskbMaSo9oMAYuzdBgVbW3TvQLdMEBd".to_string());
    program_id_str.parse().expect("Invalid program ID")
});