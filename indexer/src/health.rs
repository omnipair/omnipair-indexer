use {
    axum::{routing::get, Json, Router},
    serde_json::{json, Value},
};

pub async fn run_health_server(port: u16) {
    let app = Router::new()
        .route("/health", get(health_check))
        .route("/", get(health_check)); // Also respond to root path

    let listener = match tokio::net::TcpListener::bind(("0.0.0.0", port)).await {
        Ok(listener) => listener,
        Err(e) => {
            log::error!("Failed to bind health server to port {}: {:?}", port, e);
            return;
        }
    };

    log::info!("Health server listening on http://0.0.0.0:{}", port);
    log::info!("Health endpoint: http://0.0.0.0:{}/health", port);

    if let Err(e) = axum::serve(listener, app).await {
        log::warn!("Health server stopped: {:?}", e);
    }
}

async fn health_check() -> Json<Value> {
    Json(json!({
        "status": "healthy",
        "service": "omnipair-indexer",
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "uptime": format!("{}s", std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()),
    }))
}
