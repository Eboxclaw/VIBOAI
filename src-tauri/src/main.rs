#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod core;

fn main() {
  core::run();
}
