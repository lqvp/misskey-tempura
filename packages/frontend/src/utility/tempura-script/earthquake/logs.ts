/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { prefer } from '@/preferences.js';
import type { ConnectionLogEntry, DataLogEntry } from './types.js';

// In-memory logs (will be lost on page refresh)
let connectionLog: ConnectionLogEntry[] = [];
let dataLog: DataLogEntry[] = [];
const MAX_LOG_ENTRIES = 100; // 最大ログエントリー数

/**
 * Add entry to connection log
 */
export function addToConnectionLog(type: 'info' | 'error' | 'warning', timestamp: Date, message: string): void {
	// Check if logging is enabled
	const logLevel = prefer.s.earthquakeWarningLogLevel || 'none';
	if (logLevel === 'none') return;

	// For basic level, only log errors
	if (logLevel === 'basic' && type !== 'error') return;

	// Log to console for easier debugging
	console.debug(`[EarthquakeWarning] [${type}] ${message}`);

	// Add to log
	connectionLog.unshift({ type, timestamp, message });

	// Trim log to maximum size
	if (connectionLog.length > MAX_LOG_ENTRIES) {
		connectionLog = connectionLog.slice(0, MAX_LOG_ENTRIES);
	}
}

/**
 * Add entry to data log
 */
export function addToDataLog(type: 'received' | 'processed' | 'error', timestamp: Date, data: unknown): void {
	// Check if data logging is enabled
	const logLevel = prefer.s.earthquakeWarningLogLevel || 'none';
	if (logLevel !== 'detailed') return;

	// Log to console for easier debugging
	console.debug(`[EarthquakeWarning] [Data ${type}]`, data);

	// Add to log
	dataLog.unshift({ type, timestamp, data });

	// Trim log to maximum size
	if (dataLog.length > MAX_LOG_ENTRIES) {
		dataLog = dataLog.slice(0, MAX_LOG_ENTRIES);
	}
}

/**
 * Initialize logs
 */
export function initializeLogs(): void {
	// Clear existing logs
	connectionLog = [];
	dataLog = [];

	// Log initialization
	addToConnectionLog('info', new Date(), 'Earthquake warning system initialized');
}

/**
 * Get connection log entries
 */
export function getConnectionLogs(): ConnectionLogEntry[] {
	return [...connectionLog];
}

/**
 * Get data log entries
 */
export function getDataLogs(): DataLogEntry[] {
	return [...dataLog];
}

/**
 * Clear all logs
 */
export function clearAllLogs(): void {
	connectionLog = [];
	dataLog = [];
	addToConnectionLog('info', new Date(), 'Logs cleared');
}
