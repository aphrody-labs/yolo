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
    serde_json::json!(["system.stats", "bench.compute"])
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
  ] {
    assert!(
      header.contains(&format!("{name}(")),
      "{name} missing from yolo_runtime.h"
    );
  }
  assert!(header.contains(&format!("#define YOLO_ABI_MAJOR {ABI_MAJOR}u")));
  assert!(header.contains(&format!("#define YOLO_ABI_MINOR {ABI_MINOR}u")));
}
