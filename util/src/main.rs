use std::path::{Path, PathBuf};
use std::result::Result;
use std::error::Error;
use clap::{arg, command, value_parser, ArgAction, Command};
use rocksdb::{DB, Options};
fn main () -> Result<(), Box<dyn Error>> {
    let cli = command!()
        .arg(arg!([path] "Path to data directory")
            .value_parser(value_parser!(PathBuf)));
    let args = cli.get_matches();
    let path = args.get_one::<PathBuf>("path").expect("pass a path");
    let db = DB::open_cf_for_read_only(&Default::default(), path, ["state"], false)?;
    let cf = db.cf_handle("state").expect("no state");
    if let Some(height) = db.get_cf(cf, "height")? {
        let height = u64::from_le_bytes([
            height[0], height[1], height[2], height[3],
            height[4], height[5], height[6], height[7],
        ]);
        println!("{height:?}");
    }
    Ok(())
}
