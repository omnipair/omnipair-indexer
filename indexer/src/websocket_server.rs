//! WebSocket server that broadcasts SwapEvents to connected clients

use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{Arc, RwLock},
};

use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, State},
    response::Response,
    routing::get,
    Router,
};
use futures::{sink::SinkExt, stream::StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::{broadcast, mpsc};
use tokio_util::sync::CancellationToken;

use carbon_core::error::CarbonResult;
use carbon_omnipair_decoder::instructions::swap_event::SwapEvent;

/// WebSocket server configuration
#[derive(Debug, Clone)]
pub struct WebSocketConfig {
    /// Port to bind the WebSocket server
    pub port: u16,
}

impl Default for WebSocketConfig {
    fn default() -> Self {
        Self {
            port: 8081,
        }
    }
}

/// Messages sent to WebSocket clients
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    /// Welcome message when client connects
    Welcome {
        client_id: String,
        message: String,
    },
    /// SwapEvent broadcast with essential data only
    SwapEvent {
        pair: String,
        price: f64, // reserve1/reserve0 ratio
        timestamp: i64,
    },
}

/// Client connection information
#[derive(Debug)]
struct ClientConnection {
    id: String,
    sender: mpsc::UnboundedSender<ClientMessage>,
}

/// WebSocket server state that can be shared across the application
#[derive(Clone)]
pub struct WebSocketServerState {
    /// Connected clients
    clients: Arc<RwLock<HashMap<String, ClientConnection>>>,
    /// Broadcast channel for sending events to all subscribers
    event_sender: broadcast::Sender<ClientMessage>,
}

impl WebSocketServerState {
    pub fn new() -> Self {
        let (event_sender, _) = broadcast::channel(10000);
        
        Self {
            clients: Arc::new(RwLock::new(HashMap::new())),
            event_sender,
        }
    }

    /// Broadcast a SwapEvent to all connected clients
    pub fn broadcast_swap_event(&self, swap_event: &SwapEvent, _tx_signature: &str, _slot: i64) {
        // Calculate price as reserve1/reserve0 ratio
        let price = if swap_event.reserve0 > 0 {
            swap_event.reserve1 as f64 / swap_event.reserve0 as f64
        } else {
            0.0
        };

        let message = ClientMessage::SwapEvent {
            pair: swap_event.metadata.pair.to_string(),
            price,
            timestamp: swap_event.metadata.timestamp,
        };

        if let Err(e) = self.event_sender.send(message) {
            log::warn!("Failed to broadcast swap event: {}", e);
        }
    }

    /// Get the number of connected clients
    pub fn client_count(&self) -> usize {
        self.clients.read().unwrap().len()
    }

    /// Add a new client connection
    fn add_client(&self, client: ClientConnection) {
        let client_id = client.id.clone();
        self.clients.write().unwrap().insert(client_id.clone(), client);
        log::info!("Client {} connected. Total clients: {}", client_id, self.client_count());
    }

    /// Remove a client connection
    fn remove_client(&self, client_id: &str) {
        self.clients.write().unwrap().remove(client_id);
        log::info!("Client {} disconnected. Total clients: {}", client_id, self.client_count());
    }
}

/// Start the WebSocket server and return the state for broadcasting
pub async fn start_websocket_server(
    config: WebSocketConfig,
    cancellation_token: CancellationToken,
) -> CarbonResult<WebSocketServerState> {
    let state = WebSocketServerState::new();
    let app_state = state.clone();

    // Create the router
    let app = Router::new()
        .route("/ws", get(websocket_handler))
        .route("/health", get(health_handler))
        .route("/stats", get(stats_handler))
        .with_state(app_state);

    // Bind to address
    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    log::info!("Starting WebSocket server on {}", addr);

    // Start the server
    let listener = tokio::net::TcpListener::bind(addr).await
        .map_err(|e| carbon_core::error::Error::Custom(format!("Failed to bind WebSocket server: {}", e)))?;

    // Start server task
    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                cancellation_token.cancelled().await;
            })
            .await
        {
            log::error!("WebSocket server error: {}", e);
        }
    });

    log::info!("WebSocket server started successfully");
    Ok(state)
}

/// WebSocket upgrade handler
async fn websocket_handler(
    ws: WebSocketUpgrade,
    State(state): State<WebSocketServerState>,
) -> Response {
    ws.on_upgrade(move |socket| handle_websocket_connection(socket, state))
}

/// Health check handler
async fn health_handler() -> &'static str {
    "OK"
}

/// Statistics handler
async fn stats_handler(State(state): State<WebSocketServerState>) -> String {
    format!("{{\"connected_clients\": {}}}", state.client_count())
}

/// Handle a new WebSocket connection
async fn handle_websocket_connection(socket: WebSocket, state: WebSocketServerState) {
    let client_id = uuid::Uuid::new_v4().to_string();
    log::info!("New WebSocket connection: {}", client_id);

    // Create client message channel
    let (client_sender, mut client_receiver) = mpsc::unbounded_channel();

    // Add client to state
    let client = ClientConnection {
        id: client_id.clone(),
        sender: client_sender,
    };
    state.add_client(client);

    // Subscribe to event broadcasts
    let mut event_receiver = state.event_sender.subscribe();

    // Split the WebSocket
    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Send welcome message
    let welcome_message = ClientMessage::Welcome {
        client_id: client_id.clone(),
        message: "Welcome to Omnipair Indexer! You will receive live SwapEvents.".to_string(),
    };

    if let Ok(msg) = serde_json::to_string(&welcome_message) {
        if let Err(e) = ws_sender.send(Message::Text(msg)).await {
            log::warn!("Failed to send welcome message to {}: {}", client_id, e);
            state.remove_client(&client_id);
            return;
        }
    }

    // Handle incoming messages (for potential future control messages)
    let incoming_client_id = client_id.clone();
    let incoming_task = tokio::spawn(async move {
        while let Some(msg) = ws_receiver.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    log::debug!("Received message from {}: {}", incoming_client_id, text);
                    // Handle control messages if needed
                }
                Ok(Message::Close(_)) => {
                    log::info!("Client {} requested close", incoming_client_id);
                    break;
                }
                Err(e) => {
                    log::warn!("WebSocket error for client {}: {}", incoming_client_id, e);
                    break;
                }
                _ => {}
            }
        }
    });

    // Handle outgoing messages
    let outgoing_client_id = client_id.clone();
    let outgoing_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                // Messages from client-specific channel
                client_msg = client_receiver.recv() => {
                    match client_msg {
                        Some(msg) => {
                            if let Ok(json) = serde_json::to_string(&msg) {
                                if let Err(e) = ws_sender.send(Message::Text(json)).await {
                                    log::warn!("Failed to send message to client {}: {}", outgoing_client_id, e);
                                    break;
                                }
                            }
                        }
                        None => break,
                    }
                }
                // Broadcast events
                broadcast_msg = event_receiver.recv() => {
                    match broadcast_msg {
                        Ok(msg) => {
                            if let Ok(json) = serde_json::to_string(&msg) {
                                if let Err(e) = ws_sender.send(Message::Text(json)).await {
                                    log::warn!("Failed to send broadcast to client {}: {}", outgoing_client_id, e);
                                    break;
                                }
                            }
                        }
                        Err(broadcast::error::RecvError::Lagged(skipped)) => {
                            log::warn!("Client {} lagged, skipped {} messages", outgoing_client_id, skipped);
                        }
                        Err(broadcast::error::RecvError::Closed) => {
                            log::info!("Broadcast channel closed");
                            break;
                        }
                    }
                }
            }
        }
    });

    // Wait for either task to complete
    tokio::select! {
        _ = incoming_task => {},
        _ = outgoing_task => {},
    }

    // Clean up
    state.remove_client(&client_id);
}