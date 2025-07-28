import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	blogDirectory: string;
	assetsFolder: string;
	publishScript: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	blogDirectory: "./",
	assetsFolder: "./assets",
	publishScript: ""
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {

		//Load the settings into our plugin
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		this.addRibbonIcon('send', 'Publish', (evt: MouseEvent) => {

			const view = this.app.workspace.getActiveViewOfType(MarkdownView);

			if (view) {
				publish(this, view.editor);
			}
			else {
				new Notice('Please open a file in editing mode!');
			}

		});

		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'publish',
			name: 'Publish',

			checkCallback: (checking: boolean) => {

				// Make sure the user is editing a Markdown file.
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);

				if (view) {
					if (!checking) {
						publish(this, view.editor);
					}
					return true;
				}
				return false;
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new MySettingsTab(this.app, this));

	}

	onunload() { }

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}
	async saveSettings() {
		await this.saveData(this.settings);
	}
}


function publish(plugin: MyPlugin, editor: Editor) {

	new AssetsModal(plugin.app, (result) => {
		
		const assetPaths = result

		const pubDoc = editor.getValue();

		console.log(pubDoc, assetPaths, plugin.settings.blogDirectory, plugin.settings.assetsFolder, plugin.settings.publishScript);

	}).open();
}


class AssetsModal extends Modal {
	constructor(app: App, onSubmit: (result: string[]) => void) {
		super(app);

		const { contentEl } = this;

		contentEl.createEl('h1', { text: 'First Select this post\'s publishing options:' });

		contentEl.createEl('hr');

		//Section Container
		const section = contentEl.createDiv({ cls: 'publish-assets-section' });
		section.createEl('h3', { text: 'Any external assets to include with this publication?' });

		const inputWrapper = section.createDiv({ cls: 'input-wrapper' });
		const input = inputWrapper.createEl('input', {
			type: 'text',
			placeholder: 'e.g.: ./image.png, ./docs/file.pdf',
			cls: 'publish-assets-input'
		});

		let assets: string[] = [];
		input.addEventListener('input', () => {
			assets = input.value.split(',').map(s => s.trim()).filter(Boolean);
		});

		contentEl.createEl('hr');

		//Button Container
		const buttonRow = contentEl.createDiv({ cls: 'button-row' });
		const publishButton = buttonRow.createEl('button', { text: 'Publish', cls: 'mod-cta' });

		publishButton.addEventListener('click', () => {
			new Notice('Publishing with assets: ' + (assets.length ? assets.join(', ') : 'None'));
			this.close();
			onSubmit(assets);
		});

		// Some inline styles for better appearance
		const style = document.createElement('style');
		style.textContent = `
			.publish-assets-section { margin-bottom: 1.5em; }
			.input-wrapper { margin-top: 0.5em; }
			.publish-assets-input { width: 100%; padding: 0.5em; font-size: 1em; }
			.button-row { display: flex; justify-content: flex-end; }
			.mod-cta { background: var(--interactive-accent); color: var(--text-on-accent); border: none; padding: 0.5em; border-radius: 4px; cursor: pointer; }
			.mod-cta:hover { filter: brightness(1.1); }
		`;
		contentEl.appendChild(style);
	}
}

class MySettingsTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Blog Directory')
			.setDesc('Path to your blog directory')
			.addText(text => text
				.setPlaceholder('/path/to/blog')
				.setValue(this.plugin.settings.blogDirectory || '')
				.onChange(async (value) => {
					this.plugin.settings.blogDirectory = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Assets Folder')
			.setDesc('Path to the assets folder inside the blog directory')
			.addText(text => text
				.setPlaceholder('assets')
				.setValue(this.plugin.settings.assetsFolder || '')
				.onChange(async (value) => {
					this.plugin.settings.assetsFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Publish Script')
			.setDesc('Commands to run for publishing (one per line)')
			.addTextArea(textarea => textarea
				.setPlaceholder('e.g.\nnpm run build\nnpm run deploy')
				.setValue(this.plugin.settings.publishScript || '')
				.onChange(async (value) => {
					const commands = value.split('\n').map(cmd => cmd.trim()).filter(Boolean);
					console.log('Parsed publish commands:', commands);
					this.plugin.settings.publishScript = value;
					await this.plugin.saveSettings();
				}));
		const textarea = containerEl.querySelector('textarea');
		if (textarea) {
			textarea.style.height = '100px';
			textarea.style.width = '100%';
			textarea.style.fontFamily = 'monospace';
		}
	}
}
