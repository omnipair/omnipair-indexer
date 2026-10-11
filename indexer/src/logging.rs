//! One JSON line per log record, on stdout.
//!
//! Railway colours a log line by the `level` of a one-line JSON object and
//! files every plain line written to stderr as an error. env_logger writes
//! plain lines to stderr, so every INFO line showed in red. Each record is
//! now a JSON object carrying its own level, on stdout, and a multi-line
//! message stays one entry. `RUST_LOG` filters as before.

use std::io::Write as _;

pub fn init() {
    env_logger::Builder::from_default_env()
        .target(env_logger::Target::Stdout)
        .format(|buf, record| writeln!(buf, "{}", line(record)))
        .init();
}

fn line(record: &log::Record) -> serde_json::Value {
    let level = match record.level() {
        log::Level::Error => "error",
        log::Level::Warn => "warn",
        log::Level::Info => "info",
        log::Level::Debug | log::Level::Trace => "debug",
    };
    serde_json::json!({
        "level": level,
        "message": record.args().to_string(),
        "target": record.target(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn records_become_one_json_line_with_their_level() {
        let warn = line(
            &log::Record::builder()
                .args(format_args!("catch-up from slot {}\nreplayed", 7))
                .level(log::Level::Warn)
                .target("catchup")
                .build(),
        );
        assert_eq!(warn["level"], "warn");
        assert_eq!(warn["message"], "catch-up from slot 7\nreplayed");
        assert_eq!(warn["target"], "catchup");
        assert!(!warn.to_string().contains('\n'));

        let trace = line(
            &log::Record::builder()
                .args(format_args!("detail"))
                .level(log::Level::Trace)
                .target("pipeline")
                .build(),
        );
        assert_eq!(trace["level"], "debug");
    }
}
