/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Remove tracking parameters from URLs
 * @param text The text containing URLs to sanitize
 * @returns The text with sanitized URLs
 */
export function sanitizeUrls(text: string): string {
	// Common tracking parameters to remove
	const trackingParams = [
		// YouTube
		'si', 'feature', 'pp',
		// Twitter/X
		's', 't', 'ref_src', 'ref_url',
		// Facebook
		'fbclid', 'fb_action_ids', 'fb_action_types', 'fb_source',
		// Google
		'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
		'gclid', 'gclsrc', 'dclid',
		// Amazon
		'tag', 'linkCode', 'linkId', 'ref_', 'pf_rd_p', 'pf_rd_s', 'pf_rd_t', 'pf_rd_i', 'pf_rd_m', 'pf_rd_r',
		// General
		'source', 'mc_cid', 'mc_eid', 'affiliate', 'app', 'partner',
		// Instagram
		'igshid', 'igsh',
		// TikTok
		'_t', '_r',
	];

	// Regex to match URLs
	const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

	return text.replace(urlRegex, (url) => {
		try {
			const urlObj = new URL(url);
			const params = new URLSearchParams(urlObj.search);
			
			// Remove tracking parameters
			let paramsRemoved = false;
			for (const param of trackingParams) {
				if (params.has(param)) {
					params.delete(param);
					paramsRemoved = true;
				}
			}

			// Special handling for Amazon URLs - remove all parameters starting with 'pf_rd_'
			const amazonDomains = ['amazon.com', 'amazon.co.jp', 'amazon.co.uk', 'amazon.de', 'amazon.fr', 'amazon.it', 'amazon.es', 'amazon.ca', 'amzn.to', 'amzn.com'];
			if (amazonDomains.some(domain => urlObj.hostname.includes(domain))) {
				const keysToDelete: string[] = [];
				params.forEach((_, key) => {
					if (key.startsWith('pf_rd_') || key.startsWith('ref_')) {
						keysToDelete.push(key);
					}
				});
				keysToDelete.forEach(key => {
					params.delete(key);
					paramsRemoved = true;
				});
			}

			// If no parameters were removed, return the original URL
			if (!paramsRemoved) {
				return url;
			}

			// Reconstruct the URL
			urlObj.search = params.toString();
			
			// Clean up the URL - remove trailing ? if no parameters left
			let cleanedUrl = urlObj.toString();
			if (cleanedUrl.endsWith('?')) {
				cleanedUrl = cleanedUrl.slice(0, -1);
			}

			return cleanedUrl;
		} catch {
			// If URL parsing fails, return the original URL
			return url;
		}
	});
}