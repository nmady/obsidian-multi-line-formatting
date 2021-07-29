import { assert } from 'console';
import { 
  App, Plugin, PluginSettingTab, Setting, MarkdownView, CacheItem, EditorPosition
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
    if(!mdView) {return}
    const doc = mdView.editor;
    const cache = this.app.metadataCache.getCache(mdView.file.path)
    const sections = cache.sections
    const headings = cache.headings
    const listItems = cache.listItems
    
    const selectedContent = this.NRDoc.selectedContent(doc);
    if(selectedContent.length <= 0) { 
      return 
    }

    const selectionStartCursor = doc.getCursor('from');
    const indexStart = sectionBinarySearch(selectionStartCursor.line, sections)

    var j = indexStart;
    for (var i=0; i < selectedContent.length; i++) {
      console.log(selectedContent[i], i)
      if (selectedContent[i] === ""){
        console.log("empty line")
        continue
      }
      var line = i + selectionStartCursor.line
      console.log(line, j)
      console.log(doc.getLine(line))

      if (sections[j].position.end.line < line){
        j++;
      }

      if (sections[j].type === "paragraph") {
        var trimmed = selectedContent[i].trim()
        selectedContent[i] = selectedContent[i].replace(trimmed, this.settings.leftStyle.concat(trimmed))
        i = i + (sections[j].position.end.line - line);
        line = i + selectionStartCursor.line;
        console.log(selectedContent, i, sections[j].position.end.line, line);
        selectedContent[i] = selectedContent[i].concat(this.settings.rightStyle);
      } else if (sections[j].type === "heading") {
        console.log("header");
        var text = headings[sectionBinarySearch(line, headings)].heading
        console.log(text)
        if (i != 0 || selectedContent[i].indexOf(text) > selectionStartCursor.ch) {
          if (selectedContent[i].trim().indexOf(text) < 3){
            console.log("Not formatting this line because it wouldn't show up anyways.")
            continue
          }
          selectedContent[i] = selectedContent[i].replace(text, this.settings.leftStyle.concat(text)).concat(this.settings.rightStyle)
        } else {
          console.log(selectedContent[i])
          console.log(selectedContent[i].substring(0, selectionStartCursor.ch), 
            this.settings.leftStyle, 
            selectedContent[i].substring(selectionStartCursor.ch), 
            this.settings.rightStyle)
          selectedContent[i] = this.settings.leftStyle.concat(selectedContent[i].concat(this.settings.rightStyle))
          
        }
      } else if (sections[j].type === "list") {
        console.log("list")
      } else {
        console.log("not sure what this is", sections[j].type)
      }

    };

    console.log(doc.getCursor('from'));
    const selectionEndCursor = doc.getCursor('to')
    console.log(doc.getCursor('to'))

    /* Dealing with the first line

      The first line may be 
        empty => nothing to do here
        start in or at the beginning of the text => add left formatting at start
        start at the beginning or in the middle of some start-of-block formatting
            => go to the beginning of the text and add left formatting */

    // console.log(sections)
    // const indexEnd = sectionBinarySearch(selectionEndCursor,sections)
    // console.log(indexStart)
    // console.log(indexEnd)

    // for(var i = indexStart; i <= indexEnd; i++){
    //   if (sections[i].type === "paragraph") {
    //     console.log("This is a paragraph.")
    //     if (i == indexStart && selectionStartCursor.line >= sections[i].position.start.line){
    //       console.log("Since we're not starting on a blank line, we should simply append the left formatting where our cursor is.")
    //       console.log(doc.getLine(selectionStartCursor.line))
    //       doc.setLine(selectionStartCursor.line, doc.getLine(selectionStartCursor.line).substring(0,selectionStartCursor.ch).concat(this.settings.leftStyle, doc.getLine(selectionStartCursor.line).substring(selectionStartCursor.ch)))
    //     }
    //     if (i === indexEnd && sections[i].position.end.line >= selectionEndCursor.line) {
    //       console.log(sections[i].position.end.line)
    //       console.log(selectionEndCursor.line)
    //       console.log("It's the last section and we need to apply right formatting to the end of selection")
    //       doc.setLine(selectionEndCursor.line, doc.getLine(selectionStartCursor.line).substring(0,selectionEndCursor.ch).concat('</test>', doc.getLine(selectionEndCursor.line).substring(selectionEndCursor.ch)))
    //     }
    //   }

    //   if (sections[i].position.end.line < selectionEndCursor.line){
    //     doc.setLine(sections[i].position.end.line, doc.getLine(sections[i].position.end.line).concat(this.settings.rightStyle))
    //   } else if (i == indexEnd) {
    //     console.log("We need to make sure the end cursor isn't in the middle of some formatting, and if it isn't, we can append right formatting?")
    //   }
    // }
    

    // console.log(doc.getLine(selectionStartCursor.line))



    // if (selectedContent[0] != ""){
    //   selectedContent[0] = this.settings.leftStyle.concat(selectedContent[0]); 
    // }
    // for (var i = 0; i < selectedContent.length; i++) {
    //   if(selectedContent[i] === ""){
    //     if(i > 0 && selectedContent[i-1] != ""){
    //       selectedContent[i-1] = selectedContent[i-1].concat(this.settings.rightStyle);
    //     }
    //     if(i+1<selectedContent.length && selectedContent[i+1] != ""){
    //       selectedContent[i+1] = this.settings.leftStyle.concat(selectedContent[i+1])
    //     }
    //   }
    // }
    // if (selectedContent[selectedContent.length-1] != ""){
    //   selectedContent[selectedContent.length-1] = selectedContent[selectedContent.length-1].concat(this.settings.rightStyle)
    // }

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

function sectionBinarySearch(line: number, sections: CacheItem[]): number {
  var low = 0
  var high = sections.length - 1
  while (low < high){
    var midpoint = (low+high) >> 1
    var midposition = sections[midpoint].position
    if (line < midposition.start.line){
      // cursor before middle section
      high = midpoint - 1
    } else if (line <= midposition.end.line){
      // cursor in middle section
      return midpoint
    } else {
      // cursor after middle section
      low = midpoint + 1
    }
  }
  return low
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