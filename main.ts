import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { exec } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

interface MyPluginSettings {
	authorName: string;
	blogDirectory: string;
	assetsFolder: string;
	publishScript: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	authorName: "",
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


// This is where all the magic happens!
async function publish(plugin: MyPlugin, editor: Editor) {

	new OptionsModal(plugin.app, async (assets, description, keywords) => {
		// Collect all values for the blog post
		const assetPaths = assets; // Array of asset file paths
		const pubDoc = editor.getValue(); // Markdown content
		const targetDir = path.normalize(plugin.settings.blogDirectory); // Blog directory

		// Retrieve the name of this file and format it for publishing
		const file = plugin.app.workspace.getActiveFile();
		const fileName = file ? file.basename : 'untitled';
		const now = new Date();
		const yyyy = now.getFullYear();
		const mm = String(now.getMonth() + 1).padStart(2, '0');
		const dd = String(now.getDate()).padStart(2, '0');
		const formattedName = `${yyyy}-${mm}-${dd}-${fileName}.md`;
		const docPath = path.normalize(path.join(targetDir, formattedName));

		// Prepare all header values
		const title = fileName;
		const date = `${yyyy}-${mm}-${dd} ${now.toTimeString().slice(0, 8)} +0530`; // Adjust timezone as needed
		const desc = description || '';
		const kw = keywords.length ? keywords.join(', ') : '';
		const author = plugin.settings.authorName || '';

		// Log all values for debugging
		console.log({
			title,
			date,
			description: desc,
			keywords: kw,
			author,
			assets: assetPaths,
			targetDir,
			docPath,
			pubDoc
		});

		// Get vault root for resolving relative asset paths
		const vaultRoot = path.normalize((plugin.app.vault.adapter as any).basePath);
		// Check if blog directory exists
		try {
			await fs.access(targetDir);
		} catch (err) {
			new Notice(`Blog directory not found: ${targetDir}. Please configure your settings.`);
			return;
		}

		// Check if assets folder exists
		const assetsFolder = path.normalize(plugin.settings.assetsFolder);
		try {
			await fs.access(assetsFolder);
		} catch (err) {
			new Notice(`Assets folder not found: ${assetsFolder}. Please configure your settings.`);
			return;
		}

		// Check all asset paths before copying (resolve relative to vault root)
		for (const asset of assetPaths) {
			const assetAbsPath = path.normalize(path.isAbsolute(asset) ? asset : path.join(vaultRoot, asset));
			try {
				await fs.access(assetAbsPath); // Check if file exists
			} catch (err) {
				new Notice(`Asset not found: ${asset}. Please check your asset paths.`);
				return;
			}
		}

		// Write the blog post file
		try {
			// Build the YAML front matter header
			const header = `---
layout: post
title:  "${title}"
date:   ${date}
description: "${desc}"
keywords: "${kw}"
author: "${author}"
categories: [post]
---`;

			// Combine header and content
			const fullDoc = `${header}\n\n${pubDoc}`;
			await fs.writeFile(docPath, fullDoc);
		} catch (err) {
			new Notice(`Error writing document: ${(err as Error).message}`);
			return;
		}

		// Copy all asset files to the assets folder (resolve relative to vault root)
		for (const asset of assetPaths) {
			const assetAbsPath = path.normalize(path.isAbsolute(asset) ? asset : path.join(vaultRoot, asset));
			const assetName = path.basename(assetAbsPath);
			try {
				await fs.copyFile(assetAbsPath, path.join(assetsFolder, assetName));
			} catch (err) {
				new Notice(`Error copying asset: ${asset}`);
			}
		}

		// Run each publish script command in the target directory
		const commands = plugin.settings.publishScript.split('\n').filter(Boolean);
		for (const cmd of commands) {
			try {
				await new Promise<void>((resolve, reject) => {
					exec(cmd, { cwd: targetDir }, (error, stdout, stderr) => {
						if (error) {
							new Notice(`Error executing command "${cmd}": ${error.message}`);
							console.error(`Command: ${cmd}\nError: ${error.message}\nStderr: ${stderr}\nStdout: ${stdout}`);
							reject(error);
						} else {
							new Notice(`Command succeeded: "${cmd}"`);
							console.log(`Command: ${cmd}\nStdout: ${stdout}\nStderr: ${stderr}`);
							resolve();
						}
					});
				});
			} catch (e) {
				// If a command fails, stop further commands and notify the user
				new Notice(`Publishing aborted due to failed command: "${cmd}"`, 5000); // Longer display
				return;
			}
		}
	}).open();
}



class OptionsModal extends Modal {
	constructor(app: App, onSubmit: (assets: string[], description: string, keywords: string[]) => void) {
		super(app);

		const { contentEl } = this;

		contentEl.createEl('h1', { text: 'First Select this post\'s publishing options:' });

		contentEl.createEl('hr');

		// Section: Description
		const descSection = contentEl.createDiv({ cls: 'publish-description-section' });
		descSection.createEl('h3', { text: 'Blogpost Description' });

		const descInputWrapper = descSection.createDiv({ cls: 'input-wrapper' });
		const descInput = descInputWrapper.createEl('textarea', {
			placeholder: 'Enter a short description of the blogpost...',
			cls: 'publish-description-input'
		});
		descInput.style.width = '100%';
		descInput.style.minHeight = '60px';

		let description = '';
		descInput.addEventListener('input', () => {
			description = descInput.value.trim();
		});

		contentEl.createEl('hr');

		// Section: Keywords
		const keywordsSection = contentEl.createDiv({ cls: 'publish-keywords-section' });
		keywordsSection.createEl('h3', { text: 'Blogpost Keywords (comma separated):' });

		const keywordsInputWrapper = keywordsSection.createDiv({ cls: 'input-wrapper' });
		const keywordsInput = keywordsInputWrapper.createEl('input', {
			type: 'text',
			placeholder: 'e.g.: javascript, obsidian, blogging',
			cls: 'publish-keywords-input'
		});

		let keywords: string[] = [];
		keywordsInput.addEventListener('input', () => {
			keywords = keywordsInput.value.split(',').map(s => s.trim()).filter(Boolean);
		});

		contentEl.createEl('hr');

		// Section: Assets
		const section = contentEl.createDiv({ cls: 'publish-assets-section' });
		section.createEl('h3', { text: 'Any external assets to include with this blogpost?' });

		const inputWrapper = section.createDiv({ cls: 'input-wrapper' });
		const input = inputWrapper.createEl('input', {
			type: 'text',
			placeholder: 'From Vault Base or Absolute, e.g.: docs/file.pdf, C:\\image.png',
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
			onSubmit(assets, description, keywords);
		});

		// Some inline styles for better appearance
		const style = document.createElement('style');
		style.textContent = `
			.publish-assets-section,.publish-keywords-section,.publish-description-section { margin-bottom: 1.5em; }
			.input-wrapper { margin-top: 0.5em; }
			.publish-assets-input,.publish-keywords-input,.publish-description-input { width: 100%; padding: 0.5em; font-size: 1em; }
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
			.setName('Author Name')
			.setDesc('Default author name for publishing')
			.addText(text => text
				.setPlaceholder('Your Name')
				.setValue(this.plugin.settings.authorName || '')
				.onChange(async (value) => {
					this.plugin.settings.authorName = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Blog Directory')
			.setDesc('Absolute path to your blog directory')
			.addText(text => text
				.setPlaceholder('C:\\Users\\chitw\\posts')
				.setValue(this.plugin.settings.blogDirectory || '')
				.onChange(async (value) => {
					this.plugin.settings.blogDirectory = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Assets Folder')
			.setDesc('Absolute path to the assets folder')
			.addText(text => text
				.setPlaceholder('C:\\Users\\chitw\\posts\\images')
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
