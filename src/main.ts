import { 
  App, Modal, Plugin, PluginSettingTab, Setting, MarkdownView
} from 'obsidian';
import NRDoc from './doc';

const PLUGIN_NAME = "Multi-line Formatting"

interface MyPluginSettings {
	leftStyle: string;
  rightStyle: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	leftStyle: '<span style="background-color:#00FEFE">',
  rightStyle: '</span>'
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
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

		this.addSettingTab(new SampleSettingTab(this.app, this));

		this.registerCodeMirror((cm: CodeMirror.Editor) => {
			console.log('codemirror', cm);
		});

		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
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
    console.log(selectedContent)
    if(selectedContent.length <= 0) { 
      return 
    }

    const styling = this.settings.leftStyle
    var newContent:string[] = selectedContent;
    if (newContent[0] != ""){
      newContent[0] = styling.concat(selectedContent[0]); 
    }
    for (var i = 0; i < selectedContent.length; i++) {
      if(selectedContent[i] === ""){
        if(i > 0){
          newContent[i-1] = newContent[i-1].concat(this.settings.rightStyle);
        }
        if(i+1<selectedContent.length){
          newContent[i+1] = styling.concat(selectedContent[i+1])
        }
      }
    }
    if (newContent[selectedContent.length-1] != ""){
      newContent[selectedContent.length-1] = newContent[selectedContent.length-1].concat('</span>')
    }
    console.log(newContent)

    var catContent:string = ""
    for (var i = 0; i < newContent.length-1; i++){
      catContent = catContent.concat(newContent[i], '\n')
    }
    catContent = catContent.concat(newContent[newContent.length-1])
    doc.replaceSelection("".concat(catContent));

  }

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
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
					console.log('Secret: ' + value);
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
          console.log('Secret2: ' + value);
          this.plugin.settings.rightStyle = value;
          await this.plugin.saveSettings();
        }));
	}
}