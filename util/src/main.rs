use std::path::{Path, PathBuf};
use std::result::Result;
use std::error::Error;
use clap::{arg, command, value_parser, ArgAction, Command};
use rocksdb::{DB, Options};
use data_encoding::BASE32HEX_NOPAD;
fn main () -> Result<(), Box<dyn Error>> {
    let cli = command!()
        .arg(arg!([path] "Path to data directory")
            .value_parser(value_parser!(PathBuf)));
    let args = cli.get_matches();

    let path = args.get_one::<PathBuf>("path").expect("pass a path");
    let db = DB::open_cf_for_read_only(&Default::default(), path, ["state", "block"], false)?;

    let state_cf = db.cf_handle("state").expect("no cf: state");
    let h = db.get_cf(state_cf, "height")?.expect("no height in state cf");
    let height = u64::from_le_bytes([h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]]);
    println!("{height:?}");

    let block_cf = db.cf_handle("block").expect("no cf: block");
    let prefix = BASE32HEX_NOPAD.encode(&height.to_be_bytes());
    let key = format!("{prefix}/epoch");
    let err = format!("no epoch in block cf, key: {key:x?}");
    let e = db.get_cf(block_cf, &key)?.expect(&err);
    let epoch = u64::from_le_bytes([e[0], e[1], e[2], e[3], e[4], e[5], e[6], e[7]]);
    println!("{epoch:?}");
    Ok(())
}
