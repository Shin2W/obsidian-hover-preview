/**
 * SieveEngine - 图片URL提取规则引擎
 * 参考自 Imagus 扩展的规则系统，针对 Obsidian 使用场景精简
 */

export interface SieveRule {
	/** 规则名称 */
	name: string;
	/** 匹配链接的正则 */
	link?: RegExp;
	/** 匹配图片URL的正则 */
	img?: RegExp;
	/** URL转换规则（替换字符串、数组或函数） */
	to?: string | string[] | ((url: string) => string);
	/** 是否禁用 */
	off?: boolean;
	/** 备注 */
	note?: string;
}

export interface SieveResult {
	url: string;
	caption?: string;
}

/**
 * 将URL中的HTTP协议前缀标准化
 */
function normalizeURL(url: string, pageProtocol: string): string {
	if (url.startsWith('//')) {
		return pageProtocol + url;
	}
	return url;
}

/**
 * 规则引擎类
 * 负责匹配DOM元素的href/src，提取原图URL
 */
export class SieveEngine {
	private rules: SieveRule[] = [];
	private pageProtocol: string;

	constructor(rules: SieveRule[] = []) {
		this.pageProtocol = window.location.protocol;
		this.loadRules(rules);
	}

	/**
	 * 加载规则列表
	 */
	loadRules(rules: SieveRule[]): void {
		this.rules = rules.filter(r => !r.off);
	}

	/**
	 * 获取当前加载的规则列表
	 */
	getRules(): SieveRule[] {
		return [...this.rules];
	}

	/**
	 * 尝试匹配URL并提取原图地址
	 * @param url 要匹配的URL
	 * @returns 匹配到的规则和提取结果
	 */
	matchURL(url: string): { rule: SieveRule; matched: string } | null {
		// 去掉协议前缀以便匹配
		const cleanURL = url.replace(/^https?:\/\//i, '');

		for (const rule of this.rules) {
			if (!rule.link) continue;
			const match = cleanURL.match(rule.link);
			if (match) {
				if (rule.to) {
					// 应用转换
					let result = url;
					if (typeof rule.to === 'string') {
						result = url.replace(rule.link, rule.to);
					} else if (Array.isArray(rule.to)) {
						result = url.replace(rule.link, rule.to[0] || '');
					} else if (typeof rule.to === 'function') {
						result = rule.to(url);
					}
					return { rule, matched: result };
				}
				return { rule, matched: url };
			}
		}
		return null;
	}

	/**
	 * 匹配图片URL（用于img元素的src）
	 */
	matchImgURL(url: string): { rule: SieveRule; matched: string } | null {
		const cleanURL = url.replace(/^https?:\/\//i, '');

		for (const rule of this.rules) {
			if (!rule.img) continue;
			const match = cleanURL.match(rule.img);
			if (match) {
				if (rule.to) {
					let result = url;
					if (typeof rule.to === 'string') {
						result = url.replace(rule.img, rule.to);
					} else if (Array.isArray(rule.to)) {
						result = url.replace(rule.img, rule.to[0] || '');
					} else if (typeof rule.to === 'function') {
						result = rule.to(url);
					}
					return { rule, matched: normalizeURL(result, this.pageProtocol) };
				}
				return { rule, matched: url };
			}
		}
		return null;
	}

	/**
	 * 是否直接是图片URL
	 */
	static isDirectImageURL(url: string): boolean {
		return /\.(jpe?g|png|gif|webp|bmp|svg|webm|mp4)(\?.*)?(#.*)?$/i.test(url);
	}
}

/**
 * 内置的常用规则集
 * 这些规则帮助从缩略图链接提取原图
 */
export const DEFAULT_SIEVE_RULES: SieveRule[] = [
	{
		name: 'imgur',
		link: /^(?:i\.)?imgur\.com\/([a-zA-Z0-9]+)([sbtmlh]?)(\.[a-z]+)?$/i,
		img: /^(?:i\.)?imgur\.com\/([a-zA-Z0-9]+)[sbtmlh]?(\.[a-z]+)?$/i,
		to: '//i.imgur.com/$1.$2',
		note: 'Imgur 图片托管'
	},
	{
		name: 'imgur-album',
		link: /^imgur\.com\/(?:a|gallery)\/([a-zA-Z0-9]+)/i,
		note: 'Imgur 图集'
	},
	{
		name: 'flickr',
		link: /^flickr\.com\/photos\/[^/]+\/(\d+)/i,
		note: 'Flickr 图片'
	},
	{
		name: 'deviantArt',
		link: /^[^.]*\.deviantart\.com\/art\//i,
		img: /^images-wixmp-ed30a86b8c4ca887773594c2\.wixmp\.com\/[a-z]\//i,
		note: 'DeviantArt'
	},
	{
		name: '500px',
		link: /^500px\.com\/photo\/\d+/i,
		note: '500px'
	},
	{
		name: 'Unsplash',
		link: /^unsplash\.com\/photos\//i,
		img: /^images\.unsplash\.com\//i,
		to: '$&?w=1920',
		note: 'Unsplash'
	},
	{
		name: 'Wikipedia',
		img: /^upload\.wikimedia\.org\/wikipedia\/commons\/thumb\//i,
		to: (url: string) => url.replace('/thumb/', '/').replace(/\/\d+px-.+$/i, ''),
		note: 'Wikipedia 图片'
	},
	{
		name: 'Pixiv',
		link: /^pixiv\.net\/(?:\w\w\/)?artworks\//i,
		note: 'Pixiv 插画'
	},
	{
		name: 'GitHub',
		link: /^github\.com\/[^/]+\/[^/]+\/blob\//i,
		to: (url: string) => url.replace('/blob/', '/raw/'),
		note: 'GitHub 原始文件'
	},
	{
		name: 'Twitter',
		img: /^pbs\.twimg\.com\/media\//i,
		to: (url: string) => url.replace(/:(thumb|small|medium|large)$/i, ':orig'),
		note: 'Twitter 图片'
	},
	{
		name: 'Reddit preview',
		img: /^preview\.redd\.it\//i,
		to: (url: string) => url.replace(/\?.*$/, ''),
		note: 'Reddit 预览图'
	},
	{
		name: 'Steam',
		img: /^steamuserimages-[^.]*\.akamaihd\.net\//i,
		note: 'Steam 图片'
	}
];
