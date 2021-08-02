import { 
  App, Plugin, PluginSettingTab, Setting, MarkdownView, CacheItem, stringifyYaml
} from 'obsidian';
import NRDoc from './doc';

const PLUGIN_NAME = "Multi-line Formatting"

interface MultilineFormattingPluginSettings {
  styleArray: MultilineFormattingStyleSettings[];
}

interface MultilineFormattingStyleSettings {
  id: string;
  nickname: string;
	leftStyle: string;
  rightStyle: string;
  skipHeadings: boolean;
  skipListItems: boolean;
  skipBlockquotes: boolean;
}

const DEFAULT_SETTINGS: MultilineFormattingPluginSettings = {
  styleArray: [{ 
    id: 'multi-line-format-cyan-highlight',
    nickname: 'Format, even over multiple lines',
    leftStyle: '<span style="background-color:#00FEFE">',
    rightStyle: '</span>',
    skipHeadings: false,
    skipListItems: false,
    skipBlockquotes: false
  },
  { 
    id: 'multi-line-format-bold',
    nickname: 'Bold, even over multiple lines',
    leftStyle: '**',
    rightStyle: '**',
    skipHeadings: false,
    skipListItems: false,
    skipBlockquotes: false
  }]
}

const NEW_STYLE_DEFAULTS: MultilineFormattingStyleSettings = {
  id: '',
  nickname: 'Empty format',
  leftStyle: '',
  rightStyle: '',
  skipHeadings: false,
  skipListItems: false,
  skipBlockquotes: false
}

export default class MultilineFormattingPlugin extends Plugin {
	settings: MultilineFormattingPluginSettings;
  NRDoc: NRDoc;


	async onload() {
		console.log('Loading ' + PLUGIN_NAME + ' Plugin');

		await this.loadSettings();

    this.NRDoc = new NRDoc();

    for (const style of this.settings.styleArray){
      this.addStyleCommand(style);
    }

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

  async formatSelection(style: MultilineFormattingStyleSettings): Promise<void> {
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

    /* If nothing is selected, simply add both sides of the formatting 
      and stick the cursor between them */
    console.debug('empty selection', selectedContent.length == 1, selectedContent[0] === "")
    if (selectedContent.length == 1 && selectedContent[0] === ""){
      console.debug('Empty selection')
      doc.replaceSelection(style.leftStyle + style.rightStyle);
      doc.setCursor(selectionStartCursor.line, selectionStartCursor.ch + style.leftStyle.length)
      return
    }

    console.debug('Sections', sections)
    console.debug('ListItems', listItems)
    console.debug('Original selectedContent:', selectedContent)

    /* We're going to apply the rightStyle at the very end because sometimes
      headers close a block unexpectedly, in which case have to look to the block
      preceding and apply the rightStyle after the initial loop through.
      applyRightArray[i] == true means we apply rightStyle to selectedContent[i] */
    const applyRightArray: boolean[] = new Array(selectedContent.length)
    applyRightArray.fill(false);

    /* If there is no text in the line to format (empty line or only heading/list
       prefix) then we don't want to append the rightStyle after the fact*/
    let lastNonEmptyIndex = -1
    // const isFormatEmpty: boolean[] = new Array(selectedContent.length)
    // isFormatEmpty.fill(false);
    
    /* The next (non-empty) line after a heading embedded in a list needs 
      leftStyle applied. */
    let isAfterEmbeddedParaBreak = false

    let previousBlockquoteLevel = 0;

    let currentSectionIndex = sectionBinarySearch(selectionStartCursor.line, sections);

    for (let i=0; i < selectedContent.length; i++) {
      console.debug('Starting line', i, 'now, with content:', selectedContent[i])
      /* Reset applyLeft to false after each iteration. This variable lets us set
      a 'left' edge between a heading/list prefix, and only apply formatting to
      lines where there is selected content to the right of that left edge. */ 
      let applyLeft = false;
      
      let isEmpty = false

      let isBlockEnd = false;

      let left = 0;

      const selectionStartCol = (i > 0) ? 0 : selectionStartCursor.ch  

      const whitespaceMatch = selectedContent[i].match(/^(\s*)(.*)/)
      if (whitespaceMatch[2] === ""){
        isEmpty = true;
        console.debug("empty line")
        /* note: we can't continue because the prefix might matter */
      }

      const lineNo = i + selectionStartCursor.line
      console.debug("Lineno:", lineNo, "Section:", currentSectionIndex)
      const originalLine = doc.getLine(lineNo)
      console.debug("Full line:", originalLine)

      while (sections[currentSectionIndex].position.end.line < lineNo){
        currentSectionIndex++;
      }

      if (sections[currentSectionIndex].type === "paragraph") {
        console.debug("paragraph")
        if (!isEmpty){
          selectedContent[i] = whitespaceMatch[1] + style.leftStyle + whitespaceMatch[2]
          /* jump to the end of the paragraph */
          i = sections[currentSectionIndex].position.end.line - selectionStartCursor.line
          console.debug('i', i)
          // lineNo = i + selectionStartCursor.line;
          applyRightArray[i] = true
          continue
        }
      } else if (sections[currentSectionIndex].type === "heading") {
        console.debug("heading");
        if (style.skipHeadings) {
          isEmpty = true;
          console.debug('skipping Heading')
          continue
        } 
        const text = headings[sectionBinarySearch(lineNo, headings)].heading
        console.debug(text)
        left = originalLine.lastIndexOf(text)
        if (left > 0) applyLeft = true;
        console.debug('left in heading:', left)
        applyRightArray[i] = true
      } else if (sections[currentSectionIndex].type === "blockquote") {
        console.debug("blockquote")
        if (style.skipBlockquotes) {
          isEmpty = true;
          console.debug('skipping Blockquote')
          continue
        }
        /* if this is the first line of the Blockquote */
        if ((sections[currentSectionIndex].position.start.line == lineNo || isAfterEmbeddedParaBreak) && !isEmpty) {
          applyLeft = true
          console.debug('Applying left because this is the first line')
          isAfterEmbeddedParaBreak = false
        }

        /* The prefix for a blockquote is some combination of whitespace and >*/
        const blockquoteMatch = originalLine.match(/^([\s>]*)(.*)/)
        const prefix = blockquoteMatch[1];
        const text = blockquoteMatch[2];
        const blockquoteLevel = prefix.split('>').length-1
        console.debug('bq-level:', blockquoteLevel, 'previous:', previousBlockquoteLevel)
        if (previousBlockquoteLevel < blockquoteLevel) {
          applyLeft = true
          const k = lastNonEmptyIndex;
          // const k = rewindToFalse(isFormatEmpty, i)
          if (k >= 0) {applyRightArray[k] = true}
          previousBlockquoteLevel = blockquoteLevel
        } 
        if (text === "") {
          isEmpty = true
          const k = lastNonEmptyIndex;
          // const k = rewindToFalse(isFormatEmpty, i-1)
          if (k >= 0) {
            applyRightArray[k] = true
          }
          isAfterEmbeddedParaBreak = true
        }
        left = prefix.length
        console.debug('left after removing prefix:', left)
        if (sections[currentSectionIndex].position.end.line == lineNo) applyRightArray[i] = true
      } else if (sections[currentSectionIndex].type === "list") {
        console.debug("list")
        if (style.skipListItems) {
          isEmpty = true;
          console.debug('skipping List Item')
          continue
        } 
        if (isAfterEmbeddedParaBreak) { 
          console.debug("line is after list heading")
          if (!isEmpty) {
            applyLeft = true;
            isAfterEmbeddedParaBreak = false;
          }
        } else applyLeft = false

        let listIndex = sectionBinarySearch(lineNo, listItems)
        const lineTrimmed = originalLine
        const listItem = listItems[listIndex]
        console.debug('item ', listIndex, 'found via binary search', listItem)
        /* if this is the first line of the ListItem */
        if (listItem.position.start.line == lineNo){
          applyLeft = true
          while (listItems[listIndex].position.start.col > selectionStartCol) {
            console.debug("List item starts in col", listItems[listIndex].position.start.col, " which is to the right of where the selection starts,", selectionStartCol, "so the selection is probably in the preceding list item.")
            listIndex--;
          }
          while (listIndex+1 < listItems.length && listItems[listIndex+1].position.start.line === lineNo && listItems[listIndex+1].position.start.col < selectionStartCol) {
            console.debug("The start of the selected part of this line seems to be after the start of the next list item.")
            console.debug("liststart", listItems[listIndex].position.start.col)
            console.debug("selectionStart", selectionStartCol)
            listIndex++;
          }
          while (true) {
            console.debug('listIndex', listIndex)
            const listItem = listItems[listIndex]
            left = listItems[listIndex].position.start.col
            console.debug('left:', left)
            // let subLine = originalLine.substring(left)
            if (typeof(listItem.task) != 'undefined') {
              /* List item with a task */
              const startUntrimmed = originalLine.substring(left).indexOf(listItem.task.concat(']')) + 2
              left += startUntrimmed
              const subLine = originalLine.substring(left)
              const subLineTrimmed = subLine.trimStart()
              left += subLine.length - subLineTrimmed.length
              console.debug('text,' + subLine)
              console.debug('left,', left)
            } else {
              /* Taskless list items */
              const prefix = originalLine.substring(left).match(/^\s*(\*|-|\d+\.)\s*/)[0]
              console.debug('prefix:', prefix)
              left += prefix.length
              console.debug('left after removing prefix:', left)
            }
            
            if (listIndex + 1 < listItems.length && listItems[listIndex + 1].position.start.line === lineNo && listItems[listIndex + 1].position.start.col <= left){
              listIndex++;
              console.debug('listIndex', listIndex)
            } else {
              console.debug(lineTrimmed)
              break
            }
          }
        } else {
          console.debug('not first line')
          left = originalLine.length - originalLine.trimStart().length;
        }
        const headingMatch = originalLine.substring(left).match(/^\s*#{1,6}\s+/)
        if (headingMatch != null) {
          console.debug("This is a heading inside a list.")
          applyLeft = true;
          applyRightArray[i] = true;
          const k = lastNonEmptyIndex;
          // const k = rewindToFalse(isFormatEmpty, i-1)
          if (k >= 0) applyRightArray[k] = true;
          isAfterEmbeddedParaBreak = true;
          left += headingMatch[0].length
          console.debug('left', left)
        }

        if (listItem.position.end.line === lineNo){
          isBlockEnd = true;
          console.debug("end of listItem")
          if (isEmpty) {
            console.debug("isFormatEmpty")
            if (lastNonEmptyIndex >= 0) {applyRightArray[lastNonEmptyIndex] = true;}
          } else applyRightArray[i] = true
        } else console.debug("Not end of listitem.")
  
      } else {
        console.debug("not sure what this is", sections[currentSectionIndex].type)
        isEmpty = true
      }

      if (sections[currentSectionIndex].position.end.line === lineNo || i >= selectedContent.length - 1 || isBlockEnd){
        if (lastNonEmptyIndex >= 0) applyRightArray[lastNonEmptyIndex] = true
      }

      console.debug("Time to applyLeft")
      if (applyLeft) {
        console.debug('left at application:', left)
        if (left <= selectionStartCol) {
          selectedContent[i] = style.leftStyle.concat(selectedContent[i])
        } else {
          const formatable = selectedContent[i].substring(left - selectionStartCol)
          if (formatable === "") {
            isEmpty = true;
            continue
          }
          selectedContent[i] = selectedContent[i].substring(0, left - selectionStartCol).concat(style.leftStyle).concat(formatable)
        }
      }
      if (!isEmpty) {lastNonEmptyIndex = i}
      applyLeft = false
    } /* end for loop over all lines of selectedContent indexed by i */

    for (let i=0; i<selectedContent.length; i++) {
      if (applyRightArray[i]) {
        selectedContent[i] = selectedContent[i].concat(style.rightStyle)
      }
    }

    doc.replaceSelection(selectedContent.join('\n'));

  }

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

  addStyleCommand(style: MultilineFormattingStyleSettings){
    this.addCommand({
      id: style.id,
      name: style.nickname,
      callback: () => {
        this.editModeGuard(async () => await this.formatSelection(style))
      }
    });
  }

  addFormattingStyle(){
    const id = String(Math.abs((Date.now() ^ Math.random()*(1<<30)) % (1<<30)))
    const newStyle = {...NEW_STYLE_DEFAULTS, id: id};
    this.settings.styleArray.push(newStyle)
    this.addStyleCommand(newStyle)
    return newStyle
  }

  deleteFormattingStyle(style: MultilineFormattingStyleSettings){
    const index = this.settings.styleArray.indexOf(style)
    if (index >= 0) {
      this.settings.styleArray.splice(index, 1)
    }
    //@ts-ignore
    const appCommands = this.app.commands
    if (appCommands.findCommand(style.id)) {
      delete appCommands.editorCommands[style.id];
      delete appCommands.commands[style.id];
    }
  }
}

function rewindToFalse(boolArray: boolean[], startIndex: number): number {
  let k = startIndex;
  while (k >= 0 && boolArray[k]) {
    k--;
    console.debug('k:', k)
  }
  return k;
}

function sectionBinarySearch(line: number, sections: CacheItem[]): number {
  let low = 0
  let high = sections.length
  while (low < high){
    const midpoint = low + ((high - low) >> 1)
    console.debug(low, high)
    console.debug(midpoint)
    const midposition = sections[midpoint].position
    if (line < midposition.start.line){
      /* cursor before middle section */
      high = midpoint
    } else if (line <= midposition.end.line){
      /* cursor in middle section */
      return midpoint
    } else {
      /* cursor after middle section */
      low = midpoint + 1
    }
  }
  /* this might not be the right thing to do. */
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

		containerEl.createEl('h2', {text: 'Settings for ' + PLUGIN_NAME});

    const allStyleDiv = containerEl.createEl('div')

    for (const style of this.plugin.settings.styleArray) {
      const div = this.formattingStyleSetting(style)
      allStyleDiv.appendChild(div)
    }

    new Setting(containerEl)
      .addButton((t) => {
        t.setButtonText('Add new formatting style')
        t.onClick(async (v) => {
          const newStyle = this.plugin.addFormattingStyle()
          const div = this.formattingStyleSetting(newStyle);
          allStyleDiv.appendChild(div)
        })
      })
	}

  formattingStyleSetting(style: MultilineFormattingStyleSettings) {

    const containerEl = document.createElement('div');

    const commandheader = containerEl.createEl('h3', {text: 'Settings for ' + style.nickname});

    new Setting(containerEl)
      .setName('Nickname')
      .setDesc('The name for your formatting command in the command palette.')
      .addText(text => text
        // .setPlaceholder('')
        .setValue(style.nickname)
        .onChange(async (value) => {
          style.nickname = value;
          commandheader.setText('Settings for ' + style.nickname)
          this.plugin.addStyleCommand(style);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Left')
      .setDesc('The opening tag, or the left part of a highlight (==), bold (**), etc.')
      .addTextArea(text => text
        .setPlaceholder('')
        .setValue(style.leftStyle)
        .onChange(async (value) => {
          style.leftStyle = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Right')
      .setDesc('The closing tag, or the right part of a highlight (==), bold (**), etc.')
      .addTextArea(text => text
        .setPlaceholder('')
        .setValue(style.rightStyle)
        .onChange(async (value) => {
          style.rightStyle = value;
          await this.plugin.saveSettings();
        }));

    const skipDetails: HTMLDetailsElement = containerEl.createEl("details");
    skipDetails.createEl("summary", { text: "Skip some section types" });
    
    new Setting(skipDetails)
      .setName('Skip List Items')
      .setDesc('Turn this toggle ON to exclude text in list items.')
      .addToggle((t) => {
        t.setValue(style.skipListItems);
        t.onChange(async (v) => {
          style.skipListItems = v;
          await this.plugin.saveSettings();
        })
      });
    
    new Setting(skipDetails)
        .setName('Skip Headings')
        .setDesc('Turn this toggle ON to exclude text in headings.')
        .addToggle((t) => {
          t.setValue(style.skipHeadings);
          t.onChange(async (v) => {
            style.skipHeadings = v;
            await this.plugin.saveSettings();
          })
        });

    new Setting(skipDetails)
        .setName('Skip Blockquotes')
        .setDesc('Turn this toggle ON to exclude text in blockquotes.')
        .addToggle((t) => {
          t.setValue(style.skipBlockquotes);
          t.onChange(async (v) => {
            style.skipBlockquotes = v;
            await this.plugin.saveSettings();
          })
        });

    new Setting(containerEl)
      .addButton((t) => {
        t.setButtonText('Delete this style')
        t.onClick(async (v) => {
          if (confirm("Are you sure you want to delete " + style.nickname + '?')) {
            containerEl.parentElement?.removeChild(containerEl)
            this.plugin.deleteFormattingStyle(style);
          }
        })
      })

    return containerEl;
  }

}