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
