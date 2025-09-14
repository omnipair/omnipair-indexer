use std::env;
use clap::Parser;

#[derive(Parser, Debug)]
#[command(version, about = "Omnipair Indexer Daemon")]
pub struct Args {
    /// RPC WebSocket URL (falls back to RPC_WS_URL env) - used for account monitoring
    #[arg(long)]
    pub rpc_ws_url: Option<String>,

    /// Helius API key for transaction monitoring (falls back to HELIUS_API_KEY env)
    #[arg(long)]
    pub helius_api_key: Option<String>,

    /// Enable account monitoring via RPC program subscribe (default: false)
    #[arg(long, default_value_t = false)]
    pub enable_account_monitoring: bool,

    /// Health check port (0 disables /health endpoint)
    #[arg(long, default_value_t = 8080)]
    pub health_port: u16,
}

#[derive(Debug, Clone)]
pub struct Config {
    pub helius_api_key: Option<String>,
    pub rpc_ws_url: Option<String>,
    pub health_port: u16,
}

impl Config {
    pub fn from_args(args: Args) -> Self {
        let helius_api_key = args.helius_api_key.or_else(|| env::var("HELIUS_API_KEY").ok());
        
        let rpc_ws_url = if args.enable_account_monitoring {
            Some(args.rpc_ws_url.unwrap_or_else(|| {
                env::var("RPC_WS_URL").unwrap_or_else(|_| "wss://api.mainnet-beta.solana.com/".to_string())
            }))
        } else {
            None
        };

        Self {
            helius_api_key,
            rpc_ws_url,
            health_port: args.health_port,
        }
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.helius_api_key.is_none() {
            return Err("HELIUS_API_KEY is required for transaction monitoring".to_string());
        }
        Ok(())
    }

    pub fn log_configuration(&self) {
        log::info!("Configuration:");
        
        if self.helius_api_key.is_some() {
            log::info!("  Transaction monitoring: Helius Atlas WebSocket");
        } else {
            log::error!("  HELIUS_API_KEY is required for transaction monitoring");
        }
        
        if let Some(ref url) = self.rpc_ws_url {
            log::info!("  Account monitoring: Enabled via {}", url);
        } else {
            log::info!("  Account monitoring: Disabled");
        }

        if self.health_port != 0 {
            log::info!("  Health check server: Port {}", self.health_port);
        } else {
            log::info!("  Health check server: Disabled");
        }
    }
}
