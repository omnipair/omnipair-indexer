use sqlx::postgres::{PgListener, PgPool};
use tokio::sync::broadcast;

use crate::grpc_server::stream::SwapsUpdate;

pub async fn start_db_listener(
    pool: &PgPool,
    sender: broadcast::Sender<SwapsUpdate>,
) -> Result<(), Box<dyn std::error::Error>> {
    log::info!("Starting PostgreSQL LISTEN/NOTIFY listener on channel 'swap_updates'");

    let mut listener = PgListener::connect_with(pool).await?;
    listener.listen("swap_updates").await?;

    log::info!("Successfully connected to PostgreSQL LISTEN channel");

    loop {
        match listener.recv().await {
            Ok(notification) => {
                log::debug!("Received notification: {}", notification.payload());

                match serde_json::from_str::<SwapsUpdate>(notification.payload()) {
                    Ok(payload) => {
                        log::info!(
                            "Parsed swap notification - Pair: {}, User: {}, Token0In: {}, AmountIn: {}, AmountOut: {}, TxSig: {}",
                            payload.pair,
                            payload.user_address,
                            payload.is_token0_in,
                            payload.amount_in,
                            payload.amount_out,
                            payload.tx_sig
                        );

                        // Broadcast to all subscribed clients
                        // Ignore error if no receivers are listening
                        match sender.send(payload) {
                            Ok(receiver_count) => {
                                log::debug!("Broadcasted to {} gRPC clients", receiver_count);
                            }
                            Err(_) => {
                                log::debug!("No gRPC clients connected, skipping broadcast");
                            }
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
                                tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("Failed to reconnect to PostgreSQL: {}", e);
                        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                    }
                }
            }
        }
    }
}
