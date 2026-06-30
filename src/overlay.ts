/**
 * PreviewOverlay - 浮动图片预览窗口
 * 参考 Imagus 的 PVI.DIV 实现
 */

export interface OverlayConfig {
	opacity: number;
	zoom: number;
	showCaption: boolean;
	background: string;
	border: string;
	borderRadius: number;
	boxShadow: string;
	padding: number;
	loadIndicatorColor: string;
	animationDuration: number;
	/** 滚轮缩放按键: 'none' | 'ctrl' | 'alt' | 'shift' | 'meta' */
	zoomModifier: string;
}

export const OVERLAY_DEFAULTS: OverlayConfig = {
	opacity: 1,
	zoom: 1,
	showCaption: true,
	background: '#1e1e1e',
	border: '2px solid #555',
	borderRadius: 8,
	boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
	padding: 4,
	loadIndicatorColor: '#7c7c7c',
	animationDuration: 150,
	zoomModifier: 'shift',
};

export class PreviewOverlay {
	private container: HTMLDivElement;
	private imageEl: HTMLImageElement;
	private captionEl: HTMLDivElement;
	private loaderEl: HTMLDivElement;
	private active: boolean = false;
	private hideTimer: number | null = null;
	private lastMouseX: number = 0;
	private lastMouseY: number = 0;
	private config: OverlayConfig;
	private visible: boolean = false;

	constructor(config: Partial<OverlayConfig> = {}) {
		this.config = { ...OVERLAY_DEFAULTS, ...config };
		this.container = this.createContainer();
		this.imageEl = this.createImage();
		this.captionEl = this.createCaption();
		this.loaderEl = this.createLoader();

		this.container.appendChild(this.loaderEl);
		this.container.appendChild(this.imageEl);
		this.container.appendChild(this.captionEl);
		document.body.appendChild(this.container);

		// 全局监听 Shift+滚轮缩放（因为容器 pointer-events: none）
		window.addEventListener('wheel', this.handleWheel, { passive: false });
	}

	private createContainer(): HTMLDivElement {
		const el = document.createElement('div');
		el.className = 'image-hover-preview-container';
		el.style.cssText = `
			position: fixed;
			z-index: 2147483647;
			display: none;
			pointer-events: none;
			background: ${this.config.background};
			border: ${this.config.border};
			border-radius: ${this.config.borderRadius}px;
			box-shadow: ${this.config.boxShadow};
			padding: ${this.config.padding}px;
			opacity: 0;
			transition: opacity ${this.config.animationDuration}ms ease-out;
			box-sizing: content-box;
			overflow: hidden;
		`;
		return el;
	}

	private createImage(): HTMLImageElement {
		const img = document.createElement('img');
		img.className = 'image-hover-preview-img';
		img.style.cssText = `
			display: block;
			max-width: 100%;
			max-height: 100%;
			width: auto;
			height: auto;
			margin: 0 auto;
			object-fit: contain;
			border-radius: ${Math.max(0, this.config.borderRadius - 2)}px;
		`;
		img.alt = '';
		img.draggable = false;
		img.addEventListener('load', () => this.onImageLoaded());
		img.addEventListener('error', () => this.onImageError());
		return img;
	}

	private createCaption(): HTMLDivElement {
		const el = document.createElement('div');
		el.className = 'image-hover-preview-caption';
		el.style.cssText = `
			display: ${this.config.showCaption ? 'block' : 'none'};
			text-align: center;
			padding: 4px 8px;
			font-size: 12px;
			color: #ccc;
			background: rgba(0,0,0,0.6);
			border-radius: 0 0 ${Math.max(0, this.config.borderRadius - 2)}px ${Math.max(0, this.config.borderRadius - 2)}px;
			word-break: break-all;
			max-height: 40px;
			overflow: hidden;
		`;
		return el;
	}

	private createLoader(): HTMLDivElement {
		const el = document.createElement('div');
		el.className = 'image-hover-preview-loader';
		el.style.cssText = `
			position: absolute;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			width: 32px;
			height: 32px;
			border: 3px solid ${this.config.loadIndicatorColor}33;
			border-top-color: ${this.config.loadIndicatorColor};
			border-radius: 50%;
			animation: image-hover-spin 0.8s linear infinite;
			display: none;
		`;

		// 添加 keyframes（如果还没有）
		if (!document.getElementById('image-hover-preview-styles')) {
			const style = document.createElement('style');
			style.id = 'image-hover-preview-styles';
			style.textContent = `
				@keyframes image-hover-spin {
					to { transform: translate(-50%, -50%) rotate(360deg); }
				}
			`;
			document.head.appendChild(style);
		}

		return el;
	}

	/**
	 * 在鼠标位置附近显示指定URL的图片预览
	 */
	show(url: string, mouseX: number, mouseY: number, caption?: string): void {
		// 清除隐藏定时器
		if (this.hideTimer !== null) {
			clearTimeout(this.hideTimer);
			this.hideTimer = null;
		}

		// 如果已经有图片在加载，重置
		if (this.active && this.imageEl.src !== url) {
			this.resetImage();
		}

		this.active = true;

		// 显示加载动画
		this.loaderEl.style.display = 'block';
		this.imageEl.style.display = 'none';

		// 设置图片源
		this.imageEl.src = url;

		// 保存鼠标位置，用于图片加载后重新定位
		this.lastMouseX = mouseX;
		this.lastMouseY = mouseY;

		// 设置位置
		this.positionAt(mouseX, mouseY);

		// 设置标题
		if (caption && this.config.showCaption) {
			this.captionEl.textContent = caption;
			this.captionEl.style.display = 'block';
		} else if (this.config.showCaption) {
			// 尝试从URL提取文件名作为标题
			const fileName = url.split('/').pop()?.split('?')[0] || '';
			this.captionEl.textContent = fileName;
			this.captionEl.style.display = 'block';
		} else {
			this.captionEl.style.display = 'none';
		}

		// 显示容器
		this.container.style.display = 'block';

		// 触发重排后渐入
		requestAnimationFrame(() => {
			this.container.style.opacity = String(this.config.opacity);
			this.visible = true;
		});
	}

	/**
	 * 隐藏预览窗口
	 */
	hide(immediate: boolean = false): void {
		if (!this.active && !this.visible) return;

		const doHide = () => {
			this.container.style.display = 'none';
			this.container.style.opacity = '0';
			this.visible = false;
			this.resetImage();
		};

		if (immediate) {
			doHide();
		} else {
			this.container.style.opacity = '0';
			this.hideTimer = window.setTimeout(() => {
				if (this.visible) return; // 如果在超时期间又显示了，不隐藏
				doHide();
			}, this.config.animationDuration + 50);
		}
	}

	/**
	 * 更新预览窗口位置（跟随鼠标移动）
	 */
	updatePosition(mouseX: number, mouseY: number): void {
		if (!this.visible) return;
		this.lastMouseX = mouseX;
		this.lastMouseY = mouseY;
		this.positionAt(mouseX, mouseY);
	}

	/**
	 * 更新配置
	 */
	updateConfig(config: Partial<OverlayConfig>): void {
		Object.assign(this.config, config);
		// 应用样式变更
		this.container.style.opacity = String(this.config.opacity);
		this.captionEl.style.display = this.config.showCaption && this.active ? 'block' : 'none';
	}

	/**
	 * 销毁预览窗口
	 */
	destroy(): void {
		window.removeEventListener('wheel', this.handleWheel);
		if (this.hideTimer !== null) {
			clearTimeout(this.hideTimer);
		}
		if (this.container.parentNode) {
			this.container.parentNode.removeChild(this.container);
		}
		this.active = false;
		this.visible = false;
	}

	/**
	 * 判断当前是否正在显示
	 */
	isVisible(): boolean {
		return this.visible;
	}

	/**
	 * 获取当前显示的图片URL
	 */
	getCurrentUrl(): string | null {
		return this.active ? this.imageEl.src : null;
	}

	/**
	 * 放大/缩小预览（鼠标滚轮支持）
	 */
	zoomIn(factor: number = 1.2): void {
		this.config.zoom *= factor;
		this.applyZoom();
	}

	zoomOut(factor: number = 0.8): void {
		this.config.zoom /= (1 / factor);
		this.applyZoom();
	}

	resetZoom(): void {
		this.config.zoom = 1;
		this.applyZoom();
		this.positionAt(this.lastMouseX, this.lastMouseY);
	}

	private applyZoom(): void {
		if (this.imageEl.naturalWidth) {
			const w = this.imageEl.naturalWidth * this.config.zoom;
			const h = this.imageEl.naturalHeight * this.config.zoom;
			this.imageEl.style.width = w + 'px';
			this.imageEl.style.height = h + 'px';
		}
	}

	/**
	 * 判断事件中是否按下了指定的修饰键
	 */
	private isModifierPressed(event: WheelEvent, modifier: string): boolean {
		switch (modifier) {
			case 'ctrl': return event.ctrlKey;
			case 'alt': return event.altKey;
			case 'shift': return event.shiftKey;
			case 'meta': return event.metaKey;
			default: return false;
		}
	}

	/**
	 * 处理修饰键 + 滚轮缩放
	 */
	private handleWheel = (event: WheelEvent): void => {
		if (!this.visible || this.config.zoomModifier === 'none') return;
		if (!this.isModifierPressed(event, this.config.zoomModifier)) return;
		event.preventDefault();
		event.stopPropagation();

		// 计算最大有效缩放比：当图片放大到编辑区域边界时停止
		const maxZoom = this.getMaxZoom();

		const factor = event.deltaY > 0 ? 0.9 : 1.1;
		this.config.zoom *= factor;
		this.config.zoom = Math.max(0.05, Math.min(this.config.zoom, maxZoom));
		this.applyZoom();
		this.positionAt(this.lastMouseX, this.lastMouseY);
	};

	/**
	 * 计算最大有效缩放比：图片放大到填满编辑区域即可，继续放大只放大背景
	 */
	private getMaxZoom(): number {
		const naturalW = this.imageEl.naturalWidth;
		const naturalH = this.imageEl.naturalHeight;
		if (!naturalW || !naturalH) return 10;
		const editor = this.getEditorBounds();
		const maxW = Math.max(100, editor.width - 10 * 2);
		const maxH = Math.max(100, editor.height - 10 * 2);
		return Math.max(1, Math.min(maxW / naturalW, maxH / naturalH));
	}

	/**
	 * 获取 Obsidian 笔记编辑区域的边界（相对于视口）
	 * 用于将预览限制在编辑区域内，不遮挡左右侧边栏
	 */
	private getEditorBounds(): { left: number; top: number; width: number; height: number } {
	 // 先尝试通过 active leaf 的 view-content 获取精确编辑区域
	 // 限定在 .workspace-split.mod-root 内，避免侧边栏获得焦点时取到侧边栏的边界
	 const leafSelectors = [
	  '.workspace-split.mod-root .workspace-leaf.mod-active .view-content',
	  '.workspace-split.mod-root .workspace-leaf.mod-active .cm-scroller',
	  '.workspace-split.mod-root .workspace-leaf.mod-active .workspace-leaf-content',
	 ];
		for (const sel of leafSelectors) {
			const el = document.querySelector(sel) as HTMLElement | null;
			if (el) {
				return el.getBoundingClientRect();
			}
		}
		// 回退：获取根工作区域并减去左右侧边栏
		const root = document.querySelector('.workspace-split.mod-root') as HTMLElement | null;
		if (root) {
			const rootRect = root.getBoundingClientRect();
			let left = rootRect.left;
			let width = rootRect.width;
			// 减去左侧边栏（含 ribbon）
			const leftSplit = document.querySelector('.workspace-split.mod-left-split') as HTMLElement | null;
			if (leftSplit) {
				const leftRect = leftSplit.getBoundingClientRect();
				left = leftRect.right;
				width = rootRect.right - leftRect.right;
			}
			// 减去右侧边栏
			const rightSplit = document.querySelector('.workspace-split.mod-right-split') as HTMLElement | null;
			if (rightSplit) {
				const rightRect = rightSplit.getBoundingClientRect();
				width = rightRect.left - left;
			}
			return { left, top: rootRect.top, width, height: rootRect.height };
		}
		// 最终回退到整个视口
		return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
	}

	private positionAt(mouseX: number, mouseY: number): void {
		const OFFSET = 20; // 光标与预览窗口的间距
		const MARGIN = 10; // 窗口边缘与编辑区域边缘的最小间距

		const editor = this.getEditorBounds();
		const viewLeft = editor.left;
		const viewTop = editor.top;
		const viewRight = editor.left + editor.width;
		const viewBottom = editor.top + editor.height;

		// 容器最大尺寸 = 编辑区域 - 边距，防止溢出到侧边栏
		const maxContainerWidth = Math.max(100, editor.width - MARGIN * 2);
		const maxContainerHeight = Math.max(100, editor.height - MARGIN * 2);
		this.container.style.setProperty('--preview-max-width', maxContainerWidth + 'px');
		this.container.style.setProperty('--preview-max-height', maxContainerHeight + 'px');

		// 先临时设置到 (0,0) 位置来获取尺寸
		this.container.style.left = '0px';
		this.container.style.top = '0px';

		// 获取尺寸
		const rect = this.container.getBoundingClientRect();

		let left: number;
		let top: number;

		// 判断在光标右边还是左边显示
		if (mouseX + OFFSET + rect.width + MARGIN <= viewRight) {
			// 右侧有足够空间
			left = mouseX + OFFSET;
		} else if (mouseX - OFFSET - rect.width - MARGIN >= viewLeft) {
			// 左侧有足够空间
			left = mouseX - OFFSET - rect.width;
		} else {
			// 两侧都不够，取空间较大的一侧
			const rightSpace = viewRight - mouseX;
			const leftSpace = mouseX - viewLeft;
			left = rightSpace > leftSpace
				? Math.min(mouseX + OFFSET, viewRight - rect.width - MARGIN)
				: Math.max(viewLeft + MARGIN, mouseX - OFFSET - rect.width);
		}

		// 垂直位置
		if (mouseY + OFFSET + rect.height + MARGIN <= viewBottom) {
			top = mouseY + OFFSET;
		} else if (mouseY - OFFSET - rect.height - MARGIN >= viewTop) {
			top = mouseY - OFFSET - rect.height;
		} else {
			const bottomSpace = viewBottom - mouseY;
			const topSpace = mouseY - viewTop;
			top = bottomSpace > topSpace
				? Math.min(mouseY + OFFSET, viewBottom - rect.height - MARGIN)
				: Math.max(viewTop + MARGIN, mouseY - OFFSET - rect.height);
		}

		// 保证容器不超出编辑区域边界
		left = Math.max(viewLeft + MARGIN, left);
		top = Math.max(viewTop + MARGIN, top);
		// 右侧不超出编辑区域右边界
		if (left + rect.width + MARGIN > viewRight) {
			left = Math.max(viewLeft + MARGIN, viewRight - rect.width - MARGIN);
		}
		// 底部不超出编辑区域下边界
		if (top + rect.height + MARGIN > viewBottom) {
			top = Math.max(viewTop + MARGIN, viewBottom - rect.height - MARGIN);
		}

		this.container.style.left = left + 'px';
		this.container.style.top = top + 'px';
	}

	private onImageLoaded(): void {
		this.loaderEl.style.display = 'none';
		this.imageEl.style.display = 'block';
		// 重置缩放
		this.imageEl.style.width = '';
		this.imageEl.style.height = '';
		this.config.zoom = 1;

		// 检查图片自然尺寸是否超出编辑区域，自动缩小到合适尺寸
		// 注意：不能使用 container.getBoundingClientRect() 来判断，因为容器已经受到
		// --preview-max-height CSS 变量的约束，rect 始终 <= 编辑区域，导致缩放检查永远不触发
		const editor = this.getEditorBounds();
		const MARGIN = 10;
		const maxW = Math.max(100, editor.width - MARGIN * 2);
		const maxH = Math.max(100, editor.height - MARGIN * 2);
		const naturalW = this.imageEl.naturalWidth;
		const naturalH = this.imageEl.naturalHeight;
		if (naturalW > 0 && naturalH > 0 && (naturalW > maxW || naturalH > maxH)) {
			const fitX = maxW / naturalW;
			const fitY = maxH / naturalH;
			this.config.zoom = Math.min(fitX, fitY, 1);
			this.applyZoom();
		}

		// 图片加载完成后重新定位，确保在视口内
		this.positionAt(this.lastMouseX, this.lastMouseY);
	}

	private onImageError(): void {
		this.loaderEl.style.display = 'none';
		this.imageEl.style.display = 'block';
		this.imageEl.alt = '加载失败';

		// 显示加载失败信息
		this.captionEl.textContent = '⚠ 图片加载失败';
		this.captionEl.style.display = 'block';
	}

	private resetImage(): void {
		this.imageEl.src = '';
		this.imageEl.alt = '';
		this.imageEl.style.display = 'none';
		this.loaderEl.style.display = 'none';
		this.active = false;
	}
}
