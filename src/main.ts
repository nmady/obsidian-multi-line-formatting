import { assert } from 'console';
import { 
  App, Plugin, PluginSettingTab, Setting, MarkdownView, CacheItem, EditorPosition, ListItemCache, HeadingCache
} from 'obsidian';
import { start } from 'repl';
import NRDoc from './doc';

const PLUGIN_NAME = "Multi-line Formatting"

interface MultilineFormattingPluginSettings {
	leftStyle: string;
  rightStyle: string;
  skipHeadings: boolean;
  skipListItems: boolean;
}

const DEFAULT_SETTINGS: MultilineFormattingPluginSettings = {
	leftStyle: '<span style="background-color:#00FEFE">',
  rightStyle: '</span>',
  skipHeadings: true,
  skipListItems: true
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

    console.log('ListItems', listItems)
    console.log('Original selectedContent:', selectedContent)

    var applyRightArray: boolean[] = new Array(selectedContent.length)
    applyRightArray.fill(false);
    var isFormatEmpty: boolean[] = new Array(selectedContent.length)
    isFormatEmpty.fill(false);
    var isAfterListHeading = false
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

      if (sections[j].position.end.line < line){
        j++;
      }

      if (sections[j].type === "paragraph") {
        console.log("paragraph")
        if (!isFormatEmpty[i]){
          var trimmed = selectedContent[i].trim()
          selectedContent[i] = selectedContent[i].replace(trimmed, this.settings.leftStyle.concat(trimmed))
          i = i + (sections[j].position.end.line - line);
          line = i + selectionStartCursor.line;
          console.log(selectedContent, i, sections[j].position.end.line, line);
          applyRightArray[i] = true
        }
      } else if (sections[j].type === "heading") {
        console.log("heading");
        if (this.settings.skipHeadings) {
          isFormatEmpty[i] = true;
          console.log('skipping Heading')
        } else {
          var text = headings[sectionBinarySearch(line, headings)].heading
          console.log(text)
          left = originalLine.lastIndexOf(text)
          if (left > 0) applyLeft = true;
          console.log('left in heading:', left)
          applyRightArray[i] = true
        }
      } else if (sections[j].type === "list") {
        console.log("list")
        if (this.settings.skipListItems) {
          isFormatEmpty[i] = true;
          console.log('skipping List Item')
          continue
        } 
        if (isAfterListHeading) { 
          console.log("line is after list heading")
          if (!isFormatEmpty[i]) {
            applyLeft = true;
            isAfterListHeading = false;
          }
        } else applyLeft = false

        var listIndex = sectionBinarySearch(line, listItems)
        var originalLine = doc.getLine(line)
        var texttrimmed = originalLine
        var selectionStartCol = originalLine.lastIndexOf(selectedContent[i])
        var left = 0
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
            var texttrimmed: string;
            var startUntrimmed: number;
            console.log(subLine)
            if (typeof(listItem.task) != 'undefined') {
              startUntrimmed = subLine.indexOf(listItem.task.concat(']')) + 2
              left += startUntrimmed
              subLine = originalLine.substring(left)
              texttrimmed = subLine.trimStart()
              left += subLine.length - texttrimmed.length
              console.log('text,' + subLine)
              console.log('left,', left)
            } else {
              /* Taskless list items may start with whitespace*/
              texttrimmed = subLine.trimStart()
              /* But after the whitespace, there should be a *, -, or 1., then more whitespace*/
              texttrimmed = texttrimmed.substring(texttrimmed.search(/\s/)).trimStart()
              left += subLine.length - texttrimmed.length
              console.log('left after removing prefix:', left)
            }
            
            if (listIndex + 1 < listItems.length && listItems[listIndex + 1].position.start.line === line && listItems[listIndex + 1].position.start.col <= left){
              listIndex++;
              console.log('listIndex', listIndex)
            } else {
              console.log(texttrimmed)
              break
            }
          }
        } else {
          console.log('not first line')
          texttrimmed = originalLine.trimStart()
          left = originalLine.length - texttrimmed.length;
        }
        if (originalLine.substring(left).search(/#{1,6}\s/) == 0) {
          console.log("This is a heading inside a list.")
          applyLeft = true;
          applyRightArray[i] = true;
          if (i - 1 >= 0) applyRightArray[i-1] = true;
          isAfterListHeading = true;
          subLine = texttrimmed
          texttrimmed = texttrimmed.substring(texttrimmed.search(/\s/)).trimStart()
          left += subLine.length - texttrimmed.length
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

    // console.log(doc.getCursor('from'));
    // const selectionEndCursor = doc.getCursor('to')
    // console.log(doc.getCursor('to'))

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

    new Setting(containerEl)
      .setName('Skip List Items')
      .setDesc('Formatting list items is experimental and may include bugs. Turn this toggle OFF to attempt to format them.')
      .addToggle((t) => {
        t.setValue(this.plugin.settings.skipListItems);
        t.onChange(async (v) => {
          this.plugin.settings.skipListItems = v;
          await this.plugin.saveSettings();
        })
      });
    
    new Setting(containerEl)
        .setName('Skip Headings')
        .setDesc('Formatting headings is experimental and may include bugs. Turn this toggle OFF to attempt to format them.')
        .addToggle((t) => {
          t.setValue(this.plugin.settings.skipHeadings);
          t.onChange(async (v) => {
            this.plugin.settings.skipHeadings = v;
            await this.plugin.saveSettings();
          })
        });
	}
}