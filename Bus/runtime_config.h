#ifndef RUNTIME_CONFIG_H
#define RUNTIME_CONFIG_H

// Toggle local SQLite buffering on edge buses.
// Set to false for high-scale load tests focused on server throughput.
inline constexpr bool kEnableLocalDatabase = false;

// Enable detailed per-bus logs (connect, start, stop, command traces).
// Keep false for large fleet tests to avoid console spam.
inline constexpr bool kVerboseBusLogs = false;

#endif // RUNTIME_CONFIG_H
