//! Capability `process.supervise` and `http.probe`: spawn a child in its own process group,
//! observe it without blocking, stop it gracefully (SIGTERM, then SIGKILL after a grace period)
//! and probe an HTTP endpoint for readiness. Everything a consumer needs to supervise a local
//! server without writing its own spawn/poll/kill code.

use super::*;
use std::ffi::{CStr, c_char};
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::process::{Child, Command, Stdio};
use std::time::Instant;

/// Grace period used when a runtime is destroyed with processes still running.
pub(crate) const DESTROY_GRACE_MS: u32 = 500;
/// Grace period used by `yolo_process_release`.
const RELEASE_GRACE_MS: u32 = 2000;
/// `YoloSpawnInfo.flags`: connect the child's stdin/stdout/stderr to the null device.
pub const YOLO_SPAWN_NULL_STDIO: u32 = 1;
/// `YoloSpawnInfo.flags`: stdin is the null device, stdout and stderr are captured (the last
/// `CAPTURE_LIMIT` bytes of each are kept) and read with `yolo_process_read`.
pub const YOLO_SPAWN_CAPTURE: u32 = 2;
/// `yolo_process_read` streams.
pub const YOLO_STREAM_STDOUT: u32 = 1;
pub const YOLO_STREAM_STDERR: u32 = 2;
/// `yolo_process_read` modes: `DRAIN` returns and clears, `PEEK` returns without clearing.
pub const YOLO_READ_DRAIN: u32 = 0;
pub const YOLO_READ_PEEK: u32 = 1;
/// Bytes kept per captured stream; older bytes are dropped.
const CAPTURE_LIMIT: usize = 64 * 1024;

#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct YoloSpawnInfo {
  pub struct_size: u32,
  pub flags: u32,
  /// UTF-8, NUL-terminated.
  pub program: *const c_char,
  /// NULL-terminated array of NUL-terminated UTF-8 arguments (not including the program), or NULL.
  pub args: *const *const c_char,
  /// NULL-terminated array of `KEY=VALUE` entries added to the inherited environment (`KEY` alone
  /// removes the variable), or NULL.
  pub env: *const *const c_char,
  /// Working directory, or NULL.
  pub cwd: *const c_char,
}

#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct YoloProcessStatus {
  pub struct_size: u32,
  /// 0 = running, 1 = exited.
  pub state: u32,
  /// Exit code, or -1 when the process was terminated by a signal.
  pub exit_code: i32,
  /// Terminating signal on Unix, 0 otherwise.
  pub signal: i32,
  pub pid: u32,
}

#[derive(Clone, Copy)]
struct ExitInfo {
  code: Option<i32>,
  signal: Option<i32>,
}

#[derive(Default)]
struct Capture {
  bytes: Mutex<Vec<u8>>,
}

impl Capture {
  /// Reads `source` until EOF into the bounded buffer.
  fn pump(self: Arc<Self>, mut source: impl Read + Send + 'static, name: &'static str) {
    let _ = std::thread::Builder::new()
      .name(format!("yolo-{name}"))
      .spawn(move || {
        let mut chunk = [0u8; 4096];
        while let Ok(n) = source.read(&mut chunk) {
          if n == 0 {
            break;
          }
          let mut bytes = lock(&self.bytes);
          bytes.extend_from_slice(&chunk[..n]);
          if bytes.len() > CAPTURE_LIMIT {
            let excess = bytes.len() - CAPTURE_LIMIT;
            bytes.drain(..excess);
          }
        }
      });
  }
}

pub(crate) struct ProcState {
  pid: u32,
  child: Mutex<Child>,
  exit: Mutex<Option<ExitInfo>>,
  stdout: Arc<Capture>,
  stderr: Arc<Capture>,
}

impl ProcState {
  fn poll(&self) -> Option<ExitInfo> {
    if let Some(info) = *lock(&self.exit) {
      return Some(info);
    }
    let status = lock(&self.child).try_wait().ok().flatten()?;
    #[cfg(unix)]
    let signal = std::os::unix::process::ExitStatusExt::signal(&status);
    #[cfg(not(unix))]
    let signal = None;
    let info = ExitInfo {
      code: status.code(),
      signal,
    };
    *lock(&self.exit) = Some(info);
    Some(info)
  }

  /// Terminates the process group: SIGTERM, then SIGKILL once `grace_ms` elapsed. Reaps the child.
  pub(crate) fn stop(&self, grace_ms: u32) {
    if self.poll().is_some() {
      return;
    }
    #[cfg(unix)]
    {
      // SAFETY: plain syscall on a process group we created (`process_group(0)`).
      unsafe { libc::kill(-(self.pid as i32), libc::SIGTERM) };
      let deadline = Instant::now() + Duration::from_millis(u64::from(grace_ms));
      while Instant::now() < deadline {
        if self.poll().is_some() {
          return;
        }
        std::thread::sleep(Duration::from_millis(10));
      }
      // SAFETY: as above.
      unsafe { libc::kill(-(self.pid as i32), libc::SIGKILL) };
    }
    #[cfg(not(unix))]
    {
      let _ = grace_ms;
      let _ = lock(&self.child).kill();
    }
    let _ = lock(&self.child).wait();
    self.poll();
  }
}

fn read_c_string(ptr: *const c_char, what: &str) -> Result<String, YoloStatus> {
  if ptr.is_null() {
    return Err(set_error(
      YoloStatus::InvalidArgument,
      format!("{what} is null"),
    ));
  }
  // SAFETY: the caller guarantees NUL-terminated strings.
  unsafe { CStr::from_ptr(ptr) }
    .to_str()
    .map(str::to_owned)
    .map_err(|_| {
      set_error(
        YoloStatus::InvalidArgument,
        format!("{what} is not valid UTF-8"),
      )
    })
}

fn read_c_array(mut array: *const *const c_char, what: &str) -> Result<Vec<String>, YoloStatus> {
  let mut out = Vec::new();
  if array.is_null() {
    return Ok(out);
  }
  loop {
    // SAFETY: the array is NULL-terminated per the contract.
    let item = unsafe { *array };
    if item.is_null() {
      return Ok(out);
    }
    out.push(read_c_string(item, what)?);
    // SAFETY: the previous element was not the terminator.
    array = unsafe { array.add(1) };
  }
}

/// Spawns a process owned by the runtime. The child runs in its own process group so that stopping
/// it also stops its descendants. Counts against `max_operations` like an operation.
///
/// # Safety
/// `info` must point to a readable `YoloSpawnInfo` with valid strings, `out` to a writable handle.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn yolo_process_spawn(
  runtime: YoloHandle,
  info: *const YoloSpawnInfo,
  out: *mut YoloHandle,
) -> YoloStatus {
  guard(|| {
    if info.is_null() || out.is_null() {
      return set_error(YoloStatus::InvalidArgument, "null argument");
    }
    // SAFETY: readable per the contract; the first field is read before trusting the size.
    let struct_size = unsafe { ptr::addr_of!((*info).struct_size).read_unaligned() };
    if (struct_size as usize) < size_of::<YoloSpawnInfo>() {
      return set_error(YoloStatus::InvalidArgument, "struct_size too small");
    }
    // SAFETY: the structure is fully readable.
    let info = unsafe { info.read_unaligned() };
    let program = match read_c_string(info.program, "program") {
      Ok(p) => p,
      Err(status) => return status,
    };
    let args = match read_c_array(info.args, "argument") {
      Ok(a) => a,
      Err(status) => return status,
    };
    let env = match read_c_array(info.env, "environment entry") {
      Ok(e) => e,
      Err(status) => return status,
    };
    let cwd = if info.cwd.is_null() {
      None
    } else {
      match read_c_string(info.cwd, "cwd") {
        Ok(c) => Some(c),
        Err(status) => return status,
      }
    };

    let mut command = Command::new(&program);
    command.args(&args);
    for entry in &env {
      match entry.split_once('=') {
        Some((key, value)) if !key.is_empty() => command.env(key, value),
        // `KEY` alone removes the variable from the inherited environment.
        None if !entry.is_empty() => command.env_remove(entry),
        _ => {
          return set_error(
            YoloStatus::InvalidArgument,
            "environment entries are KEY=VALUE, or KEY to remove the variable",
          );
        }
      };
    }
    if let Some(cwd) = &cwd {
      command.current_dir(cwd);
    }
    let null_stdio = info.flags & YOLO_SPAWN_NULL_STDIO != 0;
    let capture = info.flags & YOLO_SPAWN_CAPTURE != 0;
    if null_stdio && capture {
      return set_error(
        YoloStatus::InvalidArgument,
        "NULL_STDIO and CAPTURE are exclusive",
      );
    }
    if null_stdio {
      command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    } else if capture {
      command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    }
    #[cfg(unix)]
    std::os::unix::process::CommandExt::process_group(&mut command, 0);

    let mut reg = lock(registry());
    let limit = match runtime_limit(&reg, runtime) {
      Ok(limit) => limit,
      Err(status) => return status,
    };
    if reg.operations_of(runtime).len() as u32 >= limit {
      return set_error(
        YoloStatus::Busy,
        format!("{limit} operations already running"),
      );
    }
    let mut child = match command.spawn() {
      Ok(child) => child,
      Err(error) => {
        return set_error(
          YoloStatus::Internal,
          format!("cannot spawn `{program}`: {error}"),
        );
      }
    };
    let stdout = Arc::new(Capture::default());
    let stderr = Arc::new(Capture::default());
    if let Some(pipe) = child.stdout.take() {
      Arc::clone(&stdout).pump(pipe, "stdout");
    }
    if let Some(pipe) = child.stderr.take() {
      Arc::clone(&stderr).pump(pipe, "stderr");
    }
    let state = Arc::new(ProcState {
      pid: child.id(),
      child: Mutex::new(child),
      exit: Mutex::new(None),
      stdout,
      stderr,
    });
    let handle = reg.insert(Entry::Process {
      owner: runtime,
      state,
    });
    drop(reg);
    // SAFETY: `out` is writable per the contract.
    unsafe { out.write(handle) };
    YoloStatus::Ok
  })
}

fn process_state(process: YoloHandle) -> Result<Arc<ProcState>, YoloStatus> {
  match lock(registry()).get(process) {
    Some(Entry::Process { state, .. }) => Ok(Arc::clone(state)),
    _ => Err(set_error(
      YoloStatus::InvalidHandle,
      "invalid process handle",
    )),
  }
}

/// Non-blocking status of the process.
///
/// # Safety
/// `out` must point to a writable `YoloProcessStatus` whose `struct_size` is set by the caller.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn yolo_process_status(
  process: YoloHandle,
  out: *mut YoloProcessStatus,
) -> YoloStatus {
  guard(|| {
    if out.is_null() {
      return set_error(YoloStatus::InvalidArgument, "null output");
    }
    let state = match process_state(process) {
      Ok(state) => state,
      Err(status) => return status,
    };
    let exit = state.poll();
    let status = YoloProcessStatus {
      struct_size: size_of::<YoloProcessStatus>() as u32,
      state: u32::from(exit.is_some()),
      exit_code: exit.map_or(0, |e| e.code.unwrap_or(-1)),
      signal: exit.and_then(|e| e.signal).unwrap_or(0),
      pid: state.pid,
    };
    // SAFETY: `out` is writable per the contract.
    unsafe { out.write(status) };
    YoloStatus::Ok
  })
}

/// Reads the captured output of a process spawned with `YOLO_SPAWN_CAPTURE`: `stream` is
/// `YOLO_STREAM_STDOUT` or `YOLO_STREAM_STDERR`, `mode` is `YOLO_READ_DRAIN` or `YOLO_READ_PEEK`.
/// The bytes are returned in a library-owned buffer (possibly empty).
///
/// # Safety
/// `out` must point to a writable `YoloBuffer`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn yolo_process_read(
  process: YoloHandle,
  stream: u32,
  mode: u32,
  out: *mut YoloBuffer,
) -> YoloStatus {
  guard(|| {
    let state = match process_state(process) {
      Ok(state) => state,
      Err(status) => return status,
    };
    let capture = match stream {
      YOLO_STREAM_STDOUT => &state.stdout,
      YOLO_STREAM_STDERR => &state.stderr,
      _ => return set_error(YoloStatus::InvalidArgument, "unknown stream"),
    };
    let bytes = {
      let mut guard = lock(&capture.bytes);
      match mode {
        YOLO_READ_DRAIN => std::mem::take(&mut *guard),
        YOLO_READ_PEEK => guard.clone(),
        _ => return set_error(YoloStatus::InvalidArgument, "unknown read mode"),
      }
    };
    write_buffer(out, bytes)
  })
}

/// Stops the process (SIGTERM to its group, SIGKILL after `grace_ms`) and waits for it. The handle
/// stays valid so the exit status can still be read.
#[unsafe(no_mangle)]
pub extern "C" fn yolo_process_stop(process: YoloHandle, grace_ms: u32) -> YoloStatus {
  guard(|| match process_state(process) {
    Ok(state) => {
      state.stop(grace_ms);
      YoloStatus::Ok
    }
    Err(status) => status,
  })
}

/// Asynchronous `yolo_process_stop`: the SIGTERM/grace/SIGKILL sequence runs on a worker thread and
/// the operation (not counted against `max_operations`) yields `{"exit_code": n, "signal": n}`.
///
/// # Safety
/// `out_operation` must point to a writable `YoloHandle`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn yolo_process_stop_start(
  process: YoloHandle,
  grace_ms: u32,
  out_operation: *mut YoloHandle,
) -> YoloStatus {
  guard(|| {
    if out_operation.is_null() {
      return set_error(YoloStatus::InvalidArgument, "null output handle");
    }
    let (owner, state) = match lock(registry()).get(process) {
      Some(Entry::Process { owner, state }) => (*owner, Arc::clone(state)),
      _ => return set_error(YoloStatus::InvalidHandle, "invalid process handle"),
    };
    let started = start_operation(owner, "stop", false, move |_| {
      state.stop(grace_ms);
      let exit = state.poll();
      OpResult::Done(
        serde_json::json!({
          "exit_code": exit.map_or(0, |e| e.code.unwrap_or(-1)),
          "signal": exit.and_then(|e| e.signal).unwrap_or(0),
        })
        .to_string(),
      )
    });
    match started {
      Ok(handle) => {
        // SAFETY: `out_operation` is writable per the contract.
        unsafe { out_operation.write(handle) };
        YoloStatus::Ok
      }
      Err(status) => status,
    }
  })
}

/// Stops the process if it is still running (2 s grace) and invalidates the handle.
#[unsafe(no_mangle)]
pub extern "C" fn yolo_process_release(process: YoloHandle) -> YoloStatus {
  guard(|| {
    let entry = {
      let mut reg = lock(registry());
      match reg.get(process) {
        Some(Entry::Process { .. }) => reg.remove(process),
        _ => None,
      }
    };
    match entry {
      Some(Entry::Process { state, .. }) => {
        state.stop(RELEASE_GRACE_MS);
        YoloStatus::Ok
      }
      _ => set_error(YoloStatus::InvalidHandle, "invalid process handle"),
    }
  })
}

/// One HTTP/1.0 `GET` with connect/read timeouts. `Ok(status)` when the server answers, `Err(why)`
/// when it is not reachable (yet).
fn probe_blocking(host: &str, port: u16, path: &str, timeout: Duration) -> Result<i32, String> {
  let addrs = (host, port)
    .to_socket_addrs()
    .map_err(|error| format!("cannot resolve {host}: {error}"))?;
  let mut last = "no address".to_string();
  for addr in addrs {
    let mut stream = match TcpStream::connect_timeout(&addr, timeout) {
      Ok(stream) => stream,
      Err(error) => {
        last = error.to_string();
        continue;
      }
    };
    let _ = stream.set_read_timeout(Some(timeout));
    let _ = stream.set_write_timeout(Some(timeout));
    let request = format!(
      "GET {path} HTTP/1.0\r\nHost: {host}:{port}\r\nUser-Agent: yolo-runtime/{}\r\nAccept: */*\r\nConnection: close\r\n\r\n",
      env!("CARGO_PKG_VERSION")
    );
    if let Err(error) = stream.write_all(request.as_bytes()) {
      last = error.to_string();
      continue;
    }
    let mut head = [0u8; 32];
    let mut filled = 0;
    let mut read_failure = None;
    while filled < head.len() {
      match stream.read(&mut head[filled..]) {
        Ok(0) => break,
        Ok(n) => filled += n,
        Err(error) => {
          read_failure = Some(error.to_string());
          break;
        }
      }
      if head[..filled].contains(&b'\r') || head[..filled].contains(&b'\n') {
        break;
      }
    }
    let line = String::from_utf8_lossy(&head[..filled]);
    let code = line
      .strip_prefix("HTTP/1.")
      .and_then(|rest| rest.get(2..5))
      .and_then(|code| code.parse::<i32>().ok());
    match code {
      Some(code) => return Ok(code),
      None => {
        last = read_failure.unwrap_or_else(|| format!("not an HTTP response: {line:?}"));
      }
    }
  }
  Err(last)
}

/// `http.probe`: starts one HTTP/1.0 `GET` on a worker thread and returns an operation handle, so
/// the caller never blocks. `yolo_operation_wait` yields the JSON `{"status": <code>}` when the
/// server answered and `{"status": null, "error": "<why>"}` when it is not reachable (yet).
///
/// # Safety
/// `host` and `path` must be NUL-terminated UTF-8; `out_operation` must be writable.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn yolo_http_probe_start(
  runtime: YoloHandle,
  host: *const c_char,
  port: u16,
  path: *const c_char,
  timeout_ms: u32,
  out_operation: *mut YoloHandle,
) -> YoloStatus {
  guard(|| {
    if out_operation.is_null() {
      return set_error(YoloStatus::InvalidArgument, "null output handle");
    }
    let host = match read_c_string(host, "host") {
      Ok(h) if !h.contains(['\r', '\n', ' ']) => h,
      Ok(_) => return set_error(YoloStatus::InvalidArgument, "invalid host"),
      Err(status) => return status,
    };
    let path = match read_c_string(path, "path") {
      Ok(p) if p.starts_with('/') && !p.contains(['\r', '\n', ' ']) => p,
      Ok(_) => {
        return set_error(
          YoloStatus::InvalidArgument,
          "path must start with / and contain no whitespace",
        );
      }
      Err(status) => return status,
    };
    let timeout = Duration::from_millis(u64::from(timeout_ms.max(1)));
    let started = start_operation(runtime, "probe", true, move |cancel| {
      if cancel.load(Ordering::Relaxed) {
        return OpResult::Cancelled;
      }
      let value = match probe_blocking(&host, port, &path, timeout) {
        Ok(status) => serde_json::json!({ "status": status }),
        Err(error) => serde_json::json!({ "status": null, "error": error }),
      };
      OpResult::Done(value.to_string())
    });
    match started {
      Ok(handle) => {
        // SAFETY: `out_operation` is writable per the contract.
        unsafe { out_operation.write(handle) };
        YoloStatus::Ok
      }
      Err(status) => status,
    }
  })
}
