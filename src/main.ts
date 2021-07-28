import { 
  App, Modal, Plugin, PluginSettingTab, Setting, MarkdownView
} from 'obsidian';
import NRDoc from './doc';

const PLUGIN_NAME = "Multi-line Formatting"

interface MultilineFormattingPluginSettings {
	leftStyle: string;
  rightStyle: string;
}

const DEFAULT_SETTINGS: MultilineFormattingPluginSettings = {
	leftStyle: '<span style="background-color:#00FEFE">',
  rightStyle: '</span>'
}

export default class MultilineFormattingPlugin extends Plugin {
	settings: MultilineFormattingPluginSettings;
  NRDoc: NRDoc;

	async onload() {
		console.log('Loading ' + PLUGIN_NAME + ' Plugin');

		await this.loadSettings();

    this.NRDoc = new NRDoc();

		this.addCommand({
			id: 'multi-line-format',
			name: 'Format, even over multiple lines',
			callback: () => {
        this.editModeGuard(async () => await this.formatSelection())
			}
		});

		this.addSettingTab(new MultilineFormattingSettingTab(this.app, this));

	}

	onunload() {
		console.log('Unloading ' + PLUGIN_NAME + 'Plugin');
	}

  editModeGuard(command: () => any): void {
    const mdView = this.app.workspace.activeLeaf.view as MarkdownView;
    if(!mdView || mdView.getMode() !== 'source') {
      new Notification('Please use ' + PLUGIN_NAME + ' plugin in edit mode');
      return;
    } else {
      command();
    }
  }

  async formatSelection(): Promise<void> {
    const mdView = this.app.workspace.activeLeaf.view as MarkdownView;
    const doc = mdView.editor;
    if(!mdView) {return}
    
    const selectedContent = this.NRDoc.selectedContent(doc);
    if(selectedContent.length <= 0) { 
      return 
    }

    const styling = this.settings.leftStyle
    if (selectedContent[0] != ""){
      selectedContent[0] = styling.concat(selectedContent[0]); 
    }
    for (var i = 0; i < selectedContent.length; i++) {
      if(selectedContent[i] === ""){
        if(i > 0 && selectedContent[i-1] != ""){
          selectedContent[i-1] = selectedContent[i-1].concat(this.settings.rightStyle);
        }
        if(i+1<selectedContent.length && selectedContent[i+1] != ""){
          selectedContent[i+1] = styling.concat(selectedContent[i+1])
        }
      }
    }
    if (selectedContent[selectedContent.length-1] != ""){
      selectedContent[selectedContent.length-1] = selectedContent[selectedContent.length-1].concat(this.settings.rightStyle)
    }

    var catContent:string = ""
    for (var i = 0; i < selectedContent.length-1; i++){
      catContent = catContent.concat(selectedContent[i], '\n')
    }
    catContent = catContent.concat(selectedContent[selectedContent.length-1])
    doc.replaceSelection("".concat(catContent));

  }

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class MultilineFormattingSettingTab extends PluginSettingTab {
	plugin: MultilineFormattingPlugin;

	constructor(app: App, plugin: MultilineFormattingPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		let {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings for ' + PLUGIN_NAME + '.'});

		new Setting(containerEl)
			.setName('Left')
			.setDesc('The opening tag, or the left part of a highlight (==), bold (**), etc.')
			.addTextArea(text => text
				.setPlaceholder('')
				.setValue(this.plugin.settings.leftStyle)
				.onChange(async (value) => {
					this.plugin.settings.leftStyle = value;
					await this.plugin.saveSettings();
				}));

    new Setting(containerEl)
      .setName('Right')
      .setDesc('The closing tag, or the right part of a highlight (==), bold (**), etc.')
      .addTextArea(text => text
        .setPlaceholder('')
        .setValue(this.plugin.settings.rightStyle)
        .onChange(async (value) => {
          this.plugin.settings.rightStyle = value;
          await this.plugin.saveSettings();
        }));
	}
}