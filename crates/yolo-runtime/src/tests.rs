use super::*;

fn create(max_operations: u32) -> YoloHandle {
  let info = YoloCreateInfo {
    struct_size: size_of::<YoloCreateInfo>() as u32,
    abi_major: ABI_MAJOR,
    abi_minor: ABI_MINOR,
    max_operations,
  };
  let mut handle = 0;
  assert_eq!(
    unsafe { yolo_runtime_create(&info, &mut handle) },
    YoloStatus::Ok
  );
  assert_ne!(handle, 0);
  handle
}

fn empty() -> YoloBuffer {
  YoloBuffer {
    data: ptr::null_mut(),
    len: 0,
    cap: 0,
  }
}

fn take_json(mut buffer: YoloBuffer) -> serde_json::Value {
  assert!(!buffer.data.is_null());
  let bytes = unsafe { std::slice::from_raw_parts(buffer.data, buffer.len) }.to_vec();
  unsafe { yolo_buffer_free(&mut buffer) };
  assert!(buffer.data.is_null() && buffer.len == 0);
  serde_json::from_slice(&bytes).unwrap()
}

fn last_error() -> String {
  let mut out = empty();
  assert_eq!(unsafe { yolo_last_error(&mut out) }, YoloStatus::Ok);
  take_json(out)["message"].as_str().unwrap().to_string()
}

#[test]
fn abi_version_is_major_minor() {
  assert_eq!(yolo_abi_version(), (ABI_MAJOR << 16) | ABI_MINOR);
}

#[test]
fn create_rejects_incompatible_or_truncated_callers() {
  let mut handle = 0;
  let wrong_major = YoloCreateInfo {
    struct_size: size_of::<YoloCreateInfo>() as u32,
    abi_major: ABI_MAJOR + 1,
    abi_minor: 0,
    max_operations: 0,
  };
  assert_eq!(
    unsafe { yolo_runtime_create(&wrong_major, &mut handle) },
    YoloStatus::AbiMismatch
  );
  assert!(last_error().contains("ABI"));
  assert_eq!(handle, 0);

  let newer_minor = YoloCreateInfo {
    abi_major: ABI_MAJOR,
    abi_minor: ABI_MINOR + 1,
    ..wrong_major
  };
  assert_eq!(
    unsafe { yolo_runtime_create(&newer_minor, &mut handle) },
    YoloStatus::AbiMismatch
  );

  let truncated = YoloCreateInfo {
    struct_size: 4,
    abi_major: ABI_MAJOR,
    abi_minor: 0,
    max_operations: 0,
  };
  assert_eq!(
    unsafe { yolo_runtime_create(&truncated, &mut handle) },
    YoloStatus::InvalidArgument
  );

  assert_eq!(
    unsafe { yolo_runtime_create(ptr::null(), &mut handle) },
    YoloStatus::InvalidArgument
  );
  let too_many = YoloCreateInfo {
    abi_major: ABI_MAJOR,
    abi_minor: 0,
    max_operations: 1000,
    ..wrong_major
  };
  assert_eq!(
    unsafe { yolo_runtime_create(&too_many, &mut handle) },
    YoloStatus::InvalidArgument
  );
}

#[test]
fn older_caller_without_max_operations_gets_the_default() {
  // A caller built against a smaller structure (12 bytes) must still work.
  let info = YoloCreateInfo {
    struct_size: 12,
    abi_major: ABI_MAJOR,
    abi_minor: 0,
    max_operations: 999,
  };
  let mut handle = 0;
  assert_eq!(
    unsafe { yolo_runtime_create(&info, &mut handle) },
    YoloStatus::Ok
  );
  assert_eq!(yolo_runtime_destroy(handle), YoloStatus::Ok);
}

#[test]
fn handles_are_validated_and_invalidated_on_destroy() {
  let rt = create(0);
  let mut out = empty();
  assert_eq!(unsafe { yolo_system_stats(rt, &mut out) }, YoloStatus::Ok);
  let stats = take_json(out);
  assert!(!stats["os"].as_str().unwrap().is_empty());

  assert_eq!(yolo_runtime_destroy(rt), YoloStatus::Ok);
  let mut out = empty();
  assert_eq!(
    unsafe { yolo_system_stats(rt, &mut out) },
    YoloStatus::InvalidHandle
  );
  assert!(out.data.is_null());
  assert_eq!(yolo_runtime_destroy(rt), YoloStatus::InvalidHandle);

  // A recycled slot gets a new generation: the stale handle stays invalid.
  let rt2 = create(0);
  assert_ne!(rt, rt2);
  assert_eq!(yolo_runtime_destroy(rt), YoloStatus::InvalidHandle);
  assert_eq!(yolo_runtime_destroy(rt2), YoloStatus::Ok);
  assert_eq!(yolo_runtime_destroy(0), YoloStatus::InvalidHandle);
  assert_eq!(
    yolo_runtime_destroy(0xdead_beef_dead_beef),
    YoloStatus::InvalidHandle
  );
}

#[test]
fn build_info_and_capabilities_are_json() {
  let mut out = empty();
  assert_eq!(unsafe { yolo_runtime_build_info(&mut out) }, YoloStatus::Ok);
  let info = take_json(out);
  assert_eq!(info["name"], "yolo-runtime");
  assert_eq!(info["abi"], format!("{ABI_MAJOR}.{ABI_MINOR}"));
  assert_eq!(info["panic_recovery"], cfg!(panic = "unwind"));
  assert!(!info["target"].as_str().unwrap().is_empty());

  let rt = create(0);
  let mut out = empty();
  assert_eq!(
    unsafe { yolo_runtime_capabilities(rt, &mut out) },
    YoloStatus::Ok
  );
  assert_eq!(
    take_json(out),
    serde_json::json!([
      "system.stats",
      "bench.compute",
      "process.supervise",
      "http.probe"
    ])
  );
  yolo_runtime_destroy(rt);
}

#[test]
fn benchmark_completes_and_is_released() {
  let rt = create(0);
  let mut op = 0;
  assert_eq!(
    unsafe { yolo_bench_start(rt, 1000, &mut op) },
    YoloStatus::Ok
  );
  let mut out = empty();
  assert_eq!(
    unsafe { yolo_operation_wait(op, 10_000, &mut out) },
    YoloStatus::Ok
  );
  assert!(take_json(out)["message"].as_str().unwrap().contains("1000"));
  // The result stays readable until the operation is released.
  let mut again = empty();
  assert_eq!(
    unsafe { yolo_operation_wait(op, 0, &mut again) },
    YoloStatus::Ok
  );
  take_json(again);
  assert_eq!(yolo_operation_release(op), YoloStatus::Ok);
  assert_eq!(yolo_operation_release(op), YoloStatus::InvalidHandle);
  assert_eq!(yolo_runtime_destroy(rt), YoloStatus::Ok);
}

#[test]
fn long_benchmark_can_be_cancelled_and_times_out_before() {
  let rt = create(0);
  let mut op = 0;
  assert_eq!(
    unsafe { yolo_bench_start(rt, u32::MAX, &mut op) },
    YoloStatus::Ok
  );
  let mut out = empty();
  assert_eq!(
    unsafe { yolo_operation_wait(op, 0, &mut out) },
    YoloStatus::Timeout
  );
  assert!(out.data.is_null());
  assert_eq!(yolo_operation_cancel(op), YoloStatus::Ok);
  assert_eq!(yolo_operation_cancel(op), YoloStatus::Ok);
  assert_eq!(
    unsafe { yolo_operation_wait(op, 10_000, &mut out) },
    YoloStatus::Cancelled
  );
  assert_eq!(yolo_operation_release(op), YoloStatus::Ok);
  assert_eq!(yolo_runtime_destroy(rt), YoloStatus::Ok);
}

#[test]
fn operations_are_bounded_per_runtime() {
  let rt = create(1);
  let mut first = 0;
  assert_eq!(
    unsafe { yolo_bench_start(rt, u32::MAX, &mut first) },
    YoloStatus::Ok
  );
  let mut second = 0;
  assert_eq!(
    unsafe { yolo_bench_start(rt, 10, &mut second) },
    YoloStatus::Busy
  );
  assert_eq!(second, 0);
  assert_eq!(yolo_operation_release(first), YoloStatus::Ok);
  assert_eq!(
    unsafe { yolo_bench_start(rt, 10, &mut second) },
    YoloStatus::Ok
  );
  assert_eq!(yolo_runtime_destroy(rt), YoloStatus::Ok);
}

#[test]
fn destroying_a_runtime_cancels_joins_and_invalidates_its_operations() {
  let rt = create(0);
  let mut a = 0;
  let mut b = 0;
  assert_eq!(
    unsafe { yolo_bench_start(rt, u32::MAX, &mut a) },
    YoloStatus::Ok
  );
  assert_eq!(
    unsafe { yolo_bench_start(rt, u32::MAX, &mut b) },
    YoloStatus::Ok
  );
  let started = std::time::Instant::now();
  assert_eq!(yolo_runtime_destroy(rt), YoloStatus::Ok);
  assert!(
    started.elapsed() < Duration::from_secs(10),
    "workers must stop promptly"
  );
  let mut out = empty();
  assert_eq!(
    unsafe { yolo_operation_wait(a, 0, &mut out) },
    YoloStatus::InvalidHandle
  );
  assert_eq!(yolo_operation_cancel(b), YoloStatus::InvalidHandle);
}

#[test]
fn an_operation_handle_is_not_a_runtime_handle() {
  let rt = create(0);
  let mut op = 0;
  assert_eq!(unsafe { yolo_bench_start(rt, 10, &mut op) }, YoloStatus::Ok);
  let mut out = empty();
  assert_eq!(
    unsafe { yolo_system_stats(op, &mut out) },
    YoloStatus::InvalidHandle
  );
  assert_eq!(yolo_runtime_destroy(op), YoloStatus::InvalidHandle);
  assert_eq!(
    unsafe { yolo_operation_wait(rt, 0, &mut out) },
    YoloStatus::InvalidHandle
  );
  yolo_operation_release(op);
  yolo_runtime_destroy(rt);
}

#[test]
fn null_outputs_are_rejected() {
  let rt = create(0);
  assert_eq!(
    unsafe { yolo_system_stats(rt, ptr::null_mut()) },
    YoloStatus::InvalidArgument
  );
  assert_eq!(
    unsafe { yolo_bench_start(rt, 1, ptr::null_mut()) },
    YoloStatus::InvalidArgument
  );
  unsafe { yolo_buffer_free(ptr::null_mut()) };
  let mut zeroed = empty();
  unsafe { yolo_buffer_free(&mut zeroed) };
  yolo_runtime_destroy(rt);
}

#[test]
#[cfg(panic = "unwind")]
fn panics_become_a_status_with_an_error_message() {
  let status = guard(|| panic!("boom"));
  assert_eq!(status, YoloStatus::Panic);
  assert!(last_error().contains("boom"));
}

#[test]
fn every_exported_function_is_declared_in_the_c_header() {
  let header = include_str!("../include/yolo_runtime.h");
  for name in [
    "yolo_abi_version",
    "yolo_runtime_create",
    "yolo_runtime_destroy",
    "yolo_runtime_build_info",
    "yolo_runtime_capabilities",
    "yolo_system_stats",
    "yolo_bench_start",
    "yolo_operation_wait",
    "yolo_operation_cancel",
    "yolo_operation_release",
    "yolo_buffer_free",
    "yolo_last_error",
    "yolo_process_spawn",
    "yolo_process_status",
    "yolo_process_stop",
    "yolo_process_release",
    "yolo_process_read",
    "yolo_process_stop_start",
    "yolo_http_probe_start",
  ] {
    assert!(
      header.contains(&format!("{name}(")),
      "{name} missing from yolo_runtime.h"
    );
  }
  assert!(header.contains(&format!("#define YOLO_ABI_MAJOR {ABI_MAJOR}u")));
  assert!(header.contains(&format!("#define YOLO_ABI_MINOR {ABI_MINOR}u")));
}

#[cfg(unix)]
mod process {
  use super::*;
  use std::ffi::CString;
  use std::io::{Read, Write};
  use std::net::TcpListener;
  use std::time::Instant;

  fn cstrings(items: &[&str]) -> (Vec<CString>, Vec<*const std::ffi::c_char>) {
    let owned: Vec<CString> = items.iter().map(|s| CString::new(*s).unwrap()).collect();
    let mut pointers: Vec<*const std::ffi::c_char> = owned.iter().map(|c| c.as_ptr()).collect();
    pointers.push(ptr::null());
    (owned, pointers)
  }

  fn spawn(rt: YoloHandle, program: &str, args: &[&str], env: &[&str]) -> (YoloStatus, YoloHandle) {
    let program = CString::new(program).unwrap();
    let (_args_owned, args_ptrs) = cstrings(args);
    let (_env_owned, env_ptrs) = cstrings(env);
    let info = YoloSpawnInfo {
      struct_size: size_of::<YoloSpawnInfo>() as u32,
      flags: YOLO_SPAWN_NULL_STDIO,
      program: program.as_ptr(),
      args: args_ptrs.as_ptr(),
      env: env_ptrs.as_ptr(),
      cwd: ptr::null(),
    };
    let mut handle = 0;
    let status = unsafe { yolo_process_spawn(rt, &info, &mut handle) };
    (status, handle)
  }

  fn status_of(process: YoloHandle) -> YoloProcessStatus {
    let mut out = YoloProcessStatus {
      struct_size: size_of::<YoloProcessStatus>() as u32,
      state: 9,
      exit_code: 0,
      signal: 0,
      pid: 0,
    };
    assert_eq!(
      unsafe { yolo_process_status(process, &mut out) },
      YoloStatus::Ok
    );
    out
  }

  fn wait_exited(process: YoloHandle) -> YoloProcessStatus {
    for _ in 0..500 {
      let status = status_of(process);
      if status.state == 1 {
        return status;
      }
      std::thread::sleep(Duration::from_millis(10));
    }
    panic!("process did not exit");
  }

  #[test]
  fn spawn_reports_exit_code_and_environment() {
    let rt = create(0);
    let (status, process) = spawn(
      rt,
      "sh",
      &["-c", "exit $YOLO_TEST_CODE"],
      &["YOLO_TEST_CODE=3"],
    );
    assert_eq!(status, YoloStatus::Ok);
    let done = wait_exited(process);
    assert_eq!((done.exit_code, done.signal), (3, 0));
    assert!(done.pid > 0);
    assert_eq!(yolo_process_release(process), YoloStatus::Ok);
    assert_eq!(yolo_process_release(process), YoloStatus::InvalidHandle);
    yolo_runtime_destroy(rt);
  }

  fn spawn_flags(
    rt: YoloHandle,
    flags: u32,
    program: &str,
    args: &[&str],
  ) -> (YoloStatus, YoloHandle) {
    let program = CString::new(program).unwrap();
    let (_args_owned, args_ptrs) = cstrings(args);
    let info = YoloSpawnInfo {
      struct_size: size_of::<YoloSpawnInfo>() as u32,
      flags,
      program: program.as_ptr(),
      args: args_ptrs.as_ptr(),
      env: ptr::null(),
      cwd: ptr::null(),
    };
    let mut handle = 0;
    let status = unsafe { yolo_process_spawn(rt, &info, &mut handle) };
    (status, handle)
  }

  fn read_stream(process: YoloHandle, stream: u32, mode: u32) -> String {
    let mut out = empty();
    assert_eq!(
      unsafe { yolo_process_read(process, stream, mode, &mut out) },
      YoloStatus::Ok
    );
    let bytes = if out.data.is_null() {
      Vec::new()
    } else {
      unsafe { std::slice::from_raw_parts(out.data, out.len) }.to_vec()
    };
    unsafe { yolo_buffer_free(&mut out) };
    String::from_utf8(bytes).unwrap()
  }

  #[test]
  fn captured_output_is_drained_or_peeked_and_bounded() {
    let rt = create(0);
    let (status, process) = spawn_flags(
      rt,
      YOLO_SPAWN_CAPTURE,
      "sh",
      &["-c", "echo first-line; echo to-stderr >&2; sleep 0.3"],
    );
    assert_eq!(status, YoloStatus::Ok);
    wait_exited(process);
    std::thread::sleep(Duration::from_millis(50));
    assert_eq!(
      read_stream(process, YOLO_STREAM_STDERR, YOLO_READ_PEEK),
      "to-stderr\n"
    );
    assert_eq!(
      read_stream(process, YOLO_STREAM_STDERR, YOLO_READ_PEEK),
      "to-stderr\n"
    );
    assert_eq!(
      read_stream(process, YOLO_STREAM_STDOUT, YOLO_READ_DRAIN),
      "first-line\n"
    );
    assert_eq!(
      read_stream(process, YOLO_STREAM_STDOUT, YOLO_READ_DRAIN),
      ""
    );
    let mut out = empty();
    assert_eq!(
      unsafe { yolo_process_read(process, 9, 0, &mut out) },
      YoloStatus::InvalidArgument
    );
    assert_eq!(
      unsafe { yolo_process_read(process, 1, 9, &mut out) },
      YoloStatus::InvalidArgument
    );
    yolo_process_release(process);

    // 200 KiB of output: only the last 64 KiB are kept and the child never blocks on a full pipe.
    let (_, noisy) = spawn_flags(
      rt,
      YOLO_SPAWN_CAPTURE,
      "sh",
      &["-c", "head -c 204800 /dev/zero | tr '\\0' x"],
    );
    wait_exited(noisy);
    std::thread::sleep(Duration::from_millis(100));
    assert_eq!(
      read_stream(noisy, YOLO_STREAM_STDOUT, YOLO_READ_PEEK).len(),
      64 * 1024
    );
    yolo_process_release(noisy);
    yolo_runtime_destroy(rt);
  }

  #[test]
  fn capture_and_null_stdio_are_exclusive() {
    let rt = create(0);
    let (status, _) = spawn_flags(rt, YOLO_SPAWN_CAPTURE | YOLO_SPAWN_NULL_STDIO, "true", &[]);
    assert_eq!(status, YoloStatus::InvalidArgument);
    yolo_runtime_destroy(rt);
  }

  #[test]
  fn spawn_errors_are_structured() {
    let rt = create(0);
    let (status, handle) = spawn(rt, "/nonexistent/binary", &[], &[]);
    assert_eq!(status, YoloStatus::Internal);
    assert_eq!(handle, 0);
    assert!(last_error().contains("cannot spawn"));
    let (status, _) = spawn(rt, "sh", &[], &["NOT_AN_ASSIGNMENT"]);
    assert_eq!(status, YoloStatus::InvalidArgument);
    let mut out = 0;
    assert_eq!(
      unsafe { yolo_process_spawn(rt, ptr::null(), &mut out) },
      YoloStatus::InvalidArgument
    );
    yolo_runtime_destroy(rt);
  }

  #[test]
  fn stop_terminates_the_whole_process_group() {
    let rt = create(0);
    // The shell backgrounds a child and waits: stopping must take both down.
    let (_, process) = spawn(rt, "sh", &["-c", "sleep 60 & wait"], &[]);
    std::thread::sleep(Duration::from_millis(100));
    assert_eq!(status_of(process).state, 0);
    let pid = status_of(process).pid as i32;
    let started = Instant::now();
    assert_eq!(yolo_process_stop(process, 2000), YoloStatus::Ok);
    assert!(started.elapsed() < Duration::from_secs(5));
    let done = status_of(process);
    assert_eq!(done.state, 1);
    assert_eq!(done.signal, libc::SIGTERM);
    // the group leader is gone and no member of the group answers any more
    assert_eq!(unsafe { libc::kill(-pid, 0) }, -1);
    yolo_process_release(process);
    yolo_runtime_destroy(rt);
  }

  #[test]
  fn asynchronous_stop_runs_on_a_worker_and_ignores_the_operation_limit() {
    let rt = create(1);
    let (_, process) = spawn(rt, "sh", &["-c", "sleep 60 & wait"], &[]);
    // the limit (1) is exhausted by the process itself, a stop must still start
    let mut op = 0;
    assert_eq!(
      unsafe { yolo_process_stop_start(process, 2000, &mut op) },
      YoloStatus::Ok
    );
    let mut out = empty();
    assert_eq!(
      unsafe { yolo_operation_wait(op, 10_000, &mut out) },
      YoloStatus::Ok
    );
    let result = take_json(out);
    assert_eq!(result["signal"], libc::SIGTERM);
    assert_eq!(status_of(process).state, 1);
    assert_eq!(yolo_operation_release(op), YoloStatus::Ok);
    let mut none = 0;
    assert_eq!(
      unsafe { yolo_process_stop_start(0, 0, &mut none) },
      YoloStatus::InvalidHandle
    );
    yolo_process_release(process);
    yolo_runtime_destroy(rt);
  }

  #[test]
  fn a_process_ignoring_sigterm_is_killed_after_the_grace_period() {
    let rt = create(0);
    let (_, process) = spawn(
      rt,
      "sh",
      &["-c", "trap '' TERM; while :; do sleep 1; done"],
      &[],
    );
    std::thread::sleep(Duration::from_millis(100));
    let started = Instant::now();
    assert_eq!(yolo_process_stop(process, 200), YoloStatus::Ok);
    assert!(started.elapsed() >= Duration::from_millis(200));
    assert_eq!(status_of(process).signal, libc::SIGKILL);
    yolo_process_release(process);
    yolo_runtime_destroy(rt);
  }

  #[test]
  fn processes_count_against_the_operation_limit_and_die_with_the_runtime() {
    let rt = create(1);
    let (status, process) = spawn(rt, "sleep", &["60"], &[]);
    assert_eq!(status, YoloStatus::Ok);
    let mut op = 0;
    assert_eq!(
      unsafe { yolo_bench_start(rt, 10, &mut op) },
      YoloStatus::Busy
    );
    let (status, _) = spawn(rt, "sleep", &["60"], &[]);
    assert_eq!(status, YoloStatus::Busy);
    let pid = status_of(process).pid as i32;
    assert_eq!(yolo_runtime_destroy(rt), YoloStatus::Ok);
    assert_eq!(yolo_process_stop(process, 0), YoloStatus::InvalidHandle);
    assert_eq!(
      unsafe { libc::kill(-pid, 0) },
      -1,
      "the runtime must not leave its process running"
    );
  }

  fn serve_once(response: &'static str) -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    std::thread::spawn(move || {
      if let Ok((mut stream, _)) = listener.accept() {
        let mut buffer = [0u8; 256];
        let _ = stream.read(&mut buffer);
        let _ = stream.write_all(response.as_bytes());
      }
    });
    port
  }

  fn probe(rt: YoloHandle, port: u16, path: &str) -> (YoloStatus, serde_json::Value) {
    let host = CString::new("127.0.0.1").unwrap();
    let path = CString::new(path).unwrap();
    let mut op = 0;
    let status =
      unsafe { yolo_http_probe_start(rt, host.as_ptr(), port, path.as_ptr(), 1000, &mut op) };
    if status != YoloStatus::Ok {
      return (status, serde_json::Value::Null);
    }
    let mut out = empty();
    assert_eq!(
      unsafe { yolo_operation_wait(op, 10_000, &mut out) },
      YoloStatus::Ok
    );
    let value = take_json(out);
    assert_eq!(yolo_operation_release(op), YoloStatus::Ok);
    (YoloStatus::Ok, value)
  }

  #[test]
  fn http_probe_reads_the_status_line_and_reports_unreachable_as_data() {
    let rt = create(0);
    let port = serve_once("HTTP/1.1 204 No Content\r\n\r\n");
    assert_eq!(
      probe(rt, port, "/json/version"),
      (YoloStatus::Ok, serde_json::json!({ "status": 204 }))
    );

    let port = serve_once("garbage");
    let (status, value) = probe(rt, port, "/");
    assert_eq!(status, YoloStatus::Ok);
    assert!(value["status"].is_null() && value["error"].as_str().unwrap().contains("not an HTTP"));

    // a closed port: connection refused is "not ready yet", reported as data
    let closed = TcpListener::bind("127.0.0.1:0")
      .unwrap()
      .local_addr()
      .unwrap()
      .port();
    let (status, value) = probe(rt, closed, "/");
    assert_eq!(status, YoloStatus::Ok);
    assert!(value["status"].is_null());

    assert_eq!(probe(rt, 1, "no-slash").0, YoloStatus::InvalidArgument);
    assert_eq!(probe(rt, 1, "/a b").0, YoloStatus::InvalidArgument);
    assert_eq!(probe(0, 1, "/").0, YoloStatus::InvalidHandle);
    yolo_runtime_destroy(rt);
  }
}
