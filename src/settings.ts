import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type ImageHoverPlugin from "./main";

export interface PluginSettings {
	/** 触发方式: 'none' | 'ctrl' | 'alt' | 'shift' | 'meta' */
	triggerModifier: string;
	/** 临时禁用键: 'none' | 'ctrl' | 'alt' | 'shift' | 'meta' */
	suppressModifier: string;
	/** 显示延迟(ms) */
	delay: number;
	/** 预览窗口透明度 0-1 */
	opacity: number;
	/** 是否显示标题 */
	showCaption: boolean;
	/** 预览窗口背景色 */
	background: string;
	/** 边框样式 */
	border: string;
	/** 圆角大小 */
	roundness: number;
	/** 阴影 */
	boxShadow: string;
	/** 鼠标悬浮时的效果: 'none' | 'outline' | 'cursor' */
	hoverEffect: string;
	/** 是否启用 */
	enabled: boolean;
	/** 图片最小尺寸（小于此尺寸不显示预览） */
	minImageSize: number;
	/** 是否预加载 */
	preloadEnabled: boolean;
	/** 放大快捷键: 'none' | 'ctrl' | 'alt' | 'shift' | 'meta' */
	zoomModifier: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	triggerModifier: 'none',
	suppressModifier: 'ctrl',
	delay: 300,
	opacity: 1,
	showCaption: true,
	background: '#1e1e1e',
	border: '2px solid #555',
	roundness: 8,
	boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
	hoverEffect: 'outline',
	enabled: true,
	minImageSize: 30,
	preloadEnabled: true,
	zoomModifier: 'shift',
};

export class SampleSettingTab extends PluginSettingTab {
	plugin: ImageHoverPlugin;

	constructor(app: App, plugin: ImageHoverPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: '图片悬停预览设置' });

		// 启用/禁用
		new Setting(containerEl)
			.setName('启用插件')
			.setDesc('开启或关闭图片悬停预览功能')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enabled)
				.onChange(async (value) => {
					this.plugin.settings.enabled = value;
					await this.plugin.saveSettings();
					if (value) {
						this.plugin.enablePreview();
						new Notice('图片悬停预览已启用');
					} else {
						this.plugin.disablePreview();
						new Notice('图片悬停预览已禁用');
					}
				}));

		// 触发方式
		new Setting(containerEl)
			.setName('触发按键')
			.setDesc('需要按住哪个键才触发预览（"无"表示直接悬停触发）')
			.addDropdown(dropdown => dropdown
				.addOption('none', '无（直接悬停）')
				.addOption('ctrl', 'Ctrl')
				.addOption('alt', 'Alt')
				.addOption('shift', 'Shift')
				.addOption('meta', 'Meta/Win')
				.setValue(this.plugin.settings.triggerModifier)
				.onChange(async (value) => {
					this.plugin.settings.triggerModifier = value;
					await this.plugin.saveSettings();
				}));

		// 临时禁用键
		new Setting(containerEl)
			.setName('临时禁用键')
			.setDesc('按住此键时临时禁用预览（覆盖"触发按键"设置）')
			.addDropdown(dropdown => dropdown
				.addOption('none', '无')
				.addOption('ctrl', 'Ctrl')
				.addOption('alt', 'Alt')
				.addOption('shift', 'Shift')
				.addOption('meta', 'Meta/Win')
				.setValue(this.plugin.settings.suppressModifier)
				.onChange(async (value) => {
					this.plugin.settings.suppressModifier = value;
					await this.plugin.saveSettings();
				}));

		// 放大快捷键
		new Setting(containerEl)
			.setName('滚轮缩放按键')
			.setDesc('预览显示后，按住此键 + 滚轮可放大/缩小图片（"无"=禁用缩放）')
			.addDropdown(dropdown => dropdown
				.addOption('none', '无（禁用）')
				.addOption('ctrl', 'Ctrl')
				.addOption('alt', 'Alt')
				.addOption('shift', 'Shift')
				.addOption('meta', 'Meta/Win')
				.setValue(this.plugin.settings.zoomModifier)
				.onChange(async (value) => {
					this.plugin.settings.zoomModifier = value;
					await this.plugin.saveSettings();
					this.plugin.updateOverlayConfig();
				}));

		// 延迟
		new Setting(containerEl)
			.setName('显示延迟')
			.setDesc('鼠标悬停后等待多久显示预览（毫秒）')
			.addSlider(slider => slider
				.setLimits(0, 1000, 50)
				.setValue(this.plugin.settings.delay)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.delay = value;
					await this.plugin.saveSettings();
				}));

		// 透明度
		new Setting(containerEl)
			.setName('透明度')
			.setDesc('预览窗口的不透明度')
			.addSlider(slider => slider
				.setLimits(0.1, 1, 0.05)
				.setValue(this.plugin.settings.opacity)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.opacity = value;
					await this.plugin.saveSettings();
					this.plugin.updateOverlayConfig();
				}));

		// 显示标题
		new Setting(containerEl)
			.setName('显示标题')
			.setDesc('在预览窗口底部显示图片标题/文件名')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showCaption)
				.onChange(async (value) => {
					this.plugin.settings.showCaption = value;
					await this.plugin.saveSettings();
					this.plugin.updateOverlayConfig();
				}));

		// 悬停效果
		new Setting(containerEl)
			.setName('悬停标记')
			.setDesc('鼠标悬停在可预览元素上时的视觉效果')
			.addDropdown(dropdown => dropdown
				.addOption('none', '无')
				.addOption('outline', '边框高亮')
				.addOption('cursor', '改变光标')
				.setValue(this.plugin.settings.hoverEffect)
				.onChange(async (value) => {
					this.plugin.settings.hoverEffect = value;
					await this.plugin.saveSettings();
				}));

		// 背景样式
		containerEl.createEl('h3', { text: '样式设置' });

		new Setting(containerEl)
			.setName('背景色')
			.setDesc('预览窗口的背景颜色')
			.addText(text => text
				.setPlaceholder('#1e1e1e')
				.setValue(this.plugin.settings.background)
				.onChange(async (value) => {
					this.plugin.settings.background = value;
					await this.plugin.saveSettings();
					this.plugin.updateOverlayConfig();
				}));

		new Setting(containerEl)
			.setName('边框')
			.setDesc('预览窗口的边框样式')
			.addText(text => text
				.setPlaceholder('2px solid #555')
				.setValue(this.plugin.settings.border)
				.onChange(async (value) => {
					this.plugin.settings.border = value;
					await this.plugin.saveSettings();
					this.plugin.updateOverlayConfig();
				}));

		new Setting(containerEl)
			.setName('圆角')
			.setDesc('预览窗口的圆角大小（像素）')
			.addSlider(slider => slider
				.setLimits(0, 20, 1)
				.setValue(this.plugin.settings.roundness)
				.setDynamicTooltip()
				.onChange(async (value) => {
				 this.plugin.settings.roundness = value;
				 await this.plugin.saveSettings();
				 this.plugin.updateOverlayConfig();
				}));

		new Setting(containerEl)
			.setName('阴影')
			.setDesc('预览窗口的阴影效果')
			.addText(text => text
				.setPlaceholder('0 8px 32px rgba(0,0,0,0.5)')
				.setValue(this.plugin.settings.boxShadow)
				.onChange(async (value) => {
					this.plugin.settings.boxShadow = value;
					await this.plugin.saveSettings();
					this.plugin.updateOverlayConfig();
				}));

		// 高级设置
		containerEl.createEl('h3', { text: '高级设置' });

		new Setting(containerEl)
			.setName('最小图片尺寸')
			.setDesc('只有宽高都大于此值的图片才触发预览（像素）')
			.addSlider(slider => slider
				.setLimits(10, 100, 5)
				.setValue(this.plugin.settings.minImageSize)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.minImageSize = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('预加载')
			.setDesc('页面加载时预扫描可预览的图片（提高响应速度）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.preloadEnabled)
				.onChange(async (value) => {
					this.plugin.settings.preloadEnabled = value;
					await this.plugin.saveSettings();
				}));
	}
}
