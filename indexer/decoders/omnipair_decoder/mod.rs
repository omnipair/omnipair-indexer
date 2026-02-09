use solana_pubkey::Pubkey;
use std::sync::LazyLock;
use std::env;

pub static PROGRAM_ID: LazyLock<Pubkey> = LazyLock::new(|| {
    let program_id_str = env::var("OMNIPAIR_PROGRAM_ID")
        .unwrap_or_else(|_| "omnixgS8fnqHfCcTGKWj6JtKjzpJZ1Y5y9pyFkQDkYE".to_string());
    program_id_str.parse().expect("Invalid program ID")
});

pub struct OmnipairDecoder;
pub mod accounts;
pub mod instructions;
pub mod types;