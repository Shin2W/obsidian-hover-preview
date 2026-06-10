/**
 * ImageResolver - 从DOM元素解析可预览的图片URL
 * 参考 Imagus 的 PVI.find() 和 PVI.getImages() 逻辑
 */

import { SieveEngine, SieveRule } from './sieve';

/**
 * 从元素获取图片信息的返回值
 */
export interface ResolvedImage {
	/** 要显示的图片URL */
	url: string;
	/** 可选的标题说明 */
	caption?: string;
	/** 原始图片尺寸（如果已知） */
	naturalWidth?: number;
	naturalHeight?: number;
	/** 是否是视频 */
	isVideo?: boolean;
}

/**
 * 从DOM元素解析可预览的图片URL
 */
export class ImageResolver {
	private sieveEngine: SieveEngine;

	constructor(rules: SieveRule[] = []) {
		this.sieveEngine = new SieveEngine(rules);
	}

	/**
	 * 设置/更新规则
	 */
	setRules(rules: SieveRule[]): void {
		this.sieveEngine.loadRules(rules);
	}

	/**
	 * 获取规则引擎实例
	 */
	getEngine(): SieveEngine {
		return this.sieveEngine;
	}

	/**
	 * 从鼠标悬停的目标元素解析可预览的图片URL
	 */
	resolve(target: Element): ResolvedImage | null {
		// 尝试多种方式提取图片URL
		const result =
			this.resolveFromImg(target) ||
			this.resolveFromAnchor(target) ||
			this.resolveFromBackground(target) ||
			this.resolveFromParentAnchor(target);

		return result;
	}

	/**
	 * 从 <img> 元素解析
	 */
	private resolveFromImg(target: Element): ResolvedImage | null {
		if (target.tagName !== 'IMG') return null;
		const img = target as HTMLImageElement;
		const src = img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src') || '';

		if (!src) return null;

		// 跳过data:URL中过小的占位图
		if (src.startsWith('data:') && (img.naturalWidth < 10 || img.naturalHeight < 10)) {
			return null;
		}

		// 跳过很小的图标
		if (img.naturalWidth > 0 && img.naturalWidth < 30 && img.naturalHeight < 30) {
			// 检查是否是更大的背景图
			const bg = this.getBackgroundImage(img);
			if (bg) {
				return this.resolveUrl(bg, this.getCaption(img));
			}
			return null;
		}

		// 检查是否有srcset，尝试取最高分辨率
		const srcsetUrl = this.getBestSrcset(img);
		if (srcsetUrl) {
			return {
				url: this.normalizeUrl(srcsetUrl),
				caption: this.getCaption(img),
				naturalWidth: img.naturalWidth,
				naturalHeight: img.naturalHeight,
			};
		}

		return this.resolveUrl(src, this.getCaption(img));
	}

	/**
	 * 从 <a> 链接解析
	 */
	private resolveFromAnchor(target: Element): ResolvedImage | null {
		if (target.tagName !== 'A') return null;
		const anchor = target as HTMLAnchorElement;
		const href = anchor.href;
		const caption = this.getCaption(anchor);

		if (!href) return null;

		// 检查链接是否直接指向图片
		if (SieveEngine.isDirectImageURL(href)) {
			return { url: this.normalizeUrl(href), caption };
		}

		// 使用规则匹配
		const match = this.sieveEngine.matchURL(href);
		if (match) {
			const matchedUrl = this.normalizeUrl(match.matched);
			return { url: matchedUrl, caption };
		}

		// 如果链接内包含图片，尝试提取
		const img = anchor.querySelector('img');
		if (img) {
			const imgResult = this.resolveFromImg(img);
			if (imgResult) {
				// 使用链接的目标URL（通常是原图）覆盖图片的src
				imgResult.url = this.normalizeUrl(href);
				if (!imgResult.caption) {
					imgResult.caption = caption;
				}
				return imgResult;
			}
		}

		return null;
	}

	/**
	 * 从父级 <a> 元素解析（当目标不是<a>本身而是其子元素时）
	 */
	private resolveFromParentAnchor(target: Element): ResolvedImage | null {
		const parent = target.closest('a');
		if (!parent || parent === target) return null;

		// 如果父级<a>没有子图片，也可能直接指向图片
		const href = (parent as HTMLAnchorElement).href;
		if (!href) return null;

		// 检查是否为图片链接
		if (SieveEngine.isDirectImageURL(href)) {
			return {
				url: this.normalizeUrl(href),
				caption: this.getCaption(parent),
			};
		}

		// 使用规则匹配
		const match = this.sieveEngine.matchURL(href);
		if (match) {
			return {
				url: this.normalizeUrl(match.matched),
				caption: this.getCaption(parent) || this.getCaption(target),
			};
		}

		return null;
	}

	/**
	 * 从CSS background-image解析
	 */
	private resolveFromBackground(target: Element): ResolvedImage | null {
		const bgUrl = this.getBackgroundImage(target);
		if (!bgUrl) return null;
		return this.resolveUrl(bgUrl, this.getCaption(target));
	}

	/**
	 * 提取CSS background-image中的URL
	 */
	private getBackgroundImage(el: Element): string | null {
		const style = window.getComputedStyle(el);
		const bg = style.backgroundImage;
		if (!bg || bg === 'none') return null;

		const match = bg.match(/url\(["']?([^"')]+)["']?\)/);
		return match ? (match[1] ?? null) : null;
	}

	/**
	 * 从img的srcset中提取最高分辨率图片
	 */
	private getBestSrcset(img: HTMLImageElement): string | null {
		const srcset = img.getAttribute('srcset');
		if (!srcset) return null;

		const candidates = srcset.split(',').map(s => s.trim()).filter(Boolean);
		if (candidates.length === 0) return null;

		// 找最高分辨率的
		let bestUrl: string | null = null;
		let bestWidth = 0;

		for (const candidate of candidates) {
			const parts = candidate.split(/\s+/);
			if (parts.length >= 2 && parts[1]) {
				const descriptor = parts[1];
				let width = 0;
				if (descriptor.endsWith('w')) {
					width = parseInt(descriptor, 10);
				} else if (descriptor.endsWith('x')) {
					width = parseInt(descriptor, 10) * img.naturalWidth;
				}
				if (width > bestWidth) {
					bestWidth = width;
					bestUrl = parts[0] ?? null;
				}
			}
		}

		const firstCandidate = candidates[0];
		const firstUrl: string | null = firstCandidate ? firstCandidate.split(/\s+/)[0] ?? null : null;
		return bestUrl ?? firstUrl;
	}

	/**
	 * 从元素提取标题/说明文字
	 */
	private getCaption(el: Element): string | undefined {
		// 优先使用 title
		const title = el.getAttribute('title');
		if (title) return title;

		// 如果是图片，使用 alt
		if (el.tagName === 'IMG') {
			const alt = (el as HTMLImageElement).alt;
			if (alt && !alt.startsWith('data:')) return alt;
		}

		// 检查父元素的 title
		const parent = el.closest('[title]');
		if (parent) {
			const parentTitle = parent.getAttribute('title');
			if (parentTitle) return parentTitle;
		}

		// 检查链接文本（如果链接内没有其他元素）
		if (el.tagName === 'A') {
			const text = el.textContent?.trim();
			if (text && !el.querySelector('img')) {
				return text;
			}
		}

		return undefined;
	}

	/**
	 * 标准化URL（处理协议相对路径等）
	 */
	private normalizeUrl(url: string): string {
		if (!url) return url;

		// 处理协议相对路径 //example.com/path
		if (url.startsWith('//')) {
			return window.location.protocol + url;
		}

		// 处理相对路径
		if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('data:')) {
			// 如果是 Obsidian 的本地资源 app:// 
			if (url.startsWith('app://') || url.startsWith('obsidian://')) {
				return url;
			}
			// 相对路径尽量解析
			try {
				return new URL(url, window.location.href).href;
			} catch {
				return url;
			}
		}

		return url;
	}

	/**
	 * 解析URL，先检查是否为直接图片，再用规则匹配
	 */
	private resolveUrl(url: string, caption?: string): ResolvedImage | null {
		if (!url) return null;

		const normalizedUrl = this.normalizeUrl(url);

		// 直接是图片URL
		if (SieveEngine.isDirectImageURL(normalizedUrl)) {
			return { url: normalizedUrl, caption };
		}

		// 用img规则匹配
		const match = this.sieveEngine.matchImgURL(normalizedUrl);
		if (match) {
			return {
				url: this.normalizeUrl(match.matched),
				caption,
			};
		}

		return { url: normalizedUrl, caption };
	}
}
