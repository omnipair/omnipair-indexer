use {
    solana_pubkey::Pubkey,
    std::{env, sync::LazyLock},
};

pub mod accounts;
pub mod instructions;
pub mod types;

pub struct OmnipairDecoder;

#[allow(clippy::panic)] // Program cannot function without valid program ID
pub static PROGRAM_ID: LazyLock<Pubkey> = LazyLock::new(|| {
    let program_id_str = env::var("OMNIPAIR_PROGRAM_ID")
        .unwrap_or_else(|_| "3tJrAXnjofAw8oskbMaSo9oMAYuzdBgVbW3TvQLdMEBd".to_string());
    program_id_str
        .parse()
        .unwrap_or_else(|e| panic!("Invalid OMNIPAIR_PROGRAM_ID '{}': {}", program_id_str, e))
});
