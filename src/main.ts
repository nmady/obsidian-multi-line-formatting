import { 
  App, Plugin, PluginSettingTab, Setting, MarkdownView, CacheItem, EditorPosition, ListItemCache, HeadingCache
} from 'obsidian';
import NRDoc from './doc';

const PLUGIN_NAME = "Multi-line Formatting"

interface MultilineFormattingPluginSettings {
  nickname: string;
	leftStyle: string;
  rightStyle: string;
  skipHeadings: boolean;
  skipListItems: boolean;
  skipBlockquotes: boolean;
}

const DEFAULT_SETTINGS: MultilineFormattingPluginSettings = {
  nickname: 'Format, even over multiple lines',
	leftStyle: '<span style="background-color:#00FEFE">',
  rightStyle: '</span>',
  skipHeadings: false,
  skipListItems: false,
  skipBlockquotes: true
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
			name: this.settings.nickname,
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

    console.log('ListItems', listItems)
    console.log('Original selectedContent:', selectedContent)

    /* We're going to apply the rightStyle at the very end because sometimes
      headers close a block unexpectedly, in which case have to look to the block
      preceding and apply the rightStyle after the initial loop through.
      applyRightArray[i] == true means we apply rightStyle to selectedContent[i] */
    var applyRightArray: boolean[] = new Array(selectedContent.length)
    applyRightArray.fill(false);

    /* If there is no text in the line to format (empty line or only heading/list
       prefix) then we don't want to append the rightStyle after the fact*/
    var isFormatEmpty: boolean[] = new Array(selectedContent.length)
    isFormatEmpty.fill(false);
    
    /* The next (non-empty) line after a heading embedded in a list needs 
      leftStyle applied. */
    var isAfterEmbeddedHeading = false

    /* Reset applyLeft to false after each iteration. This variable lets us set
     a 'left' edge between a heading/list prefix, and only apply formatting to
     lines where there is selected content to the right of that left edge. */ 
    var applyLeft = false

    const selectionStartCursor = doc.getCursor('from');
    const indexStart = sectionBinarySearch(selectionStartCursor.line, sections)
    var selectionStartCol = selectionStartCursor.ch

    var j = indexStart;
    for (var i=0; i < selectedContent.length; i++) {
      console.log('Starting line', i, 'now, with content:', selectedContent[i])
      if (i > 0) selectionStartCol = 0
      if (selectedContent[i] === ""){
        isFormatEmpty[i] = true;
        console.log("empty line:", isFormatEmpty)
      }
      var line = i + selectionStartCursor.line
      console.log("Lineno:", line, "Section:", j)
      var originalLine = doc.getLine(line)
      console.log("Full line:", originalLine)
      var left = 0

      if (sections[j].position.end.line < line){
        j++;
      }

      if (sections[j].type === "paragraph") {
        console.log("paragraph")
        if (!isFormatEmpty[i]){
          var trimmed = selectedContent[i].trim()
          selectedContent[i] = selectedContent[i].replace(trimmed, this.settings.leftStyle.concat(trimmed))
          /* jump to the end of the paragraph */
          i = i + (sections[j].position.end.line - line);
          line = i + selectionStartCursor.line;
          applyRightArray[i] = true
        }
      } else if (sections[j].type === "heading") {
        console.log("heading");
        if (this.settings.skipHeadings) {
          isFormatEmpty[i] = true;
          console.log('skipping Heading')
          continue
        } 
        var text = headings[sectionBinarySearch(line, headings)].heading
        console.log(text)
        left = originalLine.lastIndexOf(text)
        if (left > 0) applyLeft = true;
        console.log('left in heading:', left)
        applyRightArray[i] = true
      } else if (sections[j].type === "blockquote") {
        console.log("blockquote")
        if (this.settings.skipBlockquotes) {
          isFormatEmpty[i] = true;
          console.log('skipping Blockquote')
          continue
        }

      } else if (sections[j].type === "list") {
        console.log("list")
        if (this.settings.skipListItems) {
          isFormatEmpty[i] = true;
          console.log('skipping List Item')
          continue
        } 
        if (isAfterEmbeddedHeading) { 
          console.log("line is after list heading")
          if (!isFormatEmpty[i]) {
            applyLeft = true;
            isAfterEmbeddedHeading = false;
          }
        } else applyLeft = false

        var listIndex = sectionBinarySearch(line, listItems)
        // var originalLine = doc.getLine(line)
        var lineTrimmed = originalLine
        // var selectionStartCol = originalLine.lastIndexOf(selectedContent[i])
        var listItem = listItems[listIndex]
        console.log('item ', listIndex, 'found via binary search', listItem)
        /* if this is the first line of the ListItem */
        if (listItem.position.start.line == line){
          applyLeft = true
          while (listItems[listIndex].position.start.col > selectionStartCol) {
            console.log("List item starts in col", listItems[listIndex].position.start.col, " which is to the right of where the selection starts,", selectionStartCol, "so the selection is probably in the preceding list item.")
            listIndex--;
          }
          while (listIndex+1 < listItems.length && listItems[listIndex+1].position.start.line === line && listItems[listIndex+1].position.start.col < selectionStartCol) {
            console.log("The start of the selected part of this line seems to be after the start of the next list item.")
            console.log("liststart", listItems[listIndex].position.start.col)
            console.log("selectionStart", selectionStartCol)
            listIndex++;
          }
          while (true) {
            console.log('listIndex', listIndex)
            listItem = listItems[listIndex]
            left = listItems[listIndex].position.start.col
            console.log('left:', left)
            var subLine = originalLine.substring(left)
            var lineTrimmed: string;
            var startUntrimmed: number;
            console.log(subLine)
            if (typeof(listItem.task) != 'undefined') {
              startUntrimmed = subLine.indexOf(listItem.task.concat(']')) + 2
              left += startUntrimmed
              subLine = originalLine.substring(left)
              lineTrimmed = subLine.trimStart()
              left += subLine.length - lineTrimmed.length
              console.log('text,' + subLine)
              console.log('left,', left)
            } else {
              /* Taskless list items may start with whitespace*/
              lineTrimmed = subLine.trimStart()
              /* But after the whitespace, there should be a *, -, or 1., then more whitespace*/
              lineTrimmed = lineTrimmed.substring(lineTrimmed.search(/\s/)).trimStart()
              left += subLine.length - lineTrimmed.length
              console.log('left after removing prefix:', left)
            }
            
            if (listIndex + 1 < listItems.length && listItems[listIndex + 1].position.start.line === line && listItems[listIndex + 1].position.start.col <= left){
              listIndex++;
              console.log('listIndex', listIndex)
            } else {
              console.log(lineTrimmed)
              break
            }
          }
        } else {
          console.log('not first line')
          lineTrimmed = originalLine.trimStart()
          left = originalLine.length - lineTrimmed.length;
        }
        if (originalLine.substring(left).search(/#{1,6}\s/) == 0) {
          console.log("This is a heading inside a list.")
          applyLeft = true;
          applyRightArray[i] = true;
          if (i - 1 >= 0) applyRightArray[i-1] = true;
          isAfterEmbeddedHeading = true;
          subLine = lineTrimmed
          lineTrimmed = lineTrimmed.substring(lineTrimmed.search(/\s/)).trimStart()
          left += subLine.length - lineTrimmed.length
          console.log('left', left)
        }

        if (listItem.position.end.line === line || i == selectedContent.length - 1){
          console.log("end of block or selection")
          if (isFormatEmpty[i]) {
            console.log("isFormatEmpty")
            for (var k = i; isFormatEmpty[k] && k >= 0; k--) {console.log('k:', k)}
            if (!isFormatEmpty[k]) {applyRightArray[k] = true;}
          } else applyRightArray[i] = true
        } else console.log("Not end of block.")
  
      } else {
        console.log("not sure what this is", sections[j].type)
      }
      console.log("Time to applyLeft")
      if (applyLeft) {
        console.log('left at application:', left)
        if (left <= selectionStartCol) {
          selectedContent[i] = this.settings.leftStyle.concat(selectedContent[i])
        } else {
          var formatable = selectedContent[i].substring(left - selectionStartCol)
          if (formatable === "") {
            isFormatEmpty[i] = true;
            continue
          }
          selectedContent[i] = selectedContent[i].substring(0, left - selectionStartCol).concat(this.settings.leftStyle).concat(formatable)
        }
      }
    applyLeft = false
    } /* end for loop over all lines of selectedContent indexed by i */

    for (var i=0; i<selectedContent.length; i++) {
      if (applyRightArray[i] && !isFormatEmpty[i]) {
        selectedContent[i] = selectedContent[i].concat(this.settings.rightStyle)
      }
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

function sectionBinarySearch(line: number, sections: CacheItem[]): number {
  var low = 0
  var high = sections.length - 1
  while (low < high){
    var midpoint = (low+high) >> 1
    var midposition = sections[midpoint].position
    if (line < midposition.start.line){
      /* cursor before middle section */
      high = midpoint - 1
    } else if (line <= midposition.end.line){
      /* cursor in middle section */
      return midpoint
    } else {
      /* cursor after middle section */
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
			.setName('Nickname')
			.setDesc('The name for your formatting command in the command palette. Requires restart to take effect.')
			.addText(text => text
				// .setPlaceholder('')
				.setValue(this.plugin.settings.nickname)
				.onChange(async (value) => {
					this.plugin.settings.nickname = value;
          this.plugin.addCommand({
            id: 'multi-line-format',
            name: this.plugin.settings.nickname,
            callback: () => {
              this.plugin.editModeGuard(async () => await this.plugin.formatSelection())
            }
          });
					await this.plugin.saveSettings();
				}));

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

    const skipDetails: HTMLDetailsElement = containerEl.createEl("details");
    skipDetails.createEl("summary", { text: "Skip some section types" });
    
    new Setting(skipDetails)
      .setName('Skip List Items')
      .setDesc('Turn this toggle ON to exclude text in list items.')
      .addToggle((t) => {
        t.setValue(this.plugin.settings.skipListItems);
        t.onChange(async (v) => {
          this.plugin.settings.skipListItems = v;
          await this.plugin.saveSettings();
        })
      });
    
    new Setting(skipDetails)
        .setName('Skip Headings')
        .setDesc('Turn this toggle ON to exclude text in headings.')
        .addToggle((t) => {
          t.setValue(this.plugin.settings.skipHeadings);
          t.onChange(async (v) => {
            this.plugin.settings.skipHeadings = v;
            await this.plugin.saveSettings();
          })
        });

    new Setting(skipDetails)
        .setName('Skip Blockquotes')
        .setDesc('Turn this toggle ON to exclude text in Blockquotes. (OFF Disabled, since Blockquote formatting in development!)')
        .addToggle((t) => {
          t.setValue(this.plugin.settings.skipBlockquotes);
          t.onChange(async (v) => {
            this.plugin.settings.skipBlockquotes = v;
            await this.plugin.saveSettings();
          })
          .setDisabled(true)
        });
	}
}