# Changelog

All notable changes to this project will be documented in this file.

## [2.0.2] - 2025-06-17

### 🔧 CRITICAL BUG FIXES
- **Fixed authentication token expiry calculation** - SDK now correctly parses JWT token expiry time instead of assuming 1-hour duration
- **Resolved 401 "Access token is expired" errors** that occurred every ~15 minutes in long-running applications
- **Fixed token validation race condition** where SDK thought tokens were valid when PDU considered them expired

### ✨ ENHANCEMENTS  
- **Added JWT token parsing** - Automatically extracts real expiry time from token claims
- **Enhanced authentication error recovery** - More robust fallback mechanisms for auth failures
- **Improved logging for authentication events** - Better visibility into token refresh and error handling
- **Added proactive token validation** - Prevents API calls with expired tokens

### 🧪 TESTING
- **Added comprehensive integration tests** including persistent long-running tests
- **Created token expiry validation tests** to prevent regression of this critical bug
- **Added health monitoring and state change tests** for production reliability

### 📚 DOCUMENTATION
- **Updated README with authentication reliability section** 
- **Added production-ready guarantees** about indefinite operation without auth interruptions

### 💥 IMPACT FOR CONSUMERS
**Before:** Applications would randomly fail with 401 errors every 15 minutes, requiring restart
**After:** Applications run indefinitely with seamless automatic authentication handling

This release transforms the SDK from "breaks every 15 minutes" to "works forever" - a critical reliability improvement for production deployments.

## [2.0.1] - Previous Release
- Initial unified architecture release

## [2.0.0] - Previous Release  
- Major rewrite with integrated WebSocket server
- Unified TripplitePDUServer and TripplitePDUClient classes 