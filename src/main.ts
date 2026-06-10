import { Notice, Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, PluginSettings, SampleSettingTab } from "./settings";
import { PreviewOverlay, OverlayConfig } from "./overlay";
import { ImageResolver } from "./resolver";
import { DEFAULT_SIEVE_RULES } from "./sieve";

export default class ImageHoverPlugin extends Plugin {
	settings: PluginSettings;
	overlay: PreviewOverlay;
	resolver: ImageResolver;

	private showTimer: number | null = null;
	private hideTimer: number | null = null;
	private currentTarget: Element | null = null;
	private lastMouseX: number = 0;
	private lastMouseY: number = 0;
	private eventListeners: Array<{ target: EventTarget; event: string; handler: EventListenerOrEventListenerObject; options?: any }> = [];
	private markEl: HTMLElement | null = null;
	private mouseInsideTarget: boolean = false;

	async onload() {
		await this.loadSettings();

		// 创建预览窗口
		this.overlay = new PreviewOverlay(this.getOverlayConfig());

		// 创建解析器
		this.resolver = new ImageResolver(DEFAULT_SIEVE_RULES);

		// 注册设置页
		this.addSettingTab(new SampleSettingTab(this.app, this));

	// 注册命令
		this.addCommand({
			id: 'toggle-image-preview',
			name: '切换图片悬停预览',
			callback: () => {
				this.settings.enabled = !this.settings.enabled;
				this.saveSettings();
				if (this.settings.enabled) {
					this.enablePreview();
				} else {
					this.disablePreview();
				}
				new Notice(`图片预览已${this.settings.enabled ? '启用' : '禁用'}`);
			}
		});

		// 如果启用，注册事件
		if (this.settings.enabled) {
			this.enablePreview();
		}

		console.log('Image Hover Preview 插件已加载');
	}

	onunload() {
		this.disablePreview();
		if (this.overlay) {
			this.overlay.destroy();
		}
		console.log('Image Hover Preview 插件已卸载');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<PluginSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * 更新预览窗口配置
	 */
	updateOverlayConfig(): void {
		if (this.overlay) {
			this.overlay.updateConfig(this.getOverlayConfig());
		}
	}

	private getOverlayConfig(): Partial<OverlayConfig> {
		return {
			opacity: this.settings.opacity,
			showCaption: this.settings.showCaption,
			background: this.settings.background,
			border: this.settings.border,
			borderRadius: this.settings.roundness,
			boxShadow: this.settings.boxShadow,
			zoomModifier: this.settings.zoomModifier,
		};
	}

	/**
	 * 启用预览功能
	 */
	enablePreview(): void {
		// 先清理已有监听器，避免重复注册
		this.removeAllEvents();

		// 鼠标移入
		this.addEvent(document, 'mouseover', (e: MouseEvent) => {
			if (!this.settings.enabled) return;
			if (!this.isTriggerKeyPressed(e)) return;
			this.handleMouseOver(e);
		}, { capture: true });

		// 鼠标移出
		this.addEvent(document, 'mouseout', (e: MouseEvent) => {
			if (!this.settings.enabled) return;
			this.handleMouseOut(e);
		}, { capture: true });

		// 鼠标移动（更新位置）
		this.addEvent(document, 'mousemove', (e: MouseEvent) => {
			this.lastMouseX = e.clientX;
			this.lastMouseY = e.clientY;

			if (!this.settings.enabled) return;
			if (this.overlay && this.overlay.isVisible()) {
				this.overlay.updatePosition(e.clientX, e.clientY);
			}
		}, { capture: true });

		// 键盘事件
		this.addEvent(document, 'keydown', (e: KeyboardEvent) => {
			if (!this.settings.enabled) return;
			// 如果按下的是禁用键且预览正在显示，立即隐藏
			if (this.overlay && this.overlay.isVisible() && this.isSuppressKeyEvent(e)) {
				this.hidePreview(true);
			}
		});

		// 离开页面时隐藏
		this.addEvent(document, 'mouseleave', () => {
			this.hidePreview();
		});

		// 滚动时隐藏
		this.addEvent(document, 'scroll', () => {
			if (this.overlay && this.overlay.isVisible()) {
				this.hidePreview();
			}
		}, { capture: true, passive: true });

		// Obsidian 的布局变化
		this.registerEvent(this.app.workspace.on('layout-change', () => {
			this.hidePreview(true);
		}));

		// 活动叶子变化
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
			this.hidePreview(true);
		}));

		// 预加载
		if (this.settings.preloadEnabled) {
			this.registerEvent(this.app.workspace.on('layout-change', () => {
				setTimeout(() => this.preloadImages(), 1000);
			}));
		}
	}

	/**
	 * 禁用预览功能
	 */
	disablePreview(): void {
		this.hidePreview(true);
		this.removeAllEvents();
	}

	/**
	 * 处理鼠标悬停
	 */
	private handleMouseOver(e: MouseEvent): void {
		const target = e.target as Element;

		// 跳过预览窗口自身的元素
		if (target.closest('.image-hover-preview-container')) return;

		// 检查是否按下了临时禁用键
		if (this.isSuppressKeyPressed(e)) {
			// 如果预览已显示则立即隐藏
			if (this.overlay && this.overlay.isVisible()) {
				this.hidePreview(true);
			}
			return;
		}

		// 检查目标元素是否可以预览
		const resolved = this.resolver.resolve(target);
		if (!resolved) return;

		// 检查图片尺寸是否够大
		if (target.tagName === 'IMG') {
			const img = target as HTMLImageElement;
			if (img.naturalWidth > 0 && img.naturalHeight > 0) {
				if (img.naturalWidth < this.settings.minImageSize &&
					img.naturalHeight < this.settings.minImageSize) {
					return;
				}
			}
		}

		this.currentTarget = target;
		this.lastMouseX = e.clientX;
		this.lastMouseY = e.clientY;
		this.mouseInsideTarget = true;

		// 显示悬停标记
		this.showHoverMark(target);

		// 清除之前的定时器
		if (this.showTimer !== null) {
			clearTimeout(this.showTimer);
		}
		if (this.hideTimer !== null) {
			clearTimeout(this.hideTimer);
			this.hideTimer = null;
		}

		// 延迟显示预览
		if (this.settings.delay > 0) {
			this.showTimer = window.setTimeout(() => {
				if (this.currentTarget === target && this.mouseInsideTarget) {
					this.showPreview(resolved!.url, resolved!.caption);
				}
			}, this.settings.delay);
		} else {
			this.showPreview(resolved.url, resolved.caption);
		}
	}

	/**
	 * 处理鼠标移出
	 */
	private handleMouseOut(e: MouseEvent): void {
		const target = e.target as Element;
		const relatedTarget = e.relatedTarget as Element | null;

		// 检查是否真的离开了目标（而不是进入子元素）
		if (this.currentTarget && this.currentTarget.contains(target) && relatedTarget && this.currentTarget.contains(relatedTarget)) {
			return;
		}

		// 如果进入了预览窗口自身，不隐藏
		if (relatedTarget && relatedTarget.closest('.image-hover-preview-container')) {
			return;
		}

		if (target === this.currentTarget || (this.currentTarget && this.currentTarget.contains(target))) {
			this.mouseInsideTarget = false;
			this.removeHoverMark();

			if (this.showTimer !== null) {
				clearTimeout(this.showTimer);
				this.showTimer = null;
			}

			this.hidePreview();
		}
	}

	/**
	 * 显示预览
	 */
	private showPreview(url: string, caption?: string): void {
		if (!this.overlay) return;
		this.overlay.show(url, this.lastMouseX, this.lastMouseY, caption);
	}

	/**
	 * 隐藏预览
	 */
	private hidePreview(immediate: boolean = false): void {
		if (this.hideTimer !== null) {
			clearTimeout(this.hideTimer);
			this.hideTimer = null;
		}

		if (this.overlay) {
			this.overlay.hide(immediate);
		}
		this.removeHoverMark();
	}

	/**
	 * 显示悬停标记
	 */
	private showHoverMark(target: Element): void {
		if (this.settings.hoverEffect === 'none') return;

		if (this.settings.hoverEffect === 'cursor') {
			(target as HTMLElement).style.cursor = 'zoom-in';
		} else if (this.settings.hoverEffect === 'outline') {
			if (target instanceof HTMLElement) {
				this.markEl = target;
				target.style.outline = '2px solid var(--intergenic-accent, #6c8cff)';
				target.style.outlineOffset = '1px';
			}
		}
	}

	/**
	 * 移除悬停标记
	 */
	private removeHoverMark(): void {
		if (this.markEl) {
			this.markEl.style.outline = '';
			this.markEl.style.outlineOffset = '';
			this.markEl.style.cursor = '';
			this.markEl = null;
		}
	}

	/**
	 * 检查触发按键是否按下
	 */
	private isTriggerKeyPressed(e: MouseEvent): boolean {
		if (this.settings.triggerModifier === 'none') return true;
		switch (this.settings.triggerModifier) {
			case 'ctrl': return e.ctrlKey;
			case 'alt': return e.altKey;
			case 'shift': return e.shiftKey;
			case 'meta': return e.metaKey;
			default: return true;
		}
	}

	/**
	 * 检查临时禁用键是否被按下
	 */
	private isSuppressKeyPressed(e: MouseEvent): boolean {
		if (this.settings.suppressModifier === 'none') return false;
		switch (this.settings.suppressModifier) {
			case 'ctrl': return e.ctrlKey;
			case 'alt': return e.altKey;
			case 'shift': return e.shiftKey;
			case 'meta': return e.metaKey;
			default: return false;
		}
	}

	/**
	 * 检查键盘事件是否匹配禁用键（用于keydown时判断）
	 */
	private isSuppressKeyEvent(e: KeyboardEvent): boolean {
		if (this.settings.suppressModifier === 'none') return false;
		switch (this.settings.suppressModifier) {
			case 'ctrl': return e.key === 'Control' || e.ctrlKey;
			case 'alt': return e.key === 'Alt' || e.altKey;
			case 'shift': return e.key === 'Shift' || e.shiftKey;
			case 'meta': return e.key === 'Meta' || e.metaKey;
			default: return false;
		}
	}

	/**
	 * 注册DOM事件（方便统一清理）
	 */
	private addEvent(
		target: EventTarget,
		event: string,
		handler: EventListenerOrEventListenerObject,
		options?: any
	): void {
		target.addEventListener(event, handler, options);
		this.eventListeners.push({ target, event, handler, options });
	}

	/**
	 * 清理所有注册的事件
	 */
	private removeAllEvents(): void {
		for (const { target, event, handler, options } of this.eventListeners) {
			target.removeEventListener(event, handler, options);
		}
		this.eventListeners = [];
	}

	/**
	 * 预扫描可预览的图片
	 */
	private preloadImages(): void {
		if (!this.settings.preloadEnabled) return;

		// 扫描图片元素，预解析URL
		const images = document.querySelectorAll('img:not(.image-hover-preview-img)');
		images.forEach((img) => {
			const resolved = this.resolver.resolve(img);
			if (resolved && resolved.url && resolved.url !== img.getAttribute('src')) {
				// 预加载
				const preloadImg = new Image();
				preloadImg.src = resolved.url;
			}
		});
	}
}
