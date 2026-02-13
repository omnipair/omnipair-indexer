use sqlx::postgres::{PgListener, PgPool};
use std::collections::HashMap;
use tokio::sync::broadcast;
use tokio::time::{Duration, Instant, interval};

use crate::grpc_server::stream::SwapsUpdate;

/// How long to hold an INSERT notification waiting for the enriched UPDATE.
/// Configurable via GRPC_DEDUP_TIMEOUT_SECS env var (default: 5).
fn dedup_timeout() -> Duration {
    let secs = std::env::var("GRPC_DEDUP_TIMEOUT_SECS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(5);
    Duration::from_secs(secs)
}

/// How often to check for timed-out entries in the buffer.
/// Configurable via GRPC_DEDUP_TICK_SECS env var (default: 1).
fn tick_interval_duration() -> Duration {
    let secs = std::env::var("GRPC_DEDUP_TICK_SECS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(1);
    Duration::from_secs(secs)
}

/// Intermediate struct for parsing notifications that includes the `op` field
#[derive(serde::Deserialize, Debug)]
struct SwapNotification {
    #[serde(default)]
    op: String,
    #[serde(flatten)]
    swap: SwapsUpdate,
}

pub async fn start_db_listener(
    pool: &PgPool,
    sender: broadcast::Sender<SwapsUpdate>,
) -> Result<(), Box<dyn std::error::Error>> {
    log::info!("Starting PostgreSQL LISTEN/NOTIFY listener on channel 'swap_updates'");

    let mut listener = PgListener::connect_with(pool).await?;
    listener.listen("swap_updates").await?;

    log::info!("Successfully connected to PostgreSQL LISTEN channel");

    // Dedup buffer: tx_sig -> (SwapsUpdate, insert_time)
    let mut buffer: HashMap<String, (SwapsUpdate, Instant)> = HashMap::new();
    let dedup_timeout_dur = dedup_timeout();
    let mut tick = interval(tick_interval_duration());

    log::info!("Dedup buffer: timeout={}s, tick={}s (configurable via GRPC_DEDUP_TIMEOUT_SECS, GRPC_DEDUP_TICK_SECS)",
        dedup_timeout_dur.as_secs(),
        tick_interval_duration().as_secs()
    );

    loop {
        tokio::select! {
            // Handle incoming notifications
            notification = listener.recv() => {
                match notification {
                    Ok(notification) => {
                        log::debug!("Received notification: {}", notification.payload());

                        match serde_json::from_str::<SwapNotification>(notification.payload()) {
                            Ok(mut notif) => {
                                // Calculate price as reserve1/reserve0 ratio
                                let reserve0: f64 = notif.swap.reserve0.parse().unwrap_or(0.0);
                                let reserve1: f64 = notif.swap.reserve1.parse().unwrap_or(0.0);
                                notif.swap.price = if reserve0 > 0.0 {
                                    (reserve1 / reserve0) as f32
                                } else {
                                    0.0
                                };

                                let tx_sig = notif.swap.tx_sig.clone();
                                let op = notif.op.to_uppercase();

                                if op == "INSERT" {
                                    // INSERT: hold in buffer, wait for enriched UPDATE
                                    log::info!(
                                        "Swap INSERT buffered - Pair: {}, TxSig: {}, waiting for volume enrichment",
                                        notif.swap.pair, tx_sig
                                    );
                                    buffer.insert(tx_sig, (notif.swap, Instant::now()));
                                } else if op == "UPDATE" {
                                    // UPDATE: enriched swap arrived
                                    if buffer.remove(&tx_sig).is_some() {
                                        // Was in buffer, emit the enriched version
                                        log::info!(
                                            "Swap enriched - Pair: {}, TxSig: {}, VolumeUSD: {}",
                                            notif.swap.pair, tx_sig, notif.swap.volume_usd
                                        );
                                    } else {
                                        // UPDATE without prior INSERT (e.g., backfill), emit directly
                                        log::info!(
                                            "Swap UPDATE (no prior INSERT) - Pair: {}, TxSig: {}, VolumeUSD: {}",
                                            notif.swap.pair, tx_sig, notif.swap.volume_usd
                                        );
                                    }
                                    emit_swap(&sender, notif.swap);
                                } else {
                                    // Unknown op or missing op field (backward compat), emit immediately
                                    log::info!(
                                        "Swap notification (op={}) - Pair: {}, TxSig: {}",
                                        op, notif.swap.pair, tx_sig
                                    );
                                    buffer.remove(&tx_sig);
                                    emit_swap(&sender, notif.swap);
                                }
                            }
                            Err(e) => {
                                log::error!(
                                    "Failed to parse notification payload: {}. Payload: {}",
                                    e,
                                    notification.payload()
                                );
                            }
                        }
                    }
                    Err(e) => {
                        log::error!(
                            "Error receiving notification: {}. Will attempt to reconnect...",
                            e
                        );

                        // Attempt to reconnect
                        match PgListener::connect_with(pool).await {
                            Ok(mut new_listener) => {
                                match new_listener.listen("swap_updates").await {
                                    Ok(_) => {
                                        log::info!("Successfully reconnected to PostgreSQL LISTEN channel");
                                        listener = new_listener;
                                    }
                                    Err(e) => {
                                        log::error!("Failed to re-subscribe to channel: {}", e);
                                        tokio::time::sleep(Duration::from_secs(5)).await;
                                    }
                                }
                            }
                            Err(e) => {
                                log::error!("Failed to reconnect to PostgreSQL: {}", e);
                                tokio::time::sleep(Duration::from_secs(5)).await;
                            }
                        }
                    }
                }
            }

            // Periodic tick: flush timed-out entries from the buffer
            _ = tick.tick() => {
                let now = Instant::now();
                let timed_out: Vec<String> = buffer
                    .iter()
                    .filter(|(_, (_, inserted_at))| now.duration_since(*inserted_at) >= dedup_timeout_dur)
                    .map(|(tx_sig, _)| tx_sig.clone())
                    .collect();

                for tx_sig in timed_out {
                    if let Some((swap, _)) = buffer.remove(&tx_sig) {
                        log::warn!(
                            "Swap dedup timeout ({}s) - emitting without volume_usd - Pair: {}, TxSig: {}",
                            dedup_timeout_dur.as_secs(), swap.pair, swap.tx_sig
                        );
                        emit_swap(&sender, swap);
                    }
                }
            }
        }
    }
}

/// Emit a swap update to all connected GRPC clients
fn emit_swap(sender: &broadcast::Sender<SwapsUpdate>, swap: SwapsUpdate) {
    match sender.send(swap) {
        Ok(receiver_count) => {
            log::debug!("Broadcasted to {} gRPC clients", receiver_count);
        }
        Err(_) => {
            log::debug!("No gRPC clients connected, skipping broadcast");
        }
    }
}
