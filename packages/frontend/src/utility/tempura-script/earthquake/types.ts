/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Interface for earthquake alert data from jma_eew WebSocket API
 */
export interface EarthquakeAlertData {
	type: string; // jma_eew
	Title: string; // EEW发报报头
	CodeType: string; // EEW发报说明
	Issue: {
		Source: string; // EEW发报机构位置
		Status: string; // EEW发报状态
	};
	EventID: string; // EEW发报ID
	Serial: string; // EEW发报数
	AnnouncedTime: string; // EEW发报时间(UTC+9)
	OriginTime: string; // 发震时间(UTC+9)
	Hypocenter: string; // 震源地
	Latitude: number; // 震源地纬度
	Longitude: number; // 震源地经度
	magnitude: number; // 震级
	Depth: number; // 震源深度
	MaxIntensity: string; // 最大震度
	Accuracy: {
		Epicenter: string; // 震中精度说明
		Depth: string; // 深度精度说明
		Magnitude: string; // 震级精度说明
	};
	MaxIntChange: {
		String: string; // 最大震度变更说明
		Reason: string; // 最大震度变更原因
	};
	WarnArea: {
		Chiiki: string; // 警报区域
		Shindo1: string; // 区域最大震度
		Shindo2: string; // 区域最小震度
		Time: string; // 区域警报时间
		Type: string; // 区域发报类型，分为 "予報" 和 "警報"
		Arrive: boolean; // 区域地震波是否已到达
	};
	isSea: boolean; // 是否为海域地震
	isTraining: boolean; // 是否为训练报
	isAssumption: boolean; // 是否为推定震源（PLUM/レベル/IPF法）
	isWarn: boolean; // 是否为警报
	isFinal: boolean; // 是否为最终报
	isCancel: boolean; // 是否为取消报
	OriginalText: string; // JMA气象厅原电文
}

/**
 * 接続イベントログのエントリ
 */
export interface ConnectionLogEntry {
	type: 'info' | 'error' | 'warning';
	timestamp: Date;
	message: string;
}

/**
 * 受信データログのエントリ
 */
export interface DataLogEntry {
	type: 'received' | 'processed' | 'error';
	timestamp: Date;
	data: unknown;
}
