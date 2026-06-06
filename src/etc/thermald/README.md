# T480 Thermal Fix

## Problem

thermald's `--adaptive` flag (shipped default on Arch's `thermald` package) sets
RAPL PL1 to 25W via MMIO — 10W above the i7-8650U's 15W TDP hardware maximum.
This removes effective power limits, allowing the CPU to run at full turbo until
PROCHOT (97°C). Observed: 80°C package, 3984 RPM fan, 12,201 throttle events,
77.5s cumulative throttle time.

## Fix

A systemd drop-in removes `--adaptive` so thermald respects
`/etc/thermald/thermal-conf.xml`.

### Systemd drop-in

`/etc/systemd/system/thermald.service.d/override.conf`:

```
[Service]
ExecStart=
ExecStart=/usr/bin/thermald --systemd --dbus-enable --workaround-enabled
```

### Cooling config

`/etc/thermald/thermal-conf.xml` — two-tier strategy:

| Trip | Cdev | Purpose |
|---|---|---|
| 50°C | intel_pstate | Frequency cap, catches normal spikes (12s settling) |
| 75°C | Processor | P-state/T-state throttling, backup (8s settling) |

- Sensor: `x86_pkg_temp` (on-die DTS via MSR, same as `coretemp`) — not the
  laggy motherboard `acpitz` sensor
- MaxState: 10 (matches sysfs `Processor` `max_state` — kernel rejects values >10)
- No `rapl_controller` — PPCC DPTF table defines 25W max; binding rapl_controller
  would write that to RAPL, defeating the fix

### RAPL MMIO workaround

`--workaround-enabled` activates `workaround_rapl_mmio_power()` for Kaby Lake
(model 0x8e/0x9e). Thertald's built-in `rapl_controller_mmio` cdev reads the
DPTF PPCC table at startup and writes 25W (PPCC max) back to the MMIO register.
However, the kernel's `intel_rapl` MMIO driver clamps writes to
`constraint_0_max_power_uw` (15W hardware maximum), so the effective limit
remains 15W. The non-MMIO path (`intel-rapl:0`) shows 25W but this is a stale
MSR value — MMIO takes precedence.

## Verification

Run `verify-thermal-fix.sh`. Key checks:

- RAPL MMIO PL1 = 15W (not 25W) at
  `/sys/devices/virtual/powercap/intel-rapl-mmio/intel-rapl-mmio:0/constraint_0_power_limit_uw`
- No `--adaptive` in thermald cmdline (`/proc/<pid>/cmdline`)
- x86_pkg_temp zone active with both trip points bound
  (`journalctl -u thermald`, check `ZONE DUMP`)
- Package temp < 80°C at idle, throttle events < 5000

## Gotchas

1. **`thermal-conf.xml.auto` overrides custom config.** thermald loads `.auto`
   files first. A wildcard `*` ProductName captures before any explicit match,
   blocking `thermal-conf.xml`. Delete this file from `/etc/thermald/` if your
   custom config is not taking effect.

2. **Reboot required after config changes.** RAPL MMIO registers persist across
   `systemctl restart`. A fresh boot guarantees known-good state.

3. **intel_pstate may be unavailable as a cooling device under HWP.**
   If `/sys/class/thermal/cooling_device*` has no `intel_pstate` entry, the
   50°C tier silently degrades to no-op. The 75°C Processor trip will still
   catch overheat events. Check zone dump in `journalctl -u thermald` for
   bound cdevs. Fallback: add `intel_pstate=no_hwp` to kernel cmdline (trades
   ~0.5W idle power for functional intel_pstate cdev).

4. **DPTF PPCC table defines 25W max.** Located at
   `/sys/bus/pci/devices/0000:00:04.0/power_limits/power_limit_0_max_uw`.
   This is the source of 25W values. The fix avoids binding `rapl_controller`
   to any trip point so this value is never written as the active power limit.

## Files in this directory

| File | Description |
|---|---|
| `thermal-conf.xml` | Two-tier cooling config (matches `/etc/thermald/`) |
| `thermal-conf.xml.auto` | Wildcard `*` override — do NOT deploy without explicit ProductName |
| `thermald.service.d/override.conf` | Systemd drop-in removing `--adaptive` (matches `/etc/systemd/system/`) |
| `verify-thermal-fix.sh` | Post-fix verification script |
| `root-collect-thermal.sh` | Root data collection for debugging |
