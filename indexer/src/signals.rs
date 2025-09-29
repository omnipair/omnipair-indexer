use tokio_util::sync::CancellationToken;

/// Handles system shutdown signals (SIGTERM, SIGINT) on Unix systems
pub async fn shutdown_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};
        
        let mut sigterm = signal(SignalKind::terminate()).unwrap();
        let mut sigint = signal(SignalKind::interrupt()).unwrap();
        
        tokio::select! {
            _ = sigterm.recv() => {
                log::info!("Received SIGTERM");
            }
            _ = sigint.recv() => {
                log::info!("Received SIGINT");
            }
        }
    }
    
    #[cfg(not(unix))]
    {
        // On non-Unix systems, just wait indefinitely
        // The ctrl_c handler above will handle shutdown
        std::future::pending::<()>().await;
    }
}

/// Creates a cancellation token that gets triggered on system shutdown signals
pub fn shutdown_signal_token() -> CancellationToken {
    let token = CancellationToken::new();
    let token_clone = token.clone();
    
    tokio::spawn(async move {
        shutdown_signal().await;
        token_clone.cancel();
    });
    
    token
}
